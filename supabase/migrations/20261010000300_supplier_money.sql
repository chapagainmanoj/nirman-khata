-- NirmanKhata milestone 2: posting, payments, settlement, credits, reversals, supplier khata.
-- Every money-changing function follows the posting contract (design §5.1):
--   1. authorize  2. op_key  3. lock (party -> payments -> documents -> credits -> delivery lines)
--   4. check state  5. write  6. check invariants  7. store the result.

-- ===========================================================================
-- Idempotency (design §5.1 step 2)
-- ===========================================================================

-- Returns the stored result for a retry of the same request by the same user, null for a
-- new request. A different request or user with the same key is rejected (C3).
-- A concurrent call with the same key waits on the primary key until the first commits.
create function private.begin_op(p_company uuid, p_op_key uuid, p_kind text, p_request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := encode(sha256(convert_to(p_kind || ':' || p_request::text, 'UTF8')), 'hex');
  v_op public.operations;
  v_rows integer;
begin
  if p_op_key is null then
    raise exception 'An operation key is required' using errcode = '22023';
  end if;
  insert into public.operations (company_id, op_key, kind, request_hash, user_id)
  values (p_company, p_op_key, p_kind, v_hash, auth.uid())
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    return null;
  end if;
  select * into v_op from public.operations where company_id = p_company and op_key = p_op_key;
  if v_op.kind <> p_kind or v_op.request_hash <> v_hash or v_op.user_id is distinct from auth.uid() then
    raise exception 'op_key_reused: this request key was already used for a different request' using errcode = 'P0001';
  end if;
  return v_op.result;
end $$;

create function private.finish_op(p_company uuid, p_op_key uuid, p_result jsonb) returns jsonb
language sql security definer set search_path = '' as $$
  update public.operations set result = p_result where company_id = p_company and op_key = p_op_key;
  select p_result;
$$;

-- ===========================================================================
-- Ledger writers (design §4.3). Only these functions write posting_events and ledger_entries.
-- ===========================================================================

create function private.new_event(
  p_company uuid, p_type text, p_supplier uuid, p_date date, p_op_key uuid,
  p_opening_balance uuid default null, p_bill uuid default null, p_payment uuid default null,
  p_allocation_event uuid default null, p_credit uuid default null, p_reversal uuid default null,
  p_reversed_events uuid[] default null
) returns uuid
language sql security definer set search_path = '' as $$
  insert into public.posting_events (
    company_id, event_type, supplier_id, business_date, op_key, opening_balance_id, bill_id, payment_id,
    allocation_event_id, credit_id, reversal_id, reversed_event_ids, created_by
  ) values (
    p_company, p_type, p_supplier, p_date, p_op_key, p_opening_balance, p_bill, p_payment,
    p_allocation_event, p_credit, p_reversal, p_reversed_events, auth.uid()
  ) returning id
$$;

create function private.add_ledger(
  p_event uuid, p_key text, p_project uuid, p_heading uuid, p_cost bigint, p_balance bigint, p_cash bigint
) returns void
language sql security definer set search_path = '' as $$
  insert into public.ledger_entries (
    company_id, event_id, event_type, component_key, business_date, posted_at, project_id, heading_id,
    supplier_id, cost_paisa, balance_paisa, cash_paisa
  )
  select e.company_id, e.id, e.event_type, p_key, e.business_date, e.posted_at, p_project, p_heading,
    e.supplier_id, p_cost, p_balance, p_cash
  from public.posting_events e
  where e.id = p_event and (p_cost <> 0 or p_balance <> 0 or p_cash <> 0)
$$;

-- Negate every ledger row of the given events, dated on the reversal (design §4.3, I-9).
create function private.negate_events(p_reversal_event uuid, p_events uuid[]) returns void
language sql security definer set search_path = '' as $$
  insert into public.ledger_entries (
    company_id, event_id, event_type, component_key, business_date, posted_at, project_id, heading_id,
    supplier_id, cost_paisa, balance_paisa, cash_paisa
  )
  select e.company_id, e.id, e.event_type, 'rev:' || l.id, e.business_date, e.posted_at, l.project_id, l.heading_id,
    l.supplier_id, -l.cost_paisa, -l.balance_paisa, -l.cash_paisa
  from public.ledger_entries l
  join public.posting_events e on e.id = p_reversal_event
  where l.event_id = any (p_events)
$$;

create function private.lock_supplier(p_supplier uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_company uuid;
begin
  select company_id into v_company from public.suppliers where id = p_supplier for update;
  if v_company is null then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;
  return v_company;
end $$;

-- ===========================================================================
-- Settlement amounts (design §5.3)
-- ===========================================================================

-- Settleable = payable of the bill's lines in the project - active credits for that project.
create function private.bill_settleable(p_bill uuid, p_project uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce((
      select sum(l.payable_amount_paisa) from public.bill_lines l
      where l.bill_id = p_bill and l.project_id = p_project), 0)
    - coalesce((
      select sum(cl.amount_paisa) from public.credit_lines cl join public.credits c on c.id = cl.credit_id
      where c.bill_id = p_bill and c.status = 'posted' and cl.project_id = p_project), 0)
$$;

create function private.bill_settled(p_bill uuid, p_project uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(s.amount_paisa), 0)::bigint from public.settlement_events s
  where s.bill_id = p_bill and s.project_id = p_project
$$;

create function private.payment_allocated(p_payment uuid, p_project uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(e.amount_paisa), 0)::bigint from public.payment_allocation_events e
  where e.payment_id = p_payment and e.project_id = p_project
$$;

create function private.payment_settled(p_payment uuid, p_project uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(s.amount_paisa), 0)::bigint from public.settlement_events s
  where s.payment_id = p_payment and s.project_id = p_project
$$;

-- One settlement; the caller holds the locks (party, payment, bill).
create function private.settle_one(
  p_payment uuid, p_bill uuid, p_project uuid, p_amount bigint, p_date date, p_op_key uuid, p_reason text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  b public.supplier_bills;
  v_min date;
  v_id uuid;
begin
  select * into p from public.payments where id = p_payment;
  select * into b from public.supplier_bills where id = p_bill;
  if p.id is null or b.id is null or p.company_id <> b.company_id then
    raise exception 'Payment or bill not found' using errcode = 'P0002';
  end if;
  if p.supplier_id <> b.supplier_id then
    raise exception 'The payment and the bill are for different suppliers' using errcode = 'P0001';
  end if;
  if p.status <> 'posted' then
    raise exception 'Payment % is reversed', p.number using errcode = 'P0001';
  end if;
  if b.status <> 'posted' then
    raise exception 'Only posted bills can be settled' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Settlement amount must be more than zero' using errcode = '22023';
  end if;
  v_min := greatest(p.payment_date, b.bill_date);
  if p_date is not null and p_date < v_min then
    raise exception 'A settlement cannot be dated before the payment or the bill' using errcode = '22023';
  end if;
  if private.payment_allocated(p_payment, p_project) - private.payment_settled(p_payment, p_project) < p_amount then
    raise exception 'Not enough of payment % is allocated to this project', p.number using errcode = 'P0001';
  end if;
  if private.bill_settleable(p_bill, p_project) - private.bill_settled(p_bill, p_project) < p_amount then
    raise exception 'This is more than bill % still owes for the project', b.bill_no using errcode = 'P0001';
  end if;
  insert into public.settlement_events (
    company_id, payment_id, project_id, bill_id, amount_paisa, business_date, op_key, reason, created_by
  ) values (
    p.company_id, p_payment, p_project, p_bill, p_amount, coalesce(p_date, v_min), p_op_key, p_reason, auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

-- Undo settlements: by bill, by payment, or a pair. Newest payments first.
create function private.unsettle_where(
  p_bill uuid, p_payment uuid, p_project uuid, p_limit bigint, p_date date, p_op_key uuid, p_reason text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_left bigint := p_limit; -- null = everything
  v_amt bigint;
  v_done bigint := 0;
begin
  for r in
    select s.company_id, s.payment_id, s.bill_id, s.project_id, sum(s.amount_paisa) as net, max(s.posted_at) as last_at
    from public.settlement_events s
    where (p_bill is null or s.bill_id = p_bill)
      and (p_payment is null or s.payment_id = p_payment)
      and (p_project is null or s.project_id = p_project)
    group by s.company_id, s.payment_id, s.bill_id, s.project_id
    having sum(s.amount_paisa) > 0
    order by max(s.posted_at) desc, s.payment_id
  loop
    exit when v_left is not null and v_left <= 0;
    v_amt := case when v_left is null then r.net else least(r.net, v_left) end;
    insert into public.settlement_events (
      company_id, payment_id, project_id, bill_id, amount_paisa, business_date, op_key, reason, created_by
    ) values (r.company_id, r.payment_id, r.project_id, r.bill_id, -v_amt, p_date, p_op_key, p_reason, auth.uid());
    v_done := v_done + v_amt;
    if v_left is not null then
      v_left := v_left - v_amt;
    end if;
  end loop;
  return v_done;
end $$;

-- ===========================================================================
-- Opening balance (req §8.2, §20)
-- ===========================================================================
create function public.set_opening_balance(
  p_op_key uuid, p_supplier uuid, p_cutover_date date, p_amount_paisa bigint, p_note text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := (select company_id from public.suppliers where id = p_supplier);
  v_prior jsonb;
  v_id uuid;
  v_event uuid;
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can set opening balances' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'set_opening_balance', jsonb_build_object(
    'supplier', p_supplier, 'date', p_cutover_date, 'amount', p_amount_paisa, 'note', p_note));
  if v_prior is not null then
    return v_prior;
  end if;
  perform private.lock_supplier(p_supplier);
  if exists (select 1 from public.party_opening_balances where supplier_id = p_supplier and status = 'posted') then
    raise exception 'This supplier already has an opening balance; reverse it first' using errcode = 'P0001';
  end if;
  if p_cutover_date is null or p_amount_paisa is null or p_amount_paisa = 0 then
    raise exception 'Cutover date and a non-zero amount are required' using errcode = '22023';
  end if;
  insert into public.party_opening_balances (company_id, supplier_id, cutover_date, amount_paisa, note)
  values (v_company, p_supplier, p_cutover_date, p_amount_paisa, private.require_reason(p_note, 'A note'))
  returning id into v_id;
  -- Not project cost; sits in the supplier's unallocated bucket (req §12.3, §20).
  v_event := private.new_event(v_company, 'opening_balance', p_supplier, p_cutover_date, p_op_key, p_opening_balance => v_id);
  perform private.add_ledger(v_event, 'unallocated', null, null, 0, p_amount_paisa, 0);
  return private.finish_op(v_company, p_op_key, jsonb_build_object('opening_balance_id', v_id, 'event_id', v_event));
end $$;

-- ===========================================================================
-- Post a bill (req §11, design §5.5, I-2, I-3)
-- ===========================================================================
create function public.post_bill(p_op_key uuid, p_bill uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.supplier_bills;
  c public.supplier_bill_charges;
  v_company uuid := (select company_id from public.supplier_bills where id = p_bill);
  v_prior jsonb;
  v_check record;
  v_event uuid;
  v_total bigint;
  v_payable bigint;
  v_cost bigint;
  r record;
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can post bills' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'post_bill', jsonb_build_object('bill', p_bill));
  if v_prior is not null then
    return v_prior;
  end if;

  perform private.lock_supplier((select supplier_id from public.supplier_bills where id = p_bill));
  select * into b from public.supplier_bills where id = p_bill for update;
  perform 1 from public.delivery_lines dl
  where dl.id in (
    select m.delivery_line_id from public.bill_line_delivery_lines m join public.bill_lines l on l.id = m.bill_line_id
    where l.bill_id = p_bill)
  order by dl.id for update;

  if b.status in ('posted', 'reversed') then
    raise exception 'already_posted: this bill was already posted' using errcode = 'P0001';
  end if;

  for v_check in select * from private.bill_checks(p_bill) where severity in ('error', 'reason') loop
    if v_check.severity = 'reason' then
      raise exception '% (add a reason on the line to post it)', v_check.message using errcode = 'P0001';
    end if;
    raise exception '%', v_check.message using errcode = 'P0001';
  end loop;

  for r in select * from private.compute_bill_allocation(p_bill) loop
    update public.bill_lines set
      discount_share_paisa = r.discount_share, transport_share_paisa = r.transport_share,
      vat_share_paisa = r.vat_share, payable_amount_paisa = r.payable, cost_amount_paisa = r.cost
    where id = r.line_id;
  end loop;

  select * into c from public.supplier_bill_charges where id = p_bill;
  v_total := (select coalesce(sum(amount_paisa), 0) from public.bill_lines where bill_id = p_bill)
    - coalesce(c.discount_paisa, 0) + coalesce(c.transport_paisa, 0) + coalesce(c.vat_paisa, 0);
  select sum(payable_amount_paisa), sum(cost_amount_paisa) into v_payable, v_cost
  from public.bill_lines where bill_id = p_bill;
  -- I-2/I-3: lines carry the whole bill; cost excludes VAT only when it is recoverable.
  if v_payable <> v_total
     or v_cost <> v_total - (case when b.vat_treatment = 'vat_recoverable' then coalesce(c.vat_paisa, 0) else 0 end) then
    raise exception 'Bill allocation does not balance' using errcode = 'P0001';
  end if;
  update public.supplier_bill_charges set total_paisa = v_total where id = p_bill;

  v_event := private.new_event(v_company, 'bill_post', b.supplier_id, b.cost_date, p_op_key, p_bill => p_bill);
  for r in select * from public.bill_lines where bill_id = p_bill order by sort_order, id loop
    perform private.add_ledger(v_event, 'line:' || r.id, r.project_id, r.heading_id,
      r.cost_amount_paisa, r.payable_amount_paisa, 0);
  end loop;

  update public.supplier_bills set status = 'posted', posted_at = now(), posted_by = auth.uid() where id = p_bill;
  return private.finish_op(v_company, p_op_key, jsonb_build_object(
    'bill_id', p_bill, 'event_id', v_event, 'total_paisa', v_total, 'cost_paisa', v_cost));
end $$;

-- ===========================================================================
-- Payments (req §12)
-- ===========================================================================

-- p_payment: {id, supplier_id, payment_date, amount_paisa, method, reference, notes,
--   allocations: [{project_id, amount_paisa}], settlements: [{bill_id, project_id, amount_paisa}]}
-- Any part not allocated to a project stays unallocated at company level.
create function public.record_payment(p_op_key uuid, p_payment jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_payment ->> 'id')::uuid;
  v_supplier uuid := (p_payment ->> 'supplier_id')::uuid;
  v_company uuid := (select company_id from public.suppliers where id = (p_payment ->> 'supplier_id')::uuid);
  v_amount bigint := (p_payment ->> 'amount_paisa')::bigint;
  v_date date := coalesce((p_payment ->> 'payment_date')::date, private.today());
  v_allocs jsonb := coalesce(p_payment -> 'allocations', '[]'::jsonb);
  v_settles jsonb := coalesce(p_payment -> 'settlements', '[]'::jsonb);
  v_alloc_sum bigint;
  v_prior jsonb;
  v_number text;
  v_event uuid;
  a record;
  s jsonb;
begin
  -- 1. Authorize.
  if v_company is null or not private.can_record_payments(v_company) then
    raise exception 'You cannot record payments' using errcode = '42501';
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

  -- 2. Operation key.
  v_prior := private.begin_op(v_company, p_op_key, 'record_payment', p_payment);
  if v_prior is not null then
    return v_prior;
  end if;

  -- Validate.
  if v_id is null then
    raise exception 'Payment id is required' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Payment amount must be more than zero' using errcode = '22023';
  end if;
  if v_date > private.today() then
    raise exception 'The payment date cannot be in the future' using errcode = '22023';
  end if;
  if v_alloc_sum > v_amount then
    raise exception 'Project allocations are more than the payment (I-4)' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(v_allocs) x where (x ->> 'amount_paisa')::bigint <= 0)
     or (select count(*) <> count(distinct x ->> 'project_id') from jsonb_array_elements(v_allocs) x) then
    raise exception 'Each project can be allocated once, with an amount more than zero' using errcode = '22023';
  end if;

  -- 3. Lock: party, then the bills being settled.
  perform private.lock_supplier(v_supplier);
  perform 1 from public.supplier_bills
  where id in (select (x ->> 'bill_id')::uuid from jsonb_array_elements(v_settles) x)
  order by id for update;

  -- 5. Write.
  v_number := public.next_doc_number(v_company, 'payment', 'PAY');
  insert into public.payments (company_id, id, number, supplier_id, payment_date, amount_paisa, method, reference, notes)
  values (
    v_company, v_id, v_number, v_supplier, v_date, v_amount,
    coalesce((p_payment ->> 'method')::public.payment_method, 'cash'), p_payment ->> 'reference', p_payment ->> 'notes'
  );
  v_event := private.new_event(v_company, 'payment_post', v_supplier, v_date, p_op_key, p_payment => v_id);
  for a in
    select (x ->> 'project_id')::uuid as project_id, (x ->> 'amount_paisa')::bigint as amount
    from jsonb_array_elements(v_allocs) x order by 1
  loop
    insert into public.payment_allocation_events (company_id, payment_id, project_id, amount_paisa, business_date, reason, created_by)
    values (v_company, v_id, a.project_id, a.amount, v_date, 'At payment', auth.uid());
    perform private.add_ledger(v_event, 'project:' || a.project_id, a.project_id, null, 0, -a.amount, a.amount);
  end loop;
  perform private.add_ledger(v_event, 'unallocated', null, null, 0, -(v_amount - v_alloc_sum), v_amount - v_alloc_sum);

  for s in select * from jsonb_array_elements(v_settles) loop
    if not private.can_see_project(v_company, (s ->> 'project_id')::uuid) then
      raise exception 'You can only settle bills on projects you are assigned to' using errcode = '42501';
    end if;
    perform private.settle_one(v_id, (s ->> 'bill_id')::uuid, (s ->> 'project_id')::uuid,
      (s ->> 'amount_paisa')::bigint, (s ->> 'date')::date, p_op_key, null);
  end loop;

  return private.finish_op(v_company, p_op_key, jsonb_build_object('payment_id', v_id, 'number', v_number, 'event_id', v_event));
end $$;

-- Move allocation between unallocated and projects (req §12.3). p_changes: [{project_id, amount_paisa}]
-- with signed amounts (+ to the project, - back to unallocated). Dated on the payment (I-9).
create function public.allocate_payment(p_op_key uuid, p_payment uuid, p_changes jsonb, p_reason text) returns jsonb
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
  perform private.lock_supplier((select supplier_id from public.payments where id = p_payment));
  select * into p from public.payments where id = p_payment for update;
  if p.status <> 'posted' then
    raise exception 'This payment is reversed' using errcode = 'P0001';
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
    v_event := private.new_event(v_company, 'allocation_move', p.supplier_id, p.payment_date, p_op_key, p_allocation_event => v_alloc);
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

-- Match payments to bills (refines allocation; never changes cash paid). p_items:
-- [{payment_id, bill_id, project_id, amount_paisa, date}]
create function public.settle(p_op_key uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  v_supplier uuid;
  v_prior jsonb;
  s jsonb;
  v_ids uuid[] := '{}';
begin
  select b.company_id, b.supplier_id into v_company, v_supplier
  from public.supplier_bills b where b.id = (p_items -> 0 ->> 'bill_id')::uuid;
  if v_company is null or not private.can_record_payments(v_company) or not private.can_see_finance(v_company) then
    raise exception 'You cannot match payments to bills' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where not private.can_see_project(v_company, (x ->> 'project_id')::uuid)
  ) then
    raise exception 'You can only match bills on projects you are assigned to' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'settle', p_items);
  if v_prior is not null then
    return v_prior;
  end if;
  perform private.lock_supplier(v_supplier);
  perform 1 from public.payments
  where id in (select (x ->> 'payment_id')::uuid from jsonb_array_elements(p_items) x) order by id for update;
  perform 1 from public.supplier_bills
  where id in (select (x ->> 'bill_id')::uuid from jsonb_array_elements(p_items) x) order by id for update;
  for s in select * from jsonb_array_elements(p_items) loop
    v_ids := v_ids || private.settle_one((s ->> 'payment_id')::uuid, (s ->> 'bill_id')::uuid, (s ->> 'project_id')::uuid,
      (s ->> 'amount_paisa')::bigint, (s ->> 'date')::date, p_op_key, null);
  end loop;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('settlement_ids', to_jsonb(v_ids)));
end $$;

-- The money stays in the project allocation as advance (design §5.3).
create function public.unsettle(
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
  perform private.lock_supplier((select supplier_id from public.payments where id = p_payment));
  perform 1 from public.payments where id = p_payment for update;
  perform 1 from public.supplier_bills where id = p_bill for update;
  if p_amount_paisa is null or p_amount_paisa <= 0 then
    raise exception 'Amount must be more than zero' using errcode = '22023';
  end if;
  if (select coalesce(sum(amount_paisa), 0) from public.settlement_events
      where payment_id = p_payment and bill_id = p_bill and project_id = p_project) < p_amount_paisa then
    raise exception 'This is more than is matched' using errcode = 'P0001';
  end if;
  v_done := private.unsettle_where(p_bill, p_payment, p_project, p_amount_paisa, private.today(), p_op_key,
    private.require_reason(p_reason));
  return private.finish_op(v_company, p_op_key, jsonb_build_object('unsettled_paisa', v_done));
end $$;

-- ===========================================================================
-- Credits (design §5.4)
-- ===========================================================================

-- p_credit: {id, bill_id, credit_date, reason, supplier_credit_no,
--   lines: [{bill_line_id, amount_paisa, supplier_return_line_id, credited_qty}]}
create function public.post_credit(p_op_key uuid, p_credit jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_credit ->> 'id')::uuid;
  v_bill uuid := (p_credit ->> 'bill_id')::uuid;
  v_company uuid := (select company_id from public.supplier_bills where id = (p_credit ->> 'bill_id')::uuid);
  v_date date := coalesce((p_credit ->> 'credit_date')::date, private.today());
  b public.supplier_bills;
  v_prior jsonb;
  v_number text;
  v_event uuid;
  l jsonb;
  bl public.bill_lines;
  v_prev_amount bigint;
  v_prev_cost bigint;
  v_amount bigint;
  v_cost bigint;
  v_line uuid;
  v_rl record;
  v_project uuid;
  v_excess bigint;
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can post credits' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'post_credit', p_credit);
  if v_prior is not null then
    return v_prior;
  end if;
  if v_id is null then
    raise exception 'Credit id is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_credit -> 'lines') is distinct from 'array' or jsonb_array_length(p_credit -> 'lines') = 0 then
    raise exception 'Add at least one credit line' using errcode = '22023';
  end if;

  perform private.lock_supplier((select supplier_id from public.supplier_bills where id = v_bill));
  perform 1 from public.payments where id in (select payment_id from public.settlement_events where bill_id = v_bill)
  order by id for update;
  select * into b from public.supplier_bills where id = v_bill for update;
  perform 1 from public.delivery_lines where id in (
    select rl.delivery_line_id from public.supplier_return_lines rl
    where rl.id in (select (x ->> 'supplier_return_line_id')::uuid from jsonb_array_elements(p_credit -> 'lines') x))
  order by id for update;

  if b.status <> 'posted' then
    raise exception 'Credits can only be posted on a posted bill' using errcode = 'P0001';
  end if;
  if v_date < b.cost_date then
    raise exception 'A credit cannot be dated before the bill' using errcode = '22023';
  end if;

  v_number := public.next_doc_number(v_company, 'credit', 'CN');
  insert into public.credits (company_id, id, number, supplier_id, bill_id, credit_date, reason, supplier_credit_no)
  values (v_company, v_id, v_number, b.supplier_id, v_bill, v_date, private.require_reason(p_credit ->> 'reason'),
          nullif(trim(p_credit ->> 'supplier_credit_no'), ''));
  v_event := private.new_event(v_company, 'credit_post', b.supplier_id, v_date, p_op_key, p_credit => v_id);

  for l in select * from jsonb_array_elements(p_credit -> 'lines') loop
    select * into bl from public.bill_lines where id = (l ->> 'bill_line_id')::uuid and bill_id = v_bill;
    if bl.id is null then
      raise exception 'A credit line is not on this bill' using errcode = 'P0001';
    end if;
    v_amount := (l ->> 'amount_paisa')::bigint;
    select coalesce(sum(cl.amount_paisa), 0), coalesce(sum(cl.cost_paisa), 0) into v_prev_amount, v_prev_cost
    from public.credit_lines cl join public.credits c on c.id = cl.credit_id
    where cl.bill_line_id = bl.id and c.status = 'posted';
    if v_amount is null or v_amount <= 0 or v_amount > bl.payable_amount_paisa - v_prev_amount then
      raise exception 'A credit line is more than what remains on that bill line' using errcode = 'P0001';
    end if;
    -- Cost falls in proportion; crediting the rest of a line clears the rest of its cost.
    v_cost := case
      when v_amount = bl.payable_amount_paisa - v_prev_amount then bl.cost_amount_paisa - v_prev_cost
      else least(round(v_amount::numeric * bl.cost_amount_paisa / bl.payable_amount_paisa)::bigint,
                 bl.cost_amount_paisa - v_prev_cost)
    end;

    if (l ->> 'supplier_return_line_id') is not null then
      select rl.id, rl.qty, rl.delivery_line_id into v_rl
      from public.supplier_return_lines rl where rl.id = (l ->> 'supplier_return_line_id')::uuid and rl.company_id = v_company;
      if v_rl.id is null or not exists (
        select 1 from public.bill_line_delivery_lines m where m.bill_line_id = bl.id and m.delivery_line_id = v_rl.delivery_line_id
      ) then
        raise exception 'The return is not for a delivery billed on this line' using errcode = 'P0001';
      end if;
      if (l ->> 'credited_qty')::numeric > (select q.awaiting_credit_qty from private.delivery_line_qty(v_rl.delivery_line_id) q)
         or (l ->> 'credited_qty')::numeric > v_rl.qty - coalesce((
           select sum(cl.credited_qty) from public.credit_lines cl join public.credits c on c.id = cl.credit_id
           where cl.supplier_return_line_id = v_rl.id and c.status = 'posted'), 0) then
        raise exception 'The credited quantity is more than is awaiting credit' using errcode = 'P0001';
      end if;
    end if;

    insert into public.credit_lines (
      company_id, credit_id, bill_line_id, project_id, heading_id, amount_paisa, cost_paisa,
      supplier_return_line_id, credited_qty, created_by
    ) values (
      v_company, v_id, bl.id, bl.project_id, bl.heading_id, v_amount, v_cost,
      (l ->> 'supplier_return_line_id')::uuid, (l ->> 'credited_qty')::numeric, auth.uid()
    ) returning id into v_line;
    perform private.add_ledger(v_event, 'line:' || v_line, bl.project_id, bl.heading_id, -v_cost, -v_amount, 0);
  end loop;

  -- If the credit pushes settleable below what is settled, unsettle the excess (newest first).
  for v_project in select distinct cl.project_id from public.credit_lines cl where cl.credit_id = v_id loop
    v_excess := private.bill_settled(v_bill, v_project) - private.bill_settleable(v_bill, v_project);
    if v_excess > 0 then
      perform private.unsettle_where(v_bill, null, v_project, v_excess, v_date, p_op_key, 'Credit ' || v_number);
    end if;
  end loop;

  return private.finish_op(v_company, p_op_key, jsonb_build_object('credit_id', v_id, 'number', v_number, 'event_id', v_event));
end $$;

-- ===========================================================================
-- Reversals (design §5.4). The original stays; a reversal is its own dated record.
-- ===========================================================================

create function private.reverse_with_event(
  p_company uuid, p_supplier uuid, p_date date, p_reason text, p_op_key uuid,
  p_bill uuid default null, p_payment uuid default null, p_credit uuid default null, p_opening_balance uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_reversal uuid;
  v_events uuid[];
  v_event uuid;
begin
  insert into public.reversals (company_id, supplier_id, bill_id, payment_id, credit_id, opening_balance_id, reversal_date, reason, created_by)
  values (p_company, p_supplier, p_bill, p_payment, p_credit, p_opening_balance, p_date, p_reason, auth.uid())
  returning id into v_reversal;
  -- A payment's own event plus every allocation move made on it (C8).
  select array_agg(e.id order by e.posted_at, e.id) into v_events
  from public.posting_events e
  where (p_bill is not null and e.bill_id = p_bill and e.event_type = 'bill_post')
     or (p_credit is not null and e.credit_id = p_credit and e.event_type = 'credit_post')
     or (p_opening_balance is not null and e.opening_balance_id = p_opening_balance and e.event_type = 'opening_balance')
     or (p_payment is not null and e.payment_id = p_payment and e.event_type = 'payment_post')
     or (p_payment is not null and e.allocation_event_id in (
           select a.id from public.payment_allocation_events a where a.payment_id = p_payment));
  v_event := private.new_event(p_company, 'reversal', p_supplier, p_date, p_op_key,
    p_reversal => v_reversal, p_reversed_events => v_events);
  perform private.negate_events(v_event, v_events);
  return v_reversal;
end $$;

-- Order: unsettle -> reverse each active credit -> reverse the bill. Cost and payable from
-- the bill then net to exactly zero (C7).
create function public.reverse_bill(p_op_key uuid, p_bill uuid, p_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.supplier_bills;
  v_company uuid := (select company_id from public.supplier_bills where id = p_bill);
  v_prior jsonb;
  v_reason text;
  v_date date := coalesce(p_date, private.today());
  cr record;
  v_reversal uuid;
  v_credit_reversals uuid[] := '{}';
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can reverse bills' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'reverse_bill',
    jsonb_build_object('bill', p_bill, 'date', p_date, 'reason', p_reason));
  if v_prior is not null then
    return v_prior;
  end if;
  v_reason := private.require_reason(p_reason);

  perform private.lock_supplier((select supplier_id from public.supplier_bills where id = p_bill));
  perform 1 from public.payments where id in (select payment_id from public.settlement_events where bill_id = p_bill)
  order by id for update;
  select * into b from public.supplier_bills where id = p_bill for update;
  perform 1 from public.credits where bill_id = p_bill order by id for update;

  if b.status = 'reversed' then
    raise exception 'already_reversed: this bill was already reversed' using errcode = 'P0001';
  end if;
  if b.status <> 'posted' then
    raise exception 'Only a posted bill can be reversed; delete the draft instead' using errcode = 'P0001';
  end if;
  if v_date < b.cost_date or exists (select 1 from public.credits where bill_id = p_bill and status = 'posted' and credit_date > v_date) then
    raise exception 'The reversal cannot be dated before the bill or its credits' using errcode = '22023';
  end if;

  perform private.unsettle_where(p_bill, null, null, null, v_date, p_op_key, 'Bill reversed');
  for cr in select * from public.credits where bill_id = p_bill and status = 'posted' order by id loop
    v_credit_reversals := v_credit_reversals || private.reverse_with_event(
      v_company, b.supplier_id, v_date, 'Bill reversed: ' || v_reason, p_op_key, p_credit => cr.id);
    update public.credits set status = 'reversed' where id = cr.id;
  end loop;
  v_reversal := private.reverse_with_event(v_company, b.supplier_id, v_date, v_reason, p_op_key, p_bill => p_bill);
  update public.supplier_bills set status = 'reversed' where id = p_bill;

  -- C7: everything this bill and its credits wrote now nets to zero.
  if exists (
    select 1 from public.ledger_entries l join public.posting_events e on e.id = l.event_id
    where e.bill_id = p_bill
       or e.credit_id in (select id from public.credits where bill_id = p_bill)
       or e.reversal_id = v_reversal or e.reversal_id = any (v_credit_reversals)
    having sum(l.cost_paisa) <> 0 or sum(l.balance_paisa) <> 0
  ) then
    raise exception 'Bill reversal does not net to zero' using errcode = 'P0001';
  end if;
  return private.finish_op(v_company, p_op_key, jsonb_build_object(
    'reversal_id', v_reversal, 'credit_reversal_ids', to_jsonb(v_credit_reversals)));
end $$;

create function public.reverse_payment(p_op_key uuid, p_payment uuid, p_date date, p_reason text) returns jsonb
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
  perform private.lock_supplier((select supplier_id from public.payments where id = p_payment));
  select * into p from public.payments where id = p_payment for update;
  perform 1 from public.supplier_bills where id in (select bill_id from public.settlement_events where payment_id = p_payment)
  order by id for update;
  if p.status = 'reversed' then
    raise exception 'already_reversed: this payment was already reversed' using errcode = 'P0001';
  end if;
  if v_date < p.payment_date then
    raise exception 'The reversal cannot be dated before the payment' using errcode = '22023';
  end if;

  perform private.unsettle_where(null, p_payment, null, null, v_date, p_op_key, 'Payment reversed');
  v_reversal := private.reverse_with_event(v_company, p.supplier_id, v_date, v_reason, p_op_key, p_payment => p_payment);
  update public.payments set status = 'reversed' where id = p_payment;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('reversal_id', v_reversal));
end $$;

-- Allowed while the bill is still active; settleable goes back up.
create function public.reverse_credit(p_op_key uuid, p_credit uuid, p_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cr public.credits;
  v_company uuid := (select company_id from public.credits where id = p_credit);
  v_prior jsonb;
  v_reason text;
  v_date date := coalesce(p_date, private.today());
  v_reversal uuid;
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can reverse credits' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'reverse_credit',
    jsonb_build_object('credit', p_credit, 'date', p_date, 'reason', p_reason));
  if v_prior is not null then
    return v_prior;
  end if;
  v_reason := private.require_reason(p_reason);
  perform private.lock_supplier((select supplier_id from public.credits where id = p_credit));
  perform 1 from public.supplier_bills where id = (select bill_id from public.credits where id = p_credit) for update;
  select * into cr from public.credits where id = p_credit for update;
  if cr.status = 'reversed' then
    raise exception 'already_reversed: this credit was already reversed' using errcode = 'P0001';
  end if;
  if (select status from public.supplier_bills where id = cr.bill_id) <> 'posted' then
    raise exception 'The bill for this credit is reversed' using errcode = 'P0001';
  end if;
  if v_date < cr.credit_date then
    raise exception 'The reversal cannot be dated before the credit' using errcode = '22023';
  end if;
  v_reversal := private.reverse_with_event(v_company, cr.supplier_id, v_date, v_reason, p_op_key, p_credit => p_credit);
  update public.credits set status = 'reversed' where id = p_credit;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('reversal_id', v_reversal));
end $$;

create function public.reverse_opening_balance(p_op_key uuid, p_opening_balance uuid, p_date date, p_reason text) returns jsonb
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
  perform private.lock_supplier((select supplier_id from public.party_opening_balances where id = p_opening_balance));
  select * into ob from public.party_opening_balances where id = p_opening_balance for update;
  if ob.status = 'reversed' then
    raise exception 'already_reversed: this opening balance was already reversed' using errcode = 'P0001';
  end if;
  if v_date < ob.cutover_date then
    raise exception 'The reversal cannot be dated before the cutover date' using errcode = '22023';
  end if;
  v_reversal := private.reverse_with_event(v_company, ob.supplier_id, v_date, private.require_reason(p_reason), p_op_key,
    p_opening_balance => p_opening_balance);
  update public.party_opening_balances set status = 'reversed' where id = p_opening_balance;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('reversal_id', v_reversal));
end $$;

-- ===========================================================================
-- Reading: summaries, balances, khata. All run as the caller, so RLS decides
-- what is included (design §3.4 point 3).
-- ===========================================================================

create view public.bill_summaries with (security_invoker = true) as
  select
    b.id, b.company_id, b.supplier_id, b.bill_no, b.bill_date, b.cost_date, b.due_date, b.status,
    b.vat_treatment, b.created_by, b.created_at, b.posted_at,
    c.total_paisa,
    (select coalesce(sum(l.amount_paisa), 0) from public.bill_lines l where l.bill_id = b.id)::bigint as lines_paisa,
    (select coalesce(sum(l.payable_amount_paisa), 0) from public.bill_lines l where l.bill_id = b.id)::bigint as payable_paisa,
    (select coalesce(sum(cl.amount_paisa), 0) from public.credit_lines cl join public.credits cr on cr.id = cl.credit_id
      where cr.bill_id = b.id and cr.status = 'posted')::bigint as credited_paisa,
    (select coalesce(sum(s.amount_paisa), 0) from public.settlement_events s where s.bill_id = b.id)::bigint as settled_paisa,
    (select coalesce(array_agg(distinct l.project_id), '{}') from public.bill_lines l where l.bill_id = b.id) as project_ids
  from public.supplier_bills b
  left join public.supplier_bill_charges c on c.id = b.id;

create view public.payment_summaries with (security_invoker = true) as
  select
    p.id, p.company_id, p.number, p.supplier_id, p.payment_date, p.amount_paisa, p.method, p.reference,
    p.notes, p.status, p.posted_at, p.created_by,
    (select coalesce(sum(e.amount_paisa), 0) from public.payment_allocation_events e where e.payment_id = p.id)::bigint as allocated_paisa,
    (select coalesce(sum(s.amount_paisa), 0) from public.settlement_events s where s.payment_id = p.id)::bigint as settled_paisa
  from public.payments p;

-- Open bills (still owed) and payment money not yet matched, per project, for one supplier.
create function public.supplier_open_items(p_supplier uuid)
returns table (kind text, doc_id uuid, label text, doc_date date, project_id uuid, amount_paisa bigint)
language sql stable security invoker set search_path = '' as $$
  select * from (
    select 'bill'::text, b.id, b.bill_no, b.bill_date, l.project_id,
      private.bill_settleable(b.id, l.project_id) - private.bill_settled(b.id, l.project_id)
    from public.supplier_bills b
    join (select distinct x.bill_id, x.project_id from public.bill_lines x) l on l.bill_id = b.id
    where b.supplier_id = p_supplier and b.status = 'posted'
    union all
    select 'payment', p.id, p.number, p.payment_date, e.project_id,
      private.payment_allocated(p.id, e.project_id) - private.payment_settled(p.id, e.project_id)
    from public.payments p
    join (select distinct x.payment_id, x.project_id from public.payment_allocation_events x) e on e.payment_id = p.id
    where p.supplier_id = p_supplier and p.status = 'posted'
    union all
    select 'unallocated', p.id, p.number, p.payment_date, null::uuid,
      p.amount_paisa - (select coalesce(sum(x.amount_paisa), 0) from public.payment_allocation_events x where x.payment_id = p.id)
    from public.payments p
    where p.supplier_id = p_supplier and p.status = 'posted' and private.can_post(p.company_id)
  ) t (kind, doc_id, label, doc_date, project_id, amount_paisa)
  where amount_paisa > 0
  order by doc_date, label
$$;

-- Cost, cash and payable for a project as of a date (req §19, §19.1).
-- p_as_known also requires posted_at on or before that day, so past reports reproduce.
create function public.project_cost_summary(p_project uuid, p_as_of date default null, p_as_known boolean default false)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_as_of date := coalesce(p_as_of, private.today());
  v_cutoff timestamptz := ((v_as_of + 1)::timestamp at time zone 'Asia/Kathmandu');
  v_totals record;
  v_by_heading jsonb;
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

  select count(*) into v_unbilled
  from public.delivery_line_status s join public.deliveries d on d.id = s.delivery_id
  where s.project_id = p_project and s.billable_qty > 0 and d.receipt_date <= v_as_of;

  return jsonb_build_object(
    'as_of', v_as_of,
    'view', case when p_as_known then 'as_known' else 'current' end,
    'cost_paisa', v_totals.cost,
    'cash_paid_paisa', v_totals.cash,
    'payable_paisa', v_totals.balance,
    'by_heading', v_by_heading,
    'unbilled_delivery_lines', v_unbilled
  );
end $$;

-- Per supplier: what was charged, paid, and is owed. Company-level figures (unallocated,
-- opening balances) are included only for Admin and Accounts (design §3.4 point 4).
create function public.supplier_balances(p_company uuid, p_as_of date default null)
returns table (
  supplier_id uuid, supplier_name text, active boolean,
  charged_paisa bigint, paid_paisa bigint, project_balance_paisa bigint, unallocated_paisa bigint,
  balance_paisa bigint, company_level boolean
)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.name, s.active,
    coalesce(sum(l.balance_paisa) filter (where l.cash_paisa = 0), 0)::bigint,
    coalesce(sum(l.cash_paisa), 0)::bigint,
    coalesce(sum(l.balance_paisa) filter (where l.project_id is not null), 0)::bigint,
    coalesce(sum(l.balance_paisa) filter (where l.project_id is null), 0)::bigint,
    coalesce(sum(l.balance_paisa), 0)::bigint,
    private.can_post(p_company)
  from public.suppliers s
  left join public.ledger_entries l
    on l.supplier_id = s.id and l.business_date <= coalesce(p_as_of, private.today())
  where s.company_id = p_company
  group by s.id, s.name, s.active
  order by s.name
$$;

-- Document label for a khata row. Labels only (no amounts).
create function private.event_label(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.posting_events;
  r public.reversals;
  v_label text;
  v_bill uuid;
  v_payment uuid;
  v_credit uuid;
begin
  select * into e from public.posting_events where id = p_event;
  if not found or not private.can_see_finance(e.company_id) then
    return null;
  end if;
  if e.event_type = 'reversal' then
    select * into r from public.reversals where id = e.reversal_id;
    v_bill := r.bill_id; v_payment := r.payment_id; v_credit := r.credit_id;
  elsif e.event_type = 'allocation_move' then
    select a.payment_id into v_payment from public.payment_allocation_events a where a.id = e.allocation_event_id;
  else
    v_bill := e.bill_id; v_payment := e.payment_id; v_credit := e.credit_id;
  end if;
  v_label := coalesce(
    (select 'Bill ' || b.bill_no from public.supplier_bills b where b.id = v_bill),
    (select 'Payment ' || p.number from public.payments p where p.id = v_payment),
    (select 'Credit ' || c.number from public.credits c where c.id = v_credit),
    case when e.event_type = 'opening_balance' or r.opening_balance_id is not null then 'Opening balance' end
  );
  v_label := case e.event_type
    when 'reversal' then 'Reversal of ' || lower(left(v_label, 1)) || substr(v_label, 2)
    when 'allocation_move' then 'Allocation change, ' || lower(left(v_label, 1)) || substr(v_label, 2)
    else v_label end;
  return jsonb_build_object('label', v_label, 'bill_id', v_bill, 'payment_id', v_payment, 'credit_id', v_credit,
    'reason', r.reason);
end $$;

-- Supplier khata (ledger statement): one row per posting, with a running balance.
-- p_project limits it to one project; otherwise it covers what the caller can see.
create function public.supplier_khata(
  p_supplier uuid, p_from date default null, p_to date default null, p_project uuid default null
)
returns table (
  event_id uuid, business_date date, posted_at timestamptz, event_type text, label text, reason text,
  bill_id uuid, payment_id uuid, credit_id uuid, project_id uuid,
  cost_paisa bigint, balance_paisa bigint, cash_paisa bigint, running_balance_paisa bigint
)
language sql stable security invoker set search_path = '' as $$
  with rows as (
    select l.* from public.ledger_entries l
    where l.supplier_id = p_supplier
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
    null::uuid, null::uuid, null::uuid, p_project, 0::bigint, o.b, 0::bigint, o.b
  from opening o where p_from is not null
  union all
  select ev.event_id, ev.business_date, ev.posted_at, ev.event_type, lbl ->> 'label', lbl ->> 'reason',
    (lbl ->> 'bill_id')::uuid, (lbl ->> 'payment_id')::uuid, (lbl ->> 'credit_id')::uuid, ev.project_id,
    ev.cost, ev.balance, ev.cash,
    ((select o.b from opening o) + sum(ev.balance) over (order by ev.business_date, ev.posted_at, ev.event_id))::bigint
  from ev cross join lateral private.event_label(ev.event_id) lbl
  order by 2 nulls first, 3 nulls first, 1 nulls first
$$;

-- Per-project position of one bill: payable, credited, matched, still owed.
create function public.bill_project_status(p_bill uuid)
returns table (project_id uuid, payable_paisa bigint, credited_paisa bigint, settled_paisa bigint, outstanding_paisa bigint)
language sql stable security invoker set search_path = '' as $$
  select l.project_id,
    sum(l.payable_amount_paisa)::bigint,
    (sum(l.payable_amount_paisa) - private.bill_settleable(p_bill, l.project_id))::bigint,
    private.bill_settled(p_bill, l.project_id),
    (private.bill_settleable(p_bill, l.project_id) - private.bill_settled(p_bill, l.project_id))::bigint
  from public.bill_lines l
  where l.bill_id = p_bill
  group by l.project_id
$$;

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

revoke execute on function
  private.begin_op(uuid, uuid, text, jsonb),
  private.finish_op(uuid, uuid, jsonb),
  private.new_event(uuid, text, uuid, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid[]),
  private.add_ledger(uuid, text, uuid, uuid, bigint, bigint, bigint),
  private.negate_events(uuid, uuid[]),
  private.lock_supplier(uuid),
  private.settle_one(uuid, uuid, uuid, bigint, date, uuid, text),
  private.unsettle_where(uuid, uuid, uuid, bigint, date, uuid, text),
  private.reverse_with_event(uuid, uuid, date, text, uuid, uuid, uuid, uuid, uuid),
  private.notify(uuid, uuid, text, uuid, text, text)
from public, anon, authenticated;
