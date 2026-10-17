-- A cancelled project takes no new money either (product owner, 2026-10-17; GLOSSARY: Project
-- status). The same check as Books closed: every ledger posting and client receipt goes through
-- require_project_open. "Restore project" (back to Active) lets money in again.

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
