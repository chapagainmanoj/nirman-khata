-- Workers (product owner, 2026-10-17): a worker is added once for the company, with a daily or
-- hourly rate, and put on the crews of the projects they work on. Each worker is a Party: the days
-- they work are owed to them and they are paid one by one. A crew is the group of workers on one
-- project; it stays a party for day-total labour and for what was already owed to it.
--
--   workers       the person and their rate (new party; same ids as the old crew members)
--   crew_members  now only the link: which worker is on which crew, and whether still on it
--   attendance    member_id -> worker_id
--   labour_costs  worker_id: set when the cost is owed to the worker (closing attendance)
--
-- Closing attendance now makes one labour cost per worker per day, owed to the worker, so a day
-- is closed per worker, not for the whole crew. Days closed before this stay owed to the crew;
-- if one is reversed and closed again it is owed to the worker.

-- ---------------------------------------------------------------------------
-- Workers
-- ---------------------------------------------------------------------------
create table public.workers (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  name text not null check (length(trim(name)) > 0),
  work_type text,
  rate_kind text not null check (rate_kind in ('daily', 'hourly')),
  rate_paisa bigint not null check (rate_paisa > 0),
  phone text,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);
create index workers_company_name on public.workers (company_id, lower(trim(name)));

-- Every crew member becomes a worker with the same id, so attendance and time-card links hold.
insert into public.workers (company_id, id, name, work_type, rate_kind, rate_paisa, phone, active, created_by, created_at, updated_at)
select company_id, id, name, work_type, rate_kind, rate_paisa, phone, active, created_by, created_at, updated_at
from public.crew_members;

create trigger set_updated_at before update on public.workers for each row execute function private.set_updated_at();
create trigger audit after insert or update or delete on public.workers for each row execute function private.audit();
create trigger set_created_by before insert on public.workers for each row execute function private.set_created_by();

-- Crew members: the link from a crew to a worker.
alter table public.crew_members add column worker_id uuid;
update public.crew_members set worker_id = id;
alter table public.crew_members
  alter column worker_id set not null,
  add foreign key (company_id, worker_id) references public.workers (company_id, id),
  add constraint crew_members_once unique (crew_id, worker_id);
drop index public.crew_members_unique_name;
alter table public.crew_members
  drop column name, drop column work_type, drop column rate_kind, drop column rate_paisa, drop column phone;

-- Attendance belongs to the worker.
alter table public.attendance drop constraint attendance_company_id_member_id_fkey;
alter table public.attendance rename column member_id to worker_id;
alter table public.attendance add foreign key (company_id, worker_id) references public.workers (company_id, id);
alter index public.attendance_member rename to attendance_worker;
alter table public.attendance rename constraint attendance_member_id_project_id_work_date_key to attendance_worker_id_project_id_work_date_key;

-- ---------------------------------------------------------------------------
-- The worker as a fifth party column
-- ---------------------------------------------------------------------------
drop view public.payment_summaries;

do $$
declare
  t text;
  c text;
begin
  foreach t in array array['payments', 'party_opening_balances', 'reversals', 'posting_events', 'ledger_entries', 'refunds'] loop
    execute format('alter table public.%I add column worker_id uuid', t);
    execute format('alter table public.%I add foreign key (company_id, worker_id) references public.workers (company_id, id)', t);
    execute format('alter table public.%I drop column party_id', t);
    execute format('alter table public.%I add column party_id uuid generated always as '
      '(coalesce(supplier_id, subcontractor_id, crew_id, payee_id, worker_id)) stored', t);
    c := case t when 'payments' then 'payments_one_party' when 'party_opening_balances' then 'opening_balances_one_party'
      when 'reversals' then 'reversals_one_party' when 'posting_events' then 'posting_events_one_party'
      when 'ledger_entries' then 'ledger_one_party' else 'refunds_one_party' end;
    execute format('alter table public.%I drop constraint %I', t, c);
    execute format('alter table public.%I add constraint %I check '
      '(num_nonnulls(supplier_id, subcontractor_id, crew_id, payee_id, worker_id) = 1)', t, c);
  end loop;
end $$;
create index payments_party on public.payments (company_id, party_id, payment_date);
create unique index opening_balances_one_active on public.party_opening_balances (party_id) where status = 'posted';
create index ledger_party_date on public.ledger_entries (company_id, party_id, business_date);
create index refunds_party on public.refunds (company_id, party_id, refund_date);
create index ledger_worker on public.ledger_entries (worker_id, project_id) where worker_id is not null;

-- A labour cost keeps its crew (the group, for reports); the worker, when set, is the one owed.
alter table public.labour_costs
  add column worker_id uuid,
  add foreign key (company_id, worker_id) references public.workers (company_id, id);
create index labour_costs_worker on public.labour_costs (worker_id, project_id) where worker_id is not null;

create view public.payment_summaries with (security_invoker = true) as
select p.id, p.company_id, p.number, p.supplier_id, p.payment_date, p.amount_paisa, p.method, p.reference, p.notes,
  p.status, p.posted_at, p.created_by,
  (select coalesce(sum(e.amount_paisa), 0) from public.payment_allocation_events e where e.payment_id = p.id)::bigint as allocated_paisa,
  (select coalesce(sum(s.amount_paisa), 0) from public.settlement_events s where s.payment_id = p.id)::bigint as settled_paisa,
  p.subcontractor_id, p.crew_id, p.payee_id, p.party_id, p.work_package_id,
  coalesce((
    select array_agg(a.project_id order by a.project_id) from (
      select e.project_id from public.payment_allocation_events e where e.payment_id = p.id
      group by e.project_id having sum(e.amount_paisa) <> 0) a), '{}'::uuid[]) as project_ids,
  p.is_peski,
  (select min(d.label) || case when count(*) > 1 then ' and ' || (count(*) - 1) || ' more' else '' end
   from (select s.doc_id from public.settlement_events s where s.payment_id = p.id
         group by s.doc_id having sum(s.amount_paisa) > 0) x
   cross join lateral private.doc_info(x.doc_id) d) as paid_for,
  p.worker_id
from public.payments p;

create or replace view public.labour_cost_summaries with (security_invoker = true) as
select l.id, l.company_id, l.project_id, l.crew_id, l.heading_id, l.work_date, l.work_type, l.description,
  l.headcount, l.person_days, l.rate_paisa, l.amount_paisa, l.batch_id, l.status, l.posted_at, l.created_by,
  l.created_at, private.doc_settled(l.id, l.project_id) as settled_paisa, l.worker_id
from public.labour_costs l;

-- ---------------------------------------------------------------------------
-- Access. Rates are money: a worker is seen by those who may edit them (party managers, and staff
-- on a project whose crew they are on) and by finance. Site staff find the rest of the company's
-- workers through project_workers(), and add them to a crew with add_crew_worker().
-- ---------------------------------------------------------------------------
alter table public.workers enable row level security;

create function private.can_edit_worker(p_company uuid, p_worker uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_parties(p_company) or exists (
    select 1 from public.crew_members m join public.crews c on c.id = m.crew_id
    where m.worker_id = p_worker and m.company_id = p_company and c.project_id is not null
      and private.can_work_on_project(p_company, c.project_id))
$$;

create policy workers_select on public.workers for select to authenticated
  using (private.can_edit_worker(company_id, id) or private.can_see_finance(company_id));
create policy workers_insert on public.workers for insert to authenticated
  with check (private.can_manage_parties(company_id));
create policy workers_update on public.workers for update to authenticated
  using (private.can_edit_worker(company_id, id))
  with check (private.can_edit_worker(company_id, id));
revoke delete on public.workers from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Party helpers learn the worker
-- ---------------------------------------------------------------------------
create or replace function private.party_kind(p_party uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.suppliers where id = p_party) then 'supplier'
    when exists (select 1 from public.subcontractors where id = p_party) then 'subcontractor'
    when exists (select 1 from public.crews where id = p_party) then 'crew'
    when exists (select 1 from public.payees where id = p_party) then 'payee'
    when exists (select 1 from public.workers where id = p_party) then 'worker'
  end
$$;

create or replace function private.party_kind(l public.ledger_entries) returns text
language sql immutable set search_path = '' as $$
  select case
    when l.supplier_id is not null then 'supplier'
    when l.subcontractor_id is not null then 'subcontractor'
    when l.crew_id is not null then 'crew'
    when l.worker_id is not null then 'worker'
    else 'payee'
  end
$$;

create or replace function private.party_company(p_party uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select company_id from public.suppliers where id = p_party),
    (select company_id from public.subcontractors where id = p_party),
    (select company_id from public.crews where id = p_party),
    (select company_id from public.payees where id = p_party),
    (select company_id from public.workers where id = p_party))
$$;

create or replace function private.party_name(p_party uuid) returns text
language sql stable set search_path = '' as $$
  select coalesce(
    (select name from public.suppliers where id = p_party),
    (select name from public.subcontractors where id = p_party),
    (select name from public.crews where id = p_party),
    (select name from public.payees where id = p_party),
    (select name from public.workers where id = p_party))
$$;

