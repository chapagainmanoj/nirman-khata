-- Paper first (UX review, flow A): site staff photograph a bill before anyone types it.
-- A draft bill may be saved with only a supplier, and sent to Accounts with just its photo;
-- Accounts types the number and lines from the photo. The number is needed before posting. Accounts can record the total printed on the paper bill, and
-- posting is blocked while the lines and charges do not add up to it.

alter table public.supplier_bills drop constraint supplier_bills_bill_no_check;
alter table public.supplier_bills alter column bill_no drop not null;
alter table public.supplier_bills add constraint supplier_bills_bill_no_check
  check (bill_no is null or length(trim(bill_no)) > 0);
alter table public.supplier_bills add constraint supplier_bills_number_before_posting
  check (status in ('draft', 'under_review') or bill_no is not null);

alter table public.supplier_bill_charges
  add column paper_total_paisa bigint check (paper_total_paisa is null or paper_total_paisa >= 0);

-- p_bill as before; bill_no may be empty on a draft; paper_total_paisa is optional.
create or replace function public.save_bill_draft(p_bill jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_bill ->> 'id')::uuid;
  v_supplier uuid := (p_bill ->> 'supplier_id')::uuid;
  v_company uuid;
  b public.supplier_bills;
  l jsonb;
  m jsonb;
  o jsonb;
  v_line uuid;
  v_project uuid;
  v_type public.bill_line_type;
  v_material uuid;
  v_heading uuid;
  v_unit uuid;
  v_amount bigint;
  v_order integer := 0;
  v_dl record;
begin
  if v_id is null then
    raise exception 'Bill id is required' using errcode = '22023';
  end if;
  select company_id into v_company from public.suppliers where id = v_supplier;
  if v_company is null or not private.is_member(v_company) then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;

  select * into b from public.supplier_bills where id = v_id for update;
  if found then
    if b.company_id <> v_company or not private.can_edit_bill(v_id) then
      raise exception 'You cannot edit this bill' using errcode = '42501';
    end if;
    update public.supplier_bills set
      supplier_id = v_supplier,
      bill_no = nullif(trim(p_bill ->> 'bill_no'), ''),
      bill_date = coalesce((p_bill ->> 'bill_date')::date, bill_date),
      cost_date = coalesce((p_bill ->> 'cost_date')::date, (p_bill ->> 'bill_date')::date, cost_date),
      due_date = (p_bill ->> 'due_date')::date,
      notes = p_bill ->> 'notes'
    where id = v_id;
  else
    if not exists (
      select 1 from public.memberships mm
      where mm.company_id = v_company and mm.user_id = auth.uid() and mm.active
        and mm.roles && array['admin', 'project_manager', 'site_staff', 'accounts']::public.app_role[]
    ) then
      raise exception 'You cannot enter bills' using errcode = '42501';
    end if;
    insert into public.supplier_bills (
      company_id, id, supplier_id, bill_no, bill_date, cost_date, due_date, vat_treatment, notes
    ) values (
      v_company, v_id, v_supplier, nullif(trim(p_bill ->> 'bill_no'), ''),
      coalesce((p_bill ->> 'bill_date')::date, private.today()),
      coalesce((p_bill ->> 'cost_date')::date, (p_bill ->> 'bill_date')::date, private.today()),
      (p_bill ->> 'due_date')::date,
      (select c.vat_treatment from public.companies c where c.id = v_company), -- copied once (I-3)
      p_bill ->> 'notes'
    );
  end if;

  insert into public.supplier_bill_charges (company_id, id, discount_paisa, transport_paisa, vat_paisa, vat_rate_pct, paper_total_paisa)
  values (
    v_company, v_id,
    coalesce((p_bill ->> 'discount_paisa')::bigint, 0), coalesce((p_bill ->> 'transport_paisa')::bigint, 0),
    coalesce((p_bill ->> 'vat_paisa')::bigint, 0), coalesce((p_bill ->> 'vat_rate_pct')::numeric, 13),
    (p_bill ->> 'paper_total_paisa')::bigint
  )
  on conflict (id) do update set
    discount_paisa = excluded.discount_paisa, transport_paisa = excluded.transport_paisa,
    vat_paisa = excluded.vat_paisa, vat_rate_pct = excluded.vat_rate_pct, paper_total_paisa = excluded.paper_total_paisa;

  delete from public.bill_lines where bill_id = v_id; -- matches cascade
  for l in select * from jsonb_array_elements(coalesce(p_bill -> 'lines', '[]'::jsonb)) loop
    v_order := v_order + 1;
    v_project := (l ->> 'project_id')::uuid;
    v_type := coalesce((l ->> 'line_type')::public.bill_line_type, 'material');
    v_material := (l ->> 'material_id')::uuid;
    v_unit := (l ->> 'unit_id')::uuid;
    if not private.can_work_on_project(v_company, v_project) then
      raise exception 'You can only enter bill lines for projects you are assigned to' using errcode = '42501';
    end if;
    v_heading := coalesce(
      (l ->> 'heading_id')::uuid,
      (select mt.default_heading_id from public.materials mt where mt.id = v_material and mt.company_id = v_company)
    );
    if v_heading is null then
      raise exception 'Every bill line needs a cost heading' using errcode = '22023';
    end if;
    v_amount := coalesce(
      (l ->> 'amount_paisa')::bigint,
      round((l ->> 'qty')::numeric * (l ->> 'rate_paisa')::numeric)::bigint
    );
    if v_amount is null then
      raise exception 'Every bill line needs an amount' using errcode = '22023';
    end if;
    if v_unit is not null then
      perform private.check_unit_note(v_unit, l ->> 'unit_note');
    end if;
    insert into public.bill_lines (
      company_id, id, bill_id, line_type, project_id, heading_id, material_id, description, qty, unit_id,
      unit_note, rate_paisa, amount_paisa, unmatched_reason, rate_variance_reason, sort_order
    ) values (
      v_company, coalesce((l ->> 'id')::uuid, gen_random_uuid()), v_id, v_type, v_project, v_heading, v_material,
      nullif(trim(l ->> 'description'), ''), (l ->> 'qty')::numeric, v_unit, nullif(trim(l ->> 'unit_note'), ''),
      (l ->> 'rate_paisa')::bigint, v_amount, nullif(trim(l ->> 'unmatched_reason'), ''),
      nullif(trim(l ->> 'rate_variance_reason'), ''), v_order
    ) returning id into v_line;

    for m in select * from jsonb_array_elements(coalesce(l -> 'matches', '[]'::jsonb)) loop
      -- M2: same supplier, project, material and unit.
      select dl.id, dl.material_id, dl.unit_id, d.supplier_id, d.project_id into v_dl
      from public.delivery_lines dl join public.deliveries d on d.id = dl.delivery_id
      where dl.id = (m ->> 'delivery_line_id')::uuid and dl.company_id = v_company;
      if v_dl.id is null then
        raise exception 'Delivery not found' using errcode = 'P0002';
      end if;
      if v_type <> 'material' then
        raise exception 'Only material lines are matched to deliveries' using errcode = 'P0001';
      end if;
      if v_dl.supplier_id <> v_supplier or v_dl.project_id <> v_project
         or v_material is null or v_dl.material_id is distinct from v_material or v_dl.unit_id <> v_unit then
        raise exception 'A delivery can only be matched to a bill line with the same supplier, project, material and unit'
          using errcode = 'P0001';
      end if;
      insert into public.bill_line_delivery_lines (company_id, bill_line_id, delivery_line_id, project_id, billed_qty)
      values (v_company, v_line, v_dl.id, v_project, (m ->> 'billed_qty')::numeric);
    end loop;
  end loop;

  delete from public.bill_charge_overrides where bill_id = v_id;
  for o in select * from jsonb_array_elements(coalesce(p_bill -> 'overrides', '[]'::jsonb)) loop
    insert into public.bill_charge_overrides (company_id, bill_id, charge, project_id, amount_paisa)
    values (v_company, v_id, (o ->> 'charge')::public.bill_charge, (o ->> 'project_id')::uuid, (o ->> 'amount_paisa')::bigint);
  end loop;

  return jsonb_build_object('id', v_id, 'status', (select status from public.supplier_bills where id = v_id));
