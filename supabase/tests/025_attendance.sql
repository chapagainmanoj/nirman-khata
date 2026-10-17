-- Attendance (req §14, GLOSSARY: Worker, Crew Member, Attendance, Close day): workers with hourly or
-- daily rates on a project's crew, in/out per worker per day, a worker brought in on another
-- project, and closing days into each worker's labour cost through the labour writer (ledger, pay
-- now, near-duplicates, reversal).
begin;
\ir helpers/helpers.psql
select plan(34);

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('site') as site \gset
select tests.create_user('site2') as site2 \gset
select tests.create_user('viewer') as viewer \gset
select tests.create_company('Hajiri Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'site2', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'viewer', array['viewer']::public.app_role[], false);
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Bhandari house', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Lakeside', 1000000000) as pb \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select tests.assign(:'co', :'pb', :'site2');
select tests.assign(:'co', :'pa', :'viewer');
select id as crew_a from public.crews where project_id = :'pa' and is_default \gset
select id as crew_b from public.crews where project_id = :'pb' and is_default \gset

create function tests.mark(p_project uuid, p_crew uuid, p_worker uuid, p_date text, p_in text, p_out text, p_minutes int)
returns jsonb language sql as $$
  select public.set_attendance(jsonb_build_object('project_id', p_project, 'crew_id', p_crew, 'worker_id', p_worker,
    'work_date', p_date, 'time_in', p_in, 'time_out', p_out, 'minutes', p_minutes))
$$;
create function tests.close(p_project uuid, p_crew uuid, p_from text, p_to text default null, p_pay boolean default false,
  p_confirm boolean default false)
returns jsonb language sql as $$
  select public.close_labour_day(gen_random_uuid(), jsonb_build_object('project_id', p_project, 'crew_id', p_crew,
    'from_date', p_from, 'to_date', p_to, 'confirm_duplicate', p_confirm,
    'pay_now', case when p_pay then jsonb_build_object('method', 'cash') end))
$$;
grant execute on all functions in schema tests to authenticated;

-- Workers: staff who work on the crew's project add them; others do not see their rates.
select tests.login(:'site');
select public.add_crew_worker(:'crew_a', jsonb_build_object('id', gen_random_uuid(), 'name', 'Ram Bahadur',
  'work_type', 'Dakarmi', 'rate_kind', 'daily', 'rate_paisa', 120000)) as ram \gset
select public.add_crew_worker(:'crew_a', jsonb_build_object('id', gen_random_uuid(), 'name', 'Gopal Rai',
  'work_type', 'Helper', 'rate_kind', 'hourly', 'rate_paisa', 15000)) as gopal \gset
select is((select count(*) from public.workers), 2::bigint, 'site staff add workers to their project''s crew');
select tests.login(:'site2');
select throws_ok($$select public.add_crew_worker('$$ || :'crew_a' || $$', jsonb_build_object('id', gen_random_uuid(),
  'name', 'Hari', 'rate_kind', 'daily', 'rate_paisa', 90000))$$, '42501', null,
  'staff of another project cannot add to this crew');
select is((select count(*) from public.workers), 0::bigint, '... and do not see its workers'' rates');
select tests.login(:'owner');
select public.add_crew_worker(:'crew_b', jsonb_build_object('id', gen_random_uuid(), 'name', 'Bishnu Karki',
  'work_type', 'Dakarmi', 'rate_kind', 'daily', 'rate_paisa', 125000)) as bishnu \gset

-- The company still works by day totals: attendance is refused.
select tests.login(:'site');
select throws_like($$select tests.mark('$$ || :'pa' || $$', '$$ || :'crew_a' || $$', '$$ || :'ram' || $$', '2026-05-04', '08:00', '17:00', 480)$$,
  '%attendance_off%', 'attendance is refused while the company enters day totals');
select tests.logout();
update public.companies set labour_mode = 'attendance' where id = :'co';

