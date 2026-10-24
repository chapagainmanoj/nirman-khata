-- Delete a party or project that was never used (product owner, 2026-10-24).
-- Nothing with history is deleted: anything that has a slip, delivery, bill, payment, labour day,
-- report, opening balance or any other record pointing to it, even a reversed or cancelled one,
-- can only be made inactive or cancelled. A record that was never used holds nothing to keep:
-- a typo, a duplicate, a test entry. Admin only.
--
-- "Never used" is decided by the foreign keys themselves (all are NO ACTION; none cascade from a
-- history table), so a table added later is covered without changing this function. Only the
-- record's own setup goes with it:
--   * a project: its staff assignments, stages, contract and budget revisions (budget lines) and
--     its crews with their worker lists. A crew that worked has labour rows, and stops the delete;
--   * a crew or a worker: its crew lists (who is on which crew).
-- The audit log keeps the deleted row (private.audit, on delete).

-- Contract and budget revisions are append-only. They may go only with their own project, while
-- delete_unused is deleting it (a transaction-local setting a client cannot set through the API).
create or replace function private.reject_change() returns trigger
language plpgsql as $$
declare
  v_deleting text := nullif(current_setting('nirman.deleting_project', true), '');
begin
  if tg_op = 'DELETE' and v_deleting is not null then
    -- Fields read through jsonb: most tables with this trigger have neither column.
    if tg_table_name in ('contract_revisions', 'budget_revisions') and to_jsonb(old) ->> 'project_id' = v_deleting then
      return old;
    end if;
    if tg_table_name = 'budget_lines' and exists (
      select 1 from public.budget_revisions r
      where r.id = (to_jsonb(old) ->> 'budget_revision_id')::uuid and r.project_id::text = v_deleting
    ) then
      return old;
    end if;
  end if;
  raise exception '% rows cannot be changed or deleted; add a new revision instead', tg_table_name
    using errcode = 'P0001';
end $$;

create function public.delete_unused(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
begin
  v_company := case p_kind
    when 'supplier' then (select company_id from public.suppliers where id = p_id)
    when 'subcontractor' then (select company_id from public.subcontractors where id = p_id)
    when 'payee' then (select company_id from public.payees where id = p_id)
    when 'crew' then (select company_id from public.crews where id = p_id)
    when 'worker' then (select company_id from public.workers where id = p_id)
    when 'project' then (select company_id from public.projects where id = p_id)
  end;
  if v_company is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if not private.is_admin(v_company) then
    raise exception 'Only an admin can delete' using errcode = '42501';
  end if;
  if p_kind = 'crew' and (select is_default from public.crews where id = p_id) then
    raise exception 'A project''s own crew goes only with the project. Make it inactive instead.' using errcode = 'P0001';
  end if;

  begin
    case p_kind
      when 'supplier' then delete from public.suppliers where id = p_id;
      when 'subcontractor' then delete from public.subcontractors where id = p_id;
      when 'payee' then delete from public.payees where id = p_id;
      when 'crew' then
        delete from public.crew_members where crew_id = p_id;
        delete from public.crews where id = p_id;
      when 'worker' then
        delete from public.crew_members where worker_id = p_id;
        delete from public.workers where id = p_id;
      when 'project' then
        perform set_config('nirman.deleting_project', p_id::text, true);
        delete from public.project_assignments where project_id = p_id;
        delete from public.stages where project_id = p_id;
        delete from public.budget_lines l using public.budget_revisions r
          where r.id = l.budget_revision_id and r.project_id = p_id;
        delete from public.budget_revisions where project_id = p_id;
        delete from public.contract_revisions where project_id = p_id;
        delete from public.crew_members m using public.crews c where c.id = m.crew_id and c.project_id = p_id;
        delete from public.crews where project_id = p_id;
        delete from public.projects where id = p_id;
        perform set_config('nirman.deleting_project', '', true);
    end case;
  exception when foreign_key_violation then
    -- The block is rolled back: the setup rows deleted above are back too.
    raise exception 'This is already used in records, so it can''t be deleted. Make it inactive instead; it stays in history.'
      using errcode = 'P0001';
  end;
end $$;

revoke execute on function public.delete_unused(text, uuid) from public, anon;
grant execute on function public.delete_unused(text, uuid) to authenticated;
