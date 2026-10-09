-- Project assignment and finance permission (design §3.6, tests S1/S2).
begin;
\ir helpers/helpers.psql
select plan(17);

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_user('pm') as pm \gset
select tests.create_user('accounts') as acct \gset
select tests.create_user('viewer') as viewer \gset
select tests.create_company('Gamma Construction', :'owner') as co \gset

select tests.login(:'owner');
select public.create_project(:'co', 'P-1', 'Site one', 500000000) as p1 \gset
select public.create_project(:'co', 'P-2', 'Site two', 300000000) as p2 \gset
select tests.logout();

select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'pm', array['project_manager']::public.app_role[], true);
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], false);
select tests.add_member(:'co', :'viewer', array['viewer']::public.app_role[], false);
select tests.assign(:'co', :'p1', :'site');
select tests.assign(:'co', :'p1', :'pm');
select tests.assign(:'co', :'p2', :'viewer');

-- Site staff: assigned to P1, no finance.
select tests.login(:'site');
select is((select count(*) from public.projects), 1::bigint, 'site staff sees only the assigned project');
select is((select count(*) from public.projects where id = :'p2'), 0::bigint, 'site staff cannot read unassigned project');
select is((select count(*) from public.contract_revisions), 0::bigint, 'site staff without finance sees no contract amounts');
select is((select count(*) from public.budget_revisions), 0::bigint, 'site staff without finance sees no budgets');
select is((select count(*) from public.project_amounts_as_of(:'p1')), 0::bigint, 'site staff gets no amounts from as-of RPC');
select is((select count(*) from public.audit_log), 0::bigint, 'site staff cannot read the audit log');
select ok((select count(*) from public.materials) > 0, 'site staff can read the material catalog');
update public.projects set name = 'renamed' where id = :'p1';

-- PM with finance on P1.
select tests.login(:'pm');
select is((select count(*) from public.contract_revisions), 1::bigint, 'PM with finance sees contract of assigned project only');
select is((select contract_paisa from public.project_amounts_as_of(:'p1')), 500000000::bigint, 'PM gets P1 amounts');
select is((select count(*) from public.project_amounts_as_of(:'p2')), 0::bigint, 'PM gets nothing for unassigned P2');
update public.projects set name = 'Site one (PM)' where id = :'p1';

-- Accounts: all projects and amounts without explicit flag.
select tests.login(:'acct');
select is((select count(*) from public.projects), 2::bigint, 'accounts sees all projects');
select is((select count(*) from public.contract_revisions), 2::bigint, 'accounts sees all contract amounts');

-- Viewer: assigned to P2, no finance.
select tests.login(:'viewer');
select is((select count(*) from public.projects), 1::bigint, 'viewer sees assigned project');
select is((select count(*) from public.budget_revisions), 0::bigint, 'viewer without finance sees no budgets');

-- Deactivated staff lose access immediately.
select tests.logout();
update public.memberships set active = false where user_id = :'pm';
select tests.login(:'pm');
select is((select count(*) from public.projects), 0::bigint, 'deactivated PM sees no projects');

select tests.logout();
select is((select name from public.projects where id = :'p1'), 'Site one (PM)', 'site staff edit ignored, assigned PM edit applied');

-- Staff cannot grant themselves finance.
select tests.login(:'site');
update public.memberships set can_view_finance = true where user_id = :'site';
select tests.logout();
select is((select can_view_finance from public.memberships where user_id = :'site'), false, 'staff cannot change their own permissions');

select * from finish();
rollback;
