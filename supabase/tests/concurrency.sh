#!/usr/bin/env bash
# Concurrency tests with two real database connections (design §10.1: C1, C2, C5, and the
# same-key retry from C3). pgTAP runs in one transaction, so these cannot live there.
# Each test runs session A (which holds its locks for a moment) and session B at the same time.
# Usage: bash supabase/tests/concurrency.sh   (local Supabase must be running)
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:55322/postgres}"
q() { psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 "$@"; }

USER_ID=$(uuidgen | tr 'A-Z' 'a-z')
ADMIN2=$(uuidgen | tr 'A-Z' 'a-z')
COMPANY=""
failures=0

as_user() { # SQL run as the test user, in one transaction
  as_who "$USER_ID" "$1"
}
as_who() { # user id, SQL: run as that user, in one transaction
  printf "set role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"%s\",\"role\":\"authenticated\"}', true); %s" \
    "$1" "$2"
}

cleanup() {
  [ -z "$COMPANY" ] && return
  q <<SQL >/dev/null
set session_replication_role = replica; -- skip triggers and FK checks to remove append-only test rows
do \$\$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'company_id' and x.table_type = 'BASE TABLE' loop
    execute format('delete from public.%I where company_id = %L', t, '$COMPANY');
  end loop;
end \$\$;
delete from public.companies where id = '$COMPANY';
delete from public.profiles where id in ('$USER_ID', '$ADMIN2');
delete from auth.users where id in ('$USER_ID', '$ADMIN2');
SQL
}
trap cleanup EXIT

check() { # name, expected, actual
  if [ "$2" = "$3" ]; then echo "ok - $1"; else echo "not ok - $1 (expected $2, got $3)"; failures=$((failures + 1)); fi
}

# Run A (holding locks for 1.5 s) and B (started 0.3 s later). Prints "A_exit B_exit".
race() {
  local a_out b_out
  a_out=$(mktemp); b_out=$(mktemp)
  (q -c "$(as_user "$1 select pg_sleep(1.5);")" >"$a_out" 2>&1; echo "exit=$?" >>"$a_out") &
  local pid=$!
  sleep 0.3
  (q -c "$(as_user "$2")" >"$b_out" 2>&1; echo "exit=$?" >>"$b_out") || true
  wait $pid || true
  RACE_A=$(cat "$a_out"); RACE_B=$(cat "$b_out")
  rm -f "$a_out" "$b_out"
}
# The same, with session B run as another user: A_sql, B_user, B_sql.
race_as() {
  local a_out b_out
  a_out=$(mktemp); b_out=$(mktemp)
  (q -c "$(as_user "$1 select pg_sleep(1.5);")" >"$a_out" 2>&1; echo "exit=$?" >>"$a_out") &
  local pid=$!
  sleep 0.3
  (q -c "$(as_who "$2" "$3")" >"$b_out" 2>&1; echo "exit=$?" >>"$b_out") || true
  wait $pid || true
  RACE_A=$(cat "$a_out"); RACE_B=$(cat "$b_out")
  rm -f "$a_out" "$b_out"
}
succeeded() { if grep -q 'exit=0' <<<"$1"; then echo yes; else echo no; fi }
mentions() { if grep -q "$2" <<<"$1"; then echo yes; else echo no; fi }

# --- Fixture: company, project, supplier, two posted bills, one payment -------------
q -c "insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
      values ('$USER_ID', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'race-$USER_ID@test.local', '{\"full_name\":\"Race Owner\"}', '{}', now(), now())" >/dev/null
COMPANY=$(q -c "$(as_user "select public.create_company('Race Nirman $USER_ID', 'Race Owner');")" | tail -1)
PROJECT=$(q -c "$(as_user "select public.create_project('$COMPANY', 'R1', 'Race project', 100000000);")" | tail -1)
SUPPLIER=$(q -c "$(as_user "insert into public.suppliers (company_id, name) values ('$COMPANY', 'Race Supplier') returning id;")" | tail -1)