create or replace function private.lock_party(p_party uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_company uuid;
begin
  case private.party_kind(p_party)
    when 'supplier' then select company_id into v_company from public.suppliers where id = p_party for update;
    when 'subcontractor' then select company_id into v_company from public.subcontractors where id = p_party for update;
    when 'crew' then select company_id into v_company from public.crews where id = p_party for update;
    when 'payee' then select company_id into v_company from public.payees where id = p_party for update;
    when 'worker' then select company_id into v_company from public.workers where id = p_party for update;
    else null;
  end case;
  if v_company is null then
    raise exception 'Party not found' using errcode = 'P0002';
  end if;
  return v_company;
end $$;

-- Marking takes the worker's row lightly; closing and paying take it fully (lock_party), so a day
-- cannot change while it is being closed.
create or replace function private.lock_worker(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workers where id = p_member for no key update;
  if not found then
    raise exception 'Choose a worker' using errcode = 'P0002';
  end if;
end $$;

create or replace function private.new_event(
  p_company uuid, p_type text, p_party uuid, p_date date, p_op_key uuid, p_opening_balance uuid default null,
  p_bill uuid default null, p_payment uuid default null, p_allocation_event uuid default null, p_credit uuid default null,
  p_reversal uuid default null, p_reversed_events uuid[] default null, p_charge uuid default null,
  p_labour_cost uuid default null, p_expense uuid default null, p_refund uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := private.party_kind(p_party);
  v_id uuid;
begin
  if v_kind is null then
    raise exception 'Party not found' using errcode = 'P0002';
  end if;
  insert into public.posting_events (
    company_id, event_type, supplier_id, subcontractor_id, crew_id, payee_id, worker_id, business_date, op_key,
    opening_balance_id, bill_id, payment_id, allocation_event_id, credit_id, reversal_id, reversed_event_ids,
    charge_id, labour_cost_id, expense_id, refund_id, created_by
  ) values (
    p_company, p_type,
    case when v_kind = 'supplier' then p_party end, case when v_kind = 'subcontractor' then p_party end,
    case when v_kind = 'crew' then p_party end, case when v_kind = 'payee' then p_party end,
    case when v_kind = 'worker' then p_party end,
    p_date, p_op_key, p_opening_balance, p_bill, p_payment, p_allocation_event, p_credit, p_reversal,
    p_reversed_events, p_charge, p_labour_cost, p_expense, p_refund, auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function private.add_ledger(
  p_event uuid, p_key text, p_project uuid, p_heading uuid, p_cost bigint, p_balance bigint, p_cash bigint
) returns void
language sql security definer set search_path = '' as $$
  insert into public.ledger_entries (
    company_id, event_id, event_type, component_key, business_date, posted_at, project_id, heading_id,
    supplier_id, subcontractor_id, crew_id, payee_id, worker_id, cost_paisa, balance_paisa, cash_paisa
  )
  select e.company_id, e.id, e.event_type, p_key, e.business_date, e.posted_at, p_project, p_heading,
    e.supplier_id, e.subcontractor_id, e.crew_id, e.payee_id, e.worker_id, p_cost, p_balance, p_cash
  from public.posting_events e
  where e.id = p_event and (p_cost <> 0 or p_balance <> 0 or p_cash <> 0)
$$;

create or replace function private.negate_events(p_reversal_event uuid, p_events uuid[]) returns void
language sql security definer set search_path = '' as $$
  insert into public.ledger_entries (
    company_id, event_id, event_type, component_key, business_date, posted_at, project_id, heading_id,
    supplier_id, subcontractor_id, crew_id, payee_id, worker_id, cost_paisa, balance_paisa, cash_paisa
  )
  select e.company_id, e.id, e.event_type, 'rev:' || l.id, e.business_date, e.posted_at, l.project_id, l.heading_id,
    l.supplier_id, l.subcontractor_id, l.crew_id, l.payee_id, l.worker_id, -l.cost_paisa, -l.balance_paisa, -l.cash_paisa
  from public.ledger_entries l
  join public.posting_events e on e.id = p_reversal_event
  where l.event_id = any (p_events)
$$;

create or replace function private.reverse_with_event(
  p_company uuid, p_party uuid, p_date date, p_reason text, p_op_key uuid, p_bill uuid default null,
  p_payment uuid default null, p_credit uuid default null, p_opening_balance uuid default null, p_charge uuid default null,
  p_labour_cost uuid default null, p_expense uuid default null, p_refund uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := private.party_kind(p_party);
  v_reversal uuid;
  v_events uuid[];
  v_event uuid;
begin
  insert into public.reversals (
    company_id, supplier_id, subcontractor_id, crew_id, payee_id, worker_id, bill_id, payment_id, credit_id, opening_balance_id,
    charge_id, labour_cost_id, expense_id, refund_id, reversal_date, reason, created_by
  ) values (
    p_company,
    case when v_kind = 'supplier' then p_party end, case when v_kind = 'subcontractor' then p_party end,
    case when v_kind = 'crew' then p_party end, case when v_kind = 'payee' then p_party end,
    case when v_kind = 'worker' then p_party end,
    p_bill, p_payment, p_credit, p_opening_balance, p_charge, p_labour_cost, p_expense, p_refund, p_date, p_reason, auth.uid()
  ) returning id into v_reversal;
  -- A payment's own event plus every allocation move made on it (C8).
  select array_agg(e.id order by e.posted_at, e.id) into v_events
  from public.posting_events e
  where (p_bill is not null and e.bill_id = p_bill and e.event_type = 'bill_post')
     or (p_credit is not null and e.credit_id = p_credit and e.event_type = 'credit_post')
     or (p_opening_balance is not null and e.opening_balance_id = p_opening_balance and e.event_type = 'opening_balance')
     or (p_charge is not null and e.charge_id = p_charge and e.event_type = 'charge_approve')
     or (p_labour_cost is not null and e.labour_cost_id = p_labour_cost and e.event_type = 'labour_save')
     or (p_expense is not null and e.expense_id = p_expense and e.event_type = 'expense_save')
     or (p_refund is not null and e.refund_id = p_refund and e.event_type = 'refund')
     or (p_payment is not null and e.payment_id = p_payment and e.event_type = 'payment_post')
     or (p_payment is not null and e.allocation_event_id in (
           select a.id from public.payment_allocation_events a where a.payment_id = p_payment));
  v_event := private.new_event(p_company, 'reversal', p_party, p_date, p_op_key,
    p_reversal => v_reversal, p_reversed_events => v_events);
  perform private.negate_events(v_event, v_events);
  return v_reversal;
end $$;

-- A labour cost is owed to its worker when it has one, otherwise to its crew.
create or replace function private.doc_info(p_doc uuid)
returns table (kind text, company_id uuid, party_id uuid, posted boolean, doc_date date, label text)
language sql stable security definer set search_path = '' as $$
  select 'bill', b.company_id, b.supplier_id, b.status = 'posted', b.bill_date, 'Bill ' || b.bill_no
  from public.supplier_bills b where b.id = p_doc
  union all
  select 'charge', c.company_id, c.subcontractor_id, c.status = 'approved', c.approved_date,
    'Work charge' || coalesce(' ' || nullif(trim(c.claim_no), ''), '')
  from public.subcontract_charges c where c.id = p_doc
  union all
  select 'labour', l.company_id, coalesce(l.worker_id, l.crew_id), l.status = 'posted', l.work_date, 'Labour ' || coalesce(l.work_type, '')
  from public.labour_costs l where l.id = p_doc
  union all
  select 'expense', e.company_id, e.payee_id, e.status = 'posted', e.expense_date, e.description
  from public.expenses e where e.id = p_doc and e.project_id is not null
$$;

create or replace function private.post_payment(
  p_company uuid, p_id uuid, p_party uuid, p_date date, p_amount bigint, p_method text, p_reference text,
  p_notes text, p_package uuid, p_allocs jsonb, p_op_key uuid, p_is_peski boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := private.party_kind(p_party);
  v_alloc_sum bigint;
  v_number text;
  v_event uuid;
  a record;
begin
  if p_id is null then
    raise exception 'Payment id is required' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be more than zero' using errcode = '22023';
  end if;
  if p_date > private.today() then
    raise exception 'The payment date cannot be in the future' using errcode = '22023';
  end if;
  select coalesce(sum((x ->> 'amount_paisa')::bigint), 0) into v_alloc_sum from jsonb_array_elements(p_allocs) x;
  if v_alloc_sum > p_amount then
    raise exception 'Project allocations are more than the payment (I-4)' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_allocs) x where (x ->> 'amount_paisa')::bigint <= 0)
     or (select count(*) <> count(distinct x ->> 'project_id') from jsonb_array_elements(p_allocs) x) then
    raise exception 'Each project can be allocated once, with an amount more than zero' using errcode = '22023';
  end if;

  v_number := public.next_doc_number(p_company, 'payment', 'PAY');
  insert into public.payments (
    company_id, id, number, supplier_id, subcontractor_id, crew_id, payee_id, worker_id, work_package_id,
    payment_date, amount_paisa, method, reference, notes, is_peski
  ) values (
    p_company, p_id, v_number,
    case when v_kind = 'supplier' then p_party end, case when v_kind = 'subcontractor' then p_party end,
    case when v_kind = 'crew' then p_party end, case when v_kind = 'payee' then p_party end,
    case when v_kind = 'worker' then p_party end,
    p_package, p_date, p_amount, coalesce(p_method::public.payment_method, 'cash'), p_reference, p_notes, p_is_peski
  );
  v_event := private.new_event(p_company, 'payment_post', p_party, p_date, p_op_key, p_payment => p_id);
  for a in
    select (x ->> 'project_id')::uuid as project_id, (x ->> 'amount_paisa')::bigint as amount
    from jsonb_array_elements(p_allocs) x order by 1
  loop
    insert into public.payment_allocation_events (company_id, payment_id, project_id, amount_paisa, business_date, reason, created_by)
    values (p_company, p_id, a.project_id, a.amount, p_date, 'At payment', auth.uid());
    perform private.add_ledger(v_event, 'project:' || a.project_id, a.project_id, null, 0, -a.amount, a.amount);
  end loop;
  perform private.add_ledger(v_event, 'unallocated', null, null, 0, -(p_amount - v_alloc_sum), p_amount - v_alloc_sum);
  return jsonb_build_object('payment_id', p_id, 'number', v_number, 'event_id', v_event);
end $$;

create or replace function public.record_payment(p_op_key uuid, p_payment jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_payment ->> 'id')::uuid;
  v_party uuid := coalesce((p_payment ->> 'supplier_id')::uuid, (p_payment ->> 'subcontractor_id')::uuid,
                           (p_payment ->> 'crew_id')::uuid, (p_payment ->> 'payee_id')::uuid, (p_payment ->> 'worker_id')::uuid);
  v_kind text := private.party_kind(v_party);
  v_company uuid := private.party_company(v_party);
  v_package uuid := (p_payment ->> 'work_package_id')::uuid;
  v_pkg public.work_packages;
  v_amount bigint := (p_payment ->> 'amount_paisa')::bigint;
  v_date date := coalesce((p_payment ->> 'payment_date')::date, private.today());
  v_allocs jsonb := coalesce(p_payment -> 'allocations', '[]'::jsonb);
  v_settles jsonb := coalesce(p_payment -> 'settlements', '[]'::jsonb);
  v_peski boolean := coalesce((p_payment ->> 'is_peski')::boolean, false);
  v_alloc_sum bigint;
  v_prior jsonb;
  v_result jsonb;
  s jsonb;
begin
  -- 1. Authorize.
  if v_company is null or not private.can_record_payments(v_company) then
    raise exception 'You cannot record payments' using errcode = '42501';
  end if;
  if num_nonnulls(p_payment ->> 'supplier_id', p_payment ->> 'subcontractor_id', p_payment ->> 'crew_id',
                  p_payment ->> 'payee_id', p_payment ->> 'worker_id') <> 1
     or (p_payment ->> (v_kind || '_id')) is null then
    raise exception 'A payment is for exactly one supplier, subcontractor, crew, worker or payee' using errcode = '22023';
  end if;
  if v_package is not null then
    select * into v_pkg from public.work_packages where id = v_package;
    if v_pkg.id is null or v_pkg.subcontractor_id <> v_party then
      raise exception 'The work package is not for this subcontractor' using errcode = 'P0001';
    end if;
    if jsonb_array_length(v_allocs) = 0 then
      v_allocs := jsonb_build_array(jsonb_build_object('project_id', v_pkg.project_id, 'amount_paisa', v_amount));
    elsif jsonb_array_length(v_allocs) <> 1 or (v_allocs -> 0 ->> 'project_id')::uuid <> v_pkg.project_id
          or (v_allocs -> 0 ->> 'amount_paisa')::bigint <> v_amount then
      raise exception 'A payment for a work package goes wholly to its project' using errcode = 'P0001';
    end if;
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_allocs) x
    where not private.can_see_project(v_company, (x ->> 'project_id')::uuid)
  ) then
    raise exception 'You can only allocate to projects you are assigned to' using errcode = '42501';
  end if;
  select coalesce(sum((x ->> 'amount_paisa')::bigint), 0) into v_alloc_sum from jsonb_array_elements(v_allocs) x;
  if not private.can_post(v_company) and v_alloc_sum <> v_amount then
    raise exception 'Allocate the whole payment to projects; only Accounts or Admin can leave part unallocated'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_settles) x
    where not private.can_see_project(v_company, (x ->> 'project_id')::uuid)
  ) then
    raise exception 'You can only settle bills on projects you are assigned to' using errcode = '42501';
  end if;

  if v_peski and jsonb_array_length(v_settles) > 0 then
    raise exception 'Peski is paid before any bill, so it cannot pay bills' using errcode = '22023';
  end if;

  -- 2. Operation key.
  v_prior := private.begin_op(v_company, p_op_key, 'record_payment', p_payment);
  if v_prior is not null then
    return v_prior;
  end if;

  -- 3. Lock: party, then the documents being settled.
  perform private.lock_party(v_party);
  perform private.lock_docs(array(
    select coalesce(x ->> 'doc_id', x ->> 'bill_id')::uuid from jsonb_array_elements(v_settles) x));

  -- 4. Peski is only given while nothing is unpaid to the party (GLOSSARY: Peski).
  if v_peski and exists (
    select 1 from public.party_open_items(v_party) o where o.kind in ('bill', 'charge', 'labour', 'expense')
  ) then
    raise exception 'peski_with_unpaid: this party has unpaid bills, so this payment pays them; it is not peski'
      using errcode = 'P0001';
  end if;

  -- 5. Write.
  v_result := private.post_payment(v_company, v_id, v_party, v_date, v_amount, p_payment ->> 'method',
    p_payment ->> 'reference', p_payment ->> 'notes', v_package, v_allocs, p_op_key, v_peski);
  for s in select * from jsonb_array_elements(v_settles) loop
    perform private.settle_one(v_id, coalesce(s ->> 'doc_id', s ->> 'bill_id')::uuid, (s ->> 'project_id')::uuid,
      (s ->> 'amount_paisa')::bigint, (s ->> 'date')::date, p_op_key, null);
  end loop;
  return private.finish_op(v_company, p_op_key, v_result);
