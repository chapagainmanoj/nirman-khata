-- Worker's time card (req §14, GLOSSARY: Attendance, Close day): one worker's month across
-- projects, and closing that worker's open days, each for the crew owed on that project.
begin;
\ir helpers/helpers.psql
select plan(22);

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_user('viewer') as viewer \gset
select tests.create_company('Time Card Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'viewer', array['viewer']::public.app_role[], false);
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Bhandari house', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Lakeside', 1000000000) as pb \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select tests.assign(:'co', :'pa', :'viewer');
select id as crew_a from public.crews where project_id = :'pa' and is_default \gset
select id as crew_b from public.crews where project_id = :'pb' and is_default \gset
update public.companies set labour_mode = 'attendance' where id = :'co';

create function tests.tc_mark(p_project uuid, p_crew uuid, p_member uuid, p_date text, p_in text, p_out text, p_minutes int)
returns jsonb language sql as $$
  select public.set_attendance(jsonb_build_object('project_id', p_project, 'crew_id', p_crew, 'member_id', p_member,
    'work_date', p_date, 'time_in', p_in, 'time_out', p_out, 'minutes', p_minutes))
$$;
create function tests.tc_close(p_member uuid, p_pay boolean default false, p_key uuid default gen_random_uuid())
returns jsonb language sql as $$
  select public.close_worker_days(p_key, jsonb_build_object('member_id', p_member,
    'from_date', '2026-05-01', 'to_date', '2026-05-31',
    'pay_now', case when p_pay then jsonb_build_object('method', 'cash') end))
$$;
grant execute on all functions in schema tests to authenticated;

-- Ram (1,200 a day) and Gopal (150 an hour) on the Bhandari crew. Ram splits 2 May with Lakeside.
select tests.login(:'owner');
insert into public.crew_members (company_id, crew_id, name, rate_kind, rate_paisa)
values (:'co', :'crew_a', 'Ram Bahadur', 'daily', 120000) returning id as ram \gset
insert into public.crew_members (company_id, crew_id, name, rate_kind, rate_paisa)
values (:'co', :'crew_a', 'Gopal Rai', 'hourly', 15000) returning id as gopal \gset
select tests.tc_mark(:'pa', :'crew_a', :'ram', '2026-05-01', '08:00', '17:00', 480);
select tests.tc_mark(:'pa', :'crew_a', :'ram', '2026-05-02', '08:00', '12:00', 240);
select tests.tc_mark(:'pb', :'crew_b', :'ram', '2026-05-02', '13:00', '17:00', 240);
select tests.tc_mark(:'pa', :'crew_a', :'ram', '2026-05-03', '08:00', '17:00', 480);
select tests.tc_mark(:'pa', :'crew_a', :'gopal', '2026-05-01', '08:00', '17:00', 480);
select tests.tc_mark(:'pa', :'crew_a', :'gopal', '2026-05-04', '08:00', '17:00', 480);

-- Reading the month.
select tests.login(:'site');
select is(jsonb_array_length(public.worker_month(:'ram', '2026-05-01', '2026-05-31') -> 'rows'), 4,
  'the card shows every day the worker has, on any project');
select is((select count(*) from jsonb_array_elements(public.worker_month(:'ram', '2026-05-01', '2026-05-31') -> 'rows') r
    where r ->> 'project_id' is null and not (r ->> 'editable')::boolean and r ->> 'time_in' = '13:00:00'), 1::bigint,
  '... a project the user cannot see shows only the times taken');
select is(public.worker_month(:'ram', '2026-05-01', '2026-05-31') #>> '{member,crew_name}', 'Site crew',
  'the card names the worker''s crew');
select throws_ok($$select public.worker_month('$$ || :'ram' || $$', '2026-05-01', '2026-07-01')$$, '22023', null,
  'a card covers at most 32 days');
select tests.login(:'viewer');
select throws_ok($$select public.worker_month('$$ || :'ram' || $$', '2026-05-01', '2026-05-31')$$, '42501', null,
  'a viewer cannot open a time card');

-- Close Ram's open days as Bhandari staff: three Bhandari crew-days, Gopal's 1 May with them.
-- 1 May 1,200 + 1,200; 2 May 4 h of 1,200 = 600; 3 May 1,200.
select tests.login(:'site');
select throws_ok($$select tests.tc_close('$$ || :'ram' || $$', true)$$, '42501', null,
  'without payment rights the days cannot be closed as paid');
select results_eq($$select (r ->> 'days')::int, (r ->> 'crews')::int, (r ->> 'total_paisa')::bigint
    from tests.tc_close('$$ || :'ram' || $$') r$$,
  $$values (3, 1, 420000::bigint)$$, 'closing a worker closes each of their open crew-days');
select tests.logout();
select is((select count(*) from public.attendance where member_id = :'gopal' and labour_cost_id is null), 1::bigint,
  '... a crew-day without this worker stays open');
select is((select count(*) from public.attendance where project_id = :'pb' and labour_cost_id is null), 1::bigint,
  '... and so do days on projects the user cannot enter');
select is(tests.project_cost(:'pa'), 420000::bigint, 'the Bhandari cost is posted once per day');

