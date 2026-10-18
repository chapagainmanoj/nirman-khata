-- Attendance days: Draft and Verified (req §14, 2026-10-18). A draft carries no money; Verified makes
-- it labour cost; a verified day can still be changed, its cost adjusted at the same rate, paid or
-- not; site staff work up to 7 days back; the khata shows a changed day once.
begin;
\ir helpers/helpers.psql
select plan(22);

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('site') as site \gset
select tests.create_user('other') as other \gset
select tests.create_company('Hajiri Nirman', :'owner') as co \gset
select tests.create_company('Arko Nirman', :'other') as co2 \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Bhandari house', 1000000000) as pa \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select id as crew from public.crews where project_id = :'pa' and is_default \gset
update public.companies set labour_mode = 'attendance' where id = :'co';

create function tests.av_row(p_worker uuid, p_date date, p_minutes int, p_absent boolean default false) returns jsonb
language sql as $$
  select jsonb_build_object('project_id', (select project_id from public.crews c where c.id = (select crew_id from public.crew_members m where m.worker_id = p_worker limit 1)),
    'crew_id', (select crew_id from public.crew_members m where m.worker_id = p_worker limit 1),
    'worker_id', p_worker, 'work_date', p_date, 'minutes', p_minutes, 'absent', p_absent)
$$;
create function tests.av_day(p_worker uuid, p_date date) returns jsonb language sql as $$
  select to_jsonb(r) from jsonb_array_elements(public.crew_month(
    (select crew_id from public.crew_members m where m.worker_id = p_worker limit 1), p_date, p_date) -> 'workers') w,
    jsonb_array_elements(w -> 'rows') r
  where w ->> 'id' = p_worker::text
$$;
create function tests.av_verify(p_worker uuid, p_date date, p_one boolean default true) returns jsonb language sql as $$
  select public.verify_attendance(gen_random_uuid(), tests.av_row(p_worker, p_date, 0)
    || jsonb_build_object('worker_id', case when p_one then p_worker end))
$$;
grant execute on all functions in schema tests to authenticated;

select tests.login(:'acct');
select public.add_crew_worker(:'crew', jsonb_build_object('id', gen_random_uuid(), 'name', 'Ram',
  'rate_kind', 'daily', 'rate_paisa', 100000)) as ram \gset
select public.add_crew_worker(:'crew', jsonb_build_object('id', gen_random_uuid(), 'name', 'Gopal',
  'rate_kind', 'daily', 'rate_paisa', 80000)) as gopal \gset

-- A draft: marked, no money.
select public.set_attendance(tests.av_row(:'ram', '2026-05-01', 480));
select results_eq($$select (r ->> 'verified')::boolean, r -> 'amount_paisa' = 'null'::jsonb from tests.av_day('$$ || :'ram' || $$', '2026-05-01') r$$,
  $$values (false, true)$$, 'a marked day is a draft with no amount');
select is(tests.ledger(:'ram', :'pa', 'balance_paisa'), 0::bigint, '... and nothing is owed for it');

-- Verified: labour cost, owed to Ram.
select tests.av_verify(:'ram', '2026-05-01') as v \gset
select is((:'v'::jsonb ->> 'total_paisa')::bigint, 100000::bigint, 'verifying adds the day to labour cost');
select is(tests.ledger(:'ram', :'pa', 'balance_paisa'), 100000::bigint, '... owed to Ram');
select is((tests.av_day(:'ram', '2026-05-01') ->> 'verified')::boolean, true, '... and the day shows verified');
select throws_like($$select public.set_attendance(tests.av_row('$$ || :'ram' || $$', '2026-05-01', 240))$$,
  'day_verified%', 'a verified day is not changed by an ordinary mark');
select throws_like($$select tests.av_verify('$$ || :'ram' || $$', '2026-05-01')$$, 'Nothing to verify%', 'nothing left to verify');

-- Paid, then changed to 9 h: owed only the extra hour, at the day's rate.
select public.record_payment(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'worker_id', :'ram',
  'payment_date', '2026-05-01', 'amount_paisa', 100000,
  'allocations', jsonb_build_array(jsonb_build_object('project_id', :'pa', 'amount_paisa', 100000)),
  'settlements', (select jsonb_agg(jsonb_build_object('doc_id', l.id, 'project_id', :'pa', 'amount_paisa', 100000))
                  from public.labour_costs l where l.worker_id = :'ram')));
select tests.logout();
update public.workers set rate_paisa = 200000 where id = :'ram';
select tests.login(:'acct');
select public.change_attendance(gen_random_uuid(), tests.av_row(:'ram', '2026-05-01', 540)) as c \gset
select is((:'c'::jsonb ->> 'total_paisa')::bigint, 112500::bigint, 'a change keeps the day''s rate (not the new one)');
select is(tests.ledger(:'ram', :'pa', 'balance_paisa'), 12500::bigint, '... the paid 1,000 comes off it: 125 owed');
select is((select count(*) from public.labour_costs where worker_id = :'ram' and status = 'posted'), 1::bigint, '... one cost for the day');
select results_eq($$select reason from public.party_khata('$$ || :'ram' || $$') where doc_kind = 'labour'$$,
  $$values ('Changed from 8 h'::text)$$, 'the khata shows the day once, with what it was');

-- Changed to 4 h: the difference is paid ahead.
select public.change_attendance(gen_random_uuid(), tests.av_row(:'ram', '2026-05-01', 240));
select is(tests.ledger(:'ram', :'pa', 'balance_paisa'), -50000::bigint, 'fewer hours on a paid day: Ram holds the difference');
select is((select count(*) from public.party_khata(:'ram') where doc_kind = 'labour'), 1::bigint, '... still one line for the day');

-- Changed to absent: no cost, still verified.
select public.change_attendance(gen_random_uuid(), tests.av_row(:'ram', '2026-05-01', 0, true));
select is(tests.ledger(:'ram', :'pa', 'balance_paisa'), -100000::bigint, 'changed to absent: the day costs nothing');
select is((tests.av_day(:'ram', '2026-05-01') ->> 'verified')::boolean, true, '... and stays verified');

-- Absent verified on its own; the crew's day verified at once.
select public.set_attendance(tests.av_row(:'gopal', '2026-05-02', 0, true));
select public.set_attendance(tests.av_row(:'ram', '2026-05-02', 480));
select tests.av_verify(:'ram', '2026-05-02', false) as both \gset
select is((:'both'::jsonb ->> 'days')::int, 2, 'verifying the crew''s day takes every draft, absent too');
select is(tests.ledger(:'ram', :'pa', 'balance_paisa'), 100000::bigint, '... at the rate now, less what Ram held');

-- Site staff: up to 7 days back.
select tests.login(:'site');
select lives_ok($$select public.set_attendance(tests.av_row('$$ || :'gopal' || $$', private.today() - 7, 480))$$, 'site staff mark 7 days back');
select lives_ok($$select tests.av_verify('$$ || :'gopal' || $$', private.today() - 7)$$, '... and verify it');
select throws_ok($$select public.set_attendance(tests.av_row('$$ || :'gopal' || $$', private.today() - 8, 480))$$,
  '42501', null, '... not 8 days back');
select throws_ok($$select public.change_attendance(gen_random_uuid(), tests.av_row('$$ || :'ram' || $$', '2026-05-02', 240))$$,
  '42501', null, '... nor change an old verified day');
select tests.login(:'other');
select throws_ok($$select tests.av_verify('$$ || :'ram' || $$', '2026-05-02')$$, '42501', null, 'another company cannot verify');

select * from finish();
rollback;
