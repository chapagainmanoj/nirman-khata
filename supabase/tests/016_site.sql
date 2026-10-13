-- Site work (req §16, §17): stages, progress, daily reports with labour, calendar
-- (acceptance #10, #11, #23; L2; H2 progress side; S2 for site records).
begin;
\ir helpers/helpers.psql
select plan(30);

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_user('pm') as pm \gset
select tests.create_company('Site Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'pm', array['project_manager']::public.app_role[], false);
update public.memberships set can_record_payments = true where user_id = :'site';

select tests.login(:'owner');
-- Budget 10,00,000 (pre-filled from the contract).
select public.create_project(:'co', 'A', 'Project A', 100000000) as pa \gset
select public.create_project(:'co', 'B', 'Project B', 100000000) as pb \gset
select tests.supplier(:'co', 'Gandaki Hardware') as sup \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select tests.assign(:'co', :'pa', :'pm');
select id as crew from public.crews where project_id = :'pa' and is_default \gset

-- Stages from the built-in list; only Admin or the project manager sets them up.
select tests.login(:'site');
select throws_ok($$ select public.create_stages('$$ || :'pa' || $$', array['Excavation']) $$,
  '42501', null, 'site staff cannot set up stages');
select tests.logout();
select tests.login(:'pm');
select is(public.create_stages(:'pa', array['Excavation', 'Foundation', 'Structure/Slab', 'Masonry']), 4,
  'the project manager creates stages from the list');
select is(public.create_stages(:'pa', array['Foundation', 'Plaster']), 1, 'existing stage names are skipped');
select throws_ok($$ select public.copy_stages('$$ || :'pa' || $$', '$$ || :'pb' || $$') $$,
  '42501', null, 'stages are copied only onto a project the person may plan');
select tests.logout();
select tests.login(:'owner');
select is(public.copy_stages(:'pa', :'pb'), 5, 'Admin copies stages to another project');
select tests.logout();
select id as found from public.stages where project_id = :'pa' and name = 'Foundation' \gset

-- Progress: append only, reason when it goes down; as of a past date (H2).
select tests.login(:'site');
select lives_ok($$ select public.add_progress_update(jsonb_build_object('id', 'cccc0000-0000-0000-0000-000000000001',
  'project_id', '$$ || :'pa' || $$', 'stage_id', '$$ || :'found' || $$', 'effective_date', '2026-05-01', 'pct', 60)) $$,
  'site staff record stage progress');
select lives_ok($$ select public.add_progress_update(jsonb_build_object('id', 'cccc0000-0000-0000-0000-000000000001',
  'project_id', '$$ || :'pa' || $$', 'stage_id', '$$ || :'found' || $$', 'effective_date', '2026-05-01', 'pct', 60)) $$,
  'a retry with the same id returns the saved update');
select is((select count(*) from public.progress_updates where stage_id = :'found'), 1::bigint, 'the retry adds nothing');
select throws_like($$ select public.add_progress_update(jsonb_build_object('id', gen_random_uuid(),
  'project_id', '$$ || :'pa' || $$', 'stage_id', '$$ || :'found' || $$', 'effective_date', '2026-05-03', 'pct', 50)) $$,
  'reason_required: progress goes down from 60% to 50%%', 'lowering progress needs a reason');
select lives_ok($$ select public.add_progress_update(jsonb_build_object('id', 'cccc0000-0000-0000-0000-000000000002',
  'project_id', '$$ || :'pa' || $$', 'stage_id', '$$ || :'found' || $$', 'effective_date', '2026-05-03', 'pct', 50,
  'reason', 'Column cracked, part redone')) $$, 'with a reason it is saved');
select public.add_progress_update(jsonb_build_object('id', 'cccc0000-0000-0000-0000-000000000003',
  'project_id', :'pa', 'effective_date', '2026-05-04', 'pct', 40, 'notes', 'Overall'));
select throws_ok($$ update public.progress_updates set pct = 99 where id = 'cccc0000-0000-0000-0000-000000000002' $$,
  '42501', null, 'progress updates cannot be edited');
select tests.logout();
select throws_ok($$ delete from public.progress_updates where id = 'cccc0000-0000-0000-0000-000000000002' $$,
  'P0001', null, 'progress updates cannot be deleted, even directly');
select tests.login(:'site');
select is((select pct from public.progress_as_of(:'pa', '2026-05-02') where stage_id = :'found'), 60.00,
  'H2: as of 2 May the stage shows the update effective then');
select is((select pct from public.progress_as_of(:'pa', '2026-05-05') where stage_id = :'found'), 50.00,
  'H2: as of 5 May it shows the later, lower update');
select is((select pct from public.progress_as_of(:'pa', '2026-05-05') where stage_id is null), 40.00,
  'overall progress is its own entry, not an average of stages');

-- Acceptance #23: a delivery recorded once shows in the report day without re-entry.
select public.record_delivery(jsonb_build_object('id', 'dddd0000-0000-0000-0000-000000000001', 'supplier_id', :'sup',
  'project_id', :'pa', 'receipt_date', '2026-05-04', 'no_slip_reason', 'Urgent',
  'lines', jsonb_build_array(jsonb_build_object('material_id', tests.material(:'co', 'Cement'),
    'unit_id', tests.unit(:'co', 'bag'), 'received_qty', 60))));

-- L2: a daily report with labour, paid now; submitted twice under one key.
select public.submit_daily_report('eeee0000-0000-0000-0000-000000000001', jsonb_build_object(
  'id', 'eeee0000-0000-0000-0001-000000000001', 'project_id', :'pa', 'work_date', '2026-05-04',
  'stage_id', :'found', 'work_done', 'Foundation concrete, grid A-C', 'headcount', 12, 'weather', 'Sunny',
  'lines', jsonb_build_array(jsonb_build_object('description', 'PCC', 'qty', 3.5, 'unit_id', tests.unit(:'co', 'cum'))),
  'labour', jsonb_build_object('crew_id', :'crew', 'amount_paisa', 1440000, 'pay_now', jsonb_build_object('method', 'cash'))
)) as r1 \gset
select is(public.submit_daily_report('eeee0000-0000-0000-0000-000000000001', jsonb_build_object(
  'id', 'eeee0000-0000-0000-0001-000000000001', 'project_id', :'pa', 'work_date', '2026-05-04',
  'stage_id', :'found', 'work_done', 'Foundation concrete, grid A-C', 'headcount', 12, 'weather', 'Sunny',
  'lines', jsonb_build_array(jsonb_build_object('description', 'PCC', 'qty', 3.5, 'unit_id', tests.unit(:'co', 'cum'))),
  'labour', jsonb_build_object('crew_id', :'crew', 'amount_paisa', 1440000, 'pay_now', jsonb_build_object('method', 'cash'))
)), :'r1'::jsonb, 'L2: a retry after a timeout returns the first result');
select tests.logout();
select is((select count(*) from public.daily_reports where project_id = :'pa'), 1::bigint, 'L2: one report');
select is((select count(*) from public.labour_costs where daily_report_id = 'eeee0000-0000-0000-0001-000000000001'), 1::bigint,
  'L2: one labour cost, linked to the report');
select is(tests.ledger(:'crew', :'pa', 'cost_paisa'), 1440000::bigint, 'the report''s labour is project cost');
select is(tests.ledger(:'crew', :'pa', 'balance_paisa'), 0::bigint, 'paid now: nothing owed to the crew');
select throws_ok($$ update public.daily_reports set work_done = 'changed' where id = 'eeee0000-0000-0000-0001-000000000001' $$,
  'P0001', null, 'a sent report cannot be changed');

select tests.login(:'site');
select is((select array_agg(kind order by kind) from public.report_day(:'pa', '2026-05-04')), array['delivery', 'report'],
  'acceptance #23: the report day lists the delivery already recorded');
select tests.logout();

-- Labour is ignored when the company does not track own labour.
update public.companies set labour_module_enabled = false where id = :'co';
select tests.login(:'site');
select public.submit_daily_report(gen_random_uuid(), jsonb_build_object(
  'id', 'eeee0000-0000-0000-0001-000000000002', 'project_id', :'pa', 'work_date', '2026-05-04',
  'work_done', 'Shuttering', 'headcount', 4,
  'labour', jsonb_build_object('crew_id', :'crew', 'amount_paisa', 400000, 'confirm_duplicate', true)));
select tests.logout();
select is((select count(*) from public.labour_costs where daily_report_id = 'eeee0000-0000-0000-0001-000000000002'), 0::bigint,
  'with own labour off, a report creates no labour cost');
update public.companies set labour_module_enabled = true where id = :'co';

-- Acceptance #10: 40% progress and 65% of budget used are separate figures.
select tests.login(:'owner');
select tests.posted_bill(:'co', :'sup', :'pa', 63560000, '2026-05-04');
select is(tests.project_cost(:'pa') * 100
  / (select budget_paisa from public.project_amounts_as_of(:'pa')), 65::bigint,
  'acceptance #10: cost is 65% of budget');
select is((select pct from public.progress_as_of(:'pa', '2026-05-05') where stage_id is null), 40.00,
  'acceptance #10: progress stays 40%, unaffected by cost');

-- Acceptance #11: one day shows reports, deliveries, costs and payments by business date.
select public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'supplier_id', :'sup',
  'payment_date', '2026-05-04', 'amount_paisa', 20000000, 'method', 'bank_transfer',
  'allocations', jsonb_build_array(jsonb_build_object('project_id', :'pa', 'amount_paisa', 20000000))));