new_bill() { # draft bill of Rs 1,00,000; prints its id
  local id; id=$(uuidgen | tr 'A-Z' 'a-z')
  q -c "$(as_user "select public.save_bill_draft(jsonb_build_object('id', '$id', 'supplier_id', '$SUPPLIER', 'bill_no', '$id',
    'bill_date', '2026-05-01', 'lines', jsonb_build_array(jsonb_build_object('project_id', '$PROJECT',
      'heading_id', (select id from public.cost_headings where company_id = '$COMPANY' and name = 'Cement'),
      'description', 'Cement', 'qty', 1, 'unit_id', (select id from public.units where company_id = '$COMPANY' and code = 'bag'),
      'amount_paisa', 10000000, 'unmatched_reason', 'race'))));")" >/dev/null
  echo "$id"
}

# C2: concurrent post_bill on one draft -> posted once.
BILL=$(new_bill)
race "select public.post_bill(gen_random_uuid(), '$BILL');" "select public.post_bill(gen_random_uuid(), '$BILL');"
check "C2: first post succeeds" yes "$(succeeded "$RACE_A")"
check "C2: concurrent second post is refused" no "$(succeeded "$RACE_B")"
check "C2: refused as already posted" yes "$(mentions "$RACE_B" already_posted)"
check "C2: one posting event" 1 "$(q -c "select count(*) from public.posting_events where bill_id = '$BILL'")"

# C1: two settlements of 60,000 against a 1,00,000 bill -> only one succeeds.
PAYMENT=$(uuidgen | tr 'A-Z' 'a-z')
q -c "$(as_user "select public.record_payment(gen_random_uuid(), jsonb_build_object('id', '$PAYMENT', 'supplier_id', '$SUPPLIER',
  'payment_date', '2026-05-02', 'amount_paisa', 12000000,
  'allocations', jsonb_build_array(jsonb_build_object('project_id', '$PROJECT', 'amount_paisa', 12000000))));")" >/dev/null
SETTLE="select public.settle(gen_random_uuid(), jsonb_build_array(jsonb_build_object('payment_id', '$PAYMENT',
  'bill_id', '$BILL', 'project_id', '$PROJECT', 'amount_paisa', 6000000)));"
race "$SETTLE" "$SETTLE"
check "C1: first settlement succeeds" yes "$(succeeded "$RACE_A")"
check "C1: concurrent second settlement is refused" no "$(succeeded "$RACE_B")"
check "C1: the bill is settled 60,000, not 1,20,000" 6000000 \
  "$(q -c "select sum(amount_paisa) from public.settlement_events where bill_id = '$BILL'")"

# Same op_key from two devices at once -> one payment, both get the same answer.
KEY=$(uuidgen | tr 'A-Z' 'a-z'); PAY2=$(uuidgen | tr 'A-Z' 'a-z')
PAY="select public.record_payment('$KEY', jsonb_build_object('id', '$PAY2', 'supplier_id', '$SUPPLIER',
  'payment_date', '2026-05-03', 'amount_paisa', 100000,
  'allocations', jsonb_build_array(jsonb_build_object('project_id', '$PROJECT', 'amount_paisa', 100000)))) ->> 'number';"
race "$PAY" "$PAY"
check "C3: both concurrent submissions succeed" "yes yes" "$(succeeded "$RACE_A") $(succeeded "$RACE_B")"
check "C3: one payment is recorded" 1 "$(q -c "select count(*) from public.payments where id = '$PAY2'")"
check "C3: both get the same payment number" \
  "$(echo "$RACE_A" | grep '^PAY-')" "$(echo "$RACE_B" | grep '^PAY-')"