end $$;

create or replace function public.record_refund(p_op_key uuid, p_refund jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_refund ->> 'id')::uuid;
  v_party uuid := coalesce((p_refund ->> 'supplier_id')::uuid, (p_refund ->> 'subcontractor_id')::uuid,
                           (p_refund ->> 'crew_id')::uuid, (p_refund ->> 'payee_id')::uuid, (p_refund ->> 'worker_id')::uuid);
  v_kind text := private.party_kind(v_party);
  v_company uuid := private.party_company(v_party);
  v_project uuid := nullif(p_refund ->> 'project_id', '')::uuid;
  v_amount bigint := (p_refund ->> 'amount_paisa')::bigint;
  v_date date := coalesce((p_refund ->> 'refund_date')::date, private.today());
  v_refund_kind text := coalesce(nullif(p_refund ->> 'kind', ''), 'refund');
  v_prior jsonb;
  v_room bigint;
  v_number text;
  v_event uuid;
begin
  -- 1. Authorize. Refunds on a project need payment rights there; unallocated ones are Admin/Accounts.
  if v_company is null or not private.can_record_payments(v_company) then
    raise exception 'You cannot record refunds' using errcode = '42501';
  end if;
  if num_nonnulls(p_refund ->> 'supplier_id', p_refund ->> 'subcontractor_id', p_refund ->> 'crew_id',
                  p_refund ->> 'payee_id', p_refund ->> 'worker_id') <> 1
     or (p_refund ->> (v_kind || '_id')) is null then
    raise exception 'A refund is from exactly one supplier, subcontractor, crew, worker or payee' using errcode = '22023';
  end if;
  if v_project is null and not private.can_post(v_company) then
    raise exception 'Choose the project; only Accounts or Admin can record a refund not for a project' using errcode = '42501';
  end if;
  if v_project is not null and (
    not private.can_see_project(v_company, v_project)
    or not exists (select 1 from public.projects where id = v_project and company_id = v_company)
  ) then
    raise exception 'You can only record refunds on projects you are assigned to' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'Refund id is required' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Refund amount must be more than zero' using errcode = '22023';
  end if;
  if v_date > private.today() then
    raise exception 'The refund date cannot be in the future' using errcode = '22023';
  end if;
  if v_refund_kind not in ('refund', 'peski_returned') then
    raise exception 'A refund is a refund or peski returned' using errcode = '22023';
  end if;

  -- 2. Operation key.
  v_prior := private.begin_op(v_company, p_op_key, 'record_refund', p_refund);
  if v_prior is not null then
    return v_prior;
  end if;

  -- 3. Lock the party, so two refunds cannot both use the same money.
  perform private.lock_party(v_party);

  -- 4. Check, company-wide and in the bucket: a Refund clears Overpayment only; Peski Returned
  -- gives back Peski only.
  v_room := public.refund_available(v_party, v_project, v_refund_kind);
  if v_amount > v_room and v_refund_kind = 'refund' then
    raise exception 'refund_exceeds_overpayment: the overpayment available to refund here is Rs. %',
      to_char(v_room / 100.0, 'FM99,99,99,99,990.00') using errcode = 'P0001';
  elsif v_amount > v_room then
    raise exception 'peski_returned_exceeds_peski: the peski available to return here is Rs. %',
      to_char(v_room / 100.0, 'FM99,99,99,99,990.00') using errcode = 'P0001';
  end if;

  -- 5. Write.
  v_number := public.next_doc_number(v_company, 'refund', 'RF');
  insert into public.refunds (
    company_id, id, number, supplier_id, subcontractor_id, crew_id, payee_id, worker_id, project_id,
    refund_date, amount_paisa, method, reference, notes, kind
  ) values (
    v_company, v_id, v_number,
    case when v_kind = 'supplier' then v_party end, case when v_kind = 'subcontractor' then v_party end,
    case when v_kind = 'crew' then v_party end, case when v_kind = 'payee' then v_party end,
    case when v_kind = 'worker' then v_party end,
    v_project, v_date, v_amount, coalesce((p_refund ->> 'method')::public.payment_method, 'cash'),
    nullif(trim(p_refund ->> 'reference'), ''), nullif(trim(p_refund ->> 'notes'), ''), v_refund_kind
  );
  v_event := private.new_event(v_company, 'refund', v_party, v_date, p_op_key, p_refund => v_id);
  perform private.add_ledger(v_event, coalesce('project:' || v_project, 'unallocated'), v_project, null, 0, v_amount, -v_amount);
  return private.finish_op(v_company, p_op_key, jsonb_build_object('refund_id', v_id, 'number', v_number, 'event_id', v_event));
end $$;

create or replace function public.set_opening_balance(
  p_op_key uuid, p_party uuid, p_cutover_date date, p_amount_paisa bigint, p_note text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.party_company(p_party);
  v_kind text := private.party_kind(p_party);
  v_prior jsonb;
  v_id uuid;
  v_event uuid;
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can set opening balances' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'set_opening_balance', jsonb_build_object(
    'party', p_party, 'date', p_cutover_date, 'amount', p_amount_paisa, 'note', p_note));
  if v_prior is not null then
    return v_prior;
  end if;
  perform private.lock_party(p_party);
  if exists (select 1 from public.party_opening_balances where party_id = p_party and status = 'posted') then
    raise exception 'This party already has an opening balance; reverse it first' using errcode = 'P0001';
  end if;
  if p_cutover_date is null or p_amount_paisa is null or p_amount_paisa = 0 then
    raise exception 'Cutover date and a non-zero amount are required' using errcode = '22023';
  end if;
  insert into public.party_opening_balances (company_id, supplier_id, subcontractor_id, crew_id, payee_id, worker_id, cutover_date, amount_paisa, note)
  values (
    v_company,
    case when v_kind = 'supplier' then p_party end, case when v_kind = 'subcontractor' then p_party end,
    case when v_kind = 'crew' then p_party end, case when v_kind = 'payee' then p_party end,
    case when v_kind = 'worker' then p_party end,
    p_cutover_date, p_amount_paisa, private.require_reason(p_note, 'A note')
  ) returning id into v_id;
  -- Not project cost; sits in the party's unallocated bucket (req §12.3, §20).
  v_event := private.new_event(v_company, 'opening_balance', p_party, p_cutover_date, p_op_key, p_opening_balance => v_id);
  perform private.add_ledger(v_event, 'unallocated', null, null, 0, p_amount_paisa, 0);
  return private.finish_op(v_company, p_op_key, jsonb_build_object('opening_balance_id', v_id, 'event_id', v_event));
end $$;

create or replace function public.party_open_items(p_party uuid)
returns table (kind text, doc_id uuid, label text, doc_date date, project_id uuid, amount_paisa bigint)
language sql stable set search_path = '' as $$
  select * from (
    select 'bill'::text, b.id, b.bill_no, b.bill_date, l.project_id,
      private.bill_settleable(b.id, l.project_id) - private.bill_settled(b.id, l.project_id)
    from public.supplier_bills b
    join (select distinct x.bill_id, x.project_id from public.bill_lines x) l on l.bill_id = b.id
    where b.supplier_id = p_party and b.status = 'posted'
    union all
    select 'charge', c.id, coalesce(nullif(trim(c.claim_no), ''), 'Work charge'), c.approved_date, c.project_id,
      c.approved_paisa - private.doc_settled(c.id, c.project_id)
    from public.subcontract_charges c where c.subcontractor_id = p_party and c.status = 'approved'
    union all
    select 'labour', l.id, coalesce(l.work_type, 'Labour'), l.work_date, l.project_id,
      l.amount_paisa - private.doc_settled(l.id, l.project_id)
    from public.labour_costs l where coalesce(l.worker_id, l.crew_id) = p_party and l.status = 'posted'
    union all
    select 'expense', e.id, e.description, e.expense_date, e.project_id,
      e.amount_paisa - private.doc_settled(e.id, e.project_id)
    from public.expenses e where e.payee_id = p_party and e.status = 'posted'
    union all
    select 'payment', p.id, p.number, p.payment_date, e.project_id,
      private.payment_allocated(p.id, e.project_id) - private.payment_settled(p.id, e.project_id)
    from public.payments p
    join (select distinct x.payment_id, x.project_id from public.payment_allocation_events x) e on e.payment_id = p.id
    where p.party_id = p_party and p.status = 'posted'
    union all
    select 'unallocated', p.id, p.number, p.payment_date, null::uuid,
      p.amount_paisa - (select coalesce(sum(x.amount_paisa), 0) from public.payment_allocation_events x where x.payment_id = p.id)
    from public.payments p
    where p.party_id = p_party and p.status = 'posted' and private.can_post(p.company_id)
  ) t (kind, doc_id, label, doc_date, project_id, amount_paisa)
  where amount_paisa > 0
  order by doc_date, label
