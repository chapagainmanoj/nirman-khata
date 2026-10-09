-- NirmanKhata milestone 2 review fixes (2026-10-11).
-- Applied as a new migration; earlier migrations stay as they ran.

-- ---------------------------------------------------------------------------
-- 1. Reversals and posting events: only for people who can see the money they moved.
--    Admin/Accounts see all; others see an event only when they can see one of its
--    ledger rows (ledger_entries RLS already limits rows to their projects).
-- ---------------------------------------------------------------------------
drop policy posting_events_select on public.posting_events;
create policy posting_events_select on public.posting_events for select to authenticated
  using (
    private.sees_all_projects(company_id)
    or (private.can_see_finance(company_id)
        and exists (select 1 from public.ledger_entries l where l.event_id = posting_events.id))
  );
drop policy reversals_select on public.reversals;
create policy reversals_select on public.reversals for select to authenticated
  using (
    private.sees_all_projects(company_id)
    or (private.can_see_finance(company_id)
        and exists (select 1 from public.posting_events e where e.reversal_id = reversals.id))
  );

-- ---------------------------------------------------------------------------
-- 2. Document numbers are only taken by the functions that create documents,
--    so PAY-/CN- numbers have no gaps from direct calls.
-- ---------------------------------------------------------------------------
revoke execute on function public.next_doc_number(uuid, text, text) from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Slip state changes check permissions after taking the slip lock, so a delivery
--    being recorded and a cancel or close cannot both succeed.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_slip(p_slip uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_perm jsonb;
begin
  perform 1 from public.order_slips where id = p_slip for update;
  v_perm := public.slip_permissions(p_slip);
  if v_perm is null or not (v_perm ->> 'can_cancel')::boolean then
    raise exception 'This slip cannot be cancelled' using errcode = '42501';
  end if;
  update public.order_slips set status = 'cancelled', cancelled_reason = private.require_reason(p_reason)
  where id = p_slip;
end $$;

create or replace function public.mark_slip_sent(p_slip uuid, p_via text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_perm jsonb;
begin
  perform 1 from public.order_slips where id = p_slip for update;
  v_perm := public.slip_permissions(p_slip);
  if v_perm is null or not (v_perm ->> 'can_share')::boolean then
    raise exception 'You need access to every project on this slip to share it' using errcode = '42501';
  end if;
  update public.order_slips
  set sent_at = coalesce(sent_at, now()), sent_by = coalesce(sent_by, auth.uid()), sent_via = p_via
  where id = p_slip;
end $$;

create or replace function public.close_slip_short(p_slip uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_perm jsonb;
begin
  perform 1 from public.order_slips where id = p_slip for update;
  v_perm := public.slip_permissions(p_slip);
  if v_perm is null or not (v_perm ->> 'can_close_short')::boolean then
    raise exception 'This slip cannot be closed short' using errcode = '42501';
  end if;
  update public.order_slips
  set closed_short_at = now(), closed_by = auth.uid(), closed_short_reason = private.require_reason(p_reason)
  where id = p_slip;
end $$;

-- Deliveries hold a share lock on the slip while they are recorded (see 3).
-- p_delivery: {id, supplier_id, project_id, slip_id, challan_no, receipt_date, no_slip_reason, note,
--   lines: [{id, slip_line_id, material_id | material_text, spec, unit_id, unit_note, received_qty, rejected_qty, issue, note}]}
-- Retrying with the same id returns the existing delivery.
create or replace function public.record_delivery(p_delivery jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_delivery ->> 'id')::uuid;
  v_project uuid := (p_delivery ->> 'project_id')::uuid;
  v_supplier uuid := (p_delivery ->> 'supplier_id')::uuid;
  v_slip uuid := (p_delivery ->> 'slip_id')::uuid;
  v_company uuid;
  v_date date := coalesce((p_delivery ->> 'receipt_date')::date, private.today());
  s public.order_slips;
  sl public.order_slip_lines;
  d public.deliveries;
  l jsonb;
  v_order integer := 0;
  v_material uuid;
  v_unit uuid;
begin
  if v_id is null then
    raise exception 'Delivery id is required' using errcode = '22023';
  end if;
  select company_id into v_company from public.projects where id = v_project;
  if v_company is null or not private.can_work_on_project(v_company, v_project) then
    raise exception 'You cannot record deliveries for this project' using errcode = '42501';
  end if;

  select * into d from public.deliveries where id = v_id;
  if found then
    if d.created_by = auth.uid() and d.company_id = v_company then
      return v_id; -- retry of a delivery that was already saved
    end if;
    raise exception 'Delivery id already used' using errcode = 'P0001';
  end if;

  if v_date > private.today() then
    raise exception 'The receipt date cannot be in the future' using errcode = '22023';
  end if;
  if not exists (select 1 from public.suppliers x where x.id = v_supplier and x.company_id = v_company) then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_delivery -> 'lines') is distinct from 'array' or jsonb_array_length(p_delivery -> 'lines') = 0 then
    raise exception 'Add at least one delivered item' using errcode = '22023';
  end if;
  if v_slip is not null then
    select * into s from public.order_slips where id = v_slip and company_id = v_company for share;
    if not found or s.status <> 'approved' then
      raise exception 'Deliveries can only be recorded against an approved slip' using errcode = 'P0001';
    end if;
    if s.closed_short_at is not null then
      raise exception 'This slip is closed' using errcode = 'P0001';
    end if;
    if s.supplier_id <> v_supplier then
      raise exception 'The delivery supplier must match the slip supplier' using errcode = 'P0001';
    end if;
  end if;

  insert into public.deliveries (
    company_id, id, supplier_id, project_id, slip_id, challan_no, receipt_date, received_by, no_slip_reason, note
  ) values (
    v_company, v_id, v_supplier, v_project, v_slip, nullif(trim(p_delivery ->> 'challan_no'), ''), v_date,
    auth.uid(), nullif(trim(p_delivery ->> 'no_slip_reason'), ''), p_delivery ->> 'note'
  );

  for l in select * from jsonb_array_elements(p_delivery -> 'lines') loop
    v_order := v_order + 1;
    v_material := (l ->> 'material_id')::uuid;
    v_unit := (l ->> 'unit_id')::uuid;
    if (l ->> 'slip_line_id') is not null then
      select * into sl from public.order_slip_lines where id = (l ->> 'slip_line_id')::uuid;
      if not found or v_slip is null or sl.slip_id <> v_slip then
        raise exception 'A delivered item refers to a line from another slip' using errcode = 'P0001';
      end if;
      if sl.project_id <> v_project then
        raise exception 'A delivered item belongs to another project on this slip' using errcode = 'P0001';
      end if;
      v_material := coalesce(v_material, sl.material_id);
      v_unit := coalesce(v_unit, sl.unit_id);
      if v_unit <> sl.unit_id then
        raise exception 'Use the same unit as the slip (no unit conversion in v1)' using errcode = 'P0001';
      end if;
      if v_material is distinct from sl.material_id then
        raise exception 'A delivered item has a different material from its slip line' using errcode = 'P0001';
      end if;
    end if;
    perform private.check_unit_note(v_unit, coalesce(l ->> 'unit_note', sl.unit_note));
    insert into public.delivery_lines (
      company_id, id, delivery_id, slip_line_id, material_id, material_text, spec, unit_id, unit_note,
      received_qty, rejected_qty, issue, note, sort_order
    ) values (
      v_company, coalesce((l ->> 'id')::uuid, gen_random_uuid()), v_id, (l ->> 'slip_line_id')::uuid, v_material,
      coalesce(nullif(trim(l ->> 'material_text'), ''), case when (l ->> 'slip_line_id') is not null then sl.material_text end),
      coalesce(l ->> 'spec', case when (l ->> 'slip_line_id') is not null then sl.spec end),
      v_unit, coalesce(nullif(trim(l ->> 'unit_note'), ''), case when (l ->> 'slip_line_id') is not null then sl.unit_note end),
      (l ->> 'received_qty')::numeric, coalesce((l ->> 'rejected_qty')::numeric, 0),
      (l ->> 'issue')::public.delivery_issue, l ->> 'note', v_order
    );
    sl := null;
  end loop;
  return v_id;
end $$;

-- 4. Expected rates survive an edit by someone who cannot see rates.
-- Create or replace a draft slip and its lines. p_slip:
-- {id, supplier_id, request_date, required_date, delivery_instructions, site_contact, notes,
--  lines: [{id, project_id, material_id | material_text, spec, qty, unit_id, unit_note, note, est_rate_paisa}]}
create or replace function public.save_slip_draft(p_slip jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_slip ->> 'id')::uuid;
  v_supplier uuid := (p_slip ->> 'supplier_id')::uuid;
  v_company uuid;
  s public.order_slips;
  l jsonb;
  v_line uuid;
  v_project uuid;
  v_order integer := 0;
  v_rates jsonb;
begin
  if v_id is null then
    raise exception 'Slip id is required' using errcode = '22023';
  end if;
  select company_id into v_company from public.suppliers where id = v_supplier and active;
  if v_company is null or not private.is_member(v_company) then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_slip -> 'lines') is distinct from 'array' then
    raise exception 'Slip lines are required' using errcode = '22023';
  end if;

  select * into s from public.order_slips where id = v_id for update;
  if found then
    if s.company_id <> v_company or not private.can_edit_slip(v_id) then
      raise exception 'You cannot edit this slip' using errcode = '42501';
    end if;
    if s.status not in ('draft', 'rejected') then
      raise exception 'Only a draft or rejected slip can be edited' using errcode = 'P0001';
    end if;
    update public.order_slips set
      supplier_id = v_supplier,
      request_date = coalesce((p_slip ->> 'request_date')::date, request_date),
      required_date = (p_slip ->> 'required_date')::date,
      delivery_instructions = p_slip ->> 'delivery_instructions',
      site_contact = p_slip ->> 'site_contact',
      notes = p_slip ->> 'notes',
      status = 'draft'
    where id = v_id;
  else
    if not exists (
      select 1 from public.memberships m
      where m.company_id = v_company and m.user_id = auth.uid() and m.active
        and m.roles && array['admin', 'project_manager', 'site_staff', 'accounts']::public.app_role[]
    ) then
      raise exception 'You cannot create slips' using errcode = '42501';
    end if;
    insert into public.order_slips (
      company_id, id, number, supplier_id, request_date, required_date, delivery_instructions, site_contact, notes
    ) values (
      v_company, v_id, public.next_doc_number(v_company, 'order_slip', 'OS'), v_supplier,
      coalesce((p_slip ->> 'request_date')::date, private.today()), (p_slip ->> 'required_date')::date,
      p_slip ->> 'delivery_instructions', p_slip ->> 'site_contact', p_slip ->> 'notes'
    );
  end if;

  -- Callers who cannot see rates send none; keep the rates already entered for their lines.
  if not private.can_see_finance(v_company) then
    select jsonb_object_agg(p.id, p.est_rate_paisa) into v_rates
    from public.order_slip_line_prices p join public.order_slip_lines l on l.id = p.id
    where l.slip_id = v_id;
  end if;
  delete from public.order_slip_lines where slip_id = v_id;
  for l in select * from jsonb_array_elements(p_slip -> 'lines') loop
    v_order := v_order + 1;
    v_project := (l ->> 'project_id')::uuid;
    if not private.can_work_on_project(v_company, v_project) then
      raise exception 'You can only order for projects you are assigned to' using errcode = '42501';
    end if;
    perform private.check_unit_note((l ->> 'unit_id')::uuid, l ->> 'unit_note');
    insert into public.order_slip_lines (
      company_id, id, slip_id, project_id, material_id, material_text, spec, qty, unit_id, unit_note, note, sort_order
    ) values (
      v_company, coalesce((l ->> 'id')::uuid, gen_random_uuid()), v_id, v_project, (l ->> 'material_id')::uuid,
      nullif(trim(l ->> 'material_text'), ''), l ->> 'spec', (l ->> 'qty')::numeric, (l ->> 'unit_id')::uuid,
      nullif(trim(l ->> 'unit_note'), ''), l ->> 'note', v_order
    ) returning id into v_line;
    if (l ->> 'est_rate_paisa') is not null then
      if not private.can_see_finance(v_company) then
        raise exception 'You cannot enter rates' using errcode = '42501';
      end if;
      insert into public.order_slip_line_prices (company_id, id, est_rate_paisa)
      values (v_company, v_line, (l ->> 'est_rate_paisa')::bigint);
    elsif v_rates ? v_line::text then
      insert into public.order_slip_line_prices (company_id, id, est_rate_paisa)
      values (v_company, v_line, (v_rates ->> v_line::text)::bigint);
    end if;
  end loop;

  select * into s from public.order_slips where id = v_id;
  return jsonb_build_object('id', s.id, 'number', s.number, 'status', s.status);
end $$;

-- 5. A return is dated between the delivery and today.
-- Physical return: quantities only, never cost or payable (req §20, design §5.5).
-- p_return: {id, supplier_id, project_id, return_date, note, lines: [{id, delivery_line_id, qty, note}]}
create or replace function public.record_return(p_return jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_return ->> 'id')::uuid;
  v_project uuid := (p_return ->> 'project_id')::uuid;
  v_supplier uuid := (p_return ->> 'supplier_id')::uuid;
  v_company uuid;
  v_date date := coalesce((p_return ->> 'return_date')::date, private.today());
  r public.supplier_returns;
  l jsonb;
  v_dl record;
begin
  if v_id is null then
    raise exception 'Return id is required' using errcode = '22023';
  end if;
  select company_id into v_company from public.projects where id = v_project;
  if v_company is null or not private.can_work_on_project(v_company, v_project) then
    raise exception 'You cannot record returns for this project' using errcode = '42501';
  end if;
  select * into r from public.supplier_returns where id = v_id;
  if found then
    if r.created_by = auth.uid() then return v_id; end if;
    raise exception 'Return id already used' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_return -> 'lines') is distinct from 'array' or jsonb_array_length(p_return -> 'lines') = 0 then
    raise exception 'Add at least one returned item' using errcode = '22023';
  end if;
  if v_date > private.today() then
    raise exception 'The return date cannot be in the future' using errcode = '22023';
  end if;

  -- Lock order: party first, then delivery lines (design §5.2).
  perform 1 from public.suppliers where id = v_supplier and company_id = v_company for update;
  if not found then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;
  perform 1 from public.delivery_lines
  where id in (select (x ->> 'delivery_line_id')::uuid from jsonb_array_elements(p_return -> 'lines') x)
  order by id for update;

  insert into public.supplier_returns (company_id, id, supplier_id, project_id, return_date, note)
  values (v_company, v_id, v_supplier, v_project, v_date, p_return ->> 'note');

  for l in select * from jsonb_array_elements(p_return -> 'lines') loop
    select dl.id, d.supplier_id, d.project_id, d.receipt_date into v_dl
    from public.delivery_lines dl join public.deliveries d on d.id = dl.delivery_id
    where dl.id = (l ->> 'delivery_line_id')::uuid and dl.company_id = v_company;
    if v_dl.id is null or v_dl.supplier_id <> v_supplier or v_dl.project_id <> v_project then
      raise exception 'A returned item is not from this supplier and project' using errcode = 'P0001';
    end if;
    if v_date < v_dl.receipt_date then
      raise exception 'The return date is before the goods were received' using errcode = '22023';
    end if;
    if (l ->> 'qty')::numeric > (
      select q.accepted_qty - q.returned_qty from private.delivery_line_qty(v_dl.id) q
    ) then
      raise exception 'You cannot return more than was accepted' using errcode = 'P0001';
    end if;
    insert into public.supplier_return_lines (company_id, id, return_id, delivery_line_id, qty, note)
    values (v_company, coalesce((l ->> 'id')::uuid, gen_random_uuid()), v_id, v_dl.id, (l ->> 'qty')::numeric, l ->> 'note');
  end loop;
  return v_id;
end $$;

-- 6. One settle call covers one supplier, so the supplier lock covers all of it.
create or replace function public.settle(p_op_key uuid, p_items jsonb) returns jsonb
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
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    left join public.supplier_bills b on b.id = (x ->> 'bill_id')::uuid
    where b.supplier_id is distinct from v_supplier
  ) then
    raise exception 'Match one supplier at a time' using errcode = 'P0001';
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