# C5: concurrent reversals -> reversed once.
BILL2=$(new_bill)
q -c "$(as_user "select public.post_bill(gen_random_uuid(), '$BILL2');")" >/dev/null
REVERSE="select public.reverse_bill(gen_random_uuid(), '$BILL2', '2026-05-05', 'race');"
race "$REVERSE" "$REVERSE"
check "C5: first reversal succeeds" yes "$(succeeded "$RACE_A")"
check "C5: concurrent second reversal is refused" no "$(succeeded "$RACE_B")"
check "C5: one reversal record" 1 "$(q -c "select count(*) from public.reversals where bill_id = '$BILL2'")"
check "C5: bill cost nets to zero" 0 \
  "$(q -c "select sum(l.cost_paisa) from public.ledger_entries l join public.posting_events e on e.id = l.event_id
           left join public.reversals r on r.id = e.reversal_id where e.bill_id = '$BILL2' or r.bill_id = '$BILL2'")"

# Slip cancel vs delivery at the same moment: never a cancelled slip with a delivery on it.
new_slip() { # approved slip for 100 bags; prints its id
  local id; id=$(uuidgen | tr 'A-Z' 'a-z')
  q -c "$(as_user "select public.save_slip_draft(jsonb_build_object('id', '$id', 'supplier_id', '$SUPPLIER',
    'lines', jsonb_build_array(jsonb_build_object('id', '$id', 'project_id', '$PROJECT', 'material_text', 'Cement', 'qty', 100,
      'unit_id', (select id from public.units where company_id = '$COMPANY' and code = 'bag')))));
    select public.submit_slip('$id');
    select public.decide_slip('$id', true) where (select status from public.order_slips where id = '$id') = 'pending';")" >/dev/null
  echo "$id"
}
deliver() { # SQL recording 10 bags against slip $1
  echo "select public.record_delivery(jsonb_build_object('id', gen_random_uuid(), 'supplier_id', '$SUPPLIER',
    'project_id', '$PROJECT', 'slip_id', '$1', 'lines', jsonb_build_array(jsonb_build_object('slip_line_id', '$1', 'received_qty', 10))));"
}
slip_state() {
  q -c "select s.status || ':' || count(d.id) from public.order_slips s left join public.deliveries d on d.slip_id = s.id
        where s.id = '$1' group by s.status"
}
SLIP=$(new_slip)
race "$(deliver "$SLIP")" "select public.cancel_slip('$SLIP', 'race');"
check "Slip: delivery first, then the concurrent cancel is refused" "yes no" "$(succeeded "$RACE_A") $(succeeded "$RACE_B")"
check "Slip: still approved with its delivery" "approved:1" "$(slip_state "$SLIP")"
SLIP=$(new_slip)
race "select public.cancel_slip('$SLIP', 'race');" "$(deliver "$SLIP")"
check "Slip: cancel first, then the concurrent delivery is refused" "yes no" "$(succeeded "$RACE_A") $(succeeded "$RACE_B")"
check "Slip: cancelled with no delivery" "cancelled:0" "$(slip_state "$SLIP")"

# L1: the same weekly labour entry from two devices at once -> one batch of 7 days.
KEY=$(uuidgen | tr 'A-Z' 'a-z'); BATCH=$(uuidgen | tr 'A-Z' 'a-z')
WEEK="select public.save_labour_batch('$KEY', jsonb_build_object('id', '$BATCH', 'project_id', '$PROJECT',
  'from_date', '2026-05-11', 'to_date', '2026-05-17', 'total_paisa', 7000000)) ->> 'batch_id';"
race "$WEEK" "$WEEK"
check "L1: both concurrent submissions succeed" "yes yes" "$(succeeded "$RACE_A") $(succeeded "$RACE_B")"
check "L1: 7 daily records, not 14" 7 "$(q -c "select count(*) from public.labour_costs where batch_id = '$BATCH'")"

