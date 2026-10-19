-- How the heavy read functions behave with a few years of data (Phase 6 review). Everything is
-- made through the real posting functions inside one transaction and rolled back at the end, so
-- the shared local database is left as it was. Run:
--   psql "$DB_URL" -X -q -v bills=3000 -v pays=1500 -f supabase/perf/volume.sql
-- Times are for comparison between runs on one machine, not absolute.
\set ON_ERROR_STOP on
\if :{?bills} \else \set bills 3000 \endif
\if :{?pays} \else \set pays 1500 \endif
begin;
\ir ../tests/helpers/helpers.psql

select tests.create_user('perf_owner') as owner \gset
select tests.create_company('Perf Builders', :'owner') as co \gset
select tests.login(:'owner');
select array_agg(public.create_project(:'co', 'P-' || g, 'Perf site ' || g, 10000000000)) as projects
from generate_series(1, 10) g \gset
select tests.logout();
select array_agg(tests.supplier(:'co', 'Perf supplier ' || g)) as suppliers from generate_series(1, 40) g \gset

\echo 'Posting' :bills 'bills and' :pays 'payments (half to one supplier, for a long khata)...'
select tests.login(:'owner');
\timing on
select count(tests.posted_bill(:'co',
  case when g % 2 = 0 then (:'suppliers'::uuid[])[1] else (:'suppliers'::uuid[])[1 + g % 40] end,
  (:'projects'::uuid[])[1 + g % 10], 100000 + (g % 97) * 1000, date '2024-01-01' + (g % 1000)))
from generate_series(1, :bills) g;
select count(public.record_payment(gen_random_uuid(), jsonb_build_object(
  'id', gen_random_uuid(),
  'supplier_id', case when g % 2 = 0 then (:'suppliers'::uuid[])[1] else (:'suppliers'::uuid[])[1 + g % 40] end,
  'payment_date', date '2024-01-05' + (g % 1000), 'amount_paisa', 50000,
  'allocations', jsonb_build_array(jsonb_build_object('project_id', (:'projects'::uuid[])[1 + g % 10], 'amount_paisa', 50000)))))
from generate_series(1, :pays) g;
\timing off

\echo
\echo '--- Reads, as the owner (RLS on). "rows" is what the API would have to page through.'
\timing on
\echo 'party_khata, the big supplier, everything:'
select count(*) as rows from public.party_khata((:'suppliers'::uuid[])[1]);
\echo 'party_khata, the big supplier, one project:'
select count(*) as rows from public.party_khata((:'suppliers'::uuid[])[1], null, null, (:'projects'::uuid[])[1]);
\echo 'party_open_items, the big supplier:'
select count(*) as rows from public.party_open_items((:'suppliers'::uuid[])[1]);
\echo 'party_balances, all suppliers:'
select count(*) as rows from public.party_balances(:'co', 'supplier');
\echo 'project_dashboard, one project:'
select length(public.project_dashboard((:'projects'::uuid[])[1])::text) as json_chars;
\echo 'company_dashboard:'
select length(public.company_dashboard(:'co', current_date, current_date, current_date)::text) as json_chars;
\echo 'report_payments, three years:'
select count(*) as rows from public.report_payments(:'co', '2024-01-01', '2026-12-31');
\echo 'report_cost_by_heading, company:'
select count(*) as rows from public.report_cost_by_heading(:'co');
\echo 'calendar_events, one month:'
select count(*) as rows from public.calendar_events(:'co', '2025-03-01', '2025-03-31');
\echo 'bill_summaries, first page of the Bills list:'
select count(*) as rows from (select * from public.bill_summaries where company_id = :'co' order by bill_date desc, id limit 50) b;
\timing off

rollback;
