-- Milestone 6: refunds received (req §12.2, §12.3, §19; design §4.3).
-- Money a supplier, subcontractor, crew or payee gives back. Ledger effect: cost 0,
-- balance +amount (the advance shrinks), cash -amount (cash paid falls), on a project or in
-- the party's unallocated bucket, dated on the refund date. A refund never creates cost.
-- It may not exceed the advance held with the party, company-wide and in the chosen bucket,
-- so a refund never turns an advance into money owed (product owner, 2026-10-10).

create table public.refunds (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  number text not null,
  supplier_id uuid,
  subcontractor_id uuid,
  crew_id uuid,
  payee_id uuid,
  party_id uuid generated always as (coalesce(supplier_id, subcontractor_id, crew_id, payee_id)) stored,
  project_id uuid, -- null = the party's unallocated bucket
  refund_date date not null,
  amount_paisa bigint not null check (amount_paisa > 0),
  method public.payment_method not null default 'cash',
  reference text,
  notes text,
  status public.doc_status not null default 'posted',
  posted_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, number),
  constraint refunds_one_party check (num_nonnulls(supplier_id, subcontractor_id, crew_id, payee_id) = 1),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  foreign key (company_id, subcontractor_id) references public.subcontractors (company_id, id),
  foreign key (company_id, crew_id) references public.crews (company_id, id),
  foreign key (company_id, payee_id) references public.payees (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id)
);
create index refunds_party on public.refunds (company_id, party_id, refund_date);

create trigger set_updated_at before update on public.refunds for each row execute function private.set_updated_at();
create trigger audit after insert or update or delete on public.refunds for each row execute function private.audit();
create trigger set_created_by before insert on public.refunds for each row execute function private.set_created_by();
create trigger guard_posted before update or delete on public.refunds
  for each row execute function private.guard_posted_document();

alter table public.refunds enable row level security;
-- Like payments: finance people on the refund's project; unallocated ones for Admin and Accounts.
create policy refunds_select on public.refunds for select to authenticated
  using (
    private.sees_all_projects(company_id)
    or (project_id is not null and private.can_see_finance(company_id) and private.can_see_project(company_id, project_id))
  );
revoke insert, update, delete on public.refunds from authenticated, anon;

-- Posting events and reversals learn the new source.
alter table public.posting_events
  drop constraint posting_events_event_type_check,
  drop constraint posting_event_one_source,
  drop column source_id, -- also drops the I-12 unique key; re-added below
  add column refund_id uuid,
  add foreign key (company_id, refund_id) references public.refunds (company_id, id),
  add constraint posting_events_event_type_check check (event_type in (
    'opening_balance', 'bill_post', 'payment_post', 'allocation_move', 'credit_post', 'reversal',
    'charge_approve', 'labour_save', 'expense_save', 'refund'
  )),
  add column source_id uuid generated always as (coalesce(
    opening_balance_id, bill_id, payment_id, allocation_event_id, credit_id, reversal_id,
    charge_id, labour_cost_id, expense_id, refund_id)) stored,
  add constraint posting_events_company_id_event_type_source_id_key unique (company_id, event_type, source_id), -- I-12
  add constraint posting_event_one_source check (num_nonnulls(
    opening_balance_id, bill_id, payment_id, allocation_event_id, credit_id, reversal_id,
    charge_id, labour_cost_id, expense_id, refund_id) = 1);

alter table public.reversals
  drop constraint reversal_one_target,
  drop column target_id, -- also drops the C5 unique key; re-added below
  add column refund_id uuid,
  add foreign key (company_id, refund_id) references public.refunds (company_id, id),
  add column target_id uuid generated always as (
    coalesce(bill_id, payment_id, credit_id, opening_balance_id, charge_id, labour_cost_id, expense_id, refund_id)) stored,
  add constraint reversals_company_id_target_id_key unique (company_id, target_id), -- C5: reversed at most once
  add constraint reversal_one_target check (
    num_nonnulls(bill_id, payment_id, credit_id, opening_balance_id, charge_id, labour_cost_id, expense_id, refund_id) = 1);

