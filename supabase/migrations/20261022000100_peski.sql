-- Peski and Overpayment (GLOSSARY.md). Money a party holds for the company used to be one
-- figure, "advance". It is now two:
--   Peski       - agreed upfront, before any bill exists; recorded on the payment (is_peski).
--                 Used up by farchhyaut (matching it to the party's bills); if that bill is
--                 reversed, the money is Peski again.
--   Overpayment - everything else held: paid beyond a bill, paid ahead on the khata, or left
--                 by a reversal. The party owes it back; a Refund clears it.
-- Ledger rows do not change: both are a negative balance. The split is derived, never stored.
-- Existing payments stay is_peski = false (product owner, 2026-10-13).

alter table public.payments add column is_peski boolean not null default false;
alter table public.refunds add column kind text not null default 'refund'
  check (kind in ('refund', 'peski_returned'));

-- ===========================================================================
-- Peski held and Overpayment held
-- ===========================================================================

-- Peski not yet used, before the cap: Peski payments' money not yet matched to a bill, less
-- Peski Returned. p_whole: the party's whole khata; otherwise one bucket, p_project
-- (null = unallocated). Security invoker: reads with the caller's own rights.
create function private.peski_open(p_party uuid, p_project uuid, p_whole boolean, p_as_of date) returns bigint
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
      where p.party_id = p_party and p.is_peski and p.status = 'posted' and p.payment_date <= p_as_of), 0)
    - coalesce((
      select sum(s.amount_paisa) from public.settlement_events s join public.payments p on p.id = s.payment_id
      where p.party_id = p_party and p.is_peski and p.status = 'posted' and s.business_date <= p_as_of
        and (p_whole or s.project_id is not distinct from p_project)), 0)
    - coalesce((
      select sum(f.amount_paisa) from public.refunds f
      where f.party_id = p_party and f.kind = 'peski_returned' and f.status = 'posted' and f.refund_date <= p_as_of
        and (p_whole or f.project_id is not distinct from p_project)), 0)
  )::bigint
$$;

-- Money the party holds (a negative balance), split into Peski and Overpayment. Peski is capped
-- at what is held, so the two always add up to the negative balance.
create function private.held_split(p_party uuid, p_project uuid, p_whole boolean, p_as_of date)
returns table (peski_paisa bigint, overpaid_paisa bigint)
language sql stable set search_path = '' as $$
  with h as (
    select greatest(0, -coalesce(sum(l.balance_paisa), 0))::bigint as held
    from public.ledger_entries l
    where l.party_id = p_party and l.business_date <= p_as_of
      and (p_whole or l.project_id is not distinct from p_project)
  ), p as (
    select least(h.held, greatest(0, private.peski_open(p_party, p_project, p_whole, p_as_of)))::bigint as peski from h
  )
  select p.peski, (h.held - p.peski)::bigint from h, p
$$;

-- A party's whole khata today: Peski not yet used and Overpayment, for the payment form.
create function public.party_held(p_party uuid)
returns table (peski_paisa bigint, overpaid_paisa bigint)
language sql stable security invoker set search_path = '' as $$
  select * from private.held_split(p_party, null, true, 'infinity')
$$;

-- What can come back in a bucket (a project, or unallocated when p_project is null), the
-- smaller of the party's whole khata and the bucket. p_kind 'refund' clears Overpayment;
-- 'peski_returned' gives back Peski. 0 when none.
drop function public.refund_available(uuid, uuid);
create function public.refund_available(p_party uuid, p_project uuid default null, p_kind text default 'refund')
returns bigint
language sql stable security invoker set search_path = '' as $$
  select least(
    case when p_kind = 'peski_returned' then w.peski_paisa else w.overpaid_paisa end,
    case when p_kind = 'peski_returned' then b.peski_paisa else b.overpaid_paisa end)::bigint
  from private.held_split(p_party, null, true, 'infinity') w,
       private.held_split(p_party, p_project, false, 'infinity') b
$$;

-- Every bucket with something to give back, for the refund form. available_paisa is the
-- Overpayment that a Refund can clear; peski_paisa what Peski Returned can give back.
drop function public.refund_rooms(uuid);
create function public.refund_rooms(p_party uuid)
returns table (project_id uuid, available_paisa bigint, peski_paisa bigint)
language sql stable security invoker set search_path = '' as $$
  with b as (
    select distinct l.project_id from public.ledger_entries l where l.party_id = p_party
  ), r as (
    select b.project_id,
      public.refund_available(p_party, b.project_id, 'refund') as available,
      public.refund_available(p_party, b.project_id, 'peski_returned') as peski
    from b
  )
  select r.project_id, r.available, r.peski from r
  where r.available > 0 or r.peski > 0
  order by r.available + r.peski desc