select tests.login(:'site');
select throws_like($$select tests.tc_close('$$ || :'ram' || $$')$$, '%No open days%', 'nothing left to close is refused');

-- The owner closes the Lakeside afternoon, paid now, owed to Lakeside's crew. A retry repeats nothing.
select tests.login(:'owner');
select tests.tc_close(:'ram', true, '00000000-0000-0000-0000-00000000c105') as first \gset
select is(tests.tc_close(:'ram', true, '00000000-0000-0000-0000-00000000c105'), :'first'::jsonb,
  'the same operation key returns the first result');
select tests.logout();
select is(tests.project_cost(:'pb'), 60000::bigint, 'Lakeside is charged for its afternoon');
select is(tests.ledger(:'crew_b', :'pb', 'balance_paisa'), 0::bigint, '... owed to Lakeside''s crew and paid now');

-- Splitting a day keeps its hours and its in and out, and saves both sides or neither.
create function tests.tc_split(p_member uuid, p_date text, p_from uuid, p_to uuid, p_crew uuid)
returns jsonb language sql as $$
  select public.split_attendance(jsonb_build_object('member_id', p_member, 'work_date', p_date,
    'from_project', p_from, 'to_project', p_to, 'to_crew', p_crew))
$$;
create function tests.tc_day(p_member uuid, p_date text)
returns table (project_id uuid, time_in time, time_out time, minutes int) language sql as $$
  select a.project_id, a.time_in, a.time_out, a.minutes from public.attendance a
  where a.member_id = p_member and a.work_date = p_date::date order by a.time_in
$$;
grant execute on all functions in schema tests to authenticated;
select tests.login(:'owner');
insert into public.crew_members (company_id, crew_id, name, rate_kind, rate_paisa)
values (:'co', :'crew_b', 'Hari Thapa', 'daily', 100000) returning id as hari \gset
select tests.tc_mark(:'pa', :'crew_a', :'ram', '2026-06-01', '08:00', '17:00', 480);
select tests.tc_mark(:'pa', :'crew_a', :'ram', '2026-06-02', '08:00', '12:00', 240);
select tests.tc_mark(:'pa', :'crew_a', :'ram', '2026-06-03', '08:00', '17:00', 300);
select tests.tc_mark(:'pa', :'crew_a', :'ram', '2026-06-04', '08:00', '17:00', 480);
select tests.tc_mark(:'pb', :'crew_b', :'hari', '2026-06-04', '08:00', '17:00', 480);
select public.close_labour_day(gen_random_uuid(), jsonb_build_object('project_id', :'pb', 'crew_id', :'crew_b', 'from_date', '2026-06-04'));

select tests.tc_split(:'ram', '2026-06-01', :'pa', :'pb', :'crew_b');
select results_eq($$select * from tests.tc_day('$$ || :'ram' || $$', '2026-06-01')$$,
  $$values ('$$ || :'pa' || $$'::uuid, '08:00'::time, '12:00'::time, 240), ('$$ || :'pb' || $$'::uuid, '13:00'::time, '17:00'::time, 240)$$,
  'a full day splits into the morning and the afternoon, around the break');
select tests.tc_split(:'ram', '2026-06-02', :'pa', :'pb', :'crew_b');
select results_eq($$select * from tests.tc_day('$$ || :'ram' || $$', '2026-06-02')$$,
  $$values ('$$ || :'pa' || $$'::uuid, '08:00'::time, '10:00'::time, 120), ('$$ || :'pb' || $$'::uuid, '10:00'::time, '12:00'::time, 120)$$,
  'a half day splits within its own times');
select tests.tc_split(:'ram', '2026-06-03', :'pa', :'pb', :'crew_b');
select is((select sum(minutes)::int from tests.tc_day(:'ram', '2026-06-03')), 300,
  'a day with fewer hours than its in to out keeps its hours when split');
select is((select count(*) from tests.tc_day(:'ram', '2026-06-03') where time_in >= '08:00' and time_out <= '17:00'), 2::bigint,
  '... and both parts stay inside its in and out');
select throws_like($$select tests.tc_split('$$ || :'ram' || $$', '2026-06-04', '$$ || :'pa' || $$', '$$ || :'pb' || $$', '$$ || :'crew_b' || $$')$$,
  'day_closed%', 'the other project''s closed day refuses the split');
select results_eq($$select * from tests.tc_day('$$ || :'ram' || $$', '2026-06-04')$$,
  $$values ('$$ || :'pa' || $$'::uuid, '08:00'::time, '17:00'::time, 480)$$,
  '... and the first project keeps the whole day');
select throws_like($$select tests.tc_split('$$ || :'ram' || $$', '2026-06-01', '$$ || :'pa' || $$', '$$ || :'pb' || $$', '$$ || :'crew_b' || $$')$$,
  '%already marked on that project%', 'a split does not overwrite a day already on the other project');
select throws_like($$select tests.tc_split('$$ || :'ram' || $$', '2026-06-05', '$$ || :'pa' || $$', '$$ || :'pb' || $$', '$$ || :'crew_b' || $$')$$,
  '%Mark the day%', 'an unmarked day cannot be split');
select tests.logout();

select * from finish();
rollback;
