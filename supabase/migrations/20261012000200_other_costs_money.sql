-- NirmanKhata milestone 3: posting for work charges, labour and expenses, and the money
-- core widened to any party. Same posting contract as milestone 2 (design §5.1):
--   1. authorize  2. op_key  3. lock (party -> payments -> documents -> credits)
--   4. check state  5. write  6. check invariants  7. store the result.
-- Supplier-only functions from milestone 2 (post_bill, post_credit, reverse_bill,
-- reverse_credit) keep working unchanged: the helpers they call accept any party now.

-- ===========================================================================
-- Parties and documents
-- ===========================================================================

create function private.party_company(p_party uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select company_id from public.suppliers where id = p_party),
    (select company_id from public.subcontractors where id = p_party),
    (select company_id from public.crews where id = p_party),
    (select company_id from public.payees where id = p_party))
$$;

-- Lock order step 1 (design §5.2): the party row, whatever its kind.
create function private.lock_party(p_party uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_company uuid;
begin
  case private.party_kind(p_party)
    when 'supplier' then select company_id into v_company from public.suppliers where id = p_party for update;
    when 'subcontractor' then select company_id into v_company from public.subcontractors where id = p_party for update;
    when 'crew' then select company_id into v_company from public.crews where id = p_party for update;
    when 'payee' then select company_id into v_company from public.payees where id = p_party for update;
    else null;
  end case;
  if v_company is null then
    raise exception 'Party not found' using errcode = 'P0002';
  end if;
  return v_company;
end $$;

-- Lock order step 3: documents, sorted by id within each kind.
create function private.lock_docs(p_docs uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.supplier_bills where id = any (p_docs) order by id for update;
  perform 1 from public.subcontract_charges where id = any (p_docs) order by id for update;
  perform 1 from public.labour_costs where id = any (p_docs) order by id for update;
  perform 1 from public.expenses where id = any (p_docs) order by id for update;
end $$;

-- A document that can be settled by a payment.
create function private.doc_info(p_doc uuid)
returns table (kind text, company_id uuid, party_id uuid, posted boolean, doc_date date, label text)
language sql stable security definer set search_path = '' as $$
  select 'bill', b.company_id, b.supplier_id, b.status = 'posted', b.bill_date, 'Bill ' || b.bill_no
  from public.supplier_bills b where b.id = p_doc
  union all
  select 'charge', c.company_id, c.subcontractor_id, c.status = 'approved', c.approved_date,
    'Work charge' || coalesce(' ' || nullif(trim(c.claim_no), ''), '')
  from public.subcontract_charges c where c.id = p_doc
  union all
  select 'labour', l.company_id, l.crew_id, l.status = 'posted', l.work_date, 'Labour ' || coalesce(l.work_type, '')
  from public.labour_costs l where l.id = p_doc
  union all
  select 'expense', e.company_id, e.payee_id, e.status = 'posted', e.expense_date, e.description
  from public.expenses e where e.id = p_doc
$$;

-- Settleable amount of a document in a project (design §5.3). Bills subtract their credits.
create function private.doc_settleable(p_doc uuid, p_project uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.supplier_bills where id = p_doc) then private.bill_settleable(p_doc, p_project)
    else coalesce(
      (select c.approved_paisa from public.subcontract_charges c where c.id = p_doc and c.project_id = p_project),
      (select l.amount_paisa from public.labour_costs l where l.id = p_doc and l.project_id = p_project),
      (select e.amount_paisa from public.expenses e where e.id = p_doc and e.project_id = p_project),
      0)
  end
$$;

create function private.doc_settled(p_doc uuid, p_project uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(s.amount_paisa), 0)::bigint from public.settlement_events s
  where s.doc_id = p_doc and s.project_id = p_project
$$;

-- Top-level active heading of a kind: the default for labour and subcontract entries.
create function private.default_heading(p_company uuid, p_kind public.heading_kind) returns uuid
language sql stable security definer set search_path = '' as $$
  select h.id from public.cost_headings h
  where h.company_id = p_company and h.kind = p_kind and h.parent_id is null and h.active
  order by h.sort_order, h.name limit 1
$$;

-- ===========================================================================
-- Ledger writers, now for any party (design §4.3)
-- ===========================================================================

drop function private.new_event(uuid, text, uuid, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid[]);
create function private.new_event(
  p_company uuid, p_type text, p_party uuid, p_date date, p_op_key uuid,
  p_opening_balance uuid default null, p_bill uuid default null, p_payment uuid default null,
  p_allocation_event uuid default null, p_credit uuid default null, p_reversal uuid default null,
  p_reversed_events uuid[] default null, p_charge uuid default null, p_labour_cost uuid default null,
  p_expense uuid default null
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
    charge_id, labour_cost_id, expense_id, created_by
  ) values (
    p_company, p_type,
    case when v_kind = 'supplier' then p_party end, case when v_kind = 'subcontractor' then p_party end,
    case when v_kind = 'crew' then p_party end, case when v_kind = 'payee' then p_party end,
    p_date, p_op_key, p_opening_balance, p_bill, p_payment, p_allocation_event, p_credit, p_reversal,
    p_reversed_events, p_charge, p_labour_cost, p_expense, auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function private.add_ledger(
  p_event uuid, p_key text, p_project uuid, p_heading uuid, p_cost bigint, p_balance bigint, p_cash bigint
) returns void
language sql security definer set search_path = '' as $$
  insert into public.ledger_entries (
    company_id, event_id, event_type, component_key, business_date, posted_at, project_id, heading_id,
    supplier_id, subcontractor_id, crew_id, payee_id, cost_paisa, balance_paisa, cash_paisa
  )
  select e.company_id, e.id, e.event_type, p_key, e.business_date, e.posted_at, p_project, p_heading,
    e.supplier_id, e.subcontractor_id, e.crew_id, e.payee_id, p_cost, p_balance, p_cash
  from public.posting_events e
  where e.id = p_event and (p_cost <> 0 or p_balance <> 0 or p_cash <> 0)
$$;

create or replace function private.negate_events(p_reversal_event uuid, p_events uuid[]) returns void
language sql security definer set search_path = '' as $$
  insert into public.ledger_entries (
    company_id, event_id, event_type, component_key, business_date, posted_at, project_id, heading_id,
    supplier_id, subcontractor_id, crew_id, payee_id, cost_paisa, balance_paisa, cash_paisa
  )
  select e.company_id, e.id, e.event_type, 'rev:' || l.id, e.business_date, e.posted_at, l.project_id, l.heading_id,
    l.supplier_id, l.subcontractor_id, l.crew_id, l.payee_id, -l.cost_paisa, -l.balance_paisa, -l.cash_paisa
  from public.ledger_entries l
  join public.posting_events e on e.id = p_reversal_event
  where l.event_id = any (p_events)
$$;

drop function private.reverse_with_event(uuid, uuid, date, text, uuid, uuid, uuid, uuid, uuid);
create function private.reverse_with_event(
  p_company uuid, p_party uuid, p_date date, p_reason text, p_op_key uuid,
  p_bill uuid default null, p_payment uuid default null, p_credit uuid default null, p_opening_balance uuid default null,
  p_charge uuid default null, p_labour_cost uuid default null, p_expense uuid default null
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
    charge_id, labour_cost_id, expense_id, reversal_date, reason, created_by
  ) values (
    p_company,
    case when v_kind = 'supplier' then p_party end, case when v_kind = 'subcontractor' then p_party end,
    case when v_kind = 'crew' then p_party end, case when v_kind = 'payee' then p_party end,
    p_bill, p_payment, p_credit, p_opening_balance, p_charge, p_labour_cost, p_expense, p_date, p_reason, auth.uid()
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
     or (p_payment is not null and e.payment_id = p_payment and e.event_type = 'payment_post')
     or (p_payment is not null and e.allocation_event_id in (
           select a.id from public.payment_allocation_events a where a.payment_id = p_payment));
  v_event := private.new_event(p_company, 'reversal', p_party, p_date, p_op_key,
    p_reversal => v_reversal, p_reversed_events => v_events);
  perform private.negate_events(v_event, v_events);
  return v_reversal;
end $$;

-- ===========================================================================
-- Settlement of any document (design §5.3)
-- ===========================================================================

drop function private.settle_one(uuid, uuid, uuid, bigint, date, uuid, text);
create function private.settle_one(
  p_payment uuid, p_doc uuid, p_project uuid, p_amount bigint, p_date date, p_op_key uuid, p_reason text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  d record;
  v_min date;
  v_id uuid;
begin
  select * into p from public.payments where id = p_payment;
  select * into d from private.doc_info(p_doc);
  if p.id is null or d.kind is null or p.company_id <> d.company_id then
    raise exception 'Payment or bill not found' using errcode = 'P0002';
  end if;
  if p.party_id <> d.party_id then
    raise exception 'The payment and the % are for different parties', lower(d.label) using errcode = 'P0001';
  end if;
  if p.status <> 'posted' then
    raise exception 'Payment % is reversed', p.number using errcode = 'P0001';
  end if;
  if not d.posted then
    raise exception '% is not posted, so it cannot be settled', d.label using errcode = 'P0001';
  end if;
  if p.work_package_id is not null and not exists (
    select 1 from public.subcontract_charges c where c.id = p_doc and c.work_package_id = p.work_package_id
  ) then
    raise exception 'Payment % is for another work package', p.number using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Settlement amount must be more than zero' using errcode = '22023';
  end if;
  v_min := greatest(p.payment_date, d.doc_date);
  if p_date is not null and p_date < v_min then
    raise exception 'A settlement cannot be dated before the payment or the bill' using errcode = '22023';
  end if;
  if private.payment_allocated(p_payment, p_project) - private.payment_settled(p_payment, p_project) < p_amount then
    raise exception 'Not enough of payment % is allocated to this project', p.number using errcode = 'P0001';
  end if;
  if private.doc_settleable(p_doc, p_project) - private.doc_settled(p_doc, p_project) < p_amount then
    raise exception 'This is more than % still owes for the project', d.label using errcode = 'P0001';
  end if;
  insert into public.settlement_events (
    company_id, payment_id, project_id, bill_id, charge_id, labour_cost_id, expense_id,
    amount_paisa, business_date, op_key, reason, created_by
  ) values (
    p.company_id, p_payment, p_project,
    case when d.kind = 'bill' then p_doc end, case when d.kind = 'charge' then p_doc end,
    case when d.kind = 'labour' then p_doc end, case when d.kind = 'expense' then p_doc end,
    p_amount, coalesce(p_date, v_min), p_op_key, p_reason, auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

-- Undo settlements: by document, by payment, or a pair. Newest first.
drop function private.unsettle_where(uuid, uuid, uuid, bigint, date, uuid, text);
create function private.unsettle_where(
  p_doc uuid, p_payment uuid, p_project uuid, p_limit bigint, p_date date, p_op_key uuid, p_reason text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_left bigint := p_limit; -- null = everything
  v_amt bigint;
  v_done bigint := 0;
begin
  for r in
    select s.company_id, s.payment_id, s.project_id, s.bill_id, s.charge_id, s.labour_cost_id, s.expense_id,
      sum(s.amount_paisa) as net
    from public.settlement_events s
    where (p_doc is null or s.doc_id = p_doc)
      and (p_payment is null or s.payment_id = p_payment)
      and (p_project is null or s.project_id = p_project)
    group by s.company_id, s.payment_id, s.project_id, s.bill_id, s.charge_id, s.labour_cost_id, s.expense_id
    having sum(s.amount_paisa) > 0
    order by max(s.posted_at) desc, s.payment_id
  loop
    exit when v_left is not null and v_left <= 0;
    v_amt := case when v_left is null then r.net else least(r.net, v_left) end;
    insert into public.settlement_events (
      company_id, payment_id, project_id, bill_id, charge_id, labour_cost_id, expense_id,
      amount_paisa, business_date, op_key, reason, created_by
    ) values (
      r.company_id, r.payment_id, r.project_id, r.bill_id, r.charge_id, r.labour_cost_id, r.expense_id,
      -v_amt, p_date, p_op_key, p_reason, auth.uid()
    );
    v_done := v_done + v_amt;
    if v_left is not null then
      v_left := v_left - v_amt;
    end if;
  end loop;
  return v_done;
end $$;

-- ===========================================================================
-- Payments to any party (req §12, "the same rules apply to subcontractor and labour payments")
-- ===========================================================================

-- Writes the payment, its project allocations and its ledger rows. Callers authorize and lock.
create function private.post_payment(
  p_company uuid, p_id uuid, p_party uuid, p_date date, p_amount bigint, p_method text, p_reference text,
  p_notes text, p_package uuid, p_allocs jsonb, p_op_key uuid
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
    payment_date, amount_paisa, method, reference, notes
  ) values (
    p_company, p_id, v_number,
    case when v_kind = 'supplier' then p_party end, case when v_kind = 'subcontractor' then p_party end,
    case when v_kind = 'crew' then p_party end, case when v_kind = 'payee' then p_party end,
    p_package, p_date, p_amount, coalesce(p_method::public.payment_method, 'cash'), p_reference, p_notes
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

-- p_payment: {id, supplier_id | subcontractor_id | crew_id | payee_id, work_package_id,
--   payment_date, amount_paisa, method, reference, notes,
--   allocations: [{project_id, amount_paisa}], settlements: [{doc_id | bill_id, project_id, amount_paisa}]}
-- Any part not allocated to a project stays unallocated at company level. A payment for a
-- work package goes wholly to the package's project.
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

  -- 2. Operation key.
  v_prior := private.begin_op(v_company, p_op_key, 'record_payment', p_payment);
  if v_prior is not null then
    return v_prior;
  end if;

  -- 3. Lock: party, then the documents being settled.
  perform private.lock_party(v_party);
  perform private.lock_docs(array(
    select coalesce(x ->> 'doc_id', x ->> 'bill_id')::uuid from jsonb_array_elements(v_settles) x));

  -- 5. Write.
  v_result := private.post_payment(v_company, v_id, v_party, v_date, v_amount, p_payment ->> 'method',
    p_payment ->> 'reference', p_payment ->> 'notes', v_package, v_allocs, p_op_key);
  for s in select * from jsonb_array_elements(v_settles) loop
    perform private.settle_one(v_id, coalesce(s ->> 'doc_id', s ->> 'bill_id')::uuid, (s ->> 'project_id')::uuid,
      (s ->> 'amount_paisa')::bigint, (s ->> 'date')::date, p_op_key, null);
  end loop;
  return private.finish_op(v_company, p_op_key, v_result);
end $$;

-- Move allocation between unallocated and projects (req §12.3). Dated on the payment (I-9).
create or replace function public.allocate_payment(p_op_key uuid, p_payment uuid, p_changes jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  v_company uuid := (select company_id from public.payments where id = p_payment);
  v_prior jsonb;
  ch record;
  v_alloc uuid;
  v_event uuid;
  v_events uuid[] := '{}';
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can change payment allocations' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'allocate_payment',
    jsonb_build_object('payment', p_payment, 'changes', p_changes, 'reason', p_reason));
  if v_prior is not null then
    return v_prior;
  end if;
  perform private.lock_party((select party_id from public.payments where id = p_payment));
  select * into p from public.payments where id = p_payment for update;
  if p.status <> 'posted' then
    raise exception 'This payment is reversed' using errcode = 'P0001';
  end if;
  if p.work_package_id is not null then
    raise exception 'A payment for a work package stays with its project' using errcode = 'P0001';
  end if;
  perform private.require_reason(p_reason);

  for ch in
    select (x ->> 'project_id')::uuid as project_id, sum((x ->> 'amount_paisa')::bigint)::bigint as delta
    from jsonb_array_elements(p_changes) x group by 1 order by 1
  loop
    continue when ch.delta = 0;
    -- I-5: a project's allocation never drops below what it has settled.
    if private.payment_allocated(p_payment, ch.project_id) + ch.delta < private.payment_settled(p_payment, ch.project_id) then
      raise exception 'Allocation can only be reduced down to the amount already matched to bills' using errcode = 'P0001';
    end if;
    insert into public.payment_allocation_events (company_id, payment_id, project_id, amount_paisa, business_date, reason, created_by)
    values (v_company, p_payment, ch.project_id, ch.delta, p.payment_date, p_reason, auth.uid())
    returning id into v_alloc;
    v_event := private.new_event(v_company, 'allocation_move', p.party_id, p.payment_date, p_op_key, p_allocation_event => v_alloc);
    perform private.add_ledger(v_event, 'project', ch.project_id, null, 0, -ch.delta, ch.delta);
    perform private.add_ledger(v_event, 'unallocated', null, null, 0, ch.delta, -ch.delta);
    v_events := v_events || v_event;
  end loop;

  -- I-4: allocations stay within the payment, and no project goes negative.
  if (select coalesce(sum(amount_paisa), 0) from public.payment_allocation_events where payment_id = p_payment) > p.amount_paisa then
    raise exception 'Project allocations are more than the payment (I-4)' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.payment_allocation_events where payment_id = p_payment
    group by project_id having sum(amount_paisa) < 0
  ) then
    raise exception 'A project allocation cannot go below zero' using errcode = 'P0001';
  end if;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('payment_id', p_payment, 'event_ids', to_jsonb(v_events)));
end $$;

-- Match payments to documents (refines allocation; never changes cash paid).
-- p_items: [{payment_id, doc_id | bill_id, project_id, amount_paisa, date}]. One party per call.
create or replace function public.settle(p_op_key uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_docs uuid[] := array(select coalesce(x ->> 'doc_id', x ->> 'bill_id')::uuid from jsonb_array_elements(p_items) x);
  v_company uuid;
  v_party uuid;
  v_prior jsonb;
  s jsonb;
  v_ids uuid[] := '{}';
begin
  select d.company_id, d.party_id into v_company, v_party from private.doc_info(v_docs[1]) d;
  if v_company is null or not private.can_record_payments(v_company) or not private.can_see_finance(v_company) then
    raise exception 'You cannot match payments to bills' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where not private.can_see_project(v_company, (x ->> 'project_id')::uuid)
  ) then
    raise exception 'You can only match bills on projects you are assigned to' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(v_docs) doc left join lateral private.doc_info(doc) d on true
    where d.party_id is distinct from v_party
  ) then
    raise exception 'Match one supplier or other party at a time' using errcode = 'P0001';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'settle', p_items);
  if v_prior is not null then
    return v_prior;
  end if;
  perform private.lock_party(v_party);
  perform 1 from public.payments
  where id in (select (x ->> 'payment_id')::uuid from jsonb_array_elements(p_items) x) order by id for update;
  perform private.lock_docs(v_docs);
  for s in select * from jsonb_array_elements(p_items) loop
    v_ids := v_ids || private.settle_one((s ->> 'payment_id')::uuid, coalesce(s ->> 'doc_id', s ->> 'bill_id')::uuid,
      (s ->> 'project_id')::uuid, (s ->> 'amount_paisa')::bigint, (s ->> 'date')::date, p_op_key, null);
  end loop;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('settlement_ids', to_jsonb(v_ids)));
end $$;

-- p_bill is any settled document (the name is kept for the API). The money stays in the
-- project allocation as advance (design §5.3).
create or replace function public.unsettle(
  p_op_key uuid, p_payment uuid, p_bill uuid, p_project uuid, p_amount_paisa bigint, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := (select company_id from public.payments where id = p_payment);
  v_prior jsonb;
  v_done bigint;
begin
  if v_company is null or not private.can_record_payments(v_company) or not private.can_see_finance(v_company)
     or not private.can_see_project(v_company, p_project) then
    raise exception 'You cannot change this match' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'unsettle', jsonb_build_object(
    'payment', p_payment, 'bill', p_bill, 'project', p_project, 'amount', p_amount_paisa, 'reason', p_reason));
  if v_prior is not null then
    return v_prior;
  end if;
  perform private.lock_party((select party_id from public.payments where id = p_payment));
  perform 1 from public.payments where id = p_payment for update;
  perform private.lock_docs(array[p_bill]);
  if p_amount_paisa is null or p_amount_paisa <= 0 then
    raise exception 'Amount must be more than zero' using errcode = '22023';
  end if;
  if (select coalesce(sum(amount_paisa), 0) from public.settlement_events
      where payment_id = p_payment and doc_id = p_bill and project_id = p_project) < p_amount_paisa then
    raise exception 'This is more than is matched' using errcode = 'P0001';
  end if;
  v_done := private.unsettle_where(p_bill, p_payment, p_project, p_amount_paisa, private.today(), p_op_key,
    private.require_reason(p_reason));
  return private.finish_op(v_company, p_op_key, jsonb_build_object('unsettled_paisa', v_done));
end $$;

create or replace function public.reverse_payment(p_op_key uuid, p_payment uuid, p_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  v_company uuid := (select company_id from public.payments where id = p_payment);
  v_prior jsonb;
  v_reason text;
  v_date date := coalesce(p_date, private.today());
  v_reversal uuid;
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can reverse payments' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'reverse_payment',
    jsonb_build_object('payment', p_payment, 'date', p_date, 'reason', p_reason));
  if v_prior is not null then
    return v_prior;
  end if;
  v_reason := private.require_reason(p_reason);
  perform private.lock_party((select party_id from public.payments where id = p_payment));
  select * into p from public.payments where id = p_payment for update;
  perform private.lock_docs(array(select distinct doc_id from public.settlement_events where payment_id = p_payment));
  if p.status = 'reversed' then
    raise exception 'already_reversed: this payment was already reversed' using errcode = 'P0001';
  end if;
  if v_date < p.payment_date then
    raise exception 'The reversal cannot be dated before the payment' using errcode = '22023';
  end if;

  perform private.unsettle_where(null, p_payment, null, null, v_date, p_op_key, 'Payment reversed');
  v_reversal := private.reverse_with_event(v_company, p.party_id, v_date, v_reason, p_op_key, p_payment => p_payment);
  update public.payments set status = 'reversed' where id = p_payment;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('reversal_id', v_reversal));
end $$;

-- ===========================================================================
-- Opening balances for any party (req §20)
-- ===========================================================================
drop function public.set_opening_balance(uuid, uuid, date, bigint, text);
create function public.set_opening_balance(
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
  insert into public.party_opening_balances (company_id, supplier_id, subcontractor_id, crew_id, payee_id, cutover_date, amount_paisa, note)
  values (
    v_company,
    case when v_kind = 'supplier' then p_party end, case when v_kind = 'subcontractor' then p_party end,
    case when v_kind = 'crew' then p_party end, case when v_kind = 'payee' then p_party end,
    p_cutover_date, p_amount_paisa, private.require_reason(p_note, 'A note')
  ) returning id into v_id;
  -- Not project cost; sits in the party's unallocated bucket (req §12.3, §20).
  v_event := private.new_event(v_company, 'opening_balance', p_party, p_cutover_date, p_op_key, p_opening_balance => v_id);
  perform private.add_ledger(v_event, 'unallocated', null, null, 0, p_amount_paisa, 0);
  return private.finish_op(v_company, p_op_key, jsonb_build_object('opening_balance_id', v_id, 'event_id', v_event));
end $$;

create or replace function public.reverse_opening_balance(p_op_key uuid, p_opening_balance uuid, p_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ob public.party_opening_balances;
  v_company uuid := (select company_id from public.party_opening_balances where id = p_opening_balance);
  v_prior jsonb;
  v_reversal uuid;
  v_date date := coalesce(p_date, private.today());
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can reverse opening balances' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'reverse_opening_balance',
    jsonb_build_object('opening_balance', p_opening_balance, 'date', p_date, 'reason', p_reason));
  if v_prior is not null then
    return v_prior;
  end if;
  perform private.lock_party((select party_id from public.party_opening_balances where id = p_opening_balance));
  select * into ob from public.party_opening_balances where id = p_opening_balance for update;
  if ob.status = 'reversed' then
    raise exception 'already_reversed: this opening balance was already reversed' using errcode = 'P0001';
  end if;
  if v_date < ob.cutover_date then
    raise exception 'The reversal cannot be dated before the cutover date' using errcode = '22023';
  end if;
  v_reversal := private.reverse_with_event(v_company, ob.party_id, v_date, private.require_reason(p_reason), p_op_key,
    p_opening_balance => p_opening_balance);
  update public.party_opening_balances set status = 'reversed' where id = p_opening_balance;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('reversal_id', v_reversal));
end $$;

-- ===========================================================================
-- Pay now (I-8): one payment for the party, wholly for the project, settling each
-- document in full, inside the caller's transaction and op_key. Cost is counted once.
-- ===========================================================================
create function private.pay_now(
  p_company uuid, p_party uuid, p_project uuid, p_docs uuid[], p_date date, p_pay jsonb, p_op_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_total bigint := 0;
  v_id uuid := gen_random_uuid();
  v_result jsonb;
  d uuid;
begin
  if not private.can_record_payments(p_company) then
    raise exception 'You cannot record payments; save it as unpaid' using errcode = '42501';
  end if;
  foreach d in array p_docs loop
    v_total := v_total + private.doc_settleable(d, p_project);
  end loop;
  v_result := private.post_payment(p_company, v_id, p_party, p_date, v_total, coalesce(p_pay ->> 'method', 'cash'),
    nullif(trim(p_pay ->> 'reference'), ''), 'Paid when entered', null,
    jsonb_build_array(jsonb_build_object('project_id', p_project, 'amount_paisa', v_total)), p_op_key);
  foreach d in array p_docs loop
    perform private.settle_one(v_id, d, p_project, private.doc_settleable(d, p_project), null, p_op_key, 'Paid when entered');
  end loop;
  return v_result;
end $$;

-- ===========================================================================
-- Subcontract work (req §13)
-- ===========================================================================

-- p_package: {id, project_id, subcontractor_id, heading_id, scope, rate_basis, unit_id, planned_start,
--   planned_end, status, progress_pct, notes, terms: {agreed_value_paisa, rate_paisa, quantity}}
-- Terms are amounts: only finance users set them; others keep what is there.
create function public.save_work_package(p_package jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_package ->> 'id')::uuid;
  v_project uuid := (p_package ->> 'project_id')::uuid;
  v_sub uuid := (p_package ->> 'subcontractor_id')::uuid;
  v_company uuid := (select company_id from public.projects where id = (p_package ->> 'project_id')::uuid);
  v_heading uuid;
  v_basis public.rate_basis := coalesce((p_package ->> 'rate_basis')::public.rate_basis, 'lump_sum');
  v_terms jsonb := p_package -> 'terms';
  w public.work_packages;
begin
  if v_id is null then
    raise exception 'Work package id is required' using errcode = '22023';
  end if;
  if v_company is null or not private.can_manage_parties(v_company) or not private.can_work_on_project(v_company, v_project) then
    raise exception 'You cannot manage subcontract work on this project' using errcode = '42501';
  end if;
  if not exists (select 1 from public.subcontractors where id = v_sub and company_id = v_company) then
    raise exception 'Subcontractor not found' using errcode = 'P0002';
  end if;
  v_heading := coalesce((p_package ->> 'heading_id')::uuid, private.default_heading(v_company, 'subcontract'));
  if jsonb_typeof(v_terms) = 'object' and not private.can_see_finance(v_company) then
    raise exception 'You cannot enter amounts' using errcode = '42501';
  end if;

  select * into w from public.work_packages where id = v_id for update;
  if found then
    if w.project_id <> v_project or w.subcontractor_id <> v_sub then
      raise exception 'The project and subcontractor of a work package cannot change' using errcode = 'P0001';
    end if;
    update public.work_packages set
      heading_id = v_heading, scope = p_package ->> 'scope', rate_basis = v_basis,
      unit_id = (p_package ->> 'unit_id')::uuid, planned_start = (p_package ->> 'planned_start')::date,
      planned_end = (p_package ->> 'planned_end')::date,
      status = coalesce((p_package ->> 'status')::public.package_status, status),
      progress_pct = coalesce((p_package ->> 'progress_pct')::numeric, progress_pct), notes = p_package ->> 'notes'
    where id = v_id;
  else
    insert into public.work_packages (
      company_id, id, project_id, subcontractor_id, heading_id, scope, rate_basis, unit_id,
      planned_start, planned_end, status, progress_pct, notes
    ) values (
      v_company, v_id, v_project, v_sub, v_heading, p_package ->> 'scope', v_basis, (p_package ->> 'unit_id')::uuid,
      (p_package ->> 'planned_start')::date, (p_package ->> 'planned_end')::date,
      coalesce((p_package ->> 'status')::public.package_status, 'planned'),
      coalesce((p_package ->> 'progress_pct')::numeric, 0), p_package ->> 'notes'
    );
  end if;

  if jsonb_typeof(v_terms) = 'object' then
    if (v_terms ->> 'rate_paisa') is not null and (v_terms ->> 'quantity') is not null
       and (v_terms ->> 'agreed_value_paisa')::bigint
           <> round((v_terms ->> 'rate_paisa')::numeric * (v_terms ->> 'quantity')::numeric)::bigint then
      raise exception 'The agreed value must be rate x quantity' using errcode = '22023';
    end if;
    insert into public.work_package_terms (company_id, id, agreed_value_paisa, rate_paisa, quantity)
    values (v_company, v_id, (v_terms ->> 'agreed_value_paisa')::bigint, (v_terms ->> 'rate_paisa')::bigint,
            (v_terms ->> 'quantity')::numeric)
    on conflict (id) do update set
      agreed_value_paisa = excluded.agreed_value_paisa, rate_paisa = excluded.rate_paisa, quantity = excluded.quantity;
  elsif p_package ? 'terms' and private.can_see_finance(v_company) then
    delete from public.work_package_terms where id = v_id;
  end if;
  return v_id;
end $$;

-- A claim from the subcontractor, saved as a draft until Accounts approves it.
-- p_charge: {id, work_package_id, charge_date, claim_no, description, claimed_paisa}
create function public.save_charge_claim(p_charge jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_charge ->> 'id')::uuid;
  w public.work_packages;
  c public.subcontract_charges;
  v_date date := coalesce((p_charge ->> 'charge_date')::date, private.today());
begin
  select * into w from public.work_packages where id = (p_charge ->> 'work_package_id')::uuid;
  if v_id is null or w.id is null then
    raise exception 'Work package not found' using errcode = 'P0002';
  end if;
  if not private.can_see_finance(w.company_id) or not private.can_work_on_project(w.company_id, w.project_id) then
    raise exception 'You cannot record work charges on this project' using errcode = '42501';
  end if;
  if v_date > private.today() then
    raise exception 'The claim date cannot be in the future' using errcode = '22023';
  end if;
  select * into c from public.subcontract_charges where id = v_id for update;
  if found then
    if c.status <> 'draft' then
      raise exception 'Only a draft claim can be edited' using errcode = 'P0001';
    end if;
    if c.created_by <> auth.uid() and not private.can_post(w.company_id) then
      raise exception 'You cannot edit this claim' using errcode = '42501';
    end if;
    update public.subcontract_charges set
      work_package_id = w.id, project_id = w.project_id, subcontractor_id = w.subcontractor_id, heading_id = w.heading_id,
      charge_date = v_date, claim_no = nullif(trim(p_charge ->> 'claim_no'), ''), description = p_charge ->> 'description',
      claimed_paisa = (p_charge ->> 'claimed_paisa')::bigint
    where id = v_id;
  else
    insert into public.subcontract_charges (
      company_id, id, work_package_id, project_id, subcontractor_id, heading_id, charge_date, claim_no, description, claimed_paisa
    ) values (
      w.company_id, v_id, w.id, w.project_id, w.subcontractor_id, w.heading_id, v_date,
      nullif(trim(p_charge ->> 'claim_no'), ''), p_charge ->> 'description', (p_charge ->> 'claimed_paisa')::bigint
    );
  end if;
  return v_id;
end $$;

create function public.delete_charge_draft(p_charge uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.subcontract_charges;
begin
  select * into c from public.subcontract_charges where id = p_charge for update;
  if not found or not private.can_see_project_money(c.company_id, c.project_id)
     or not (c.created_by = auth.uid() or private.can_post(c.company_id)) then
    raise exception 'You cannot delete this claim' using errcode = '42501';
  end if;
  if c.status <> 'draft' then
    raise exception 'Only a draft claim can be deleted' using errcode = 'P0001';
  end if;
  delete from public.attachments where charge_id = p_charge;
  delete from public.subcontract_charges where id = p_charge;
end $$;

-- Approval creates the cost (req §13, §19). The approved amount may be less than claimed,
-- with a note. Business date = approval date (design §4.3).
create function public.approve_charge(
  p_op_key uuid, p_charge uuid, p_approved_paisa bigint, p_date date default null, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.subcontract_charges;
  v_company uuid := (select company_id from public.subcontract_charges where id = p_charge);
  v_date date := coalesce(p_date, private.today());
  v_prior jsonb;
  v_event uuid;
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can approve work charges' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'approve_charge', jsonb_build_object(
    'charge', p_charge, 'amount', p_approved_paisa, 'date', p_date, 'note', p_note));
  if v_prior is not null then
    return v_prior;
  end if;
  perform private.lock_party((select subcontractor_id from public.subcontract_charges where id = p_charge));
  select * into c from public.subcontract_charges where id = p_charge for update;
  if c.status in ('approved', 'reversed') then
    raise exception 'already_posted: this work charge was already approved' using errcode = 'P0001';
  end if;
  if c.status <> 'draft' then
    raise exception 'This claim was rejected' using errcode = 'P0001';
  end if;
  if p_approved_paisa is null or p_approved_paisa <= 0 or p_approved_paisa > c.claimed_paisa then
    raise exception 'The approved amount must be more than zero and not more than the claim' using errcode = '22023';
  end if;
  if p_approved_paisa < c.claimed_paisa and coalesce(trim(p_note), '') = '' then
    raise exception 'Say why less than the claim is approved' using errcode = '22023';
  end if;
  if v_date < c.charge_date or v_date > private.today() then
    raise exception 'The approval date must be between the claim date and today' using errcode = '22023';
  end if;

  update public.subcontract_charges set
    status = 'approved', approved_paisa = p_approved_paisa, approved_date = v_date, decided_by = auth.uid(),
    decided_at = now(), decision_note = nullif(trim(p_note), ''), posted_at = now()
  where id = p_charge;
  v_event := private.new_event(v_company, 'charge_approve', c.subcontractor_id, v_date, p_op_key, p_charge => p_charge);
  perform private.add_ledger(v_event, 'charge', c.project_id, c.heading_id, p_approved_paisa, p_approved_paisa, 0);
  return private.finish_op(v_company, p_op_key, jsonb_build_object('charge_id', p_charge, 'event_id', v_event));
end $$;

create function public.reject_charge(p_charge uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.subcontract_charges;
begin
  select * into c from public.subcontract_charges where id = p_charge for update;
  if not found or not private.can_post(c.company_id) then
    raise exception 'Only Accounts or Admin can reject work charges' using errcode = '42501';
  end if;
  if c.status <> 'draft' then
    raise exception 'Only a claim waiting for approval can be rejected' using errcode = 'P0001';
  end if;
  update public.subcontract_charges set
    status = 'rejected', decided_by = auth.uid(), decided_at = now(),
    decision_note = private.require_reason(p_reason, 'A reason for rejecting')
  where id = p_charge;
end $$;

-- ===========================================================================
-- Own labour (req §14). Cost when entered; pay now by default (I-8).
-- ===========================================================================

-- p_entry: {project_id, crew_id, heading_id, work_type, description}; p_days: [{work_date,
-- amount_paisa, headcount, person_days, rate_paisa}]. Callers check the op_key first.
create function private.post_labour(
  p_entry jsonb, p_days jsonb, p_batch jsonb, p_pay jsonb, p_confirm_duplicate boolean, p_op_key uuid, p_single_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_entry ->> 'project_id')::uuid;
  v_company uuid := (select company_id from public.projects where id = (p_entry ->> 'project_id')::uuid);
  v_crew uuid := coalesce((p_entry ->> 'crew_id')::uuid,
    (select id from public.crews where project_id = (p_entry ->> 'project_id')::uuid and is_default));
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

  -- 3. Lock: the crew (party), then check for near-duplicates under the lock.
  perform private.lock_party(v_crew);
  if v_batch is not null and exists (select 1 from public.labour_batches where id = v_batch) then
    raise exception 'This weekly entry was already saved' using errcode = 'P0001';
  end if;
  select l.work_date into v_dup
  from public.labour_costs l
  where l.project_id = v_project and l.crew_id = v_crew and l.status = 'posted'
    and l.work_date in (select (x ->> 'work_date')::date from jsonb_array_elements(p_days) x)
  order by l.work_date limit 1;
  if v_dup is not null and not coalesce(p_confirm_duplicate, false) then
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
      company_id, id, project_id, crew_id, heading_id, work_date, work_type, description,
      headcount, person_days, rate_paisa, amount_paisa, batch_id
    ) values (
      v_company, v_id, v_project, v_crew, v_heading, (d ->> 'work_date')::date,
      nullif(trim(p_entry ->> 'work_type'), ''), nullif(trim(p_entry ->> 'description'), ''),
      (d ->> 'headcount')::integer, (d ->> 'person_days')::numeric, (d ->> 'rate_paisa')::bigint,
      (d ->> 'amount_paisa')::bigint, v_batch
    );
    v_event := private.new_event(v_company, 'labour_save', v_crew, (d ->> 'work_date')::date, p_op_key, p_labour_cost => v_id);
    perform private.add_ledger(v_event, 'labour', v_project, v_heading,
      (d ->> 'amount_paisa')::bigint, (d ->> 'amount_paisa')::bigint, 0);
    v_ids := v_ids || v_id;
  end loop;

  if jsonb_typeof(p_pay) = 'object' then
    v_payment := private.pay_now(v_company, v_crew, v_project, v_ids,
      coalesce((p_pay ->> 'date')::date, (select max((x ->> 'work_date')::date) from jsonb_array_elements(p_days) x)),
      p_pay, p_op_key);
  end if;
  return jsonb_build_object('labour_cost_ids', to_jsonb(v_ids), 'batch_id', v_batch, 'crew_id', v_crew,
    'payment', v_payment, 'total_paisa', (select sum((x ->> 'amount_paisa')::bigint) from jsonb_array_elements(p_days) x));
end $$;

-- One day. p_entry: {id, project_id, crew_id, heading_id, work_date, work_type, description,
--   headcount, person_days, rate_paisa, amount_paisa, pay_now: {method, reference} | null, confirm_duplicate}
create function public.save_labour_cost(p_op_key uuid, p_entry jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := (select company_id from public.projects where id = (p_entry ->> 'project_id')::uuid);
  v_prior jsonb;
begin
  if v_company is null or not private.can_work_on_project(v_company, (p_entry ->> 'project_id')::uuid) then
    raise exception 'You cannot enter labour cost on this project' using errcode = '42501';
  end if;
  if jsonb_typeof(p_entry -> 'pay_now') = 'object' and not private.can_record_payments(v_company) then
    raise exception 'You cannot record payments; save it as unpaid' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'save_labour_cost', p_entry);
  if v_prior is not null then
    return v_prior;
  end if;
  if (p_entry ->> 'id') is null then
    raise exception 'Labour cost id is required' using errcode = '22023';
  end if;
  return private.finish_op(v_company, p_op_key, private.post_labour(
    p_entry,
    jsonb_build_array(jsonb_build_object('work_date', coalesce(p_entry ->> 'work_date', private.today()::text),
      'amount_paisa', p_entry -> 'amount_paisa', 'headcount', p_entry -> 'headcount',
      'person_days', p_entry -> 'person_days', 'rate_paisa', p_entry -> 'rate_paisa')),
    null, p_entry -> 'pay_now', (p_entry ->> 'confirm_duplicate')::boolean, p_op_key, (p_entry ->> 'id')::uuid));
end $$;

-- A week (or any range) entered once; one daily record per date (req §14, acceptance #18, L1).
-- p_batch: {id, project_id, crew_id, heading_id, from_date, to_date, work_type, description,
--   total_paisa (split evenly over the days) | days: [{work_date, amount_paisa, headcount, person_days}],
--   pay_now: {method, reference} | null, confirm_duplicate}
create function public.save_labour_batch(p_op_key uuid, p_batch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := (select company_id from public.projects where id = (p_batch ->> 'project_id')::uuid);
  v_from date := (p_batch ->> 'from_date')::date;
  v_to date := (p_batch ->> 'to_date')::date;
  v_total bigint := (p_batch ->> 'total_paisa')::bigint;
  v_days jsonb := p_batch -> 'days';
  v_n integer;
  v_prior jsonb;
begin
  if v_company is null or not private.can_work_on_project(v_company, (p_batch ->> 'project_id')::uuid) then
    raise exception 'You cannot enter labour cost on this project' using errcode = '42501';
  end if;
  if jsonb_typeof(p_batch -> 'pay_now') = 'object' and not private.can_record_payments(v_company) then
    raise exception 'You cannot record payments; save it as unpaid' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'save_labour_batch', p_batch);
  if v_prior is not null then
    return v_prior;
  end if;
  if (p_batch ->> 'id') is null or v_from is null or v_to is null or v_to < v_from or v_to - v_from > 30 then
    raise exception 'Enter a range of up to 31 days' using errcode = '22023';
  end if;
  if v_days is null then
    -- Same amount each day; the paisa left over go to the first days (largest remainder).
    v_n := v_to - v_from + 1;
    if v_total is null or v_total <= 0 then
      raise exception 'Enter the total for the week' using errcode = '22023';
    end if;
    select jsonb_agg(jsonb_build_object(
      'work_date', v_from + i,
      'amount_paisa', v_total / v_n + case when i < v_total % v_n then 1 else 0 end,
      'headcount', p_batch -> 'headcount') order by i)
    into v_days from generate_series(0, v_n - 1) i;
  end if;
  return private.finish_op(v_company, p_op_key, private.post_labour(
    p_batch, v_days, jsonb_build_object('id', p_batch -> 'id', 'from_date', v_from, 'to_date', v_to),
    p_batch -> 'pay_now', (p_batch ->> 'confirm_duplicate')::boolean, p_op_key, null));
end $$;

-- ===========================================================================
-- Other expenses (req §15)
-- ===========================================================================

-- p_expense: {id, project_id, heading_id, expense_date, amount_paisa, description, bill_no,
--   payee_id | payee: {name, phone, kind}, pay_now: {method, reference} | null}
-- A typed payee name reuses an existing payee with that name, or creates one.
create function public.save_expense(p_op_key uuid, p_expense jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_expense ->> 'id')::uuid;
  v_project uuid := (p_expense ->> 'project_id')::uuid;
  v_company uuid := (select company_id from public.projects where id = (p_expense ->> 'project_id')::uuid);
  v_payee uuid := (p_expense ->> 'payee_id')::uuid;
  v_name text := nullif(trim(p_expense -> 'payee' ->> 'name'), '');
  v_heading uuid := (p_expense ->> 'heading_id')::uuid;
  v_date date := coalesce((p_expense ->> 'expense_date')::date, private.today());
  v_amount bigint := (p_expense ->> 'amount_paisa')::bigint;
  v_prior jsonb;
  v_event uuid;
  v_payment jsonb;
begin
  if v_company is null or not private.can_work_on_project(v_company, v_project) then
    raise exception 'You cannot enter expenses on this project' using errcode = '42501';
  end if;
  if jsonb_typeof(p_expense -> 'pay_now') = 'object' and not private.can_record_payments(v_company) then
    raise exception 'You cannot record payments; save it as unpaid' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'save_expense', p_expense);
  if v_prior is not null then
    return v_prior;
  end if;
  if v_id is null then
    raise exception 'Expense id is required' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Enter the amount' using errcode = '22023';
  end if;
  if v_date > private.today() then
    raise exception 'The expense date cannot be in the future' using errcode = '22023';
  end if;
  if not exists (select 1 from public.cost_headings where id = v_heading and company_id = v_company) then
    raise exception 'Choose a cost heading' using errcode = 'P0001';
  end if;

  if v_payee is null then
    if v_name is null then
      raise exception 'Choose or type who was paid' using errcode = '22023';
    end if;
    select id into v_payee from public.payees where company_id = v_company and lower(trim(name)) = lower(v_name);
    if v_payee is null then
      insert into public.payees (company_id, name, phone, kind)
      values (v_company, v_name, nullif(trim(p_expense -> 'payee' ->> 'phone'), ''), nullif(trim(p_expense -> 'payee' ->> 'kind'), ''))
      returning id into v_payee;
    end if;
  elsif not exists (select 1 from public.payees where id = v_payee and company_id = v_company) then
    raise exception 'Payee not found' using errcode = 'P0002';
  end if;

  perform private.lock_party(v_payee);
  insert into public.expenses (company_id, id, project_id, heading_id, payee_id, expense_date, amount_paisa, description, bill_no)
  values (v_company, v_id, v_project, v_heading, v_payee, v_date, v_amount,
          private.require_reason(p_expense ->> 'description', 'A description'), nullif(trim(p_expense ->> 'bill_no'), ''));
  v_event := private.new_event(v_company, 'expense_save', v_payee, v_date, p_op_key, p_expense => v_id);
  perform private.add_ledger(v_event, 'expense', v_project, v_heading, v_amount, v_amount, 0);
  if jsonb_typeof(p_expense -> 'pay_now') = 'object' then
    v_payment := private.pay_now(v_company, v_payee, v_project, array[v_id], v_date, p_expense -> 'pay_now', p_op_key);
  end if;
  return private.finish_op(v_company, p_op_key, jsonb_build_object(
    'expense_id', v_id, 'payee_id', v_payee, 'event_id', v_event, 'payment', v_payment));
end $$;

-- A payee that turns out to be a regular supplier (req §15). History stays with the payee.
create function public.promote_payee(p_payee uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.payees;
  v_supplier uuid;
begin
  select * into p from public.payees where id = p_payee for update;
  if not found or not private.can_manage_parties(p.company_id) then
    raise exception 'You cannot change payees' using errcode = '42501';
  end if;
  if p.promoted_supplier_id is not null then
    return p.promoted_supplier_id;
  end if;
  select id into v_supplier from public.suppliers where company_id = p.company_id and lower(trim(name)) = lower(trim(p.name));
  if v_supplier is null then
    insert into public.suppliers (company_id, name, phone, categories, notes)
    values (p.company_id, p.name, p.phone, case when p.kind is null then '{}' else array[p.kind] end, p.notes)
    returning id into v_supplier;
  end if;
  update public.payees set promoted_supplier_id = v_supplier, active = false where id = p_payee;
  return v_supplier;
end $$;

create policy payees_insert on public.payees for insert to authenticated
  with check (private.can_manage_parties(company_id));
grant insert on public.payees to authenticated;

-- ===========================================================================
-- Reversing a work charge, labour cost or expense (design §5.4). These have no credits in
-- v1, so: unsettle everything -> negate the cost event. The money paid stays with the
-- party as advance until Accounts reverses or rematches the payment.
-- ===========================================================================
create function public.reverse_cost_entry(p_op_key uuid, p_doc uuid, p_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d record;
  v_project uuid;
  v_reason text;
  v_date date := coalesce(p_date, private.today());
  v_prior jsonb;
  v_reversal uuid;
begin
  select * into d from private.doc_info(p_doc);
  if d.kind is null or d.kind = 'bill' or not private.can_post(d.company_id) then
    raise exception 'Only Accounts or Admin can reverse entries' using errcode = '42501';
  end if;
  v_prior := private.begin_op(d.company_id, p_op_key, 'reverse_cost_entry',
    jsonb_build_object('doc', p_doc, 'date', p_date, 'reason', p_reason));
  if v_prior is not null then
    return v_prior;
  end if;
  v_reason := private.require_reason(p_reason);
  perform private.lock_party(d.party_id);
  perform 1 from public.payments where id in (select payment_id from public.settlement_events where doc_id = p_doc)
  order by id for update;
  perform private.lock_docs(array[p_doc]);
  select * into d from private.doc_info(p_doc); -- re-read under the lock

  if exists (select 1 from public.reversals where target_id = p_doc) then
    raise exception 'already_reversed: this entry was already reversed' using errcode = 'P0001';
  end if;
  if not d.posted then
    raise exception 'Only an approved or saved entry can be reversed' using errcode = 'P0001';
  end if;
  if v_date < d.doc_date then
    raise exception 'The reversal cannot be dated before the entry' using errcode = '22023';
  end if;

  perform private.unsettle_where(p_doc, null, null, null, v_date, p_op_key, 'Entry reversed');
  if d.kind = 'charge' then
    v_reversal := private.reverse_with_event(d.company_id, d.party_id, v_date, v_reason, p_op_key, p_charge => p_doc);
    update public.subcontract_charges set status = 'reversed' where id = p_doc;
  elsif d.kind = 'labour' then
    v_reversal := private.reverse_with_event(d.company_id, d.party_id, v_date, v_reason, p_op_key, p_labour_cost => p_doc);
    update public.labour_costs set status = 'reversed' where id = p_doc;
  else
    v_reversal := private.reverse_with_event(d.company_id, d.party_id, v_date, v_reason, p_op_key, p_expense => p_doc);
    update public.expenses set status = 'reversed' where id = p_doc;
  end if;

  -- C7 for these entries: everything the entry wrote now nets to zero.
  if exists (
    select 1 from public.ledger_entries l join public.posting_events e on e.id = l.event_id
    where e.charge_id = p_doc or e.labour_cost_id = p_doc or e.expense_id = p_doc or e.reversal_id = v_reversal
    having sum(l.cost_paisa) <> 0 or sum(l.balance_paisa) <> 0
  ) then
    raise exception 'Reversal does not net to zero' using errcode = 'P0001';
  end if;
  return private.finish_op(d.company_id, p_op_key, jsonb_build_object('reversal_id', v_reversal));
end $$;

-- ===========================================================================
-- Reading. Security invoker unless stated, so RLS decides what is included.
-- ===========================================================================

create or replace view public.payment_summaries with (security_invoker = true) as
  select
    p.id, p.company_id, p.number, p.supplier_id, p.payment_date, p.amount_paisa, p.method, p.reference,
    p.notes, p.status, p.posted_at, p.created_by,
    (select coalesce(sum(e.amount_paisa), 0) from public.payment_allocation_events e where e.payment_id = p.id)::bigint as allocated_paisa,
    (select coalesce(sum(s.amount_paisa), 0) from public.settlement_events s where s.payment_id = p.id)::bigint as settled_paisa,
    p.subcontractor_id, p.crew_id, p.payee_id, p.party_id, p.work_package_id
  from public.payments p;

-- Settled amount comes from a definer helper so X2 creators see their own entry's status.
create view public.labour_cost_summaries with (security_invoker = true) as
  select l.id, l.company_id, l.project_id, l.crew_id, l.heading_id, l.work_date, l.work_type, l.description,
    l.headcount, l.person_days, l.rate_paisa, l.amount_paisa, l.batch_id, l.status, l.posted_at, l.created_by,
    l.created_at, private.doc_settled(l.id, l.project_id) as settled_paisa
  from public.labour_costs l;

create view public.expense_summaries with (security_invoker = true) as
  select e.id, e.company_id, e.project_id, e.heading_id, e.payee_id, e.expense_date, e.amount_paisa, e.description,
    e.bill_no, e.status, e.posted_at, e.created_by, e.created_at, private.doc_settled(e.id, e.project_id) as settled_paisa
  from public.expenses e;

create view public.charge_summaries with (security_invoker = true) as
  select c.id, c.company_id, c.work_package_id, c.project_id, c.subcontractor_id, c.heading_id, c.charge_date,
    c.claim_no, c.description, c.claimed_paisa, c.approved_paisa, c.approved_date, c.status, c.decided_by,
    c.decided_at, c.decision_note, c.created_by, c.created_at,
    private.doc_settled(c.id, c.project_id) as settled_paisa
  from public.subcontract_charges c;

-- Per work package (req §13): agreed value, approved cost, paid, payable or advance, remaining.
-- Paid = payments made for the package + other payments matched to its charges.
create function public.work_package_figures(p_project uuid)
returns table (
  work_package_id uuid, agreed_value_paisa bigint, approved_paisa bigint, pending_claims_paisa bigint,
  paid_paisa bigint, balance_paisa bigint, remaining_value_paisa bigint
)
language sql stable security definer set search_path = '' as $$
  with pk as (
    select w.id, w.company_id from public.work_packages w
    where w.project_id = p_project and private.can_see_project_money(w.company_id, w.project_id)
  ),
  f as (
    select pk.id,
      (select t.agreed_value_paisa from public.work_package_terms t where t.id = pk.id) as agreed,
      coalesce((select sum(c.approved_paisa) from public.subcontract_charges c
                where c.work_package_id = pk.id and c.status = 'approved'), 0)::bigint as approved,
      coalesce((select sum(c.claimed_paisa) from public.subcontract_charges c
                where c.work_package_id = pk.id and c.status = 'draft'), 0)::bigint as pending,
      (coalesce((select sum(p.amount_paisa) from public.payments p
                 where p.work_package_id = pk.id and p.status = 'posted'), 0)
       + coalesce((select sum(s.amount_paisa) from public.settlement_events s
                   join public.subcontract_charges c on c.id = s.charge_id
                   join public.payments p on p.id = s.payment_id
                   where c.work_package_id = pk.id and p.work_package_id is distinct from pk.id), 0))::bigint as paid
    from pk
  )
  select f.id, f.agreed, f.approved, f.pending, f.paid, f.approved - f.paid, f.agreed - f.approved from f
$$;

-- Open documents (still owed) and payment money not yet matched, per project, for one party.
create function public.party_open_items(p_party uuid)
returns table (kind text, doc_id uuid, label text, doc_date date, project_id uuid, amount_paisa bigint)
language sql stable security invoker set search_path = '' as $$
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
    from public.labour_costs l where l.crew_id = p_party and l.status = 'posted'
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

create or replace function public.supplier_open_items(p_supplier uuid)
returns table (kind text, doc_id uuid, label text, doc_date date, project_id uuid, amount_paisa bigint)
language sql stable security invoker set search_path = '' as $$
  select * from public.party_open_items(p_supplier)
$$;

-- Per party of one kind: what was charged, paid, and is owed. Company-level figures
-- (unallocated, opening balances) are included only for Admin and Accounts (design §3.4).
create function public.party_balances(p_company uuid, p_kind text, p_as_of date default null)
returns table (
  party_id uuid, party_name text, active boolean, project_id uuid,
  charged_paisa bigint, paid_paisa bigint, project_balance_paisa bigint, unallocated_paisa bigint,
  balance_paisa bigint, company_level boolean
)
language sql stable security invoker set search_path = '' as $$
  with parties as (
    select s.id, s.name, s.active, null::uuid as project_id from public.suppliers s where p_kind = 'supplier' and s.company_id = p_company
    union all
    select s.id, s.name, s.active, null from public.subcontractors s where p_kind = 'subcontractor' and s.company_id = p_company
    union all
    select c.id, c.name, c.active, c.project_id from public.crews c where p_kind = 'crew' and c.company_id = p_company
    union all
    select p.id, p.name, p.active, null from public.payees p where p_kind = 'payee' and p.company_id = p_company
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

-- Document label for a khata row. Labels only (no amounts).
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
begin
  select * into e from public.posting_events where id = p_event;
  if not found or not private.can_see_finance(e.company_id) then
    return null;
  end if;
  if e.event_type = 'reversal' then
    select * into r from public.reversals where id = e.reversal_id;
    v_bill := r.bill_id; v_payment := r.payment_id; v_credit := r.credit_id;
    v_charge := r.charge_id; v_labour := r.labour_cost_id; v_expense := r.expense_id;
  elsif e.event_type = 'allocation_move' then
    select a.payment_id into v_payment from public.payment_allocation_events a where a.id = e.allocation_event_id;
  else
    v_bill := e.bill_id; v_payment := e.payment_id; v_credit := e.credit_id;
    v_charge := e.charge_id; v_labour := e.labour_cost_id; v_expense := e.expense_id;
  end if;
  v_label := coalesce(
    (select 'Bill ' || b.bill_no from public.supplier_bills b where b.id = v_bill),
    (select 'Payment ' || p.number from public.payments p where p.id = v_payment),
    (select 'Credit ' || c.number from public.credits c where c.id = v_credit),
    (select 'Work charge' || coalesce(' ' || nullif(trim(c.claim_no), ''), '') || ': ' || w.scope
     from public.subcontract_charges c join public.work_packages w on w.id = c.work_package_id where c.id = v_charge),
    (select 'Labour' || coalesce(', ' || l.work_type, '') from public.labour_costs l where l.id = v_labour),
    (select 'Expense: ' || x.description from public.expenses x where x.id = v_expense),
    case when e.event_type = 'opening_balance' or r.opening_balance_id is not null then 'Opening balance' end
  );
  v_label := case e.event_type
    when 'reversal' then 'Reversal of ' || lower(left(v_label, 1)) || substr(v_label, 2)
    when 'allocation_move' then 'Allocation change, ' || lower(left(v_label, 1)) || substr(v_label, 2)
    else v_label end;
  return jsonb_build_object('label', v_label, 'bill_id', v_bill, 'payment_id', v_payment, 'credit_id', v_credit,
    'charge_id', v_charge, 'labour_cost_id', v_labour, 'expense_id', v_expense, 'reason', r.reason);
end $$;

-- Khata (ledger statement) for any party: one row per posting, with a running balance.
-- p_project limits it to one project; otherwise it covers what the caller can see.
create function public.party_khata(
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
    end,
    coalesce(lbl ->> 'bill_id', lbl ->> 'charge_id', lbl ->> 'labour_cost_id', lbl ->> 'expense_id',
             lbl ->> 'credit_id', lbl ->> 'payment_id')::uuid,
    ev.project_id, ev.cost, ev.balance, ev.cash,
    ((select o.b from opening o) + sum(ev.balance) over (order by ev.business_date, ev.posted_at, ev.event_id))::bigint
  from ev cross join lateral private.event_label(ev.event_id) lbl
  order by 2 nulls first, 3 nulls first, 1 nulls first
$$;

-- Project figures (req §19): now also what is owed by kind of party, so unpaid labour and
-- labour advances show next to cost (req §14).
create or replace function public.project_cost_summary(p_project uuid, p_as_of date default null, p_as_known boolean default false)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
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
    'crew', coalesce(sum(l.balance_paisa) filter (where l.crew_id is not null), 0),
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
end $$;

-- ===========================================================================
-- Attachments for the new owners (design §3.7)
-- ===========================================================================
create or replace function private.can_access_attachment(p_attachment uuid, p_action text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.attachments;
  v_project uuid;
  v_status public.bill_status;
  c public.subcontract_charges;
  l public.labour_costs;
  x public.expenses;
begin
  select * into a from public.attachments where id = p_attachment;
  if not found or not private.is_member(a.company_id) then
    return false;
  end if;

  if a.contract_revision_id is not null or a.budget_revision_id is not null then
    if a.contract_revision_id is not null then
      select project_id into v_project from public.contract_revisions where id = a.contract_revision_id;
    else
      select project_id into v_project from public.budget_revisions where id = a.budget_revision_id;
    end if;
    -- Revision attachments: financial records, admin writes, never deleted.
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_finance(a.company_id) and private.can_see_project(a.company_id, v_project);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.is_admin(a.company_id);
    end if;
    return false;
  end if;

  if a.delivery_id is not null then
    select project_id into v_project from public.deliveries where id = a.delivery_id;
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_project(a.company_id, v_project);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_work_on_project(a.company_id, v_project);
    end if;
    return false;
  end if;

  if a.bill_id is not null then
    select status into v_status from public.supplier_bills where id = a.bill_id;
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_bill_amounts(a.bill_id);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_edit_bill(a.bill_id);
    elsif p_action = 'delete' then
      return v_status = 'draft' and private.can_edit_bill(a.bill_id);
    end if;
    return false;
  end if;

  if a.payment_id is not null then
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_payment(a.payment_id);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_record_payments(a.company_id) and private.can_see_payment(a.payment_id);
    end if;
    return false;
  end if;

  -- Agreement and measurement sheets carry amounts: finance + project to read.
  if a.work_package_id is not null then
    select project_id into v_project from public.work_packages where id = a.work_package_id;
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_project_money(a.company_id, v_project);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_manage_parties(a.company_id)
        and private.can_work_on_project(a.company_id, v_project) and private.can_see_finance(a.company_id);
    end if;
    return false;
  end if;

  if a.charge_id is not null then
    select * into c from public.subcontract_charges where id = a.charge_id;
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_project_money(a.company_id, c.project_id);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_see_project_money(a.company_id, c.project_id)
        and private.can_work_on_project(a.company_id, c.project_id);
    elsif p_action = 'delete' then
      return c.status = 'draft' and private.can_see_project_money(a.company_id, c.project_id)
        and (c.created_by = auth.uid() or private.can_post(a.company_id));
    end if;
    return false;
  end if;

  -- Labour and expense receipts: finance + project, or the creator within X2.
  if a.labour_cost_id is not null then
    select * into l from public.labour_costs where id = a.labour_cost_id;
    if p_action in ('read', 'upload') and (
      private.can_see_project_money(a.company_id, l.project_id)
      or private.is_own_recent_entry(a.company_id, l.project_id, l.created_by, l.created_at, l.status)
    ) then
      return case when p_action = 'read' then a.removed_at is null
                  else a.uploaded_at is null and private.can_work_on_project(a.company_id, l.project_id) end;
    end if;
    return false;
  end if;

  if a.expense_id is not null then
    select * into x from public.expenses where id = a.expense_id;
    if p_action in ('read', 'upload') and (
      private.can_see_project_money(a.company_id, x.project_id)
      or private.is_own_recent_entry(a.company_id, x.project_id, x.created_by, x.created_at, x.status)
    ) then
      return case when p_action = 'read' then a.removed_at is null
                  else a.uploaded_at is null and private.can_work_on_project(a.company_id, x.project_id) end;
    end if;
    return false;
  end if;
  return false;
end $$;

drop policy attachments_insert on public.attachments;
drop function private.can_create_attachment_for(uuid, uuid, uuid, uuid, uuid, uuid);
create function private.can_create_attachment_for(
  p_company uuid, p_contract_revision uuid, p_budget_revision uuid, p_delivery uuid, p_bill uuid, p_payment uuid,
  p_work_package uuid, p_charge uuid, p_labour_cost uuid, p_expense uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    (p_contract_revision is not null and private.is_admin(p_company) and exists (
      select 1 from public.contract_revisions r where r.company_id = p_company and r.id = p_contract_revision))
    or (p_budget_revision is not null and private.is_admin(p_company) and exists (
      select 1 from public.budget_revisions r where r.company_id = p_company and r.id = p_budget_revision))
    or (p_delivery is not null and exists (
      select 1 from public.deliveries d
      where d.company_id = p_company and d.id = p_delivery and private.can_work_on_project(d.company_id, d.project_id)))
    or (p_bill is not null and exists (
      select 1 from public.supplier_bills b where b.company_id = p_company and b.id = p_bill)
      and private.can_edit_bill(p_bill))
    or (p_payment is not null and exists (
      select 1 from public.payments p where p.company_id = p_company and p.id = p_payment)
      and private.can_record_payments(p_company) and private.can_see_payment(p_payment))
    or (p_work_package is not null and exists (
      select 1 from public.work_packages w
      where w.company_id = p_company and w.id = p_work_package and private.can_manage_parties(p_company)
        and private.can_work_on_project(p_company, w.project_id) and private.can_see_finance(p_company)))
    or (p_charge is not null and exists (
      select 1 from public.subcontract_charges c
      where c.company_id = p_company and c.id = p_charge
        and private.can_see_project_money(p_company, c.project_id) and private.can_work_on_project(p_company, c.project_id)))
    or (p_labour_cost is not null and exists (
      select 1 from public.labour_costs l
      where l.company_id = p_company and l.id = p_labour_cost and private.can_work_on_project(p_company, l.project_id)
        and (private.can_see_project_money(p_company, l.project_id)
             or private.is_own_recent_entry(p_company, l.project_id, l.created_by, l.created_at, l.status))))
    or (p_expense is not null and exists (
      select 1 from public.expenses x
      where x.company_id = p_company and x.id = p_expense and private.can_work_on_project(p_company, x.project_id)
        and (private.can_see_project_money(p_company, x.project_id)
             or private.is_own_recent_entry(p_company, x.project_id, x.created_by, x.created_at, x.status))))
$$;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    uploaded_at is null and removed_at is null
    and private.can_create_attachment_for(company_id, contract_revision_id, budget_revision_id, delivery_id, bill_id,
      payment_id, work_package_id, charge_id, labour_cost_id, expense_id)
  );

-- ===========================================================================
-- Grants: RPCs for signed-in users only; internal writers are not callable at all.
-- ===========================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
revoke execute on function public.next_doc_number(uuid, text, text) from authenticated;

revoke execute on function
  private.new_event(uuid, text, uuid, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], uuid, uuid, uuid),
  private.reverse_with_event(uuid, uuid, date, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid),
  private.settle_one(uuid, uuid, uuid, bigint, date, uuid, text),
  private.unsettle_where(uuid, uuid, uuid, bigint, date, uuid, text),
  private.lock_party(uuid),
  private.lock_docs(uuid[]),
  private.post_payment(uuid, uuid, uuid, date, bigint, text, text, text, uuid, jsonb, uuid),
  private.pay_now(uuid, uuid, uuid, uuid[], date, jsonb, uuid),
  private.post_labour(jsonb, jsonb, jsonb, jsonb, boolean, uuid, uuid)
from public, anon, authenticated;
revoke execute on function
  private.party_kind(uuid), private.party_company(uuid), private.doc_info(uuid), private.doc_settleable(uuid, uuid),
  private.doc_settled(uuid, uuid), private.default_heading(uuid, public.heading_kind),
  private.is_own_recent_entry(uuid, uuid, uuid, timestamptz, public.doc_status), private.can_see_project_money(uuid, uuid),
  private.add_default_crew()
from public, anon;
-- Policies and security-invoker views call these as the signed-in user.
grant execute on function
  private.party_kind(uuid), private.party_company(uuid), private.doc_info(uuid), private.doc_settleable(uuid, uuid),
  private.doc_settled(uuid, uuid), private.default_heading(uuid, public.heading_kind),
  private.is_own_recent_entry(uuid, uuid, uuid, timestamptz, public.doc_status), private.can_see_project_money(uuid, uuid)
to authenticated;
