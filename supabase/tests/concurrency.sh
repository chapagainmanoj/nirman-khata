#!/usr/bin/env bash
# Concurrency tests with two real database connections (design §10.1: C1, C2, C5, and the
# same-key retry from C3). pgTAP runs in one transaction, so these cannot live there.
# Each test runs session A (which holds its locks for a moment) and session B at the same time.
# Usage: bash supabase/tests/concurrency.sh   (local Supabase must be running)
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:55322/postgres}"
q() { psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 "$@"; }

USER_ID=$(uuidgen | tr 'A-Z' 'a-z')
COMPANY=""
failures=0

as_user() { # SQL run as the test user, in one transaction
  printf "set role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"%s\",\"role\":\"authenticated\"}', true); %s" \
    "$USER_ID" "$1"
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
delete from public.profiles where id = '$USER_ID';
delete from auth.users where id = '$USER_ID';
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

if [ "$failures" -gt 0 ]; then echo "$failures concurrency test(s) failed"; exit 1; fi
echo "All concurrency tests passed"
