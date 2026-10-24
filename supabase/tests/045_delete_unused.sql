-- Deleting a party or project that was never used (delete_unused): Admin only, own company only;
-- anything with a record pointing to it, even a reversed bill or a draft slip, is refused and
-- stays exactly as it was. A deleted project takes its own setup (revisions, crew, stages) with it.
begin;
\ir helpers/helpers.psql
select plan(14);

select tests.create_user('owner') as owner \gset
select tests.create_user('accounts') as accounts \gset
select tests.create_user('other') as other \gset
select tests.create_company('Delete Nirman', :'owner') as co \gset
select tests.create_company('Other Nirman', :'other') as co2 \gset
select tests.add_member(:'co', :'accounts', '{accounts}', true);

select tests.login(:'owner');
select public.create_project(:'co', 'D-1', 'Used project', 100000000, 90000000, '2026-05-01') as used_p \gset
select public.create_project(:'co', 'D-2', 'Typo project', 100000000, 90000000, '2026-05-01') as typo_p \gset
insert into public.stages (company_id, project_id, name) values (:'co', :'typo_p', 'Foundation');
select tests.supplier(:'co', 'Never Used Hardware') as unused_sup \gset
select tests.supplier(:'co', 'Reversed Sand') as rev_sup \gset
insert into public.payees (company_id, name) values (:'co', 'Typo Payee') returning id as payee \gset
insert into public.subcontractors (company_id, name) values (:'co', 'Typo Plaster') returning id as sub \gset
insert into public.workers (company_id, name, rate_kind, rate_paisa) values (:'co', 'Typo Worker', 'daily', 100000) returning id as unused_w \gset
insert into public.workers (company_id, name, rate_kind, rate_paisa) values (:'co', 'Ram Bahadur', 'daily', 120000) returning id as ram \gset
select id as crew from public.crews where project_id = :'used_p' and is_default \gset
select public.add_crew_worker(:'crew', jsonb_build_object('worker_id', :'unused_w'));
select public.add_crew_worker(:'crew', jsonb_build_object('worker_id', :'ram'));

-- History: a bill on the used project, reversed; a labour day for Ram.
select tests.posted_bill(:'co', :'rev_sup', :'used_p', 950000) as bill \gset
select public.reverse_bill(gen_random_uuid(), :'bill', '2026-05-07', 'Wrong amount');
update public.companies set labour_mode = 'attendance' where id = :'co';
select public.set_attendance(jsonb_build_object('project_id', :'used_p', 'crew_id', :'crew', 'worker_id', :'ram',
  'work_date', '2026-05-02', 'minutes', 480));

-- Only an admin of the record's own company.
select tests.login(:'accounts');
select throws_ok(format($$ select public.delete_unused('supplier', %L) $$, :'unused_sup'), '42501', null,
  'accounts staff cannot delete');
select tests.login(:'other');
select throws_ok(format($$ select public.delete_unused('supplier', %L) $$, :'unused_sup'), '42501', null,
  'an admin of another company cannot delete');
select tests.login(:'owner');
select throws_ok(format($$ select public.delete_unused('supplier', %L) $$, gen_random_uuid()), 'P0002', null,
  'an unknown id is not found');

-- Never used: gone.
select lives_ok(format($$ select public.delete_unused('supplier', %L) $$, :'unused_sup'), 'an unused supplier is deleted');
select lives_ok(format($$ select public.delete_unused('payee', %L) $$, :'payee'), 'an unused payee is deleted');
select lives_ok(format($$ select public.delete_unused('subcontractor', %L) $$, :'sub'), 'an unused subcontractor is deleted');
select lives_ok(format($$ select public.delete_unused('worker', %L) $$, :'unused_w'),
  'a worker who is only on a crew list, with no days, is deleted');
select lives_ok(format($$ select public.delete_unused('project', %L) $$, :'typo_p'),
  'an unused project is deleted with its budget, contract, stage and crew');
select is((select count(*)::int from public.budget_revisions where project_id = :'typo_p')
  + (select count(*)::int from public.crews where project_id = :'typo_p'), 0, '... and its setup is gone with it');
select cmp_ok((select count(*)::int from public.audit_log where entity = 'projects' and entity_id = :'typo_p' and action = 'delete'),
  '=', 1, 'the audit log keeps the deleted project');

-- Used, even only by a reversed bill or a day of work: refused, nothing changed.
select throws_ok(format($$ select public.delete_unused('supplier', %L) $$, :'rev_sup'), 'P0001',
  'This is already used in records, so it can''t be deleted. Make it inactive instead; it stays in history.',
  'a supplier with a reversed bill cannot be deleted');
select throws_ok(format($$ select public.delete_unused('worker', %L) $$, :'ram'), 'P0001', null,
  'a worker with a day of work cannot be deleted');
select throws_ok(format($$ select public.delete_unused('project', %L) $$, :'used_p'), 'P0001', null,
  'a project with a bill cannot be deleted');
select is((select count(*)::int from public.budget_revisions where project_id = :'used_p')
  + (select count(*)::int from public.crew_members where crew_id = :'crew'), 2,
  'a refused delete leaves the setup it started on in place');

select * from finish();
rollback;
