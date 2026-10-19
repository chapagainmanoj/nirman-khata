-- A new staff member's membership and project assignments, in one transaction (admin-users Edge
-- Function, create_staff). Before, they were two requests: when the assignments failed the person
-- was left added without their projects, and only a warning said so. Now both are saved or neither
-- is, and the Edge Function then removes the login it just made, so the admin can simply try again.
-- Called with the service-role key only; the caller's admin rights are checked again here.

create function public.add_staff_member(
  p_company uuid,
  p_by uuid,
  p_user uuid,
  p_roles public.app_role[],
  p_can_view_finance boolean,
  p_can_record_payments boolean,
  p_can_approve_slips boolean,
  p_projects uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_membership uuid;
begin
  if not exists (
    select 1 from public.memberships
    where company_id = p_company and user_id = p_by and active and 'admin' = any (roles)
  ) then
    raise exception 'Only an admin can manage staff' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_roles), 0) = 0 then
    raise exception 'Choose at least one role' using errcode = '22023';
  end if;
  -- Every project must be one of this company's (the composite key checks it too; this names it).
  if exists (
    select 1 from unnest(coalesce(p_projects, '{}')) as p(id)
    where not exists (select 1 from public.projects where company_id = p_company and id = p.id)
  ) then
    raise exception 'A chosen project is not in this company' using errcode = '22023';
  end if;

  insert into public.memberships (company_id, user_id, roles, can_view_finance, can_record_payments, can_approve_slips, created_by)
  values (p_company, p_user, p_roles, p_can_view_finance, p_can_record_payments, p_can_approve_slips, p_by)
  returning id into v_membership;

  insert into public.project_assignments (company_id, project_id, user_id, created_by)
  select p_company, p.id, p_user, p_by from (select distinct unnest(coalesce(p_projects, '{}')) as id) p;

  return v_membership;
end;
$$;

revoke execute on function public.add_staff_member(uuid, uuid, uuid, public.app_role[], boolean, boolean, boolean, uuid[]) from public, anon, authenticated;
grant execute on function public.add_staff_member(uuid, uuid, uuid, public.app_role[], boolean, boolean, boolean, uuid[]) to service_role;
