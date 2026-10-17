-- Project status, made simpler (product owner, 2026-10-17; GLOSSARY: Project status).
-- People choose only Active, On hold or Completed. "Close books" and "Cancel project" are separate
-- actions on the project page, so the states underneath are unchanged except Planned:
--   * Planned is retired: a new project starts Active, and existing Planned projects become Active.
--     The enum value stays (Postgres cannot drop one), barred by a check.
--   * create_project maps a 'planned' it is still sent (an older draft on a phone) to Active.
--   * A cancelled project takes no new money, like Books closed: every ledger posting and client
--     receipt goes through require_project_open. "Restore project" (back to Active) allows it again.

update public.projects set status = 'active' where status = 'planned';
alter table public.projects alter column status set default 'active';
alter table public.projects add constraint projects_status_not_planned check (status <> 'planned');

create or replace function public.create_project(
  p_company uuid,
  p_code text,
  p_name text,
  p_contract_paisa bigint,
  p_budget_paisa bigint default null,
  p_effective_date date default null,
  p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid;
  v_date date := coalesce(p_effective_date, (now() at time zone 'Asia/Kathmandu')::date);
begin
  if not private.is_admin(p_company) then
    raise exception 'Only an admin can create projects' using errcode = '42501';
  end if;
  if p_contract_paisa is null or p_contract_paisa < 0 then
    raise exception 'Contract amount is required' using errcode = '22023';
  end if;

  insert into public.projects (
    company_id, code, name, client_name, client_phone, district, municipality, ward, location_note,
    manager_id, planned_start, planned_end, status, created_by
  ) values (
    p_company, p_code, p_name,
    p_details ->> 'client_name', p_details ->> 'client_phone', p_details ->> 'district',
    p_details ->> 'municipality', p_details ->> 'ward', p_details ->> 'location_note',
    (p_details ->> 'manager_id')::uuid, (p_details ->> 'planned_start')::date, (p_details ->> 'planned_end')::date,
    case when coalesce(p_details ->> 'status', 'planned') = 'planned' then 'active'
      else (p_details ->> 'status')::public.project_status end, auth.uid()
  ) returning id into v_project;

  insert into public.contract_revisions (company_id, project_id, effective_date, amount_paisa, is_original, reason, created_by)
  values (p_company, v_project, v_date, p_contract_paisa, true, 'Original contract', auth.uid());
  insert into public.budget_revisions (company_id, project_id, effective_date, total_paisa, is_original, reason, created_by)
  values (p_company, v_project, v_date, coalesce(p_budget_paisa, p_contract_paisa), true, 'Original budget', auth.uid());

  if (p_details ->> 'manager_id') is not null then
    insert into public.project_assignments (company_id, project_id, user_id, created_by)
    values (p_company, v_project, (p_details ->> 'manager_id')::uuid, auth.uid());
  end if;
  return v_project;
end $$;

-- No new money on a cancelled project either.
create or replace function private.require_project_open(p_project uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status public.project_status;
begin
  select status into v_status from public.projects where id = p_project for share;
  if v_status = 'closed' then
    raise exception 'This project is closed. Reopen it before posting.' using errcode = 'P0001';
  end if;
  if v_status = 'cancelled' then
    raise exception 'This project is cancelled. Restore it before posting.' using errcode = 'P0001';
  end if;
end $$;