-- I-6: payments, allocation moves and refunds never create cost.
alter table public.ledger_entries
  drop constraint ledger_payments_no_cost,
  add constraint ledger_payments_no_cost check (event_type not in ('payment_post', 'allocation_move', 'refund') or cost_paisa = 0);

-- ===========================================================================
-- Ledger writers with the refund source
-- ===========================================================================

drop function private.new_event(uuid, text, uuid, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], uuid, uuid, uuid);
create function private.new_event(
  p_company uuid, p_type text, p_party uuid, p_date date, p_op_key uuid,
  p_opening_balance uuid default null, p_bill uuid default null, p_payment uuid default null,
  p_allocation_event uuid default null, p_credit uuid default null, p_reversal uuid default null,
  p_reversed_events uuid[] default null, p_charge uuid default null, p_labour_cost uuid default null,
  p_expense uuid default null, p_refund uuid default null
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
    company_id, event_type, supplier_id, subcontractor_id, crew_id, payee_id, business_date, op_key,
    opening_balance_id, bill_id, payment_id, allocation_event_id, credit_id, reversal_id, reversed_event_ids,
    charge_id, labour_cost_id, expense_id, refund_id, created_by
  ) values (
    p_company, p_type,
    case when v_kind = 'supplier' then p_party end, case when v_kind = 'subcontractor' then p_party end,
    case when v_kind = 'crew' then p_party end, case when v_kind = 'payee' then p_party end,
    p_date, p_op_key, p_opening_balance, p_bill, p_payment, p_allocation_event, p_credit, p_reversal,
    p_reversed_events, p_charge, p_labour_cost, p_expense, p_refund, auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

drop function private.reverse_with_event(uuid, uuid, date, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid);
create function private.reverse_with_event(
  p_company uuid, p_party uuid, p_date date, p_reason text, p_op_key uuid,
  p_bill uuid default null, p_payment uuid default null, p_credit uuid default null, p_opening_balance uuid default null,
  p_charge uuid default null, p_labour_cost uuid default null, p_expense uuid default null, p_refund uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := private.party_kind(p_party);
  v_reversal uuid;
  v_events uuid[];
  v_event uuid;
begin
  insert into public.reversals (
    company_id, supplier_id, subcontractor_id, crew_id, payee_id, bill_id, payment_id, credit_id, opening_balance_id,
    charge_id, labour_cost_id, expense_id, refund_id, reversal_date, reason, created_by
  ) values (
    p_company,
    case when v_kind = 'supplier' then p_party end, case when v_kind = 'subcontractor' then p_party end,
    case when v_kind = 'crew' then p_party end, case when v_kind = 'payee' then p_party end,
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

-- ===========================================================================
-- Recording and reversing refunds
-- ===========================================================================

-- Advance that can be refunded: the smaller of the party's company-wide advance and the
-- advance in the bucket (a project, or unallocated when p_project is null). 0 when none.
-- Security invoker: it reads the ledger with the caller's own rights.
create function public.refund_available(p_party uuid, p_project uuid default null) returns bigint
language sql stable security invoker set search_path = '' as $$
  select greatest(0, least(
    -coalesce((select sum(l.balance_paisa) from public.ledger_entries l where l.party_id = p_party), 0),
    -coalesce((select sum(l.balance_paisa) from public.ledger_entries l
               where l.party_id = p_party and l.project_id is not distinct from p_project), 0)
  ))::bigint
$$;

-- Every bucket (project or unallocated, null) with something to refund, for the refund form.
create function public.refund_rooms(p_party uuid)
returns table (project_id uuid, available_paisa bigint)
language sql stable security invoker set search_path = '' as $$
  with b as (
    select l.project_id, sum(l.balance_paisa)::bigint as bal from public.ledger_entries l
    where l.party_id = p_party group by l.project_id
  ), total as (select coalesce(sum(bal), 0) as bal from b)
  select b.project_id, least(-total.bal, -b.bal)::bigint
  from b, total
  where b.bal < 0 and total.bal < 0
  order by 2 desc
$$;

-- p_refund: {id, supplier_id | subcontractor_id | crew_id | payee_id, project_id (null = unallocated),
--   refund_date, amount_paisa, method, reference, notes}
create function public.record_refund(p_op_key uuid, p_refund jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_refund ->> 'id')::uuid;
  v_party uuid := coalesce((p_refund ->> 'supplier_id')::uuid, (p_refund ->> 'subcontractor_id')::uuid,
                           (p_refund ->> 'crew_id')::uuid, (p_refund ->> 'payee_id')::uuid);
  v_kind text := private.party_kind(v_party);
  v_company uuid := private.party_company(v_party);
  v_project uuid := nullif(p_refund ->> 'project_id', '')::uuid;
  v_amount bigint := (p_refund ->> 'amount_paisa')::bigint;
  v_date date := coalesce((p_refund ->> 'refund_date')::date, private.today());
  v_prior jsonb;
  v_company_bal bigint;
  v_bucket_bal bigint;
  v_room bigint;
  v_number text;
  v_event uuid;
begin
  -- 1. Authorize. Refunds on a project need payment rights there; unallocated ones are Admin/Accounts.
  if v_company is null or not private.can_record_payments(v_company) then
    raise exception 'You cannot record refunds' using errcode = '42501';
  end if;
  if num_nonnulls(p_refund ->> 'supplier_id', p_refund ->> 'subcontractor_id', p_refund ->> 'crew_id',
                  p_refund ->> 'payee_id') <> 1
     or (p_refund ->> (v_kind || '_id')) is null then
    raise exception 'A refund is from exactly one supplier, subcontractor, crew or payee' using errcode = '22023';
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

  -- 2. Operation key.
  v_prior := private.begin_op(v_company, p_op_key, 'record_refund', p_refund);
  if v_prior is not null then
    return v_prior;
  end if;

  -- 3. Lock the party, so two refunds cannot both use the same advance.
  perform private.lock_party(v_party);

  -- 4. Check: no more than the advance, company-wide and in the bucket.
  select coalesce(sum(balance_paisa), 0), coalesce(sum(balance_paisa) filter (where project_id is not distinct from v_project), 0)
  into v_company_bal, v_bucket_bal
  from public.ledger_entries where party_id = v_party;
  v_room := greatest(0, least(-v_company_bal, -v_bucket_bal));
  if v_amount > v_room then
    raise exception 'refund_exceeds_advance: the advance available to refund here is Rs. %',
      to_char(v_room / 100.0, 'FM99,99,99,99,990.00') using errcode = 'P0001';
  end if;

  -- 5. Write.
  v_number := public.next_doc_number(v_company, 'refund', 'RF');
  insert into public.refunds (
    company_id, id, number, supplier_id, subcontractor_id, crew_id, payee_id, project_id,
    refund_date, amount_paisa, method, reference, notes
  ) values (
    v_company, v_id, v_number,
    case when v_kind = 'supplier' then v_party end, case when v_kind = 'subcontractor' then v_party end,
    case when v_kind = 'crew' then v_party end, case when v_kind = 'payee' then v_party end,
    v_project, v_date, v_amount, coalesce((p_refund ->> 'method')::public.payment_method, 'cash'),
    nullif(trim(p_refund ->> 'reference'), ''), nullif(trim(p_refund ->> 'notes'), '')
  );
  v_event := private.new_event(v_company, 'refund', v_party, v_date, p_op_key, p_refund => v_id);
  perform private.add_ledger(v_event, coalesce('project:' || v_project, 'unallocated'), v_project, null, 0, v_amount, -v_amount);
  return private.finish_op(v_company, p_op_key, jsonb_build_object('refund_id', v_id, 'number', v_number, 'event_id', v_event));
end $$;

create function public.reverse_refund(p_op_key uuid, p_refund uuid, p_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f public.refunds;
  v_company uuid := (select company_id from public.refunds where id = p_refund);
  v_prior jsonb;
  v_reason text;
  v_date date := coalesce(p_date, private.today());
  v_reversal uuid;
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can reverse refunds' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'reverse_refund',
    jsonb_build_object('refund', p_refund, 'date', p_date, 'reason', p_reason));
  if v_prior is not null then
    return v_prior;
  end if;
  v_reason := private.require_reason(p_reason);
  perform private.lock_party((select party_id from public.refunds where id = p_refund));
  select * into f from public.refunds where id = p_refund for update;
  if f.status = 'reversed' then
    raise exception 'already_reversed: this refund was already reversed' using errcode = 'P0001';
  end if;
  if v_date < f.refund_date then
    raise exception 'The reversal cannot be dated before the refund' using errcode = '22023';
  end if;
  v_reversal := private.reverse_with_event(v_company, f.party_id, v_date, v_reason, p_op_key, p_refund => p_refund);
  update public.refunds set status = 'reversed' where id = p_refund;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('reversal_id', v_reversal));
end $$;

-- ===========================================================================
-- Readers: khata, calendar, payment register
-- ===========================================================================

create or replace function private.event_label(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.posting_events;
  r public.reversals;
  v_label text;
  v_bill uuid;
  v_payment uuid;
  v_credit uuid;
  v_charge uuid;
  v_labour uuid;
  v_expense uuid;
  v_refund uuid;
begin
  select * into e from public.posting_events where id = p_event;
  if not found or not private.can_see_finance(e.company_id) then
    return null;
  end if;
  if e.event_type = 'reversal' then
    select * into r from public.reversals where id = e.reversal_id;
    v_bill := r.bill_id; v_payment := r.payment_id; v_credit := r.credit_id;
    v_charge := r.charge_id; v_labour := r.labour_cost_id; v_expense := r.expense_id; v_refund := r.refund_id;
  elsif e.event_type = 'allocation_move' then
    select a.payment_id into v_payment from public.payment_allocation_events a where a.id = e.allocation_event_id;
  else
    v_bill := e.bill_id; v_payment := e.payment_id; v_credit := e.credit_id;
    v_charge := e.charge_id; v_labour := e.labour_cost_id; v_expense := e.expense_id; v_refund := e.refund_id;
  end if;
  v_label := coalesce(
    (select 'Bill ' || b.bill_no from public.supplier_bills b where b.id = v_bill),
    (select 'Payment ' || p.number from public.payments p where p.id = v_payment),
    (select 'Credit ' || c.number from public.credits c where c.id = v_credit),
    (select 'Work charge' || coalesce(' ' || nullif(trim(c.claim_no), ''), '') || ': ' || w.scope
     from public.subcontract_charges c join public.work_packages w on w.id = c.work_package_id where c.id = v_charge),
    (select 'Labour' || coalesce(', ' || l.work_type, '') from public.labour_costs l where l.id = v_labour),
    (select 'Expense: ' || x.description from public.expenses x where x.id = v_expense),
    (select 'Refund ' || f.number from public.refunds f where f.id = v_refund),
    case when e.event_type = 'opening_balance' or r.opening_balance_id is not null then 'Opening balance' end
  );
  v_label := case e.event_type
    when 'reversal' then 'Reversal of ' || lower(left(v_label, 1)) || substr(v_label, 2)
    when 'allocation_move' then 'Allocation change, ' || lower(left(v_label, 1)) || substr(v_label, 2)
    else v_label end;
  return jsonb_build_object('label', v_label, 'bill_id', v_bill, 'payment_id', v_payment, 'credit_id', v_credit,
    'charge_id', v_charge, 'labour_cost_id', v_labour, 'expense_id', v_expense, 'refund_id', v_refund, 'reason', r.reason);
end $$;

create or replace function public.party_khata(
  p_party uuid, p_from date default null, p_to date default null, p_project uuid default null
)
returns table (
  event_id uuid, business_date date, posted_at timestamptz, event_type text, label text, reason text,
  doc_kind text, doc_id uuid, project_id uuid,
  cost_paisa bigint, balance_paisa bigint, cash_paisa bigint, running_balance_paisa bigint
)
language sql stable security invoker set search_path = '' as $$
  with rows as (
    select l.* from public.ledger_entries l
    where l.party_id = p_party
      and (p_project is null or l.project_id = p_project)
      and (p_to is null or l.business_date <= p_to)
  ),
  opening as (
    select coalesce(sum(r.balance_paisa), 0)::bigint as b from rows r where p_from is not null and r.business_date < p_from
  ),
  ev as (
    select r.event_id, min(r.business_date) as business_date, min(r.posted_at) as posted_at, min(r.event_type) as event_type,
      case when count(distinct coalesce(r.project_id::text, '-')) = 1 then (array_agg(r.project_id))[1] end as project_id,
      sum(r.cost_paisa)::bigint as cost, sum(r.balance_paisa)::bigint as balance, sum(r.cash_paisa)::bigint as cash
    from rows r
    where p_from is null or r.business_date >= p_from
    group by r.event_id
    having sum(r.cost_paisa) <> 0 or sum(r.balance_paisa) <> 0 or sum(r.cash_paisa) <> 0
  )
  select null::uuid, p_from, null::timestamptz, 'opening'::text, 'Balance brought forward'::text, null::text,
    null::text, null::uuid, p_project, 0::bigint, o.b, 0::bigint, o.b
  from opening o where p_from is not null
  union all
  select ev.event_id, ev.business_date, ev.posted_at, ev.event_type, lbl ->> 'label', lbl ->> 'reason',
    case
      when lbl ->> 'bill_id' is not null then 'bill' when lbl ->> 'charge_id' is not null then 'charge'
      when lbl ->> 'labour_cost_id' is not null then 'labour' when lbl ->> 'expense_id' is not null then 'expense'
      when lbl ->> 'credit_id' is not null then 'credit' when lbl ->> 'payment_id' is not null then 'payment'
      when lbl ->> 'refund_id' is not null then 'refund'
    end,
    coalesce(lbl ->> 'bill_id', lbl ->> 'charge_id', lbl ->> 'labour_cost_id', lbl ->> 'expense_id',
             lbl ->> 'credit_id', lbl ->> 'payment_id', lbl ->> 'refund_id')::uuid,
    ev.project_id, ev.cost, ev.balance, ev.cash,
    ((select o.b from opening o) + sum(ev.balance) over (order by ev.business_date, ev.posted_at, ev.event_id))::bigint
  from ev cross join lateral private.event_label(ev.event_id) lbl
  order by 2 nulls first, 3 nulls first, 1 nulls first
$$;

-- Calendar: a refund is cash coming back, shown apart from payments (kind 'refund').
create or replace function public.calendar_events(
  p_company uuid, p_from date, p_to date, p_project uuid default null
)
returns table (
  event_date date, kind text, label text, detail text, money text,
  cost_paisa bigint, cash_paisa bigint, project_id uuid, party_name text,
  link_kind text, link_id uuid, created_by uuid, at timestamptz
)
language sql stable security invoker set search_path = '' as $$
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
      when lbl ->> 'payment_id' is not null and e.event_type = 'payment_post' and not exists (
        select 1 from public.settlement_events s where s.payment_id = (lbl ->> 'payment_id')::uuid) then 'advance'
      else 'payment'
    end,
    m.cost, m.cash, m.project_id,
    coalesce((select name from public.suppliers where id = m.party_id), (select name from public.subcontractors where id = m.party_id),
             (select name from public.crews where id = m.party_id), (select name from public.payees where id = m.party_id)),
    case
      when lbl ->> 'bill_id' is not null then 'bill' when lbl ->> 'charge_id' is not null then 'charge'
      when lbl ->> 'labour_cost_id' is not null then 'labour' when lbl ->> 'expense_id' is not null then 'expense'
      when lbl ->> 'credit_id' is not null then 'credit' when lbl ->> 'payment_id' is not null then 'payment'
      when lbl ->> 'refund_id' is not null then 'refund'
    end,
    coalesce(lbl ->> 'bill_id', lbl ->> 'charge_id', lbl ->> 'labour_cost_id', lbl ->> 'expense_id',
             lbl ->> 'credit_id', lbl ->> 'payment_id', lbl ->> 'refund_id')::uuid,
    null::uuid, m.at
  from money m
  join public.posting_events e on e.id = m.event_id
  cross join lateral private.event_label(m.event_id) lbl
  union all
  select r.work_date, 'report', 'Daily report: ' || r.work_done,
    concat_ws(' · ', r.area, case when r.headcount is not null then r.headcount || ' people' end, r.issues),
    null, null, null, r.project_id, null, 'report', r.id, r.created_by, r.submitted_at
  from public.daily_reports r
  where r.company_id = p_company and r.work_date between p_from and p_to and (p_project is null or r.project_id = p_project)
  union all
  select u.effective_date, 'progress',
    'Progress: ' || coalesce(s.name, 'Overall') || ' ' || trim(to_char(u.pct, 'FM990.##')) || '%',
    coalesce(u.reason, u.notes), null, null, null, u.project_id, null, 'progress', u.id, u.created_by, u.created_at
  from public.progress_updates u left join public.stages s on s.id = u.stage_id
  where u.company_id = p_company and u.effective_date between p_from and p_to and (p_project is null or u.project_id = p_project)
  union all
  select d.receipt_date, 'delivery', 'Delivery' || coalesce(', challan ' || d.challan_no, ''),
    (select string_agg(coalesce(mt.name, dl.material_text) || ' ' || trim(to_char(dl.received_qty - dl.rejected_qty, 'FM999999990.###')) || ' ' || un.code, ', ')
     from public.delivery_lines dl left join public.materials mt on mt.id = dl.material_id join public.units un on un.id = dl.unit_id
     where dl.delivery_id = d.id),
    null, null, null, d.project_id, sp.name, 'delivery', d.id, d.created_by, d.created_at
  from public.deliveries d left join public.suppliers sp on sp.id = d.supplier_id
  where d.company_id = p_company and d.receipt_date between p_from and p_to and (p_project is null or d.project_id = p_project)
  union all
  -- Slips the caller can see: requested (once out of draft) and marked sent.
  select x.day, x.kind, x.label, null, null, null, null, null, sp.name, 'slip', o.id, o.created_by, x.at
  from public.order_slips o
  left join public.suppliers sp on sp.id = o.supplier_id
  cross join lateral (values
    (o.request_date, 'slip', 'Order slip ' || o.number, o.created_at),
    ((o.sent_at at time zone 'Asia/Kathmandu')::date, 'slip_sent', 'Order slip ' || o.number || ' marked sent', o.sent_at)
  ) as x(day, kind, label, at)
  where o.company_id = p_company and o.status <> 'draft' and x.day between p_from and p_to
    and (p_project is null or exists (select 1 from public.order_slip_lines ol where ol.slip_id = o.id and ol.project_id = p_project))
$$;

-- Payment register: refunds are listed too, as negative rows (kind 'refund'), so the register
-- total is cash paid net of refunds, as on the dashboard (req §19, acceptance #14).
drop function public.report_payments(uuid, date, date, uuid, uuid, date);
create function public.report_payments(
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
    (select sum(l.cash_paisa)::bigint from public.ledger_entries l join public.posting_events e on e.id = l.event_id
     where e.payment_id = p.id and e.event_type = 'payment_post' and l.project_id = p_project),
    (select coalesce(sum(s.amount_paisa), 0)::bigint from public.settlement_events s, d
     where s.payment_id = p.id and s.business_date <= d.as_of and (p_project is null or s.project_id = p_project)),
    (select r.reversal_date from public.reversals r, d where r.payment_id = p.id and r.reversal_date <= d.as_of),
    'payment'
  from public.payments p
  where p.company_id = p_company and p.payment_date between p_from and p_to
    and (p_party is null or p.party_id = p_party)
    and (p_project is null or exists (
      select 1 from public.ledger_entries l join public.posting_events e on e.id = l.event_id
      where e.payment_id = p.id and l.project_id = p_project and l.cash_paisa <> 0))
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

revoke execute on function public.record_refund(uuid, jsonb), public.reverse_refund(uuid, uuid, date, text),
  public.refund_available(uuid, uuid), public.refund_rooms(uuid), public.report_payments(uuid, date, date, uuid, uuid, date) from public, anon;
grant execute on function public.record_refund(uuid, jsonb), public.reverse_refund(uuid, uuid, date, text),
  public.refund_available(uuid, uuid), public.refund_rooms(uuid), public.report_payments(uuid, date, date, uuid, uuid, date) to authenticated;
revoke execute on function private.new_event(uuid, text, uuid, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], uuid, uuid, uuid, uuid),
  private.reverse_with_event(uuid, uuid, date, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