# Concurrent approvals of one work charge with different keys -> approved once.
SUB=$(q -c "$(as_user "insert into public.subcontractors (company_id, name) values ('$COMPANY', 'Race Plaster') returning id;")" | tail -1)
PKG=$(uuidgen | tr 'A-Z' 'a-z'); CHARGE=$(uuidgen | tr 'A-Z' 'a-z')
q -c "$(as_user "select public.save_work_package(jsonb_build_object('id', '$PKG', 'project_id', '$PROJECT',
  'subcontractor_id', '$SUB', 'scope', 'Plaster'));
  select public.save_charge_claim(jsonb_build_object('id', '$CHARGE', 'work_package_id', '$PKG',
  'charge_date', '2026-05-10', 'claimed_paisa', 8000000));")" >/dev/null
APPROVE="select public.approve_charge(gen_random_uuid(), '$CHARGE', 8000000, '2026-05-12');"
race "$APPROVE" "$APPROVE"
check "Charge: first approval succeeds" yes "$(succeeded "$RACE_A")"
check "Charge: concurrent second approval is refused" no "$(succeeded "$RACE_B")"
check "Charge: one cost event" 1 "$(q -c "select count(*) from public.posting_events where charge_id = '$CHARGE'")"

# L2: the same daily report with labour from two devices at once -> one report, one labour cost.
KEY=$(uuidgen | tr 'A-Z' 'a-z'); REPORT=$(uuidgen | tr 'A-Z' 'a-z')
SEND="select public.submit_daily_report('$KEY', jsonb_build_object('id', '$REPORT', 'project_id', '$PROJECT',
  'work_date', '2026-05-20', 'work_done', 'Slab casting', 'headcount', 10,
  'labour', jsonb_build_object('amount_paisa', 1200000, 'confirm_duplicate', true))) ->> 'id';"
race "$SEND" "$SEND"
check "L2: both concurrent submissions succeed" "yes yes" "$(succeeded "$RACE_A") $(succeeded "$RACE_B")"
check "L2: one report" 1 "$(q -c "select count(*) from public.daily_reports where id = '$REPORT'")"
check "L2: one labour cost" 1 "$(q -c "select count(*) from public.labour_costs where daily_report_id = '$REPORT'")"

# Refunds: two refunds of 30,000 racing for one 50,000 overpayment -> only one fits.
SUPPLIER2=$(q -c "$(as_user "insert into public.suppliers (company_id, name) values ('$COMPANY', 'Refund Supplier') returning id;")" | tail -1)
q -c "$(as_user "select public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'supplier_id', '$SUPPLIER2',
  'payment_date', '2026-05-02', 'amount_paisa', 5000000));")" >/dev/null
REFUND="select public.record_refund(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'supplier_id', '$SUPPLIER2',
  'refund_date', '2026-05-04', 'amount_paisa', 3000000));"
race "$REFUND" "$REFUND"
check "Refund: first refund succeeds" yes "$(succeeded "$RACE_A")"
check "Refund: concurrent second refund is refused" no "$(succeeded "$RACE_B")"
check "Refund: refused as more than the overpayment" yes "$(mentions "$RACE_B" refund_exceeds_overpayment)"
check "Refund: overpayment left is 20,000" -2000000 \
  "$(q -c "select sum(balance_paisa) from public.ledger_entries where party_id = '$SUPPLIER2'")"