$$;

create or replace function public.party_balances(p_company uuid, p_kind text, p_as_of date default null)
returns table (party_id uuid, party_name text, active boolean, project_id uuid, charged_paisa bigint, paid_paisa bigint,
  project_balance_paisa bigint, unallocated_paisa bigint, balance_paisa bigint, company_level boolean)
language sql stable set search_path = '' as $$
  with parties as (
    select s.id, s.name, s.active, null::uuid as project_id from public.suppliers s where p_kind = 'supplier' and s.company_id = p_company
    union all
    select s.id, s.name, s.active, null from public.subcontractors s where p_kind = 'subcontractor' and s.company_id = p_company
    union all
    select c.id, c.name, c.active, c.project_id from public.crews c where p_kind = 'crew' and c.company_id = p_company
    union all
    select p.id, p.name, p.active, null from public.payees p where p_kind = 'payee' and p.company_id = p_company
    union all
    select w.id, w.name, w.active, null from public.workers w where p_kind = 'worker' and w.company_id = p_company
  )
  select pt.id, pt.name, pt.active, pt.project_id,
    coalesce(sum(l.balance_paisa) filter (where l.cash_paisa = 0), 0)::bigint,
    coalesce(sum(l.cash_paisa), 0)::bigint,
    coalesce(sum(l.balance_paisa) filter (where l.project_id is not null), 0)::bigint,
    coalesce(sum(l.balance_paisa) filter (where l.project_id is null), 0)::bigint,
    coalesce(sum(l.balance_paisa), 0)::bigint,
    private.can_post(p_company)
  from parties pt
  left join public.ledger_entries l
    on l.party_id = pt.id and l.business_date <= coalesce(p_as_of, private.today())
  group by pt.id, pt.name, pt.active, pt.project_id
  order by pt.name
$$;

create or replace function public.report_payments(
  p_company uuid, p_from date, p_to date, p_project uuid default null, p_party uuid default null, p_as_of date default null
) returns table (payment_id uuid, number text, payment_date date, party_kind text, party_id uuid, party_name text,
  method public.payment_method, reference text, amount_paisa bigint, project_paisa bigint, settled_paisa bigint,
  reversed_on date, kind text)
language sql stable set search_path = '' as $$
  with d as (select coalesce(p_as_of, greatest(p_to, private.today())) as as_of)
  select p.id, p.number, p.payment_date,
    case when p.supplier_id is not null then 'supplier' when p.subcontractor_id is not null then 'subcontractor'
         when p.crew_id is not null then 'crew' when p.worker_id is not null then 'worker' else 'payee' end,
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
         when f.crew_id is not null then 'crew' when f.worker_id is not null then 'worker' else 'payee' end,
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

-- The labour report names the worker as well as the crew.
drop function public.report_labour(uuid, date, date, uuid, uuid);
create function public.report_labour(p_company uuid, p_from date, p_to date, p_project uuid default null, p_crew uuid default null)
returns table (labour_cost_id uuid, project_id uuid, work_date date, crew_id uuid, crew text, work_type text, headcount integer,
  person_days numeric, amount_paisa bigint, paid_paisa bigint, reversed_on date, daily_report_id uuid, worker_id uuid, worker text)
language sql stable set search_path = '' as $$
  select lc.id, lc.project_id, lc.work_date, lc.crew_id, c.name, lc.work_type, lc.headcount, lc.person_days, lc.amount_paisa,
    (select coalesce(sum(s.amount_paisa), 0)::bigint from public.settlement_events s
     where s.labour_cost_id = lc.id and s.business_date <= p_to),
    (select r.reversal_date from public.reversals r where r.labour_cost_id = lc.id and r.reversal_date <= p_to),
    lc.daily_report_id, lc.worker_id, w.name
  from public.labour_costs lc
  join public.crews c on c.id = lc.crew_id
  left join public.workers w on w.id = lc.worker_id
  where lc.company_id = p_company and lc.work_date between p_from and p_to
    and (p_project is null or lc.project_id = p_project) and (p_crew is null or lc.crew_id = p_crew)
  order by lc.work_date, c.name, w.name
$$;
revoke execute on function public.report_labour(uuid, date, date, uuid, uuid) from public, anon;
grant execute on function public.report_labour(uuid, date, date, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Posting labour: owed to the worker when one is given
-- ---------------------------------------------------------------------------
create or replace function private.post_labour(
  p_entry jsonb, p_days jsonb, p_batch jsonb, p_pay jsonb, p_confirm_duplicate boolean, p_op_key uuid, p_single_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_entry ->> 'project_id')::uuid;
  v_company uuid := (select company_id from public.projects where id = (p_entry ->> 'project_id')::uuid);
  v_crew uuid := coalesce((p_entry ->> 'crew_id')::uuid,
    (select id from public.crews where project_id = (p_entry ->> 'project_id')::uuid and is_default));
  v_worker uuid := (p_entry ->> 'worker_id')::uuid;
  v_party uuid;
  v_heading uuid;
  v_batch uuid := (p_batch ->> 'id')::uuid;
  v_dup date;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_event uuid;
  v_payment jsonb;
  d jsonb;
begin
  if v_company is null or not private.can_work_on_project(v_company, v_project) then
    raise exception 'You cannot enter labour cost on this project' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.crews c
    where c.id = v_crew and c.company_id = v_company and c.active and (c.project_id is null or c.project_id = v_project)
  ) then
    raise exception 'Choose a crew for this project' using errcode = 'P0001';
  end if;
  if v_worker is not null and not exists (select 1 from public.workers w where w.id = v_worker and w.company_id = v_company) then
    raise exception 'Choose a worker' using errcode = 'P0001';
  end if;
  v_party := coalesce(v_worker, v_crew);
  v_heading := coalesce((p_entry ->> 'heading_id')::uuid, private.default_heading(v_company, 'labour'));
  if not exists (select 1 from public.cost_headings where id = v_heading and company_id = v_company) then
    raise exception 'Choose a cost heading' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days) = 0 then
    raise exception 'Enter at least one day' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_days) x where (x ->> 'work_date')::date > private.today()) then
    raise exception 'Labour cannot be entered for a future date' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_days) x where coalesce((x ->> 'amount_paisa')::bigint, 0) <= 0) then
    raise exception 'Each day needs an amount more than zero' using errcode = '22023';
  end if;
  if (select count(*) <> count(distinct x ->> 'work_date') from jsonb_array_elements(p_days) x) then
    raise exception 'A day is entered twice' using errcode = '22023';
  end if;

  -- 3. Lock: the party owed (worker or crew), then check for near-duplicates under the lock.
  perform private.lock_party(v_party);
  if v_batch is not null and exists (select 1 from public.labour_batches where id = v_batch) then
    raise exception 'This weekly entry was already saved' using errcode = 'P0001';
  end if;
  select l.work_date into v_dup
  from public.labour_costs l
  where l.project_id = v_project and l.status = 'posted'
    -- A worker's day also clashes with a day total typed for their crew.
    and ((v_worker is not null and l.worker_id = v_worker) or (l.crew_id = v_crew and l.worker_id is null))
    and l.work_date in (select (x ->> 'work_date')::date from jsonb_array_elements(p_days) x)
  order by l.work_date limit 1;
  if v_dup is not null and not coalesce(p_confirm_duplicate, false) then
    if v_worker is not null then
      raise exception 'near_duplicate: this worker already has labour cost on % for this project', v_dup using errcode = 'P0001';
    end if;
    raise exception 'near_duplicate: this crew already has labour cost on % for this project', v_dup using errcode = 'P0001';
  end if;

  if v_batch is not null then
    insert into public.labour_batches (company_id, id, project_id, crew_id, from_date, to_date)
    values (v_company, v_batch, v_project, v_crew, (p_batch ->> 'from_date')::date, (p_batch ->> 'to_date')::date);
    if exists (
      select 1 from jsonb_array_elements(p_days) x
      where (x ->> 'work_date')::date not between (p_batch ->> 'from_date')::date and (p_batch ->> 'to_date')::date
    ) then
      raise exception 'Every day must be inside the week entered' using errcode = '22023';
    end if;
  end if;

  for d in select * from jsonb_array_elements(p_days) x order by (x ->> 'work_date')::date loop
    v_id := coalesce(p_single_id, gen_random_uuid());
    insert into public.labour_costs (
      company_id, id, project_id, crew_id, worker_id, heading_id, work_date, work_type, description,
      headcount, person_days, rate_paisa, amount_paisa, batch_id, daily_report_id
    ) values (
      v_company, v_id, v_project, v_crew, v_worker, v_heading, (d ->> 'work_date')::date,
      nullif(trim(p_entry ->> 'work_type'), ''), nullif(trim(p_entry ->> 'description'), ''),
      (d ->> 'headcount')::integer, (d ->> 'person_days')::numeric, (d ->> 'rate_paisa')::bigint,
      (d ->> 'amount_paisa')::bigint, v_batch, (p_entry ->> 'daily_report_id')::uuid
    );
    v_event := private.new_event(v_company, 'labour_save', v_party, (d ->> 'work_date')::date, p_op_key, p_labour_cost => v_id);
    perform private.add_ledger(v_event, 'labour', v_project, v_heading,
      (d ->> 'amount_paisa')::bigint, (d ->> 'amount_paisa')::bigint, 0);
    v_ids := v_ids || v_id;
  end loop;

  if jsonb_typeof(p_pay) = 'object' then
    v_payment := private.pay_now(v_company, v_party, v_project, v_ids,
      coalesce((p_pay ->> 'date')::date, (select max((x ->> 'work_date')::date) from jsonb_array_elements(p_days) x)),
      p_pay, p_op_key);
  end if;
  return jsonb_build_object('labour_cost_ids', to_jsonb(v_ids), 'batch_id', v_batch, 'crew_id', v_crew, 'worker_id', v_worker,
    'payment', v_payment, 'total_paisa', (select sum((x ->> 'amount_paisa')::bigint) from jsonb_array_elements(p_days) x));
