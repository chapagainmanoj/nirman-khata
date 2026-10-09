-- NirmanKhata milestone 2: order slips, deliveries, returns, bill drafts.
-- None of these create cost or payable (I-1); posting is in the next migration.
-- Design: docs/technical-design.md sections 3.6, 3.7, 4.4, 5.5.

create function private.today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Kathmandu')::date
$$;

create function private.require_reason(p_reason text, p_what text default 'A reason') returns text
language plpgsql immutable set search_path = '' as $$
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception '% is required', p_what using errcode = '22023';
  end if;
  return trim(p_reason);
end $$;

-- A unit like trip or load must say what vehicle it was (req §3.2).
create function private.check_unit_note(p_unit uuid, p_note text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(trim(p_note), '') = '' and exists (select 1 from public.units u where u.id = p_unit and u.needs_note) then
    raise exception 'Describe the % (vehicle or size) for this unit',
      (select u.name from public.units u where u.id = p_unit) using errcode = '22023';
  end if;
end $$;

create function private.notify(
  p_company uuid, p_user uuid, p_kind text, p_slip uuid, p_title text, p_body text default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (company_id, user_id, kind, slip_id, title, body)
  values (p_company, p_user, p_kind, p_slip, p_title, p_body)
$$;

-- ===========================================================================
-- Quantities (design §4.4, §5.5). Derived, never stored.
-- ===========================================================================

create function private.delivery_line_qty(p_line uuid)
returns table (
  accepted_qty numeric, returned_qty numeric, net_received_qty numeric,
  billed_qty numeric, billable_qty numeric, credited_qty numeric, awaiting_credit_qty numeric
)
language sql stable security definer set search_path = '' as $$
  with dl as (select d.accepted_qty from public.delivery_lines d where d.id = p_line),
  r as (select coalesce(sum(x.qty), 0) q from public.supplier_return_lines x where x.delivery_line_id = p_line),
  b as (
    select coalesce(sum(m.billed_qty), 0) q
    from public.bill_line_delivery_lines m
    join public.bill_lines l on l.id = m.bill_line_id
    join public.supplier_bills sb on sb.id = l.bill_id
    where m.delivery_line_id = p_line and sb.status = 'posted'
  ),
  c as (
    select coalesce(sum(cl.credited_qty), 0) q
    from public.credit_lines cl
    join public.credits cr on cr.id = cl.credit_id
    join public.supplier_return_lines rl on rl.id = cl.supplier_return_line_id
    where rl.delivery_line_id = p_line and cr.status = 'posted'
  )
  select
    dl.accepted_qty,
    r.q,
    dl.accepted_qty - r.q,
    b.q,
    greatest(dl.accepted_qty - r.q - b.q, 0),
    c.q,
    greatest(greatest(b.q - (dl.accepted_qty - r.q), 0) - c.q, 0)
  from dl, r, b, c
$$;

-- Received on a slip line = accepted on its deliveries minus returns.
create function private.slip_line_received(p_line uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(dl.accepted_qty) from public.delivery_lines dl where dl.slip_line_id = p_line), 0)
       - coalesce((
           select sum(rl.qty) from public.supplier_return_lines rl
           join public.delivery_lines dl on dl.id = rl.delivery_line_id
           where dl.slip_line_id = p_line), 0)
$$;

-- Fulfilment is computed over every line, so it is the same for everyone who sees the slip.
create function private.slip_fulfilment(p_slip uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when s.closed_short_at is not null then 'closed_short'
    when not exists (select 1 from public.order_slip_lines l where l.slip_id = s.id) then 'not_received'
    when not exists (
      select 1 from public.order_slip_lines l where l.slip_id = s.id and private.slip_line_received(l.id) < l.qty
    ) then 'fully_received'
    when exists (
      select 1 from public.order_slip_lines l where l.slip_id = s.id and private.slip_line_received(l.id) > 0
    ) then 'partially_received'
    else 'not_received'
  end
  from public.order_slips s where s.id = p_slip
$$;

create view public.delivery_line_status with (security_invoker = true) as
  select dl.id, dl.company_id, dl.delivery_id, d.project_id, d.supplier_id, dl.slip_line_id, q.*
  from public.delivery_lines dl
  join public.deliveries d on d.id = dl.delivery_id
  cross join lateral private.delivery_line_qty(dl.id) q;

create view public.order_slip_line_progress with (security_invoker = true) as
  select l.id, l.company_id, l.slip_id, l.project_id, l.qty as ordered_qty,
    r.received_qty,
    greatest(l.qty - r.received_qty, 0) as remaining_qty,
    r.received_qty > l.qty as over_received
  from public.order_slip_lines l
  cross join lateral (select private.slip_line_received(l.id) as received_qty) r;

create view public.order_slip_progress with (security_invoker = true) as
  select s.id, s.company_id, private.slip_fulfilment(s.id) as fulfilment
  from public.order_slips s;

-- ===========================================================================
-- Order slips (req §9)
-- ===========================================================================

create function private.can_approve_slip(p_slip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.order_slips s
    where s.id = p_slip
      and (
        private.is_admin(s.company_id)
        or (
          exists (
            select 1 from public.memberships m
            where m.company_id = s.company_id and m.user_id = auth.uid() and m.active and m.can_approve_slips
          )
          and private.can_see_whole_slip(s.id)
        )
      )
  )
$$;

create function private.can_edit_slip(p_slip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.order_slips s
    where s.id = p_slip and private.is_member(s.company_id)
      and (s.created_by = auth.uid() or private.sees_all_projects(s.company_id))
      and private.can_see_whole_slip(s.id)
  )
$$;

-- What the caller may do with a slip; the UI shows buttons from this (the functions re-check).
create function public.slip_permissions(p_slip uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.order_slips;
  v_whole boolean;
  v_editor boolean;
  v_worker boolean;
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
  v_deliveries := exists (select 1 from public.deliveries d where d.slip_id = p_slip);
  v_fulfilment := private.slip_fulfilment(p_slip);
  return jsonb_build_object(
    'can_edit', s.status in ('draft', 'rejected') and v_editor,
    'can_submit', s.status = 'draft' and v_editor,
    'can_delete', s.status = 'draft' and v_editor,
    'can_approve', s.status = 'pending' and private.can_approve_slip(p_slip),
    'can_share', s.status = 'approved' and v_whole and v_worker,
    'can_cancel', s.status in ('draft', 'pending', 'approved') and not v_deliveries
      and (s.created_by = auth.uid() or private.is_admin(s.company_id) or private.can_approve_slip(p_slip)),
    'can_close_short', s.status = 'approved' and s.closed_short_at is null and v_whole
      and v_fulfilment <> 'fully_received'
      and (s.created_by = auth.uid() or private.can_manage_parties(s.company_id)),
    'can_record_delivery', s.status = 'approved' and s.closed_short_at is null and v_worker,
    'fulfilment', v_fulfilment
  );
end $$;

-- Create or replace a draft slip and its lines. p_slip:
-- {id, supplier_id, request_date, required_date, delivery_instructions, site_contact, notes,
--  lines: [{id, project_id, material_id | material_text, spec, qty, unit_id, unit_note, note, est_rate_paisa}]}
create function public.save_slip_draft(p_slip jsonb) returns jsonb
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
    end if;
  end loop;

  select * into s from public.order_slips where id = v_id;
  return jsonb_build_object('id', s.id, 'number', s.number, 'status', s.status);
end $$;

create function public.submit_slip(p_slip uuid) returns public.slip_status
language plpgsql security definer set search_path = '' as $$
declare
  s public.order_slips;
  v_supplier text;
begin
  select * into s from public.order_slips where id = p_slip for update;
  if not found or not private.can_edit_slip(p_slip) then
    raise exception 'You cannot submit this slip' using errcode = '42501';
  end if;
  if s.status <> 'draft' then
    raise exception 'Only a draft slip can be submitted' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.order_slip_lines l where l.slip_id = p_slip) then
    raise exception 'Add at least one line before submitting' using errcode = 'P0001';
  end if;
  select name into v_supplier from public.suppliers where id = s.supplier_id;

  -- Approval off: a submitted slip is treated as approved (req §9.3).
  if not (select c.slip_approval_required from public.companies c where c.id = s.company_id) then
    update public.order_slips set status = 'approved', submitted_at = now(), decided_at = now(), decided_by = null
    where id = p_slip;
    return 'approved';
  end if;

  update public.order_slips set status = 'pending', submitted_at = now(), rejected_reason = null where id = p_slip;
  -- Notify eligible approvers: admins, and holders of the approve flag who see every project on the slip.
  perform private.notify(s.company_id, m.user_id, 'slip_submitted', s.id,
    format('Slip %s needs approval', s.number), v_supplier)
  from public.memberships m
  where m.company_id = s.company_id and m.active and m.user_id <> auth.uid()
    and (
      'admin' = any (m.roles)
      or (
        m.can_approve_slips
        and (
          m.roles && array['accounts']::public.app_role[]
          or not exists (
            select 1 from public.order_slip_lines l
            where l.slip_id = s.id and not exists (
              select 1 from public.project_assignments a where a.project_id = l.project_id and a.user_id = m.user_id)
          )
        )
      )
    );
  return 'pending';
end $$;

create function public.decide_slip(p_slip uuid, p_approve boolean, p_reason text default null)
returns public.slip_status
language plpgsql security definer set search_path = '' as $$
declare s public.order_slips;
begin
  select * into s from public.order_slips where id = p_slip for update;
  if not found or not private.can_approve_slip(p_slip) then
    raise exception 'You cannot approve or reject this slip' using errcode = '42501';
  end if;
  if s.status <> 'pending' then
    raise exception 'This slip is not waiting for approval' using errcode = 'P0001';
  end if;
  if p_approve then
    update public.order_slips set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = p_slip;
  else
    update public.order_slips
    set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
        rejected_reason = private.require_reason(p_reason, 'A reason for rejecting')
    where id = p_slip;
  end if;
  if s.created_by is not null and s.created_by <> auth.uid() then
    perform private.notify(s.company_id, s.created_by, case when p_approve then 'slip_approved' else 'slip_rejected' end,
      s.id, format('Slip %s was %s', s.number, case when p_approve then 'approved' else 'rejected' end),
      case when p_approve then null else p_reason end);
  end if;
  return case when p_approve then 'approved'::public.slip_status else 'rejected'::public.slip_status end;
end $$;

create function public.cancel_slip(p_slip uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_perm jsonb := public.slip_permissions(p_slip);
begin
  perform 1 from public.order_slips where id = p_slip for update;
  if v_perm is null or not (v_perm ->> 'can_cancel')::boolean then
    raise exception 'This slip cannot be cancelled' using errcode = '42501';
  end if;
  update public.order_slips set status = 'cancelled', cancelled_reason = private.require_reason(p_reason)
  where id = p_slip;
end $$;

create function public.delete_slip_draft(p_slip uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.order_slips;
begin
  select * into s from public.order_slips where id = p_slip for update;
  if not found or not private.can_edit_slip(p_slip) then
    raise exception 'You cannot delete this slip' using errcode = '42501';
  end if;
  if s.status <> 'draft' then
    raise exception 'Only a draft slip can be deleted; cancel it instead' using errcode = 'P0001';
  end if;
  delete from public.order_slips where id = p_slip;
end $$;

-- "Marked sent" only; it does not mean the supplier acknowledged (req §9.3).
-- Needs access to every project on the slip, with no creator exception (S4).
create function public.mark_slip_sent(p_slip uuid, p_via text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_perm jsonb := public.slip_permissions(p_slip);
begin
  perform 1 from public.order_slips where id = p_slip for update;
  if v_perm is null or not (v_perm ->> 'can_share')::boolean then
    raise exception 'You need access to every project on this slip to share it' using errcode = '42501';
  end if;
  update public.order_slips
  set sent_at = coalesce(sent_at, now()), sent_by = coalesce(sent_by, auth.uid()), sent_via = p_via
  where id = p_slip;
end $$;

create function public.close_slip_short(p_slip uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_perm jsonb := public.slip_permissions(p_slip);
begin
  perform 1 from public.order_slips where id = p_slip for update;
  if v_perm is null or not (v_perm ->> 'can_close_short')::boolean then
    raise exception 'This slip cannot be closed short' using errcode = '42501';
  end if;
  update public.order_slips
  set closed_short_at = now(), closed_by = auth.uid(), closed_short_reason = private.require_reason(p_reason)
  where id = p_slip;
end $$;

-- ===========================================================================
-- Deliveries (req §10) and returns (req §20)
-- ===========================================================================

-- p_delivery: {id, supplier_id, project_id, slip_id, challan_no, receipt_date, no_slip_reason, note,
--   lines: [{id, slip_line_id, material_id | material_text, spec, unit_id, unit_note, received_qty, rejected_qty, issue, note}]}
-- Retrying with the same id returns the existing delivery.
create function public.record_delivery(p_delivery jsonb) returns uuid
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
    select * into s from public.order_slips where id = v_slip and company_id = v_company;
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

-- A wrong entry can be deleted while nothing depends on it.
create function public.delete_delivery(p_delivery uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.deliveries;
begin
  select * into d from public.deliveries where id = p_delivery for update;
  if not found or not private.can_work_on_project(d.company_id, d.project_id)
     or not (d.created_by = auth.uid() or private.can_manage_parties(d.company_id)) then
    raise exception 'You cannot delete this delivery' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.bill_line_delivery_lines m join public.delivery_lines dl on dl.id = m.delivery_line_id
    where dl.delivery_id = p_delivery
  ) then
    raise exception 'This delivery is linked to a bill' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.supplier_return_lines r join public.delivery_lines dl on dl.id = r.delivery_line_id
    where dl.delivery_id = p_delivery
  ) then
    raise exception 'This delivery has returns recorded' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.attachments a where a.delivery_id = p_delivery and a.uploaded_at is not null) then
    raise exception 'This delivery has a photo; it cannot be deleted' using errcode = 'P0001';
  end if;
  delete from public.attachments where delivery_id = p_delivery;
  delete from public.deliveries where id = p_delivery;
end $$;

-- Physical return: quantities only, never cost or payable (req §20, design §5.5).
-- p_return: {id, supplier_id, project_id, return_date, note, lines: [{id, delivery_line_id, qty, note}]}
create function public.record_return(p_return jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_return ->> 'id')::uuid;
  v_project uuid := (p_return ->> 'project_id')::uuid;
  v_supplier uuid := (p_return ->> 'supplier_id')::uuid;
  v_company uuid;
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

  -- Lock order: party first, then delivery lines (design §5.2).
  perform 1 from public.suppliers where id = v_supplier and company_id = v_company for update;
  if not found then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;
  perform 1 from public.delivery_lines
  where id in (select (x ->> 'delivery_line_id')::uuid from jsonb_array_elements(p_return -> 'lines') x)
  order by id for update;

  insert into public.supplier_returns (company_id, id, supplier_id, project_id, return_date, note)
  values (v_company, v_id, v_supplier, v_project, coalesce((p_return ->> 'return_date')::date, private.today()), p_return ->> 'note');

  for l in select * from jsonb_array_elements(p_return -> 'lines') loop
    select dl.id, d.supplier_id, d.project_id, d.receipt_date into v_dl
    from public.delivery_lines dl join public.deliveries d on d.id = dl.delivery_id
    where dl.id = (l ->> 'delivery_line_id')::uuid and dl.company_id = v_company;
    if v_dl.id is null or v_dl.supplier_id <> v_supplier or v_dl.project_id <> v_project then
      raise exception 'A returned item is not from this supplier and project' using errcode = 'P0001';
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

-- ===========================================================================
-- Bill drafts (req §11, design §3.5 X1, §5.5)
-- ===========================================================================

create function private.can_edit_bill(p_bill uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.supplier_bills b
    where b.id = p_bill
      and (
        private.is_own_draft_bill(b.id)
        or (b.status in ('draft', 'under_review') and private.can_post(b.company_id))
      )
  )
$$;

-- p_bill: {id, supplier_id, bill_no, bill_date, cost_date, due_date, notes,
--   discount_paisa, transport_paisa, vat_paisa, vat_rate_pct,
--   lines: [{id, line_type, project_id, heading_id, material_id, description, qty, unit_id, unit_note,
--            rate_paisa, amount_paisa, unmatched_reason, rate_variance_reason,
--            matches: [{delivery_line_id, billed_qty}]}],
--   overrides: [{charge, project_id, amount_paisa}]}
create function public.save_bill_draft(p_bill jsonb) returns jsonb
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
  if coalesce(trim(p_bill ->> 'bill_no'), '') = '' then
    raise exception 'Bill number is required' using errcode = '22023';
  end if;

  select * into b from public.supplier_bills where id = v_id for update;
  if found then
    if b.company_id <> v_company or not private.can_edit_bill(v_id) then
      raise exception 'You cannot edit this bill' using errcode = '42501';
    end if;
    update public.supplier_bills set
      supplier_id = v_supplier,
      bill_no = trim(p_bill ->> 'bill_no'),
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
      v_company, v_id, v_supplier, trim(p_bill ->> 'bill_no'),
      coalesce((p_bill ->> 'bill_date')::date, private.today()),
      coalesce((p_bill ->> 'cost_date')::date, (p_bill ->> 'bill_date')::date, private.today()),
      (p_bill ->> 'due_date')::date,
      (select c.vat_treatment from public.companies c where c.id = v_company), -- copied once (I-3)
      p_bill ->> 'notes'
    );
  end if;

  insert into public.supplier_bill_charges (company_id, id, discount_paisa, transport_paisa, vat_paisa, vat_rate_pct)
  values (
    v_company, v_id,
    coalesce((p_bill ->> 'discount_paisa')::bigint, 0), coalesce((p_bill ->> 'transport_paisa')::bigint, 0),
    coalesce((p_bill ->> 'vat_paisa')::bigint, 0), coalesce((p_bill ->> 'vat_rate_pct')::numeric, 13)
  )
  on conflict (id) do update set
    discount_paisa = excluded.discount_paisa, transport_paisa = excluded.transport_paisa,
    vat_paisa = excluded.vat_paisa, vat_rate_pct = excluded.vat_rate_pct;

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

-- Draft -> under review. Ends the creator's X1 access (design §3.5).
create function public.submit_bill(p_bill uuid) returns void
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
  if not exists (select 1 from public.bill_lines l where l.bill_id = p_bill) then
    raise exception 'Add at least one line first' using errcode = 'P0001';
  end if;
  update public.supplier_bills set status = 'under_review', submitted_at = now() where id = p_bill;
end $$;

create function public.delete_bill_draft(p_bill uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.supplier_bills;
begin
  select * into b from public.supplier_bills where id = p_bill for update;
  if not found or not private.can_edit_bill(p_bill) then
    raise exception 'You cannot delete this bill' using errcode = '42501';
  end if;
  delete from public.supplier_bills where id = p_bill; -- lines, charges, matches and photos cascade
end $$;

-- Pro-rata split by the largest-remainder method (design §4.1); same as splitProRata in money.ts.
create function private.split_pro_rata(p_total bigint, p_weights bigint[]) returns bigint[]
language plpgsql immutable set search_path = '' as $$
declare
  n integer := coalesce(array_length(p_weights, 1), 0);
  v_sum numeric := 0;
  v_out bigint[] := '{}';
  v_rem numeric[] := '{}';
  v_left bigint := p_total;
  v_raw numeric;
  v_order integer[];
  i integer;
begin
  if p_total < 0 then
    raise exception 'split_pro_rata needs a non-negative total';
  end if;
  if n = 0 then
    raise exception 'There are no lines to split the amount over' using errcode = 'P0001';
  end if;
  for i in 1..n loop
    if p_weights[i] < 0 then
      raise exception 'split_pro_rata needs non-negative weights';
    end if;
    v_sum := v_sum + p_weights[i];
  end loop;
  if v_sum = 0 then
    if p_total = 0 then
      return array_fill(0::bigint, array[n]);
    end if;
    raise exception 'Cannot split an amount over lines that are all zero' using errcode = 'P0001';
  end if;
  for i in 1..n loop
    v_raw := p_total::numeric * p_weights[i];
    v_out := v_out || div(v_raw, v_sum)::bigint;
    v_rem := v_rem || mod(v_raw, v_sum);
    v_left := v_left - div(v_raw, v_sum)::bigint;
  end loop;
  select array_agg(u.idx::integer order by u.rem desc, u.idx) into v_order
  from unnest(v_rem) with ordinality as u (rem, idx);
  for i in 1..v_left loop
    v_out[v_order[i]] := v_out[v_order[i]] + 1;
  end loop;
  return v_out;
end $$;

-- Header charges allocated to lines (I-2) and cost/payable per line (I-3).
create function private.compute_bill_allocation(p_bill uuid)
returns table (
  line_id uuid, discount_share bigint, transport_share bigint, vat_share bigint, payable bigint, cost bigint
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  b public.supplier_bills;
  c public.supplier_bill_charges;
  v_ids uuid[];
  v_projects uuid[];
  v_amounts bigint[];
  v_n integer;
  v_d bigint[];
  v_t bigint[];
  v_v bigint[];
  v_part bigint[];
  v_idx integer[];
  v_w bigint[];
  v_charge public.bill_charge;
  v_amt bigint;
  v_override_sum bigint;
  o record;
  i integer;
  j integer;
begin
  select * into b from public.supplier_bills x where x.id = p_bill;
  select * into c from public.supplier_bill_charges x where x.id = p_bill;
  select array_agg(x.id order by x.sort_order, x.id), array_agg(x.project_id order by x.sort_order, x.id),
         array_agg(x.amount_paisa order by x.sort_order, x.id)
  into v_ids, v_projects, v_amounts
  from public.bill_lines x where x.bill_id = p_bill;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    raise exception 'A bill needs at least one line' using errcode = 'P0001';
  end if;

  foreach v_charge in array array['discount', 'transport', 'vat']::public.bill_charge[] loop
    v_amt := coalesce(case v_charge
      when 'discount' then c.discount_paisa when 'transport' then c.transport_paisa else c.vat_paisa end, 0);
    v_part := array_fill(0::bigint, array[v_n]);
    select sum(x.amount_paisa) into v_override_sum
    from public.bill_charge_overrides x where x.bill_id = p_bill and x.charge = v_charge;
    if v_override_sum is not null then
      if v_override_sum <> v_amt then
        raise exception 'The % split across projects must add up to the % on the bill', v_charge, v_charge
          using errcode = 'P0001';
      end if;
      for o in
        select x.project_id, x.amount_paisa from public.bill_charge_overrides x
        where x.bill_id = p_bill and x.charge = v_charge and x.amount_paisa > 0 order by x.project_id
      loop
        v_idx := '{}';
        v_w := '{}';
        for i in 1..v_n loop
          if v_projects[i] = o.project_id then
            v_idx := v_idx || i;
            v_w := v_w || v_amounts[i];
          end if;
        end loop;
        if cardinality(v_idx) = 0 then
          raise exception 'The % is split to a project that has no lines on this bill', v_charge using errcode = 'P0001';
        end if;
        v_w := private.split_pro_rata(o.amount_paisa, v_w);
        for j in 1..cardinality(v_idx) loop
          v_part[v_idx[j]] := v_w[j];
        end loop;
      end loop;
    elsif v_amt > 0 then
      v_part := private.split_pro_rata(v_amt, v_amounts);
    end if;
    if v_charge = 'discount' then v_d := v_part;
    elsif v_charge = 'transport' then v_t := v_part;
    else v_v := v_part;
    end if;
  end loop;

  for i in 1..v_n loop
    line_id := v_ids[i];
    discount_share := v_d[i];
    transport_share := v_t[i];
    vat_share := v_v[i];
    payable := v_amounts[i] - v_d[i] + v_t[i] + v_v[i];
    if payable < 0 then
      raise exception 'The discount is larger than a line amount' using errcode = 'P0001';
    end if;
    cost := payable - case when b.vat_treatment = 'vat_recoverable' then v_v[i] else 0 end;
    return next;
  end loop;
end $$;

-- Checks before posting (design §5.5). severity: 'error' blocks; 'reason' blocks until the
-- line has a reason; 'warning' is shown only.
create function private.bill_checks(p_bill uuid)
returns table (line_id uuid, code text, severity text, message text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  b public.supplier_bills;
  l record;
  m record;
  v_matched numeric;
  v_est bigint;
  v_tol numeric;
  v_rate numeric;
  v_label text;
begin
  select * into b from public.supplier_bills x where x.id = p_bill;
  select x.rate_variance_tolerance_pct into v_tol from public.companies x where x.id = b.company_id;

  if exists (
    select 1 from public.supplier_bills o
    where o.company_id = b.company_id and o.supplier_id = b.supplier_id and o.id <> b.id
      and o.status <> 'reversed' and lower(trim(o.bill_no)) = lower(trim(b.bill_no))
  ) then
    line_id := null; code := 'duplicate_bill_no'; severity := 'warning';
    message := format('Another bill from this supplier has number %s', b.bill_no);
    return next;
  end if;

  for l in
    select x.*, coalesce(mt.name, x.description) as label
    from public.bill_lines x left join public.materials mt on mt.id = x.material_id
    where x.bill_id = p_bill and x.line_type = 'material' order by x.sort_order, x.id
  loop
    v_label := coalesce(l.label, 'Line ' || l.sort_order);
    select coalesce(sum(x.billed_qty), 0) into v_matched from public.bill_line_delivery_lines x where x.bill_line_id = l.id;
    if v_matched > l.qty then
      line_id := l.id; code := 'over_matched'; severity := 'error';
      message := format('%s: matched deliveries (%s) are more than the billed quantity (%s)', v_label, v_matched, l.qty);
      return next;
    elsif v_matched < l.qty then
      line_id := l.id;
      code := case when v_matched = 0 then 'unmatched' else 'partly_matched' end;
      severity := case when coalesce(trim(l.unmatched_reason), '') = '' then 'reason' else 'warning' end;
      message := case when v_matched = 0
        then format('%s: no delivery received for this line', v_label)
        else format('%s: only %s of %s matched to deliveries', v_label, v_matched, l.qty) end;
      return next;
    end if;

    v_est := null;
    select p.est_rate_paisa into v_est
    from public.bill_line_delivery_lines x
    join public.delivery_lines dl on dl.id = x.delivery_line_id
    join public.order_slip_line_prices p on p.id = dl.slip_line_id
    where x.bill_line_id = l.id
    order by x.created_at, x.id limit 1;
    if v_est is not null and v_est > 0 and l.qty > 0 then
      v_rate := l.amount_paisa / l.qty;
      if abs(v_rate - v_est) * 100 / v_est > v_tol then
        line_id := l.id; code := 'rate_variance';
        severity := case when coalesce(trim(l.rate_variance_reason), '') = '' then 'reason' else 'warning' end;
        message := format('%s: rate differs from the slip estimate by more than %s%%', v_label, v_tol);
        return next;
      end if;
    end if;
  end loop;

  -- M4: what this bill claims from a delivery line must still be billable.
  for m in
    select x.delivery_line_id, sum(x.billed_qty) as qty
    from public.bill_line_delivery_lines x join public.bill_lines bl on bl.id = x.bill_line_id
    where bl.bill_id = p_bill group by x.delivery_line_id
  loop
    if m.qty > (select q.billable_qty from private.delivery_line_qty(m.delivery_line_id) q) then
      line_id := null; code := 'billable_exceeded'; severity := 'error';
      message := 'A matched delivery has already been billed or returned; reduce the matched quantity';
      return next;
    end if;
  end loop;
end $$;

-- Preview of what posting would do. Same calculation as post_bill.
create function public.bill_preview(p_bill uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_lines jsonb;
  v_checks jsonb;
  v_error text;
begin
  if not private.can_see_bill_amounts(p_bill) then
    raise exception 'You cannot see this bill' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_checks from private.bill_checks(p_bill) c;
  begin
    select jsonb_agg(to_jsonb(a)) into v_lines from private.compute_bill_allocation(p_bill) a;
  exception when sqlstate 'P0001' then
    v_error := sqlerrm;
  end;
  return jsonb_build_object(
    'lines', coalesce(v_lines, '[]'::jsonb),
    'allocation_error', v_error,
    'checks', v_checks,
    'total_paisa', (select sum((x ->> 'payable')::bigint) from jsonb_array_elements(v_lines) x),
    'cost_paisa', (select sum((x ->> 'cost')::bigint) from jsonb_array_elements(v_lines) x)
  );
end $$;

-- Hint while entering a bill (rate lists are Phase 2).
create function public.last_billed_rate(p_supplier uuid, p_material uuid)
returns table (rate_paisa bigint, qty numeric, bill_no text, bill_date date)
language sql stable security invoker set search_path = '' as $$
  select l.rate_paisa, l.qty, b.bill_no, b.bill_date
  from public.bill_lines l join public.supplier_bills b on b.id = l.bill_id
  where b.supplier_id = p_supplier and l.material_id = p_material and b.status = 'posted' and l.rate_paisa is not null
  order by b.bill_date desc, b.posted_at desc
  limit 1
$$;

-- ===========================================================================
-- Attachments for the new owners (design §3.7)
-- ===========================================================================
create or replace function private.can_access_attachment(p_attachment uuid, p_action text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.attachments;
  v_project uuid;
  v_status public.bill_status;
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
  return false;
end $$;

create function private.can_create_attachment_for(
  p_company uuid, p_contract_revision uuid, p_budget_revision uuid, p_delivery uuid, p_bill uuid, p_payment uuid
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
$$;

drop policy attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    uploaded_at is null and removed_at is null
    and private.can_create_attachment_for(company_id, contract_revision_id, budget_revision_id, delivery_id, bill_id, payment_id)
  );
drop function private.can_create_attachment(uuid, uuid, uuid);

-- Remove a photo: deleted on drafts (after the client deletes the file), hidden otherwise.
create function public.remove_attachment(p_attachment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.attachments;
begin
  select * into a from public.attachments where id = p_attachment for update;
  if not found then
    raise exception 'Attachment not found' using errcode = 'P0002';
  end if;
  if private.can_access_attachment(p_attachment, 'delete') then
    delete from public.attachments where id = p_attachment;
  elsif a.uploaded_at is null and a.created_by = auth.uid() then
    delete from public.attachments where id = p_attachment; -- upload never finished
  elsif private.is_admin(a.company_id) and private.can_access_attachment(p_attachment, 'read') then
    update public.attachments set removed_at = now() where id = p_attachment;
  else
    raise exception 'You cannot remove this file' using errcode = '42501';
  end if;
end $$;