# Two admins removing each other at the same moment -> one stays admin.
q -c "insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
      values ('$ADMIN2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'race2-$ADMIN2@test.local', '{\"full_name\":\"Race Admin\"}', '{}', now(), now());
      insert into public.memberships (company_id, user_id, roles) values ('$COMPANY', '$ADMIN2', array['admin']::public.app_role[])" >/dev/null
race_as "update public.memberships set active = false where company_id = '$COMPANY' and user_id = '$ADMIN2';" \
  "$ADMIN2" "update public.memberships set active = false where company_id = '$COMPANY' and user_id = '$USER_ID';"
check "Admins: the first removal succeeds" yes "$(succeeded "$RACE_A")"
check "Admins: the concurrent second removal is refused" no "$(succeeded "$RACE_B")"
check "Admins: one active admin is left" 1 \
  "$(q -c "select count(*) from public.memberships where company_id = '$COMPANY' and active and 'admin' = any (roles)")"

# One worker marked on two projects (two crews) at the same moment -> the second is an overlap.
q -c "update public.companies set labour_mode = 'attendance' where id = '$COMPANY'" >/dev/null
PROJECT2=$(q -c "$(as_user "select public.create_project('$COMPANY', 'R2', 'Race project 2', 100000000);")" | tail -1)
CREW1=$(q -c "select id from public.crews where project_id = '$PROJECT' and is_default")
CREW2=$(q -c "select id from public.crews where project_id = '$PROJECT2' and is_default")
WORKER=$(q -c "$(as_user "insert into public.crew_members (company_id, crew_id, name, rate_kind, rate_paisa)
  values ('$COMPANY', '$CREW1', 'Race Worker', 'daily', 120000) returning id;")" | tail -1)
mark() { # project, crew
  echo "select public.set_attendance(jsonb_build_object('project_id', '$1', 'crew_id', '$2', 'member_id', '$WORKER',
    'work_date', '2026-05-04', 'time_in', '08:00', 'time_out', '17:00', 'minutes', 480));"
}
race "$(mark "$PROJECT" "$CREW1")" "$(mark "$PROJECT2" "$CREW2")"
check "Attendance: the first mark succeeds" yes "$(succeeded "$RACE_A")"
check "Attendance: the concurrent mark on another project is refused" no "$(succeeded "$RACE_B")"
check "Attendance: refused as an overlap" yes "$(mentions "$RACE_B" attendance_overlap)"
check "Attendance: the worker has one day, not two" 1 \
  "$(q -c "select count(*) from public.attendance where member_id = '$WORKER' and work_date = '2026-05-04'")"

# A split and a change to the same worker's day at the same moment -> the change waits, then sees the split.
split() { # worker, date, from project, to project, to crew
  echo "select public.split_attendance(jsonb_build_object('member_id', '$1', 'work_date', '$2',
    'from_project', '$3', 'to_project', '$4', 'to_crew', '$5'));"
}
mark_day() { # worker, date, project, crew, in, out, minutes
  local times="null, 'time_out', null"
  [ -n "$5" ] && times="'$5', 'time_out', '$6'"
  echo "select public.set_attendance(jsonb_build_object('project_id', '$3', 'crew_id', '$4', 'member_id', '$1',
    'work_date', '$2', 'time_in', $times, 'minutes', $7));"
}
q -c "$(as_user "$(mark_day "$WORKER" 2026-05-06 "$PROJECT" "$CREW1" 08:00 17:00 480)")" >/dev/null
race "$(split "$WORKER" 2026-05-06 "$PROJECT" "$PROJECT2" "$CREW2")" "$(mark_day "$WORKER" 2026-05-06 "$PROJECT" "$CREW1" 08:00 17:00 480)"
check "Split: the split succeeds" yes "$(succeeded "$RACE_A")"
check "Split: a full day marked again at the same moment is refused" no "$(succeeded "$RACE_B")"
check "Split: refused as an overlap with the afternoon" yes "$(mentions "$RACE_B" attendance_overlap)"
check "Split: the day still adds up to 8 hours" 480 \
  "$(q -c "select sum(minutes) from public.attendance where member_id = '$WORKER' and work_date = '2026-05-06'")"

# Two splits between the same two crews in opposite directions at the same moment -> both succeed, no deadlock.
WORKER2=$(q -c "$(as_user "insert into public.crew_members (company_id, crew_id, name, rate_kind, rate_paisa)
  values ('$COMPANY', '$CREW2', 'Race Worker 2', 'daily', 120000) returning id;")" | tail -1)