end $$;

-- ---------------------------------------------------------------------------
-- Closing attendance: one labour cost per worker per day, owed to the worker
-- ---------------------------------------------------------------------------
drop function private.close_crew_days(uuid, uuid, uuid, date, date, jsonb, boolean, uuid);

-- Prices the open rows of one crew on one project between two dates (only one worker's, when
-- given) and posts them as each worker's labour cost. Workers are locked in id order, the same
-- lock marking waits on, so a day cannot change while it closes. Paid now: one payment per worker.
create function private.close_crew_days(
  p_company uuid, p_project uuid, p_crew uuid, p_from date, p_to date, p_pay jsonb, p_confirm boolean, p_op_key uuid,
  p_worker uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_std integer := (select standard_day_minutes from public.companies where id = p_company);
  v_days jsonb;
  v_one jsonb;
  v_ids uuid[] := '{}';
  v_total bigint := 0;
  v_dates integer;
  v_payments jsonb := '[]'::jsonb;
  w record;
begin
  for w in
    select distinct a.worker_id from public.attendance a
    where a.project_id = p_project and a.crew_id = p_crew and a.work_date between p_from and p_to
      and (p_worker is null or a.worker_id = p_worker) and not private.attendance_is_closed(a.labour_cost_id)
    order by a.worker_id
  loop
    perform private.lock_party(w.worker_id);
  end loop;

  -- Price the open rows from the workers' current rates.
  update public.attendance a
  set rate_kind = k.rate_kind, rate_paisa = k.rate_paisa,
    amount_paisa = round(k.rate_paisa::numeric * a.minutes / case when k.rate_kind = 'hourly' then 60 else v_std end)
  from public.workers k
  where k.id = a.worker_id and a.project_id = p_project and a.crew_id = p_crew
    and a.work_date between p_from and p_to and (p_worker is null or a.worker_id = p_worker)
    and not private.attendance_is_closed(a.labour_cost_id);

  select count(distinct a.work_date) into v_dates
  from public.attendance a
  where a.project_id = p_project and a.crew_id = p_crew and a.work_date between p_from and p_to
    and (p_worker is null or a.worker_id = p_worker) and not private.attendance_is_closed(a.labour_cost_id)
    and a.amount_paisa > 0;

  for w in
    select a.worker_id, k.work_type
    from public.attendance a join public.workers k on k.id = a.worker_id
    where a.project_id = p_project and a.crew_id = p_crew and a.work_date between p_from and p_to
      and (p_worker is null or a.worker_id = p_worker) and not private.attendance_is_closed(a.labour_cost_id)
      and a.amount_paisa > 0
    group by a.worker_id, k.work_type
    order by a.worker_id
  loop
    select jsonb_agg(jsonb_build_object(
        'work_date', a.work_date, 'amount_paisa', a.amount_paisa, 'headcount', 1, 'rate_paisa', a.rate_paisa,
        'person_days', round(a.minutes::numeric / v_std, 2)) order by a.work_date)
    into v_days
    from public.attendance a
    where a.worker_id = w.worker_id and a.project_id = p_project and a.crew_id = p_crew
      and a.work_date between p_from and p_to and not private.attendance_is_closed(a.labour_cost_id) and a.amount_paisa > 0;

    v_one := private.post_labour(
      jsonb_build_object('project_id', p_project, 'crew_id', p_crew, 'worker_id', w.worker_id,
        'work_type', coalesce(w.work_type, 'Mixed'), 'description', 'From attendance'),
      v_days, null, p_pay, p_confirm, p_op_key, null);

    update public.attendance a
    set labour_cost_id = l.id
    from public.labour_costs l
    where l.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_one -> 'labour_cost_ids') x)
      and a.worker_id = w.worker_id and a.project_id = p_project and a.crew_id = p_crew and a.work_date = l.work_date
      and not private.attendance_is_closed(a.labour_cost_id);

    v_ids := v_ids || array(select (x #>> '{}')::uuid from jsonb_array_elements(v_one -> 'labour_cost_ids') x);
    v_total := v_total + (v_one ->> 'total_paisa')::bigint;
    if v_one -> 'payment' is not null and jsonb_typeof(v_one -> 'payment') = 'object' then
      v_payments := v_payments || jsonb_build_array(v_one -> 'payment');
    end if;
  end loop;

  if cardinality(v_ids) = 0 then
    raise exception 'Mark at least one worker before closing' using errcode = 'P0001';
  end if;
  return jsonb_build_object('labour_cost_ids', to_jsonb(v_ids), 'crew_id', p_crew, 'total_paisa', v_total,
    'days', v_dates, 'payments', v_payments);
end $$;
revoke execute on function private.close_crew_days(uuid, uuid, uuid, date, date, jsonb, boolean, uuid, uuid) from public, anon;
grant execute on function private.close_crew_days(uuid, uuid, uuid, date, date, jsonb, boolean, uuid, uuid) to authenticated;

create or replace function public.close_labour_day(p_op_key uuid, p_close jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_close ->> 'project_id')::uuid;
  v_crew uuid := (p_close ->> 'crew_id')::uuid;
  v_from date := (p_close ->> 'from_date')::date;
  v_to date := coalesce((p_close ->> 'to_date')::date, (p_close ->> 'from_date')::date);
  v_company uuid := private.attendance_scope(v_project, v_crew);
  v_prior jsonb;
begin
  if jsonb_typeof(p_close -> 'pay_now') = 'object' and not private.can_record_payments(v_company) then
    raise exception 'You cannot record payments; close it as unpaid' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'close_labour_day', p_close);
  if v_prior is not null then
    return v_prior;
  end if;
  if v_from is null or v_to < v_from or v_to - v_from > 31 then
    raise exception 'Choose up to 32 days to close' using errcode = '22023';
  end if;
  return private.finish_op(v_company, p_op_key, private.close_crew_days(
    v_company, v_project, v_crew, v_from, v_to, p_close -> 'pay_now', (p_close ->> 'confirm_duplicate')::boolean, p_op_key));
end $$;

-- Closes one worker's open days up to a date, on the projects the user enters labour on (or one
-- project). Without a from date it closes every open day up to the to date, which is what paying
-- a worker needs. Paid now: one payment per project.
-- p_close: {worker_id, project_id?, from_date?, to_date, pay_now: {method, reference} | null, confirm_duplicate}
drop function public.close_worker_days(uuid, jsonb);
create function public.close_worker_days(p_op_key uuid, p_close jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_worker uuid := coalesce((p_close ->> 'worker_id')::uuid, (p_close ->> 'member_id')::uuid);
  v_project uuid := nullif(p_close ->> 'project_id', '')::uuid;
  v_from date := (p_close ->> 'from_date')::date;
  v_to date := (p_close ->> 'to_date')::date;
  v_company uuid := (select w.company_id from public.workers w where w.id = v_worker);
  v_prior jsonb;
  v_one jsonb;
  v_total bigint := 0;
  v_days integer := 0;
  v_payments jsonb := '[]'::jsonb;
  v_groups integer := 0;
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
  if v_to is null or v_to > private.today() or (v_from is not null and (v_to < v_from or v_to - v_from > 31)) then
    raise exception 'Choose up to 32 days to close' using errcode = '22023';
  end if;

  for g in
    select a.project_id, a.crew_id, min(a.work_date) as first_day, max(a.work_date) as last_day
    from public.attendance a
    where a.worker_id = v_worker and a.work_date between coalesce(v_from, '-infinity'::date) and v_to
      and (v_project is null or a.project_id = v_project)
      and not private.attendance_is_closed(a.labour_cost_id)
      and private.can_work_on_project(v_company, a.project_id)
    group by a.project_id, a.crew_id
    order by a.crew_id, a.project_id
  loop
    perform private.attendance_scope(g.project_id, g.crew_id);
    v_one := private.close_crew_days(v_company, g.project_id, g.crew_id, g.first_day, g.last_day,
      p_close -> 'pay_now', (p_close ->> 'confirm_duplicate')::boolean, p_op_key, v_worker);
    v_total := v_total + (v_one ->> 'total_paisa')::bigint;
    v_days := v_days + (v_one ->> 'days')::integer;
    v_payments := v_payments || (v_one -> 'payments');
    v_groups := v_groups + 1;
  end loop;
  if v_groups = 0 then
    raise exception 'No open days to close' using errcode = 'P0001';
  end if;

  return private.finish_op(v_company, p_op_key, jsonb_build_object(
    'total_paisa', v_total, 'days', v_days, 'crews', v_groups, 'payments', v_payments));
end $$;
revoke execute on function public.close_worker_days(uuid, jsonb) from public, anon;
grant execute on function public.close_worker_days(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Marking attendance: the worker's own row is what is closed, not the whole crew-day
-- ---------------------------------------------------------------------------
create or replace function public.set_attendance(p_row jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_row ->> 'project_id')::uuid;
  v_crew uuid := (p_row ->> 'crew_id')::uuid;
  v_worker uuid := coalesce((p_row ->> 'worker_id')::uuid, (p_row ->> 'member_id')::uuid);
  v_date date := (p_row ->> 'work_date')::date;
  v_in time := nullif(p_row ->> 'time_in', '')::time;
  v_out time := nullif(p_row ->> 'time_out', '')::time;
  v_minutes integer := coalesce((p_row ->> 'minutes')::integer, 0);
  v_company uuid := private.attendance_scope(v_project, v_crew);
  v_row public.attendance;
begin
  -- The worker's lock: two marks of one worker on two projects take turns, so the overlap and
  -- 24-hour checks below see each other, and closing (which takes it fully) waits for a mark.
  perform private.lock_worker(v_worker);
  if v_date is null or v_date > private.today() then
    raise exception 'Attendance cannot be marked for a future date' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workers w where w.id = v_worker and w.company_id = v_company and w.active) then
    raise exception 'Choose a worker who is still working' using errcode = 'P0001';
  end if;
  if v_minutes < 0 or v_minutes > 1440 then
    raise exception 'Hours must be between 0 and 24' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.attendance a
    where a.worker_id = v_worker and a.project_id = v_project and a.work_date = v_date
      and private.attendance_is_closed(a.labour_cost_id)
  ) then
    raise exception 'day_closed: this day is closed; reverse its labour cost to change it' using errcode = 'P0001';
  end if;

  if v_minutes = 0 then
    delete from public.attendance where worker_id = v_worker and project_id = v_project and work_date = v_date;
    return jsonb_build_object('removed', true);
  end if;

  if v_in is not null and v_out is not null and exists (
    select 1 from public.attendance a
    where a.worker_id = v_worker and a.work_date = v_date and a.project_id <> v_project
      and a.time_in is not null and a.time_out is not null and a.time_in < v_out and v_in < a.time_out
  ) then
    raise exception 'attendance_overlap: these times overlap the same worker''s time on another project' using errcode = 'P0001';
  end if;
  if v_minutes + (select coalesce(sum(a.minutes), 0) from public.attendance a
      where a.worker_id = v_worker and a.work_date = v_date and a.project_id <> v_project) > 1440 then
    raise exception 'attendance_overlap: more than 24 hours on one day' using errcode = 'P0001';
  end if;

  insert into public.attendance (company_id, project_id, crew_id, worker_id, work_date, time_in, time_out, minutes)
  values (v_company, v_project, v_crew, v_worker, v_date, v_in, v_out, v_minutes)
  on conflict (worker_id, project_id, work_date) do update
    set crew_id = excluded.crew_id, time_in = excluded.time_in, time_out = excluded.time_out,
      minutes = excluded.minutes, labour_cost_id = null, rate_kind = null, rate_paisa = null, amount_paisa = null
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.split_attendance(p_split jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_worker uuid := coalesce((p_split ->> 'worker_id')::uuid, (p_split ->> 'member_id')::uuid);
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
begin
  perform private.lock_worker(v_worker);
  select * into v_row from public.attendance a
  where a.worker_id = v_worker and a.project_id = v_from and a.work_date = v_date;
  if not found then
    raise exception 'Mark the day before splitting it' using errcode = 'P0001';
  end if;
  if v_to is null or v_to = v_from then
    raise exception 'Choose another project for the rest of the day' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.attendance a where a.worker_id = v_worker and a.project_id = v_to and a.work_date = v_date) then
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

  -- The first project shrinks before the other is marked, so the two never overlap.
  perform public.set_attendance(jsonb_build_object('project_id', v_from, 'crew_id', v_row.crew_id, 'worker_id', v_worker,
    'work_date', v_date, 'time_in', v_row.time_in, 'time_out', v_first_out, 'minutes', v_first));
  perform public.set_attendance(jsonb_build_object('project_id', v_to, 'crew_id', nullif(p_split ->> 'to_crew', ''),
    'worker_id', v_worker, 'work_date', v_date, 'time_in', v_second_in, 'time_out', v_row.time_out, 'minutes', v_second));
  return jsonb_build_object('first_minutes', v_first, 'second_minutes', v_second);