-- Marking, checks and unset.
select tests.login(:'site');
select tests.mark(:'pa', :'crew_a', :'ram', '2026-05-04', '08:00', '12:00', 240);
select tests.mark(:'pa', :'crew_a', :'gopal', '2026-05-04', '08:00', '18:00', 540);
select is((select minutes from public.attendance where worker_id = :'gopal'), 540, 'in, out and hours are saved');
select throws_ok($$select tests.mark('$$ || :'pa' || $$', '$$ || :'crew_a' || $$', '$$ || :'gopal' || $$', '2026-05-04', '17:00', '08:00', 60)$$,
  '23514', null, 'out before in is refused');
select throws_ok($$select tests.mark('$$ || :'pa' || $$', '$$ || :'crew_a' || $$', '$$ || :'gopal' || $$', '2026-05-04', '08:00', '10:00', 300)$$,
  '23514', null, 'more hours than in to out is refused');
select throws_ok($$select tests.mark('$$ || :'pa' || $$', '$$ || :'crew_a' || $$', '$$ || :'gopal' || $$', '2999-01-01', '08:00', '17:00', 480)$$,
  '22023', null, 'a future day is refused');
select throws_like($$select tests.mark('$$ || :'pa' || $$', '$$ || :'crew_b' || $$', '$$ || :'gopal' || $$', '2026-05-04', '08:00', '17:00', 480)$$,
  '%Choose a crew%', 'another project''s crew cannot be marked here');
select tests.mark(:'pa', :'crew_a', :'gopal', '2026-05-03', null, null, 480);
select tests.mark(:'pa', :'crew_a', :'gopal', '2026-05-03', null, null, 0);
select is((select count(*) from public.attendance where work_date = '2026-05-03'), 0::bigint, 'unset removes the row');

-- Brought in: Ram spends the afternoon at Lakeside, marked on Lakeside's crew by its staff.
select tests.login(:'site2');
select is((select count(*) from public.project_workers(:'pb')), 3::bigint, 'project_workers lists every active worker to bring in');
select throws_like($$select tests.mark('$$ || :'pb' || $$', '$$ || :'crew_b' || $$', '$$ || :'ram' || $$', '2026-05-04', '11:00', '17:00', 360)$$,
  '%attendance_overlap%', 'times that overlap the worker''s other project are refused');
select tests.mark(:'pb', :'crew_b', :'ram', '2026-05-04', '13:00', '17:00', 240);
select is((select count(*) from public.attendance), 1::bigint, 'Lakeside staff see only Lakeside''s rows');
select tests.logout();
select is((select count(*) from public.attendance where worker_id = :'ram' and work_date = '2026-05-04'), 2::bigint,
  'a day split between two projects is two rows');
select tests.login(:'site2');
select throws_ok($$select * from public.project_workers('$$ || :'pa' || $$')$$, '42501', null,
  'staff of another project cannot list workers there');

-- Close the Bhandari day: Ram 4h of a daily 1,200 = 600; Gopal 9h × 150 = 1,350.
select tests.login(:'site');
select throws_ok($$select tests.close('$$ || :'pa' || $$', '$$ || :'crew_a' || $$', '2026-05-04', null, true)$$,
  '42501', null, 'without payment rights the day cannot be closed as paid');
select tests.close(:'pa', :'crew_a', '2026-05-04') ->> 'labour_cost_ids' as ids_a \gset
select tests.logout();
select is(tests.project_cost(:'pa'), 195000::bigint, 'closing posts the day''s cost to the project');
select is(tests.ledger(:'ram', :'pa', 'balance_paisa'), 60000::bigint, '... owed to each worker: Ram 600');
select is(tests.ledger(:'gopal', :'pa', 'balance_paisa'), 135000::bigint, '... and Gopal 1,350');
select is(tests.ledger(:'crew_a', :'pa', 'balance_paisa'), 0::bigint, '... not to the crew');
select results_eq($$select worker_id, headcount, person_days, amount_paisa from public.labour_costs
    where project_id = '$$ || :'pa' || $$' order by amount_paisa$$,
  $$values ('$$ || :'ram' || $$'::uuid, 1, 0.50::numeric(8,2), 60000::bigint), ('$$ || :'gopal' || $$'::uuid, 1, 1.13::numeric(8,2), 135000::bigint)$$,
  'one labour cost per worker for the day, with their share of a day');
