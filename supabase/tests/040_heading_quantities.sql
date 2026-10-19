-- Quantities beside cost by heading (req §18.3, 2026-10-19): units of material by unit, never
-- added across units; labour person-days and attendance hours; the same as-of, as-known and
-- reversal rules as the money; and only for users who see the project's money.
begin;
\ir helpers/helpers.psql
select plan(12);

create function tests.qty(p_company uuid, p_project uuid, p_heading text, p_kind text, p_unit text default null,
  p_as_of date default '2026-05-31', p_as_known boolean default false) returns numeric
language sql as $$
  select q.qty from public.report_heading_quantities(p_company, p_as_of, p_project, p_as_known) q
  where q.heading_id = tests.heading(p_company, p_heading) and q.kind = p_kind and q.unit is not distinct from p_unit
$$;
create function tests.qty_bill(p_company uuid, p_supplier uuid, p_project uuid, p_date date, p_lines jsonb)
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform public.save_bill_draft(jsonb_build_object('id', v_id, 'supplier_id', p_supplier,
    'bill_no', 'Q-' || left(v_id::text, 8), 'bill_date', p_date,
    'lines', (select jsonb_agg(jsonb_build_object('project_id', p_project, 'heading_id', tests.heading(p_company, l ->> 0),
      'description', l ->> 0, 'qty', (l ->> 1)::numeric, 'unit_id', tests.unit(p_company, l ->> 2), 'unit_note', l ->> 4,
      'amount_paisa', (l ->> 3)::bigint, 'unmatched_reason', 'test bill')) from jsonb_array_elements(p_lines) l)));
  perform public.post_bill(gen_random_uuid(), v_id);
  return v_id;
end $$;
grant execute on all functions in schema tests to authenticated;

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_user('other') as other \gset
select tests.create_user('acct') as acct \gset
select tests.create_company('Matra Nirman', :'owner') as co \gset
select tests.create_company('Arko Nirman', :'other') as co2 \gset
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);

select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Project A', 100000000) as pa \gset
select tests.supplier(:'co', 'Shrestha Cement') as s1 \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select id as crew from public.crews where project_id = :'pa' and is_default \gset

select tests.login(:'owner');
-- Cement in two lines of one bill, and Baluwa by the trip and by the cft.
select tests.qty_bill(:'co', :'s1', :'pa', '2026-05-01', jsonb_build_array(
  jsonb_build_array('Cement', 50, 'bag', 3500000), jsonb_build_array('Cement', 10, 'bag', 700000),
  jsonb_build_array('Baluwa/Gitti/Dhunga', 2, 'trip', 1000000, 'Tipper'), jsonb_build_array('Baluwa/Gitti/Dhunga', 150, 'cft', 900000)));
-- A second cement bill, reversed on 10 May.
select tests.qty_bill(:'co', :'s1', :'pa', '2026-05-02', jsonb_build_array(jsonb_build_array('Cement', 20, 'bag', 1400000))) as b2 \gset
select public.reverse_bill(gen_random_uuid(), :'b2', '2026-05-10', 'Entered twice');

select is(tests.qty(:'co', :'pa', 'Cement', 'material', 'bag'), 60.000, 'cement lines add up in bags (the reversed bill nets out)');
select is(tests.qty(:'co', :'pa', 'Cement', 'material', 'bag', '2026-05-05'), 80.000, '... before its reversal date the second bill still counts');
select results_eq($$select unit, qty from public.report_heading_quantities('$$ || :'co' || $$', '2026-05-31', '$$ || :'pa' || $$')
  where heading_id = tests.heading('$$ || :'co' || $$', 'Baluwa/Gitti/Dhunga') order by unit$$,
  $$values ('cft'::text, 150.000::numeric), ('trip', 2.000)$$, 'different units stay apart, never summed');
select is(tests.qty(:'co', :'pa', 'Cement', 'material', 'bag', '2026-04-30'), null, 'nothing before the first bill');

-- Labour entered by hand: person-days only.
select public.save_labour_cost(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', :'pa',
  'crew_id', :'crew', 'work_date', '2026-05-06', 'amount_paisa', 250000, 'headcount', 3, 'person_days', 2.5));
select id as l1 from public.labour_costs where crew_id = :'crew' and work_date = '2026-05-06' \gset
select is(tests.qty(:'co', :'pa', 'Own Labour (Jyala)', 'person_days'), 2.500, 'labour person-days');
select is(tests.qty(:'co', :'pa', 'Own Labour (Jyala)', 'hours'), null, '... and no hours without attendance');
select tests.logout();
select tests.login(:'acct');
select public.reverse_cost_entry(gen_random_uuid(), :'l1', '2026-05-20', 'Wrong crew');
select is(tests.qty(:'co', :'pa', 'Own Labour (Jyala)', 'person_days'), null, 'a reversed labour entry drops out');
select tests.logout();

-- Attendance: a verified 8-hour day, later changed to 9 hours.
update public.companies set labour_mode = 'attendance' where id = :'co';
select tests.login(:'acct');
select public.add_crew_worker(:'crew', jsonb_build_object('id', gen_random_uuid(), 'name', 'Ram',
  'rate_kind', 'daily', 'rate_paisa', 100000)) as ram \gset
select public.set_attendance(jsonb_build_object('project_id', :'pa', 'crew_id', :'crew', 'worker_id', :'ram',
  'work_date', '2026-05-07', 'minutes', 480, 'absent', false));
select public.verify_attendance(gen_random_uuid(), jsonb_build_object('project_id', :'pa', 'crew_id', :'crew',
  'worker_id', :'ram', 'work_date', '2026-05-07'));
select is(tests.qty(:'co', :'pa', 'Own Labour (Jyala)', 'hours'), 8.000, 'a verified attendance day gives its hours');
select public.change_attendance(gen_random_uuid(), jsonb_build_object('project_id', :'pa', 'crew_id', :'crew',
  'worker_id', :'ram', 'work_date', '2026-05-07', 'minutes', 540, 'absent', false));
select is(tests.qty(:'co', :'pa', 'Own Labour (Jyala)', 'hours'), 9.000, '... a changed day counts once, at its new hours');
select tests.logout();

-- As known: a bill entered today but dated in May is left out of "as known" on 31 May.
select is(tests.qty(:'co', :'pa', 'Cement', 'material', 'bag', '2026-05-31', true), null::numeric,
  'as known on 31 May leaves out bills entered after it');

-- Only users who see the project's money.
select tests.login(:'site');
select is((select count(*) from public.report_heading_quantities(:'co', '2026-05-31', :'pa')), 0::bigint,
  'site staff see no quantities in the cost report');
select tests.logout();
select tests.login(:'other');
select is((select count(*) from public.report_heading_quantities(:'co', '2026-05-31', :'pa')), 0::bigint,
  'another company sees nothing');
select tests.logout();

select * from finish();
rollback;
