-- Absent, the batch mark and labour not added to cost yet (req §14, GLOSSARY: Attendance, Close day).
-- An absent day is kept and told apart from a day not marked; it is never priced, closed or split.
begin;
\ir helpers/helpers.psql
-- These tests mark days long past as site staff; the 7-day limit has its own tests (038).
create or replace function private.can_mark_day(p_company uuid, p_date date) returns boolean language sql as $$ select true $$;
select plan(16);

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_user('other') as other \gset
select tests.create_company('Absent Nirman', :'owner') as co \gset
select tests.create_company('Arko Nirman', :'other') as co2 \gset
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Bhandari house', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Lakeside', 1000000000) as pb \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select id as crew_a from public.crews where project_id = :'pa' and is_default \gset
update public.companies set labour_mode = 'attendance' where id = :'co';

create function tests.ab_row(p_project uuid, p_crew uuid, p_worker uuid, p_date text, p_minutes int, p_absent boolean default false)
returns jsonb language sql as $$
  select jsonb_build_object('project_id', p_project, 'crew_id', p_crew, 'worker_id', p_worker,
    'work_date', p_date, 'minutes', p_minutes, 'absent', p_absent)
$$;
grant execute on all functions in schema tests to authenticated;

select tests.login(:'owner');
select public.add_crew_worker(:'crew_a', jsonb_build_object('id', gen_random_uuid(), 'name', 'Ram Bahadur',
  'rate_kind', 'daily', 'rate_paisa', 120000)) as ram \gset
select public.add_crew_worker(:'crew_a', jsonb_build_object('id', gen_random_uuid(), 'name', 'Gopal Rai',
  'rate_kind', 'hourly', 'rate_paisa', 15000)) as gopal \gset

-- Site staff mark the crew in one call: Ram in, Gopal absent, and one row that cannot be saved.
select tests.login(:'site');
select public.set_attendance_many(jsonb_build_array(
  tests.ab_row(:'pa', :'crew_a', :'ram', '2026-05-01', 480),
  tests.ab_row(:'pa', :'crew_a', :'gopal', '2026-05-01', 0, true),
  tests.ab_row(:'pa', :'crew_a', :'ram', '2999-01-01', 480))) as batch \gset
select is((:'batch'::jsonb ->> 'saved')::int, 2, 'a batch saves each row it can');
select is(jsonb_array_length(:'batch'::jsonb -> 'failed'), 1, '... and returns the rows it could not save');
select is((:'batch'::jsonb #>> '{failed,0,worker_id}')::uuid, :'ram'::uuid, '... naming the worker');

select results_eq($$select absent, minutes, time_in from public.attendance where worker_id = '$$ || :'gopal' || $$' and work_date = '2026-05-01'$$,
  $$values (true, 0, null::time)$$, 'an absent day is kept, with no hours or times');
select is((select r ->> 'absent' from jsonb_array_elements(
    public.crew_month(:'crew_a', '2026-05-01', '2026-05-31') #> '{workers}') w, jsonb_array_elements(w -> 'rows') r
    where w ->> 'id' = :'gopal'), 'true', 'the crew''s month shows it as absent');

-- Absent never counts as open work.
select is((select (w ->> 'draft_days')::int from jsonb_array_elements(public.crew_month(:'crew_a', '2026-05-01', '2026-05-31') -> 'workers') w
    where w ->> 'id' = :'gopal'), 1, 'an absent day is a draft until verified');
select throws_like($$select public.close_worker_days(gen_random_uuid(), jsonb_build_object('worker_id', '$$ || :'gopal' || $$',
    'project_id', '$$ || :'pa' || $$', 'to_date', '2026-05-31'))$$,
  '%No open days%', 'a worker with only absent days has nothing to close');
select throws_like($$select public.split_attendance(jsonb_build_object('worker_id', '$$ || :'gopal' || $$', 'work_date', '2026-05-01',
    'from_project', '$$ || :'pa' || $$', 'to_project', '$$ || :'pb' || $$'))$$,
  '%Mark the day%', 'an absent day cannot be split');

-- Closing the crew's day posts Ram only; Gopal's absent row stays, not closed.
select public.close_labour_day(gen_random_uuid(), jsonb_build_object('project_id', :'pa', 'crew_id', :'crew_a', 'from_date', '2026-05-01'));
select is((select count(*) from public.labour_costs where project_id = :'pa'), 1::bigint, 'closing posts the worked day only');
select results_eq($$select absent, labour_cost_id is null from public.attendance where worker_id = '$$ || :'gopal' || $$'$$,
  $$values (true, true)$$, '... and leaves the absent day as it was');

-- An absent day can become a worked day, and can be cleared back to not marked.
select public.set_attendance(tests.ab_row(:'pa', :'crew_a', :'gopal', '2026-05-01', 240));
select results_eq($$select absent, minutes from public.attendance where worker_id = '$$ || :'gopal' || $$'$$,
  $$values (false, 240)$$, 'marking hours on an absent day makes it a worked day');
select public.set_attendance(tests.ab_row(:'pa', :'crew_a', :'gopal', '2026-05-01', 0, true));
select public.set_attendance(tests.ab_row(:'pa', :'crew_a', :'gopal', '2026-05-01', 0));
select is((select count(*) from public.attendance where worker_id = :'gopal'), 0::bigint, 'clearing an absent day leaves it not marked');
select throws_like($$select public.set_attendance(tests.ab_row('$$ || :'pa' || $$', '$$ || :'crew_a' || $$', '$$ || :'ram' || $$', '2026-05-01', 0, true))$$,
  'day_verified%', 'a closed day cannot be made absent');

-- Labour not added to cost yet: Gopal 4 h open on 2 May.
select public.set_attendance(tests.ab_row(:'pa', :'crew_a', :'gopal', '2026-05-02', 240));
select public.set_attendance(tests.ab_row(:'pa', :'crew_a', :'ram', '2026-05-02', 0, true));
select tests.login(:'owner');
select results_eq($$select worker_id, days, minutes, amount_paisa from public.open_labour('$$ || :'co' || $$')$$,
  $$values ('$$ || :'gopal' || $$'::uuid, 1, 240, 60000::bigint)$$, 'open labour lists days not added to cost, without absent days');
select tests.login(:'site');
select results_eq($$select days, amount_paisa from public.open_labour('$$ || :'co' || $$')$$,
  $$values (1, null::bigint)$$, 'site staff see the days, not the money');
select tests.login(:'other');
select throws_ok($$select * from public.open_labour('$$ || :'co' || $$')$$, '42501', null, 'another company sees nothing');

select * from finish();
rollback;