q -c "$(as_user "$(mark_day "$WORKER" 2026-05-07 "$PROJECT" "$CREW1" 08:00 17:00 480)
  $(mark_day "$WORKER2" 2026-05-07 "$PROJECT2" "$CREW2" 08:00 17:00 480)")" >/dev/null
race "$(split "$WORKER" 2026-05-07 "$PROJECT" "$PROJECT2" "$CREW2")" "$(split "$WORKER2" 2026-05-07 "$PROJECT2" "$PROJECT" "$CREW1")"
check "Split: opposite splits both succeed" "yes yes" "$(succeeded "$RACE_A") $(succeeded "$RACE_B")"
check "Split: neither hit a deadlock" no "$(mentions "$RACE_A$RACE_B" deadlock)"
check "Split: each worker has two parts" "2 2" \
  "$(q -c "select count(*) from public.attendance where member_id = '$WORKER' and work_date = '2026-05-07'") $(q -c "select count(*) from public.attendance where member_id = '$WORKER2' and work_date = '2026-05-07'")"

# Hours without times on two projects at the same moment -> never more than 24 hours in a day.
race "$(mark_day "$WORKER" 2026-05-08 "$PROJECT" "$CREW1" "" "" 800)" "$(mark_day "$WORKER" 2026-05-08 "$PROJECT2" "$CREW2" "" "" 800)"
check "24 h: the first succeeds" yes "$(succeeded "$RACE_A")"
check "24 h: the concurrent second is refused" no "$(succeeded "$RACE_B")"
check "24 h: refused as more than 24 hours" yes "$(mentions "$RACE_B" "more than 24 hours")"

# Closing a project while a bill posts or a client receipt is recorded -> the posting waits and is refused.
BILL3=$(new_bill)
race "update public.projects set status = 'closed' where id = '$PROJECT';" "select public.post_bill(gen_random_uuid(), '$BILL3');"
check "Close: the project closes" yes "$(succeeded "$RACE_A")"
check "Close: a bill posted at the same moment is refused" no "$(succeeded "$RACE_B")"
check "Close: refused as closed" yes "$(mentions "$RACE_B" closed)"
q -c "update public.projects set status = 'active' where id = '$PROJECT'" >/dev/null
race "update public.projects set status = 'closed' where id = '$PROJECT';" \
  "select public.record_client_receipt(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', '$PROJECT',
    'receipt_date', '2026-05-05', 'amount_paisa', 100000));"
check "Close: a client receipt at the same moment is refused" no "$(succeeded "$RACE_B")"
check "Close: no receipt recorded" 0 "$(q -c "select count(*) from public.client_receipts where project_id = '$PROJECT'")"
q -c "update public.projects set status = 'active' where id = '$PROJECT'" >/dev/null
race "select public.post_bill(gen_random_uuid(), '$BILL3');" "update public.projects set status = 'closed' where id = '$PROJECT';"
check "Close: a bill posting first, then the close, both succeed" "yes yes" "$(succeeded "$RACE_A") $(succeeded "$RACE_B")"
q -c "update public.projects set status = 'active' where id = '$PROJECT'" >/dev/null
race "select public.record_client_receipt(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', '$PROJECT',
    'receipt_date', '2026-05-05', 'amount_paisa', 100000));" "update public.projects set status = 'closed' where id = '$PROJECT';"
check "Close: a receipt first, then the close, both succeed" "yes yes" "$(succeeded "$RACE_A") $(succeeded "$RACE_B")"
check "Close: the receipt is recorded and the project closed" "1 closed" \
  "$(q -c "select count(*) from public.client_receipts where project_id = '$PROJECT'") $(q -c "select status from public.projects where id = '$PROJECT'")"

if [ "$failures" -gt 0 ]; then echo "$failures concurrency test(s) failed"; exit 1; fi
echo "All concurrency tests passed"