end $$;

-- Everyone who can be marked on this project: the company's active workers, with the crew they are
-- on here (or another crew of theirs, or none yet).
create or replace function public.project_workers(p_project uuid)
returns table (id uuid, name text, work_type text, rate_kind text, rate_paisa bigint,
  crew_id uuid, crew_name text, crew_project_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid := (select p.company_id from public.projects p where p.id = p_project);
begin
  if v_company is null or not private.can_work_on_project(v_company, p_project) then
    raise exception 'You cannot enter labour on this project' using errcode = '42501';
  end if;
  return query
    select w.id, w.name, w.work_type, w.rate_kind, w.rate_paisa, c.id, c.name, c.project_id
    from public.workers w
    left join lateral (
      select c.id, c.name, c.project_id from public.crew_members m join public.crews c on c.id = m.crew_id
      where m.worker_id = w.id and m.active and c.active
      order by (c.project_id = p_project) desc nulls last, c.name limit 1
    ) c on true
    where w.company_id = v_company and w.active
    order by c.name nulls last, w.name;
end $$;

drop function public.attendance_day(uuid, date);
create function public.attendance_day(p_project uuid, p_date date)
returns table (worker_id uuid, crew_id uuid, time_in time, time_out time, minutes integer, amount_paisa bigint, closed boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid := (select p.company_id from public.projects p where p.id = p_project);
begin
  if v_company is null or not (private.can_work_on_project(v_company, p_project) or private.can_see_project_money(v_company, p_project)) then
    raise exception 'You cannot see labour on this project' using errcode = '42501';
  end if;
  return query
    select a.worker_id, a.crew_id, a.time_in, a.time_out, a.minutes, a.amount_paisa, private.attendance_is_closed(a.labour_cost_id)
    from public.attendance a
    where a.project_id = p_project and a.work_date = p_date;
end $$;
revoke execute on function public.attendance_day(uuid, date) from public, anon;
grant execute on function public.attendance_day(uuid, date) to authenticated;

drop function public.worker_month(uuid, date, date);
create function public.worker_month(p_worker uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_company uuid := (select w.company_id from public.workers w where w.id = p_worker);
  v_worker jsonb;
  v_rows jsonb;
begin
  if v_company is null or not (
    private.can_see_finance(v_company)
    or exists (select 1 from public.projects p where p.company_id = v_company and private.can_work_on_project(v_company, p.id))
  ) then
    raise exception 'You cannot see this worker' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 31 then
    raise exception 'Choose up to 32 days' using errcode = '22023';
  end if;

  select jsonb_build_object('id', w.id, 'name', w.name, 'work_type', w.work_type, 'rate_kind', w.rate_kind,
      'rate_paisa', w.rate_paisa, 'active', w.active,
      'crews', coalesce((
        select jsonb_agg(jsonb_build_object('crew_id', c.id, 'crew_name', c.name, 'project_id', c.project_id) order by c.name)
        from public.crew_members m join public.crews c on c.id = m.crew_id
        where m.worker_id = w.id and m.active and c.active), '[]'::jsonb))
  into v_worker
  from public.workers w
  where w.id = p_worker;

  select coalesce(jsonb_agg(jsonb_build_object(
      'work_date', a.work_date,
      'project_id', case when r.seen then a.project_id end,
      'crew_id', case when r.seen then a.crew_id end,
      'time_in', a.time_in, 'time_out', a.time_out, 'minutes', a.minutes,
      'amount_paisa', case when r.seen then a.amount_paisa end,
      'closed', private.attendance_is_closed(a.labour_cost_id),
      'editable', r.editable) order by a.work_date, a.time_in nulls last), '[]'::jsonb)
  into v_rows
  from public.attendance a
  cross join lateral (
    select private.can_work_on_project(v_company, a.project_id) as editable,
      private.can_work_on_project(v_company, a.project_id) or private.can_see_project_money(v_company, a.project_id) as seen
  ) r
  where a.worker_id = p_worker and a.work_date between p_from and p_to;

  return jsonb_build_object('worker', v_worker, 'rows', v_rows);
end $$;
revoke execute on function public.worker_month(uuid, date, date) from public, anon;
grant execute on function public.worker_month(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- The crew page: each worker's month on this crew, with what they earned and what is still due
-- ---------------------------------------------------------------------------
-- Money is shown to those who can see the project's money: earned in the month (closed days at
-- their price, open days at the current rate), paid in the month, and due on the project (posted
-- balance plus open days not closed yet). The company-wide balance, which includes money not given
-- to a project, is for Accounts and Admin (design §3.4).
create function public.crew_month(p_crew uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_crew public.crews;
  v_std integer;
  v_money boolean;
  v_post boolean;
  v_workers jsonb;
begin
  select * into v_crew from public.crews where id = p_crew;
  if v_crew.id is null or not (
    case when v_crew.project_id is null
      then private.can_manage_parties(v_crew.company_id) or private.can_see_finance(v_crew.company_id)
      else private.can_work_on_project(v_crew.company_id, v_crew.project_id)
        or private.can_see_project_money(v_crew.company_id, v_crew.project_id) end
  ) then
    raise exception 'You cannot see this crew' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 41 then
    raise exception 'Choose up to 42 days' using errcode = '22023';
  end if;
  v_std := (select standard_day_minutes from public.companies where id = v_crew.company_id);
  v_money := case when v_crew.project_id is null then private.can_see_finance(v_crew.company_id)
    else private.can_see_project_money(v_crew.company_id, v_crew.project_id) end;
  v_post := private.can_post(v_crew.company_id);

  select coalesce(jsonb_agg(x.j order by x.on_crew desc, x.name), '[]'::jsonb) into v_workers
  from (
    select w.name, coalesce(m.active, false) as on_crew, jsonb_build_object(
      'id', w.id, 'name', w.name, 'work_type', w.work_type, 'rate_kind', w.rate_kind, 'rate_paisa', w.rate_paisa,
      'phone', w.phone, 'active', w.active, 'on_crew', coalesce(m.active, false),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
            'work_date', a.work_date, 'project_id', a.project_id, 'time_in', a.time_in, 'time_out', a.time_out,
            'minutes', a.minutes, 'closed', private.attendance_is_closed(a.labour_cost_id),
            'amount_paisa', case when v_money then case when private.attendance_is_closed(a.labour_cost_id) then a.amount_paisa
              else round(w.rate_paisa::numeric * a.minutes / case when w.rate_kind = 'hourly' then 60 else v_std end)::bigint end end
          ) order by a.work_date)
        from public.attendance a
        where a.worker_id = w.id and a.crew_id = p_crew and a.work_date between p_from and p_to), '[]'::jsonb),
      'minutes', (select coalesce(sum(a.minutes), 0) from public.attendance a
        where a.worker_id = w.id and a.crew_id = p_crew and a.work_date between p_from and p_to),
      'paid_paisa', case when v_money then (
        select coalesce(sum(l.cash_paisa), 0)::bigint from public.ledger_entries l
        where l.worker_id = w.id and l.business_date between p_from and p_to
          and (v_crew.project_id is null or l.project_id = v_crew.project_id)) end,
      'balance_paisa', case when v_money then (
        select coalesce(sum(l.balance_paisa), 0)::bigint from public.ledger_entries l
        where l.worker_id = w.id and l.business_date <= private.today()
          and (case when v_crew.project_id is null then l.project_id is not null else l.project_id = v_crew.project_id end)) end,
      'open_paisa', case when v_money then (
        select coalesce(sum(round(w.rate_paisa::numeric * a.minutes / case when w.rate_kind = 'hourly' then 60 else v_std end)), 0)::bigint
        from public.attendance a
        where a.worker_id = w.id and not private.attendance_is_closed(a.labour_cost_id)
          and (case when v_crew.project_id is null then a.crew_id = p_crew else a.project_id = v_crew.project_id end)) end,
      'company_balance_paisa', case when v_post then (
        select coalesce(sum(l.balance_paisa), 0)::bigint from public.ledger_entries l
        where l.worker_id = w.id and l.business_date <= private.today()) end
    ) as j
    from public.workers w
    left join public.crew_members m on m.worker_id = w.id and m.crew_id = p_crew
    where w.company_id = v_crew.company_id
      and (m.active or exists (
        select 1 from public.attendance a where a.worker_id = w.id and a.crew_id = p_crew and a.work_date between p_from and p_to))
  ) x;

  return jsonb_build_object(
    'crew', jsonb_build_object('id', v_crew.id, 'name', v_crew.name, 'project_id', v_crew.project_id, 'active', v_crew.active),
    'standard_day_minutes', v_std, 'can_see_money', v_money, 'workers', v_workers);