$$;

-- ===========================================================================
-- Payments: is_peski. Peski cannot pay bills, and is refused while the party has unpaid bills,
-- work charges, labour or other expenses: that money pays them instead.
-- ===========================================================================
drop function private.post_payment(uuid, uuid, uuid, date, bigint, text, text, text, uuid, jsonb, uuid);

create function private.post_payment(
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
    company_id, id, number, supplier_id, subcontractor_id, crew_id, payee_id, work_package_id,
    payment_date, amount_paisa, method, reference, notes, is_peski
  ) values (
    p_company, p_id, v_number,
    case when v_kind = 'supplier' then p_party end, case when v_kind = 'subcontractor' then p_party end,
    case when v_kind = 'crew' then p_party end, case when v_kind = 'payee' then p_party end,
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

-- p_payment: as before, plus is_peski (default false).
create or replace function public.record_payment(p_op_key uuid, p_payment jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_payment ->> 'id')::uuid;
  v_party uuid := coalesce((p_payment ->> 'supplier_id')::uuid, (p_payment ->> 'subcontractor_id')::uuid,
                           (p_payment ->> 'crew_id')::uuid, (p_payment ->> 'payee_id')::uuid);
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
                  p_payment ->> 'payee_id') <> 1
     or (p_payment ->> (v_kind || '_id')) is null then
    raise exception 'A payment is for exactly one supplier, subcontractor, crew or payee' using errcode = '22023';
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

-- ===========================================================================
-- Refunds: kind 'refund' (clears Overpayment) or 'peski_returned' (gives back Peski)
-- ===========================================================================
-- p_refund: as before, plus kind ('refund' default, or 'peski_returned').
create or replace function public.record_refund(p_op_key uuid, p_refund jsonb) returns jsonb
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
    company_id, id, number, supplier_id, subcontractor_id, crew_id, payee_id, project_id,
    refund_date, amount_paisa, method, reference, notes, kind
  ) values (
    v_company, v_id, v_number,
    case when v_kind = 'supplier' then v_party end, case when v_kind = 'subcontractor' then v_party end,
    case when v_kind = 'crew' then v_party end, case when v_kind = 'payee' then v_party end,
    v_project, v_date, v_amount, coalesce((p_refund ->> 'method')::public.payment_method, 'cash'),
    nullif(trim(p_refund ->> 'reference'), ''), nullif(trim(p_refund ->> 'notes'), ''), v_refund_kind
  );
  v_event := private.new_event(v_company, 'refund', v_party, v_date, p_op_key, p_refund => v_id);
  perform private.add_ledger(v_event, coalesce('project:' || v_project, 'unallocated'), v_project, null, 0, v_amount, -v_amount);
  return private.finish_op(v_company, p_op_key, jsonb_build_object('refund_id', v_id, 'number', v_number, 'event_id', v_event));
end $$;

-- Khata label: "Peski returned RF-0003" for that kind.
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
    (select case when f.kind = 'peski_returned' then 'Peski returned ' else 'Refund ' end || f.number
     from public.refunds f where f.id = v_refund),
    case when e.event_type = 'opening_balance' or r.opening_balance_id is not null then 'Opening balance' end
  );
  v_label := case e.event_type
    when 'reversal' then 'Reversal of ' || lower(left(v_label, 1)) || substr(v_label, 2)
    when 'allocation_move' then 'Allocation change, ' || lower(left(v_label, 1)) || substr(v_label, 2)
    else v_label end;
  return jsonb_build_object('label', v_label, 'bill_id', v_bill, 'payment_id', v_payment, 'credit_id', v_credit,
    'charge_id', v_charge, 'labour_cost_id', v_labour, 'expense_id', v_expense, 'refund_id', v_refund, 'reason', r.reason);
end $$;