select is((select sum(amount_paisa) from public.attendance where project_id = :'pa'), 195000::numeric,
  'each row keeps its priced amount');

-- Closed rows are locked until the cost is reversed.
select tests.login(:'site');
select throws_like($$select tests.mark('$$ || :'pa' || $$', '$$ || :'crew_a' || $$', '$$ || :'gopal' || $$', '2026-05-04', '08:00', '17:00', 480)$$,
  '%day_closed%', 'a closed day cannot be changed');

-- Lakeside closes its afternoon of Ram, paid now: owed to Lakeside's crew, settled at once.
select tests.login(:'owner');
select tests.close(:'pb', :'crew_b', '2026-05-04', null, true);
select tests.logout();
select is(tests.project_cost(:'pb'), 60000::bigint, 'a brought-in worker''s hours cost the project they worked on');
select is(tests.ledger(:'ram', :'pb', 'balance_paisa'), 0::bigint, '... owed to the worker and paid now');
select is((select count(*) from public.payments where worker_id = :'ram'), 1::bigint, '... with a payment to the worker');

-- Reverse Gopal's cost: his day opens again (Ram's stays closed) and closes again with the change.
select tests.login(:'acct');
select public.reverse_cost_entry(gen_random_uuid(),
  (select id from public.labour_costs where worker_id = :'gopal' and project_id = :'pa'), '2026-05-05', 'Gopal left early');
select tests.login(:'site');
select tests.mark(:'pa', :'crew_a', :'gopal', '2026-05-04', '08:00', '12:00', 240);
select tests.close(:'pa', :'crew_a', '2026-05-04');
select tests.logout();
select is(tests.project_cost(:'pa'), 120000::bigint, 'after a reversal the day is fixed and closed again (600 + 600)');

-- A day already entered as a total needs the same confirm as on the labour form.
select tests.login(:'site');
select public.save_labour_cost(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', :'pa',
  'crew_id', :'crew_a', 'work_date', '2026-05-05', 'amount_paisa', 100000));
select tests.mark(:'pa', :'crew_a', :'ram', '2026-05-05', '08:00', '17:00', 480);
select throws_like($$select tests.close('$$ || :'pa' || $$', '$$ || :'crew_a' || $$', '2026-05-05')$$,
  '%near_duplicate%', 'a day with a typed total needs confirming');
select lives_ok($$select tests.close('$$ || :'pa' || $$', '$$ || :'crew_a' || $$', '2026-05-05', null, false, true)$$,
  '... and closes once confirmed');

-- Several days at once: one labour cost per day.
select tests.mark(:'pa', :'crew_a', :'ram', '2026-05-06', '08:00', '17:00', 480);
select tests.mark(:'pa', :'crew_a', :'ram', '2026-05-07', '08:00', '17:00', 480);
select is(jsonb_array_length(tests.close(:'pa', :'crew_a', '2026-05-06', '2026-05-07') -> 'labour_cost_ids'), 2,
  'closing a range posts one labour cost per day');
select throws_like($$select tests.close('$$ || :'pa' || $$', '$$ || :'crew_a' || $$', '2026-05-08')$$,
  '%Mark at least one worker%', 'a day with nobody marked cannot be closed');

-- Who sees attendance.
select is((select count(*) from public.attendance where project_id = :'pa'), 5::bigint, 'staff on the project see its attendance');
select tests.login(:'viewer');
select is((select count(*) from public.attendance), 0::bigint, 'a viewer does not');
select tests.login(:'site');
select throws_ok($$insert into public.attendance (company_id, project_id, crew_id, worker_id, work_date, minutes)
  values ('$$ || :'co' || $$', '$$ || :'pa' || $$', '$$ || :'crew_a' || $$', '$$ || :'ram' || $$', '2026-05-09', 60)$$,
  '42501', null, 'attendance is written only through set_attendance');

select * from finish();
rollback;