end $$;
revoke execute on function public.crew_month(uuid, date, date) from public, anon;
grant execute on function public.crew_month(uuid, date, date) to authenticated;

-- Puts a worker on a crew: an existing worker ({worker_id}) or a new one ({id, name, work_type,
-- rate_kind, rate_paisa, phone}). Safe to retry: the client gives the new worker's id, and putting
-- a worker back on a crew they left marks them on it again.
create function public.add_crew_worker(p_crew uuid, p_worker jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := (select c.company_id from public.crews c where c.id = p_crew and c.active);
  v_worker uuid := coalesce((p_worker ->> 'worker_id')::uuid, (p_worker ->> 'id')::uuid);
begin
  if v_company is null then
    raise exception 'Choose a crew' using errcode = 'P0001';
  end if;
  if not private.can_edit_crew_members(v_company, p_crew) then
    raise exception 'You cannot change this crew' using errcode = '42501';
  end if;
  if v_worker is null then
    raise exception 'Choose a worker' using errcode = '22023';
  end if;
  if p_worker ? 'name' then
    insert into public.workers (company_id, id, name, work_type, rate_kind, rate_paisa, phone)
    values (v_company, v_worker, trim(p_worker ->> 'name'), nullif(trim(p_worker ->> 'work_type'), ''),
      p_worker ->> 'rate_kind', (p_worker ->> 'rate_paisa')::bigint, nullif(trim(p_worker ->> 'phone'), ''))
    on conflict (id) do nothing;
  end if;
  if not exists (select 1 from public.workers w where w.id = v_worker and w.company_id = v_company) then
    raise exception 'Choose a worker' using errcode = 'P0001';
  end if;
  insert into public.crew_members (company_id, crew_id, worker_id)
  values (v_company, p_crew, v_worker)
  on conflict (crew_id, worker_id) do update set active = true;
  return v_worker;
end $$;
revoke execute on function public.add_crew_worker(uuid, jsonb) from public, anon;
grant execute on function public.add_crew_worker(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Reports, dashboards and the calendar count a worker's labour as labour, like a crew's
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.project_cost_summary(p_project uuid, p_as_of date DEFAULT NULL::date, p_as_known boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_as_of date := coalesce(p_as_of, private.today());
  v_cutoff timestamptz := ((v_as_of + 1)::timestamp at time zone 'Asia/Kathmandu');
  v_totals record;
  v_by_heading jsonb;
  v_by_kind jsonb;
  v_unbilled bigint;
begin
  select coalesce(sum(l.cost_paisa), 0)::bigint as cost, coalesce(sum(l.cash_paisa), 0)::bigint as cash,
         coalesce(sum(l.balance_paisa), 0)::bigint as balance
  into v_totals
  from public.ledger_entries l
  where l.project_id = p_project and l.business_date <= v_as_of and (not p_as_known or l.posted_at < v_cutoff);

  select coalesce(jsonb_agg(jsonb_build_object('heading_id', h.heading_id, 'cost_paisa', h.cost) order by h.heading_id), '[]')
  into v_by_heading
  from (
    select l.heading_id, sum(l.cost_paisa)::bigint as cost from public.ledger_entries l
    where l.project_id = p_project and l.business_date <= v_as_of and (not p_as_known or l.posted_at < v_cutoff)
      and l.heading_id is not null
    group by l.heading_id having sum(l.cost_paisa) <> 0
  ) h;

  select jsonb_build_object(
    'supplier', coalesce(sum(l.balance_paisa) filter (where l.supplier_id is not null), 0),
    'subcontractor', coalesce(sum(l.balance_paisa) filter (where l.subcontractor_id is not null), 0),
    'crew', coalesce(sum(l.balance_paisa) filter (where l.crew_id is not null or l.worker_id is not null), 0),
    'payee', coalesce(sum(l.balance_paisa) filter (where l.payee_id is not null), 0))
  into v_by_kind
  from public.ledger_entries l
  where l.project_id = p_project and l.business_date <= v_as_of and (not p_as_known or l.posted_at < v_cutoff);

  select count(*) into v_unbilled
  from public.delivery_line_status s join public.deliveries d on d.id = s.delivery_id
  where s.project_id = p_project and s.billable_qty > 0 and d.receipt_date <= v_as_of;

  return jsonb_build_object(
    'as_of', v_as_of,
    'view', case when p_as_known then 'as_known' else 'current' end,
    'cost_paisa', v_totals.cost,
    'cash_paid_paisa', v_totals.cash,
    'payable_paisa', v_totals.balance,
    'payable_by_kind', v_by_kind,
    'by_heading', v_by_heading,
    'unbilled_delivery_lines', v_unbilled
  );
end $function$;


CREATE OR REPLACE FUNCTION private.company_dashboard_base(p_company uuid, p_from date, p_to date, p_as_of date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_as_of date := coalesce(p_as_of, private.today());
  v_money boolean := private.can_see_finance(p_company);
  v_projects jsonb;
  v_totals jsonb;
  v_parties jsonb;
  v_counts jsonb;
begin
  select coalesce(jsonb_agg(x.d order by x.status_order, x.code), '[]') into v_projects
  from (
    select pr.code, case when pr.status = 'active' then 0 when pr.status in ('planned', 'on_hold') then 1 else 2 end as status_order,
      jsonb_build_object('id', pr.id, 'code', pr.code, 'name', pr.name) || public.project_dashboard(pr.id, v_as_of) as d
    from public.projects pr
    where pr.company_id = p_company and pr.status not in ('cancelled', 'closed')
  ) x;

  if v_money then
    select jsonb_build_object(
        'cost_period_paisa', coalesce(sum(l.cost_paisa) filter (where l.business_date between p_from and p_to), 0),
        'cash_period_paisa', coalesce(sum(l.cash_paisa) filter (where l.business_date between p_from and p_to), 0),
        'cost_to_date_paisa', coalesce(sum(l.cost_paisa), 0),
        'cash_to_date_paisa', coalesce(sum(l.cash_paisa), 0))
    into v_totals
    from public.ledger_entries l
    where l.company_id = p_company and l.business_date <= v_as_of;

    -- Per party, whole company (I-10): positive is owed to them, negative is an advance.
    -- Payments not yet given to a project sit in the unallocated bucket (project null).
    select jsonb_build_object(
        'payable_by_kind', jsonb_build_object(
          'supplier', coalesce(sum(greatest(b.balance, 0)) filter (where b.kind = 'supplier'), 0),
          'subcontractor', coalesce(sum(greatest(b.balance, 0)) filter (where b.kind = 'subcontractor'), 0),
          'crew', coalesce(sum(greatest(b.balance, 0)) filter (where b.kind in ('crew', 'worker')), 0),
          'payee', coalesce(sum(greatest(b.balance, 0)) filter (where b.kind = 'payee'), 0)),
        'advances_paisa', coalesce(sum(-least(b.balance, 0)), 0),
        'unallocated_paisa', coalesce(sum(-b.unallocated), 0),
        'unallocated_parties', count(*) filter (where b.unallocated <> 0))
    into v_parties
    from (
      select l.party_id, private.party_kind(l) as kind, sum(l.balance_paisa) as balance,
        sum(l.balance_paisa) filter (where l.project_id is null) as unallocated
      from public.ledger_entries l
      where l.company_id = p_company and l.business_date <= v_as_of
      group by l.party_id, private.party_kind(l)
    ) b;
  end if;

  select jsonb_build_object(
      'slips_to_approve', (select count(*) from public.order_slips s where s.company_id = p_company and s.status = 'pending'),
      'slips_waiting', (select count(*) from public.order_slips s join public.order_slip_progress g on g.id = s.id
        where s.company_id = p_company and s.status = 'approved' and g.fulfilment in ('not_received', 'partially_received')),
      'unbilled_lines', (select count(*) from public.delivery_line_status s where s.company_id = p_company and s.billable_qty > 0),
      'bills_to_post', (select count(*) from public.supplier_bills b where b.company_id = p_company and b.status = 'under_review'))
  into v_counts;

  return jsonb_build_object('as_of', v_as_of, 'from', p_from, 'to', p_to, 'money_visible', v_money,
    'projects', v_projects, 'counts', v_counts)
    || coalesce(v_totals, '{}') || coalesce(v_parties, '{}');
end $function$;


CREATE OR REPLACE FUNCTION private.project_dashboard_base(p_project uuid, p_as_of date DEFAULT NULL::date, p_as_known boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_as_of date := coalesce(p_as_of, private.today());
  v_cutoff timestamptz := ((v_as_of + 1)::timestamp at time zone 'Asia/Kathmandu');
  p public.projects;
  a jsonb := '{}';
  v_money boolean;
  v_cost jsonb;
  v_headings jsonb;
  v_sources jsonb;
  v_advances bigint;
  v_progress numeric;
  v_unbilled record;
  v_drafts jsonb := '{}';
  v_last_report date;
  v_waiting bigint;
begin
  select * into p from public.projects where id = p_project;
  if not found then
    return null;
  end if;
  v_money := private.can_see_project_money(p.company_id, p.id);
  select pct into v_progress from public.progress_as_of(p_project, v_as_of) where stage_id is null;
  select max(work_date) into v_last_report from public.daily_reports where project_id = p_project and work_date <= v_as_of;
  select * into v_unbilled from private.unbilled_estimate(p_project, v_as_of);
  select count(*) into v_waiting
  from public.order_slips s join public.order_slip_progress g on g.id = s.id
  where s.status = 'approved' and g.fulfilment in ('not_received', 'partially_received')
    and exists (select 1 from public.order_slip_lines l where l.slip_id = s.id and l.project_id = p_project);

  if v_money then
    select to_jsonb(x) into a from public.project_amounts_as_of(p_project, v_as_of) x;
    a := coalesce(a, '{}');
    v_cost := public.project_cost_summary(p_project, v_as_of, p_as_known);

    -- Heading budget (the revision effective on the date) against recorded cost.
    select coalesce(jsonb_agg(jsonb_build_object(
        'heading_id', h.id, 'name', h.name, 'parent', ph.name,
        'budget_paisa', bl.amount_paisa, 'cost_paisa', coalesce(c.cost, 0),
        'over', bl.amount_paisa is not null and coalesce(c.cost, 0) > bl.amount_paisa)
      order by coalesce(ph.sort_order, h.sort_order), ph.name nulls first, h.sort_order, h.name), '[]')
    into v_headings
    from public.cost_headings h
    left join public.cost_headings ph on ph.id = h.parent_id
    left join public.budget_lines bl on bl.heading_id = h.id and bl.budget_revision_id = (a ->> 'budget_revision_id')::uuid
    left join (
      select l.heading_id, sum(l.cost_paisa)::bigint as cost from public.ledger_entries l
      where l.project_id = p_project and l.business_date <= v_as_of and (not p_as_known or l.posted_at < v_cutoff)
      group by l.heading_id
    ) c on c.heading_id = h.id
    where h.company_id = p.company_id and (bl.id is not null or coalesce(c.cost, 0) <> 0);

    select jsonb_build_object(
        'materials', coalesce(sum(l.cost_paisa) filter (where l.supplier_id is not null), 0),
        'subcontract', coalesce(sum(l.cost_paisa) filter (where l.subcontractor_id is not null), 0),
        'labour', coalesce(sum(l.cost_paisa) filter (where l.crew_id is not null or l.worker_id is not null), 0),
        'other', coalesce(sum(l.cost_paisa) filter (where l.payee_id is not null), 0))
    into v_sources
    from public.ledger_entries l
    where l.project_id = p_project and l.business_date <= v_as_of and (not p_as_known or l.posted_at < v_cutoff);

    -- Advances: parties paid more than they have charged on this project.
    select coalesce(sum(-least(b.balance, 0)), 0)::bigint into v_advances
    from (
      select l.party_id, sum(l.balance_paisa) as balance from public.ledger_entries l
      where l.project_id = p_project and l.business_date <= v_as_of and (not p_as_known or l.posted_at < v_cutoff)
      group by l.party_id
    ) b;

    select jsonb_build_object('bills', count(distinct b.id), 'typed_paisa', coalesce(sum(l.amount_paisa), 0)) into v_drafts
    from public.supplier_bills b join public.bill_lines l on l.bill_id = b.id
    where b.status in ('draft', 'under_review') and l.project_id = p_project;
  end if;

  return jsonb_build_object(
    'project_id', p.id, 'status', p.status, 'as_of', v_as_of,
    'view', case when p_as_known then 'as_known' else 'current' end,
    'money_visible', v_money,
    'progress_pct', v_progress,
    'last_report_date', v_last_report,
    'days_since_report', v_as_of - v_last_report,
    'slips_waiting', v_waiting,
    'unbilled_lines', v_unbilled.lines,
    'unbilled_estimate_paisa', case when v_money then v_unbilled.value_paisa end,
    'unbilled_without_rate', v_unbilled.lines_without_rate,
    'draft_bills', v_drafts -> 'bills',
    'draft_bills_paisa', v_drafts -> 'typed_paisa',
    'contract_paisa', a -> 'contract_paisa',
    'original_contract_paisa', a -> 'original_contract_paisa',
    'budget_paisa', a -> 'budget_paisa',
    'original_budget_paisa', a -> 'original_budget_paisa',
    'budget_revision_id', a -> 'budget_revision_id',
    'budget_effective_date', (select effective_date from public.budget_revisions where id = (a ->> 'budget_revision_id')::uuid),
    'planned_margin_paisa', a -> 'planned_margin_paisa',
    'cost_paisa', v_cost -> 'cost_paisa',
    'cash_paid_paisa', v_cost -> 'cash_paid_paisa',
    'payable_paisa', v_cost -> 'payable_paisa',
    'payable_by_kind', v_cost -> 'payable_by_kind',
    'advances_paisa', v_advances,
    'by_heading', v_headings,
    'by_source', v_sources,
    'final_result_paisa', case when v_money and p.status in ('completed', 'closed')
      then (a ->> 'contract_paisa')::bigint - (v_cost ->> 'cost_paisa')::bigint end
  );
end $function$;


CREATE OR REPLACE FUNCTION public.company_dashboard(p_company uuid, p_from date, p_to date, p_as_of date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_as_of date := coalesce(p_as_of, private.today());
  d jsonb := private.company_dashboard_money(p_company, p_from, p_to, p_as_of);
  v_sources jsonb;
begin
  if not coalesce((d ->> 'money_visible')::boolean, false) then
    return d;
  end if;

  select jsonb_build_object(
      'materials', coalesce(sum(l.cost_paisa) filter (where l.supplier_id is not null), 0),
      'subcontract', coalesce(sum(l.cost_paisa) filter (where l.subcontractor_id is not null), 0),
      'labour', coalesce(sum(l.cost_paisa) filter (where l.crew_id is not null or l.worker_id is not null), 0),
      'other', coalesce(sum(l.cost_paisa) filter (where l.payee_id is not null), 0))
  into v_sources
  from public.ledger_entries l
  where l.company_id = p_company and l.business_date <= v_as_of and l.business_date between p_from and p_to;

  return d || jsonb_build_object('cost_by_source_period', v_sources);
end $function$;


CREATE OR REPLACE FUNCTION public.calendar_events(p_company uuid, p_from date, p_to date, p_project uuid DEFAULT NULL::uuid)
 RETURNS TABLE(event_date date, kind text, label text, detail text, money text, cost_paisa bigint, cash_paisa bigint, project_id uuid, party_name text, link_kind text, link_id uuid, created_by uuid, at timestamp with time zone, received_paisa bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with money as (
    select l.event_id, l.business_date, l.project_id, l.party_id,
      sum(l.cost_paisa)::bigint as cost, sum(l.cash_paisa)::bigint as cash, min(l.posted_at) as at
    from public.ledger_entries l
    where l.company_id = p_company and l.business_date between p_from and p_to
      and (p_project is null or l.project_id = p_project)
    group by l.event_id, l.business_date, l.project_id, l.party_id
    having sum(l.cost_paisa) <> 0 or sum(l.cash_paisa) <> 0
  )
  select m.business_date, e.event_type, lbl ->> 'label', lbl ->> 'reason',
    case
      when m.cost <> 0 then 'cost'
      when e.event_type = 'refund' then 'refund'
      when e.event_type = 'payment_post' and exists (
        select 1 from public.payments p where p.id = (lbl ->> 'payment_id')::uuid and p.is_peski) then 'peski'
      else 'payment'
    end,
    m.cost, m.cash, m.project_id,
    coalesce((select name from public.suppliers where id = m.party_id), (select name from public.subcontractors where id = m.party_id),
             (select name from public.crews where id = m.party_id), (select name from public.payees where id = m.party_id), (select name from public.workers where id = m.party_id)),
    case
      when lbl ->> 'bill_id' is not null then 'bill' when lbl ->> 'charge_id' is not null then 'charge'
      when lbl ->> 'labour_cost_id' is not null then 'labour' when lbl ->> 'expense_id' is not null then 'expense'
      when lbl ->> 'credit_id' is not null then 'credit' when lbl ->> 'payment_id' is not null then 'payment'
      when lbl ->> 'refund_id' is not null then 'refund'
    end,
    coalesce(lbl ->> 'bill_id', lbl ->> 'charge_id', lbl ->> 'labour_cost_id', lbl ->> 'expense_id',
             lbl ->> 'credit_id', lbl ->> 'payment_id', lbl ->> 'refund_id')::uuid,
    null::uuid, m.at, null::bigint
  from money m
  join public.posting_events e on e.id = m.event_id
  cross join lateral private.event_label(m.event_id) lbl
  union all
  select r.work_date, 'report', 'Daily report: ' || r.work_done,
    concat_ws(' · ', r.area, case when r.headcount is not null then r.headcount || ' people' end, r.issues),
    null, null, null, r.project_id, null, 'report', r.id, r.created_by, r.submitted_at, null::bigint
  from public.daily_reports r
  where r.company_id = p_company and r.work_date between p_from and p_to and (p_project is null or r.project_id = p_project)
  union all
  select u.effective_date, 'progress',
    'Progress: ' || coalesce(s.name, 'Overall') || ' ' || trim(to_char(u.pct, 'FM990.##')) || '%',
    coalesce(u.reason, u.notes), null, null, null, u.project_id, null, 'progress', u.id, u.created_by, u.created_at, null::bigint
  from public.progress_updates u left join public.stages s on s.id = u.stage_id
  where u.company_id = p_company and u.effective_date between p_from and p_to and (p_project is null or u.project_id = p_project)
  union all
  select d.receipt_date, 'delivery', 'Delivery' || coalesce(', challan ' || d.challan_no, ''),
    (select string_agg(coalesce(mt.name, dl.material_text) || ' ' || trim(to_char(dl.received_qty - dl.rejected_qty, 'FM999999990.###')) || ' ' || un.code, ', ')
     from public.delivery_lines dl left join public.materials mt on mt.id = dl.material_id join public.units un on un.id = dl.unit_id
     where dl.delivery_id = d.id),
    null, null, null, d.project_id, sp.name, 'delivery', d.id, d.created_by, d.created_at, null::bigint
  from public.deliveries d left join public.suppliers sp on sp.id = d.supplier_id
  where d.company_id = p_company and d.receipt_date between p_from and p_to and (p_project is null or d.project_id = p_project)
  union all
  -- Slips the caller can see: requested (once out of draft) and marked sent.
  select x.day, x.kind, x.label, null, null, null, null, null, sp.name, 'slip', o.id, o.created_by, x.at, null::bigint
  from public.order_slips o
  left join public.suppliers sp on sp.id = o.supplier_id
  cross join lateral (values
    (o.request_date, 'slip', 'Order slip ' || o.number, o.created_at),
    ((o.sent_at at time zone 'Asia/Kathmandu')::date, 'slip_sent', 'Order slip ' || o.number || ' marked sent', o.sent_at)
  ) as x(day, kind, label, at)
  where o.company_id = p_company and o.status <> 'draft' and x.day between p_from and p_to
    and (p_project is null or exists (select 1 from public.order_slip_lines ol where ol.slip_id = o.id and ol.project_id = p_project))
  union all
  -- What the client paid (kept apart from cash paid out), and its reversal as a negative row.
  select x.day, x.kind, x.label, x.detail, 'received', null, null, cr.project_id, pj.client_name,
    'client_receipt', cr.id, x.by, x.at, x.amount
  from public.client_receipts cr
  join public.projects pj on pj.id = cr.project_id
  left join public.client_receipt_reversals rv on rv.receipt_id = cr.id
  cross join lateral (values
    (cr.receipt_date, 'client_receipt', 'Received ' || cr.number, cr.reference, cr.amount_paisa, cr.created_by, cr.created_at),
    (rv.reversal_date, 'client_receipt_reversal', 'Reversed ' || cr.number, rv.reason, -cr.amount_paisa, rv.created_by, rv.created_at)
  ) as x(day, kind, label, detail, amount, by, at)
  where cr.company_id = p_company and x.day is not null and x.day between p_from and p_to
    and (p_project is null or cr.project_id = p_project)
$function$;


revoke execute on function private.can_edit_worker(uuid, uuid) from public, anon;
grant execute on function private.can_edit_worker(uuid, uuid) to authenticated;