-- Calendar money tag: 'peski' for a Peski payment (was 'advance' for any payment not matched
-- to a bill, which mixed Peski with Overpayment).
create or replace function public.calendar_events(
  p_company uuid, p_from date, p_to date, p_project uuid default null
)
returns table (
  event_date date, kind text, label text, detail text, money text,
  cost_paisa bigint, cash_paisa bigint, project_id uuid, party_name text,
  link_kind text, link_id uuid, created_by uuid, at timestamptz, received_paisa bigint
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
      when e.event_type = 'payment_post' and exists (
        select 1 from public.payments p where p.id = (lbl ->> 'payment_id')::uuid and p.is_peski) then 'peski'
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
$$;

-- ===========================================================================
-- Dashboards: advances_paisa (money held by parties) is split into peski_paisa and
-- overpaid_paisa. The earlier functions are kept, renamed into private, and wrapped.
-- ===========================================================================
alter function public.project_dashboard(uuid, date, boolean) rename to project_dashboard_base;
alter function public.project_dashboard_base(uuid, date, boolean) set schema private;
alter function public.company_dashboard(uuid, date, date, date) rename to company_dashboard_base;
alter function public.company_dashboard_base(uuid, date, date, date) set schema private;

create function public.project_dashboard(p_project uuid, p_as_of date default null, p_as_known boolean default false)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_as_of date := coalesce(p_as_of, private.today());
  v_cutoff timestamptz := ((v_as_of + 1)::timestamp at time zone 'Asia/Kathmandu');
  d jsonb := private.project_dashboard_base(p_project, p_as_of, p_as_known);
  v_held bigint := (d ->> 'advances_paisa')::bigint;
  v_peski bigint;
begin
  if v_held is null then
    return d;
  end if;
  -- Per party on this project: Peski up to what the party holds here; the rest is Overpayment.
  select coalesce(sum(least(-b.balance, greatest(0, private.peski_open(b.party_id, p_project, false, v_as_of)))), 0)::bigint
  into v_peski
  from (
    select l.party_id, sum(l.balance_paisa) as balance from public.ledger_entries l
    where l.project_id = p_project and l.business_date <= v_as_of and (not p_as_known or l.posted_at < v_cutoff)
    group by l.party_id
  ) b
  where b.balance < 0;
  return (d - 'advances_paisa') || jsonb_build_object('peski_paisa', v_peski, 'overpaid_paisa', v_held - v_peski);
end $$;

create function public.company_dashboard(p_company uuid, p_from date, p_to date, p_as_of date default null)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_as_of date := coalesce(p_as_of, private.today());
  d jsonb := private.company_dashboard_base(p_company, p_from, p_to, p_as_of);
  v_held bigint := (d ->> 'advances_paisa')::bigint;
  v_peski bigint;
begin
  if v_held is null then
    return d;
  end if;
  -- Per party, whole khata (I-10).
  select coalesce(sum(least(-b.balance, greatest(0, private.peski_open(b.party_id, null, true, v_as_of)))), 0)::bigint
  into v_peski
  from (
    select l.party_id, sum(l.balance_paisa) as balance from public.ledger_entries l
    where l.company_id = p_company and l.business_date <= v_as_of
    group by l.party_id
  ) b
  where b.balance < 0;
  return (d - 'advances_paisa') || jsonb_build_object('peski_paisa', v_peski, 'overpaid_paisa', v_held - v_peski);
end $$;

revoke execute on function
  public.party_held(uuid), public.refund_available(uuid, uuid, text), public.refund_rooms(uuid),
  public.project_dashboard(uuid, date, boolean), public.company_dashboard(uuid, date, date, date),
  private.peski_open(uuid, uuid, boolean, date), private.held_split(uuid, uuid, boolean, date),
  private.project_dashboard_base(uuid, date, boolean), private.company_dashboard_base(uuid, date, date, date)
from public, anon;
grant execute on function
  public.party_held(uuid), public.refund_available(uuid, uuid, text), public.refund_rooms(uuid),
  public.project_dashboard(uuid, date, boolean), public.company_dashboard(uuid, date, date, date),
  private.peski_open(uuid, uuid, boolean, date), private.held_split(uuid, uuid, boolean, date),
  private.project_dashboard_base(uuid, date, boolean), private.company_dashboard_base(uuid, date, date, date)
to authenticated;
revoke execute on function
  private.post_payment(uuid, uuid, uuid, date, bigint, text, text, text, uuid, jsonb, uuid, boolean)
from public, anon, authenticated;

-- The payment page says whether unmatched money is Peski or overpaid. is_peski appended at the
-- end so "create or replace" keeps the existing columns and grants.
create or replace view public.payment_summaries with (security_invoker = true) as
  select
    p.id, p.company_id, p.number, p.supplier_id, p.payment_date, p.amount_paisa, p.method, p.reference,
    p.notes, p.status, p.posted_at, p.created_by,
    (select coalesce(sum(e.amount_paisa), 0) from public.payment_allocation_events e where e.payment_id = p.id)::bigint as allocated_paisa,
    (select coalesce(sum(s.amount_paisa), 0) from public.settlement_events s where s.payment_id = p.id)::bigint as settled_paisa,
    p.subcontractor_id, p.crew_id, p.payee_id, p.party_id, p.work_package_id,
    coalesce((
      select array_agg(a.project_id order by a.project_id) from (
        select e.project_id from public.payment_allocation_events e
        where e.payment_id = p.id group by e.project_id having sum(e.amount_paisa) <> 0
      ) a
    ), '{}'::uuid[]) as project_ids,
    p.is_peski
  from public.payments p;
