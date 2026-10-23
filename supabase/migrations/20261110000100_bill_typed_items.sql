-- A delivered item typed under "Other" (no catalog material, req §8.1) can be billed against its
-- delivery: the bill line carries the typed name as its description and no material. M2 now reads
-- "same supplier, project, material (both none counts as the same) and unit". A typed delivery
-- still cannot be matched to a catalog material line, nor a catalog delivery to a typed line.
-- Also: a line with no unit can no longer slip past the unit check (null <> x is null, not true).

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
      -- M2: same supplier, project, material and unit. A typed delivery item (no material)
      -- matches a bill line with no material.
      select dl.id, dl.material_id, dl.unit_id, d.supplier_id, d.project_id into v_dl
      from public.delivery_lines dl join public.deliveries d on d.id = dl.delivery_id
      where dl.id = (m ->> 'delivery_line_id')::uuid and dl.company_id = v_company;
      if v_dl.id is null then
        raise exception 'Delivery not found' using errcode = 'P0002';
      end if;
      if v_type <> 'material' then
        raise exception 'Only material lines are matched to deliveries' using errcode = 'P0001';
      end if;
      if v_dl.supplier_id <> v_supplier or v_dl.project_id is distinct from v_project
         or v_dl.material_id is distinct from v_material or v_dl.unit_id is distinct from v_unit then
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
