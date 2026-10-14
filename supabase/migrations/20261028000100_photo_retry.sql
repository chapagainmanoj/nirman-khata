-- Photos that failed to upload are kept on the device and uploaded again later (second review,
-- #10). A bill photo can then arrive after the bill was sent to Accounts or posted, so adding a
-- photo to a sent or posted bill is allowed for its creator (while they still work on all its
-- projects) and for Accounts or Admin (product owner, 2026-10-14). Photos are evidence: they add
-- nothing to the money, and only drafts let a photo be removed (unchanged).

create function private.can_add_bill_photo(p_bill uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_edit_bill(p_bill) or exists (
    select 1 from public.supplier_bills b
    where b.id = p_bill and b.status in ('under_review', 'posted')
      and (
        (private.can_post(b.company_id) and private.can_see_whole_bill(b.id))
        or (b.created_by = auth.uid() and private.has_working_role(b.company_id) and not exists (
          select 1 from public.bill_lines l
          where l.bill_id = b.id and not private.can_work_on_project(l.company_id, l.project_id)))
      )
  )
$$;
revoke execute on function private.can_add_bill_photo(uuid) from public, anon;
grant execute on function private.can_add_bill_photo(uuid) to authenticated;

create or replace function private.can_create_attachment_for(p_company uuid, p_contract_revision uuid, p_budget_revision uuid, p_delivery uuid, p_bill uuid, p_payment uuid, p_work_package uuid, p_charge uuid, p_labour_cost uuid, p_expense uuid, p_daily_report uuid, p_progress_update uuid, p_client_receipt uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
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
      and private.can_add_bill_photo(p_bill))
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
    or (p_daily_report is not null and exists (
      select 1 from public.daily_reports r
      where r.company_id = p_company and r.id = p_daily_report and private.can_work_on_project(p_company, r.project_id)))
    or (p_progress_update is not null and exists (
      select 1 from public.progress_updates u
      where u.company_id = p_company and u.id = p_progress_update and private.can_work_on_project(p_company, u.project_id)))
    or (p_client_receipt is not null and exists (
      select 1 from public.client_receipts r
      where r.company_id = p_company and r.id = p_client_receipt
        and private.can_record_payments(p_company) and private.can_see_project(p_company, r.project_id)))
$$;

create or replace function private.can_access_attachment(p_attachment uuid, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
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
      return a.uploaded_at is null and private.can_add_bill_photo(a.bill_id);
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

  -- Site records carry no amounts: anyone on the project reads; anyone working on it adds.
  if a.daily_report_id is not null or a.progress_update_id is not null then
    v_project := coalesce(
      (select project_id from public.daily_reports where id = a.daily_report_id),
      (select project_id from public.progress_updates where id = a.progress_update_id));
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_project(a.company_id, v_project);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_work_on_project(a.company_id, v_project);
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
  -- Client receipts carry amounts: read like the receipt; added by whoever may record them.
  if a.client_receipt_id is not null then
    select project_id into v_project from public.client_receipts where id = a.client_receipt_id;
    if p_action = 'read' then
      return a.removed_at is null and (private.sees_all_projects(a.company_id)
        or (private.can_see_finance(a.company_id) and private.can_see_project(a.company_id, v_project)));
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_record_payments(a.company_id) and private.can_see_project(a.company_id, v_project);
    end if;
    return false;
  end if;
  return false;
end $$;