end $$;

-- The line checks stay as they were; the header checks are added around them.
alter function private.bill_checks(uuid) rename to bill_line_checks;

create function private.bill_checks(p_bill uuid)
returns table (line_id uuid, code text, severity text, message text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  b public.supplier_bills;
  v_paper bigint;
  v_total bigint;
begin
  select * into b from public.supplier_bills x where x.id = p_bill;
  if b.bill_no is null then
    line_id := null; code := 'no_bill_no'; severity := 'error';
    message := 'Enter the bill number from the paper bill';
    return next;
  end if;
  if not exists (select 1 from public.bill_lines x where x.bill_id = p_bill) then
    line_id := null; code := 'no_lines'; severity := 'error';
    message := 'Add the lines from the paper bill';
    return next;
  end if;

  select c.paper_total_paisa into v_paper from public.supplier_bill_charges c where c.id = p_bill;
  if v_paper is not null then
    begin
      select sum(a.payable) into v_total from private.compute_bill_allocation(p_bill) a;
    exception when sqlstate 'P0001' then
      v_total := null; -- the allocation error is reported on its own
    end;
    if v_total is not null and v_total <> v_paper then
      line_id := null; code := 'paper_total_mismatch'; severity := 'error';
      message := format('Lines and charges add up to Rs. %s but the paper bill says Rs. %s',
        to_char(v_total / 100.0, 'FM999999999990.00'), to_char(v_paper / 100.0, 'FM999999999990.00'));
      return next;
    end if;
  end if;

  return query select * from private.bill_line_checks(p_bill);
end $$;

revoke all on function private.bill_checks(uuid) from public;
revoke all on function private.bill_line_checks(uuid) from public;

-- Sent to Accounts with the number and lines, or with just a photo of the paper bill.
create or replace function public.submit_bill(p_bill uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.supplier_bills;
begin
  select * into b from public.supplier_bills where id = p_bill for update;
  if not found or not private.can_edit_bill(p_bill) then
    raise exception 'You cannot submit this bill' using errcode = '42501';
  end if;
  if b.status <> 'draft' then
    raise exception 'Only a draft bill can be sent for review' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.attachments a where a.bill_id = p_bill and a.uploaded_at is not null and a.removed_at is null
  ) then
    if b.bill_no is null then
      raise exception 'Add the bill photo, or enter the bill number' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.bill_lines l where l.bill_id = p_bill) then
      raise exception 'Add the bill photo, or at least one line' using errcode = 'P0001';
    end if;
  end if;
  update public.supplier_bills set status = 'under_review', submitted_at = now() where id = p_bill;
end $$;