select is((select array_agg(distinct kind order by kind) from public.calendar_events(:'co', '2026-05-04', '2026-05-04')),
  array['bill_post', 'delivery', 'labour_save', 'payment_post', 'progress', 'report'],
  'acceptance #11: the day has the report, progress, delivery, bill, labour and payments');
select is((select sum(cost_paisa) from public.calendar_events(:'co', '2026-05-04', '2026-05-04'))::bigint, 65000000::bigint,
  'day total cost: bill 6,35,600 + labour 14,400');
select is((select money from public.calendar_events(:'co', '2026-05-04', '2026-05-04') where kind = 'payment_post' and party_name = 'Gandaki Hardware'),
  'payment', 'a payment not matched to a bill, and not peski, shows as a payment');
select tests.logout();

-- Site staff see the site rows but no money; nothing from a project they are not on.
select tests.login(:'site');
select is((select count(*) from public.calendar_events(:'co', '2026-05-01', '2026-05-31') where cost_paisa is not null or cash_paisa is not null),
  0::bigint, 'site staff get no amounts in the calendar');
select tests.logout();
select tests.login(:'owner');
select public.submit_daily_report(gen_random_uuid(), jsonb_build_object(
  'id', 'eeee0000-0000-0000-0001-000000000003', 'project_id', :'pb', 'work_date', '2026-05-04', 'work_done', 'Site clearing'));
select tests.logout();
select tests.login(:'site');
select is((select count(*) from public.daily_reports where project_id = :'pb'), 0::bigint,
  'reports on a project someone is not assigned to stay hidden');
select tests.logout();

select * from finish();
rollback;
