-- Fixes from the second full review (2026-10-14). Each section names the problem it closes.

-- ---------------------------------------------------------------------------
-- 1. Slips: changing a slip needs a working role (not only Viewer) and the right to work on every
--    project on it, also for its creator. An empty draft has no projects, so the role is checked
--    on its own.
-- ---------------------------------------------------------------------------
create function private.has_working_role(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company and m.user_id = auth.uid() and m.active
      and m.roles && array['admin', 'project_manager', 'site_staff', 'accounts']::public.app_role[]
  )
$$;

-- Works on every project on the slip (true for a slip with no lines yet).
create function private.can_work_on_whole_slip(p_slip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.order_slip_lines l
    where l.slip_id = p_slip and not private.can_work_on_project(l.company_id, l.project_id)
  )
$$;

create or replace function private.can_edit_slip(p_slip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.order_slips s
    where s.id = p_slip and private.has_working_role(s.company_id)
      and (s.created_by = auth.uid() or private.sees_all_projects(s.company_id))
      and private.can_work_on_whole_slip(s.id)
  )
$$;

create or replace function public.slip_permissions(p_slip uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.order_slips;
  v_whole boolean;
  v_editor boolean;
  v_worker boolean;
  v_creator boolean;
  v_deliveries boolean;
  v_fulfilment text;
begin
  select * into s from public.order_slips where id = p_slip;
  if not found or not private.can_see_slip(p_slip) then
    return null;
  end if;
  v_whole := private.can_see_whole_slip(p_slip);
  v_editor := private.can_edit_slip(p_slip);
  v_worker := exists (
    select 1 from public.order_slip_lines l
    where l.slip_id = p_slip and private.can_work_on_project(l.company_id, l.project_id)
  );
  -- The creator acts on their own slip only while they may still work on all of it.
  v_creator := s.created_by = auth.uid() and private.has_working_role(s.company_id) and private.can_work_on_whole_slip(p_slip);
  v_deliveries := exists (select 1 from public.deliveries d where d.slip_id = p_slip);
  v_fulfilment := private.slip_fulfilment(p_slip);
  return jsonb_build_object(
    'can_edit', s.status in ('draft', 'rejected') and v_editor,
    'can_submit', s.status = 'draft' and v_editor,
    'can_delete', s.status = 'draft' and v_editor,
    'can_approve', s.status = 'pending' and private.can_approve_slip(p_slip),
    'can_share', s.status = 'approved' and v_whole and v_worker,
    'can_cancel', s.status in ('draft', 'pending', 'approved') and not v_deliveries
      and (v_creator or private.is_admin(s.company_id) or private.can_approve_slip(p_slip)),
    'can_close_short', s.status = 'approved' and s.closed_short_at is null and v_whole
      and v_fulfilment <> 'fully_received'
      and (v_creator or private.can_manage_parties(s.company_id)),
    'can_record_delivery', s.status = 'approved' and s.closed_short_at is null and v_worker,
    'fulfilment', v_fulfilment
  );
end $$;

-- ---------------------------------------------------------------------------
-- 2. A retried worker close is checked against the projects it closed (design §6, C4).
-- ---------------------------------------------------------------------------
create or replace function public.close_worker_days(p_op_key uuid, p_close jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := (p_close ->> 'member_id')::uuid;
  v_from date := (p_close ->> 'from_date')::date;
  v_to date := (p_close ->> 'to_date')::date;
  v_company uuid := (select m.company_id from public.crew_members m where m.id = v_member);
  v_prior jsonb;
  v_one jsonb;
  v_total bigint := 0;
  v_days integer := 0;
  v_payments jsonb := '[]'::jsonb;
  v_groups integer := 0;
  v_ids uuid[];
  g record;
begin
  if v_company is null then
    raise exception 'Choose a worker' using errcode = 'P0001';
  end if;
  if not private.is_member(v_company) then
    raise exception 'You cannot close this worker''s days' using errcode = '42501';
  end if;
  if jsonb_typeof(p_close -> 'pay_now') = 'object' and not private.can_record_payments(v_company) then
    raise exception 'You cannot record payments; close it as unpaid' using errcode = '42501';
  end if;
  -- A retry returns the first result only while the user may still enter labour on every project
  -- that close covered (design §6, C4).
  if exists (
    select 1 from public.posting_events e join public.labour_costs l on l.id = e.labour_cost_id
    where e.company_id = v_company and e.op_key = p_op_key and not private.can_work_on_project(v_company, l.project_id)
  ) then
    raise exception 'You cannot enter labour on a project these days were closed on' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'close_worker_days', p_close);
  if v_prior is not null then
    return v_prior;
  end if;
  if v_from is null or v_to is null or v_to < v_from or v_to - v_from > 31 then
    raise exception 'Choose up to 32 days to close' using errcode = '22023';
  end if;

  -- Crews in a fixed order, so two closes that share crews take their locks the same way.
  for g in
    select a.project_id, a.crew_id, min(a.work_date) as first_day, max(a.work_date) as last_day
    from public.attendance a
    where a.member_id = v_member and a.work_date between v_from and v_to
      and not private.attendance_is_closed(a.labour_cost_id)
      and private.can_work_on_project(v_company, a.project_id)
    group by a.project_id, a.crew_id
    order by a.crew_id, a.project_id
  loop
    perform private.attendance_scope(g.project_id, g.crew_id);
    -- Only the dates this worker is on; other open days of the crew stay open.
    v_ids := '{}';
    for v_one in
      select private.close_crew_days(v_company, g.project_id, g.crew_id, d.work_date, d.work_date,
        null, (p_close ->> 'confirm_duplicate')::boolean, p_op_key)
      from (
        select distinct a.work_date from public.attendance a
        where a.member_id = v_member and a.project_id = g.project_id and a.crew_id = g.crew_id
          and a.work_date between g.first_day and g.last_day and not private.attendance_is_closed(a.labour_cost_id)
        order by a.work_date
      ) d
    loop
      v_total := v_total + (v_one ->> 'total_paisa')::bigint;
      v_days := v_days + 1;
      v_ids := v_ids || array(select (x #>> '{}')::uuid from jsonb_array_elements(v_one -> 'labour_cost_ids') x);
    end loop;
    -- One payment for this crew and project, covering the days just closed.
    if jsonb_typeof(p_close -> 'pay_now') = 'object' then
      v_payments := v_payments || jsonb_build_array(
        private.pay_now(v_company, g.crew_id, g.project_id, v_ids, g.last_day, p_close -> 'pay_now', p_op_key));
    end if;
    v_groups := v_groups + 1;
  end loop;
  if v_groups = 0 then
    raise exception 'No open days to close' using errcode = 'P0001';
  end if;

  return private.finish_op(v_company, p_op_key, jsonb_build_object(
    'total_paisa', v_total, 'days', v_days, 'crews', v_groups, 'payments', v_payments));
end $$;

-- ---------------------------------------------------------------------------
-- 3. Two admins removing each other at the same time cannot leave the company without one.
--    The company row is locked first, so the second change waits and then sees the first.
-- ---------------------------------------------------------------------------
create function private.lock_company_for_admins() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.active and 'admin' = any (old.roles) then
    perform 1 from public.companies where id = old.company_id for no key update;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger lock_company_for_admins before update or delete on public.memberships
  for each row execute function private.lock_company_for_admins();

-- ---------------------------------------------------------------------------
-- 4. One worker's attendance changes one at a time, whichever crew or project it is on.
--    Lock order: worker, then crews (by id), then attendance rows.
-- ---------------------------------------------------------------------------
create function private.lock_worker(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.crew_members where id = p_member for no key update;
  if not found then
    raise exception 'Choose a worker' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.set_attendance(p_row jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_row ->> 'project_id')::uuid;
  v_crew uuid := (p_row ->> 'crew_id')::uuid;
  v_member uuid := (p_row ->> 'member_id')::uuid;
  v_date date := (p_row ->> 'work_date')::date;
  v_in time := nullif(p_row ->> 'time_in', '')::time;
  v_out time := nullif(p_row ->> 'time_out', '')::time;
  v_minutes integer := coalesce((p_row ->> 'minutes')::integer, 0);
  v_company uuid := private.attendance_scope(v_project, v_crew);
  v_row public.attendance;
begin
  -- The worker first, then the crew: two marks of one worker on two projects (two crews) take
  -- turns, so the overlap and 24-hour checks below see each other.
  perform private.lock_worker(v_member);
  if v_date is null or v_date > private.today() then
    raise exception 'Attendance cannot be marked for a future date' using errcode = '22023';
  end if;
  if not exists (select 1 from public.crew_members m where m.id = v_member and m.company_id = v_company and m.active) then
    raise exception 'Choose a worker who is still on a crew' using errcode = 'P0001';
  end if;
  if v_minutes < 0 or v_minutes > 1440 then
    raise exception 'Hours must be between 0 and 24' using errcode = '22023';
  end if;

  -- Same lock as closing, so a day cannot change while it is being closed.
  perform private.lock_party(v_crew);
  if exists (
    select 1 from public.attendance a
    where a.project_id = v_project and a.crew_id = v_crew and a.work_date = v_date
      and private.attendance_is_closed(a.labour_cost_id)
  ) then
    raise exception 'day_closed: this day is closed; reverse its labour cost to change it' using errcode = 'P0001';
  end if;

  if v_minutes = 0 then
    delete from public.attendance where member_id = v_member and project_id = v_project and work_date = v_date;
    return jsonb_build_object('removed', true);
  end if;

  if v_in is not null and v_out is not null and exists (
    select 1 from public.attendance a
    where a.member_id = v_member and a.work_date = v_date and a.project_id <> v_project
      and a.time_in is not null and a.time_out is not null and a.time_in < v_out and v_in < a.time_out
  ) then
    raise exception 'attendance_overlap: these times overlap the same worker''s time on another project' using errcode = 'P0001';
  end if;
  if v_minutes + (select coalesce(sum(a.minutes), 0) from public.attendance a
      where a.member_id = v_member and a.work_date = v_date and a.project_id <> v_project) > 1440 then
    raise exception 'attendance_overlap: more than 24 hours on one day' using errcode = 'P0001';
  end if;

  insert into public.attendance (company_id, project_id, crew_id, member_id, work_date, time_in, time_out, minutes)
  values (v_company, v_project, v_crew, v_member, v_date, v_in, v_out, v_minutes)
  on conflict (member_id, project_id, work_date) do update
    set crew_id = excluded.crew_id, time_in = excluded.time_in, time_out = excluded.time_out,
      minutes = excluded.minutes, labour_cost_id = null, rate_kind = null, rate_paisa = null, amount_paisa = null
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.split_attendance(p_split jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := (p_split ->> 'member_id')::uuid;
  v_date date := (p_split ->> 'work_date')::date;
  v_from uuid := (p_split ->> 'from_project')::uuid;
  v_to uuid := (p_split ->> 'to_project')::uuid;
  v_row public.attendance;
  v_first integer;
  v_second integer;
  v_span integer;
  v_mid time;
  v_first_out time;
  v_second_in time;
  v_crew uuid;
begin
  perform private.lock_worker(v_member);
  select * into v_row from public.attendance a
  where a.member_id = v_member and a.project_id = v_from and a.work_date = v_date;
  if not found then
    raise exception 'Mark the day before splitting it' using errcode = 'P0001';
  end if;
  if v_to is null or v_to = v_from then
    raise exception 'Choose another project for the rest of the day' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.attendance a where a.member_id = v_member and a.project_id = v_to and a.work_date = v_date) then
    raise exception 'The worker is already marked on that project this day' using errcode = 'P0001';
  end if;
  v_first := v_row.minutes / 2;
  v_second := v_row.minutes - v_first;
  if v_first = 0 then
    raise exception 'This day is too short to split' using errcode = 'P0001';
  end if;

  if v_row.time_in is not null and v_row.time_out is not null then
    v_span := (extract(epoch from v_row.time_out - v_row.time_in) / 60)::integer;
    if v_span >= v_row.minutes then
      v_first_out := v_row.time_in + make_interval(mins => v_first);
      v_second_in := v_row.time_out - make_interval(mins => v_second);
    else
      -- More hours than in to out: share the span in the same proportion.
      v_mid := v_row.time_in + make_interval(mins => round(v_span::numeric * v_first / v_row.minutes)::integer);
      v_first_out := v_mid;
      v_second_in := v_mid;
    end if;
  end if;

  -- Both crews in a fixed order, so two splits between the same crews cannot deadlock.
  for v_crew in
    select c.id from public.crews c where c.id in (v_row.crew_id, nullif(p_split ->> 'to_crew', '')::uuid) order by c.id
  loop
    perform private.lock_party(v_crew);
  end loop;

  -- The first project shrinks before the other is marked, so the two never overlap.
  perform public.set_attendance(jsonb_build_object('project_id', v_from, 'crew_id', v_row.crew_id, 'member_id', v_member,
    'work_date', v_date, 'time_in', v_row.time_in, 'time_out', v_first_out, 'minutes', v_first));
  perform public.set_attendance(jsonb_build_object('project_id', v_to, 'crew_id', nullif(p_split ->> 'to_crew', ''),
    'member_id', v_member, 'work_date', v_date, 'time_in', v_second_in, 'time_out', v_row.time_out, 'minutes', v_second));
  return jsonb_build_object('first_minutes', v_first, 'second_minutes', v_second);
end $$;

-- ---------------------------------------------------------------------------
-- 5, 6. A closed project takes no new money. The project row is share-locked while checking, so
--    closing it waits for postings in progress, and a posting waits for a close in progress.
--    Client receipts (kept out of the ledger) now follow the same rule.
-- ---------------------------------------------------------------------------
create function private.require_project_open(p_project uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status public.project_status;
begin
  select status into v_status from public.projects where id = p_project for share;
  if v_status = 'closed' then
    raise exception 'This project is closed. Reopen it before posting.' using errcode = 'P0001';
  end if;
end $$;

create or replace function private.ledger_project_open() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is not null then
    perform private.require_project_open(new.project_id);
  end if;
  return new;
end $$;

create or replace function public.record_client_receipt(p_op_key uuid, p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_receipt ->> 'id')::uuid;
  v_project uuid := nullif(p_receipt ->> 'project_id', '')::uuid;
  v_company uuid := (select company_id from public.projects where id = v_project);
  v_amount bigint := (p_receipt ->> 'amount_paisa')::bigint;
  v_date date := coalesce((p_receipt ->> 'receipt_date')::date, private.today());
  v_prior jsonb;
  v_number text;
begin
  if v_company is null or not private.can_record_payments(v_company) or not private.can_see_project(v_company, v_project) then
    raise exception 'You cannot record client payments on this project' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'Receipt id is required' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'The amount must be more than zero' using errcode = '22023';
  end if;
  if v_date > private.today() then
    raise exception 'The date cannot be in the future' using errcode = '22023';
  end if;

  v_prior := private.begin_op(v_company, p_op_key, 'record_client_receipt', p_receipt);
  if v_prior is not null then
    return v_prior;
  end if;
  perform private.require_project_open(v_project);

  v_number := public.next_doc_number(v_company, 'client_receipt', 'CR');
  insert into public.client_receipts (company_id, id, number, project_id, receipt_date, amount_paisa, kind, method, reference, notes)
  values (
    v_company, v_id, v_number, v_project, v_date, v_amount,
    coalesce((p_receipt ->> 'kind')::public.client_receipt_kind, 'running_bill'),
    coalesce((p_receipt ->> 'method')::public.payment_method, 'bank_transfer'),
    nullif(trim(p_receipt ->> 'reference'), ''), nullif(trim(p_receipt ->> 'notes'), '')
  );
  return private.finish_op(v_company, p_op_key, jsonb_build_object('receipt_id', v_id, 'number', v_number));
end $$;

create or replace function public.reverse_client_receipt(p_op_key uuid, p_receipt uuid, p_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.client_receipts;
  v_company uuid := (select company_id from public.client_receipts where id = p_receipt);
  v_prior jsonb;
  v_reason text;
  v_date date := coalesce(p_date, private.today());
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can reverse client payments' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'reverse_client_receipt',
    jsonb_build_object('receipt', p_receipt, 'date', p_date, 'reason', p_reason));
  if v_prior is not null then
    return v_prior;
  end if;
  v_reason := private.require_reason(p_reason);
  select * into r from public.client_receipts where id = p_receipt for update;
  perform private.require_project_open(r.project_id);
  if r.status = 'reversed' then
    raise exception 'already_reversed: this payment was already reversed' using errcode = 'P0001';
  end if;
  if v_date < r.receipt_date then
    raise exception 'The reversal cannot be dated before the payment' using errcode = '22023';
  end if;
  if v_date > private.today() then
    raise exception 'The date cannot be in the future' using errcode = '22023';
  end if;
  insert into public.client_receipt_reversals (company_id, receipt_id, reversal_date, reason)
  values (v_company, p_receipt, v_date, v_reason);
  update public.client_receipts set status = 'reversed' where id = p_receipt;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('receipt_id', p_receipt));
end $$;

-- ---------------------------------------------------------------------------
-- 8. Payment register by project follows moves between projects. A payment's share of a project
--    is its allocation there, net of moves, as on the payments list (payment_summaries); moves
--    carry no payment_id on their posting event, so the ledger join missed them.
-- ---------------------------------------------------------------------------
create or replace function public.report_payments(
  p_company uuid, p_from date, p_to date, p_project uuid default null, p_party uuid default null, p_as_of date default null
)
returns table (
  payment_id uuid, number text, payment_date date, party_kind text, party_id uuid, party_name text,
  method public.payment_method, reference text, amount_paisa bigint, project_paisa bigint,
  settled_paisa bigint, reversed_on date, kind text
)
language sql stable security invoker set search_path = '' as $$
  with d as (select coalesce(p_as_of, greatest(p_to, private.today())) as as_of)
  select p.id, p.number, p.payment_date,
    case when p.supplier_id is not null then 'supplier' when p.subcontractor_id is not null then 'subcontractor'
         when p.crew_id is not null then 'crew' else 'payee' end,
    p.party_id, private.party_name(p.party_id), p.method, p.reference, p.amount_paisa,
    pp.project_paisa,
    (select coalesce(sum(s.amount_paisa), 0)::bigint from public.settlement_events s, d
     where s.payment_id = p.id and s.business_date <= d.as_of and (p_project is null or s.project_id = p_project)),
    (select r.reversal_date from public.reversals r, d where r.payment_id = p.id and r.reversal_date <= d.as_of),
    'payment'
  from public.payments p
  cross join lateral (
    select case when p_project is not null then (
      select sum(a.amount_paisa)::bigint from public.payment_allocation_events a, d
      where a.payment_id = p.id and a.project_id = p_project and a.business_date <= d.as_of
    ) end as project_paisa
  ) pp
  where p.company_id = p_company and p.payment_date between p_from and p_to
    and (p_party is null or p.party_id = p_party)
    and (p_project is null or coalesce(pp.project_paisa, 0) <> 0)
  union all
  select f.id, f.number, f.refund_date,
    case when f.supplier_id is not null then 'supplier' when f.subcontractor_id is not null then 'subcontractor'
         when f.crew_id is not null then 'crew' else 'payee' end,
    f.party_id, private.party_name(f.party_id), f.method, f.reference, -f.amount_paisa,
    case when p_project is not null then -f.amount_paisa end,
    0::bigint,
    (select r.reversal_date from public.reversals r, d where r.refund_id = f.id and r.reversal_date <= d.as_of),
    'refund'
  from public.refunds f
  where f.company_id = p_company and f.refund_date between p_from and p_to
    and (p_party is null or f.party_id = p_party)
    and (p_project is null or f.project_id = p_project)
  order by 3, 2
$$;

-- ---------------------------------------------------------------------------
-- 9. Peski as of a date counts a payment (or a Peski Returned) until the date it was reversed,
--    not by its status today, so a later reversal does not rewrite earlier dashboards.
-- ---------------------------------------------------------------------------
-- Whether a payment or refund still stood on a date: posted now, or reversed only after that date.
-- Reads the reversal with definer rights, so it does not depend on who may see reversals.
create function private.posted_on(p_status public.doc_status, p_as_of date, p_payment uuid, p_refund uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_status = 'posted' or exists (
    select 1 from public.reversals r
    where r.reversal_date > p_as_of and (r.payment_id = p_payment or r.refund_id = p_refund)
  )
$$;

create or replace function private.peski_open(p_party uuid, p_project uuid, p_whole boolean, p_as_of date) returns bigint
language sql stable set search_path = '' as $$
  select (
    coalesce((
      select sum(case
        when p_whole then p.amount_paisa
        when p_project is null then p.amount_paisa - (
          select coalesce(sum(a.amount_paisa), 0) from public.payment_allocation_events a
          where a.payment_id = p.id and a.business_date <= p_as_of)
        else (
          select coalesce(sum(a.amount_paisa), 0) from public.payment_allocation_events a
          where a.payment_id = p.id and a.project_id = p_project and a.business_date <= p_as_of)
      end)
      from public.payments p
      where p.party_id = p_party and p.is_peski and p.payment_date <= p_as_of
        and private.posted_on(p.status, p_as_of, p.id, null)), 0)
    - coalesce((
      select sum(s.amount_paisa) from public.settlement_events s join public.payments p on p.id = s.payment_id
      where p.party_id = p_party and p.is_peski and s.business_date <= p_as_of
        and private.posted_on(p.status, p_as_of, p.id, null)
        and (p_whole or s.project_id is not distinct from p_project)), 0)
    - coalesce((
      select sum(f.amount_paisa) from public.refunds f
      where f.party_id = p_party and f.kind = 'peski_returned' and f.refund_date <= p_as_of
        and private.posted_on(f.status, p_as_of, null, f.id)
        and (p_whole or f.project_id is not distinct from p_project)), 0)
  )::bigint
$$;

revoke execute on function
  private.has_working_role(uuid), private.can_work_on_whole_slip(uuid), private.lock_worker(uuid),
  private.require_project_open(uuid), private.lock_company_for_admins()
from public, anon, authenticated;
-- Called by peski_open, which runs with the caller's rights.
revoke execute on function private.posted_on(public.doc_status, date, uuid, uuid) from public, anon;
grant execute on function private.posted_on(public.doc_status, date, uuid, uuid) to authenticated;
