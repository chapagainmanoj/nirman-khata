-- payment_summaries.project_ids: the Payments list follows the current project.
begin;
\ir helpers/helpers.psql
select plan(5);

create function tests.pay(p_supplier uuid, p_amount bigint, p_allocs jsonb default '[]')
returns uuid language sql as $$
  select (public.record_payment(gen_random_uuid(), jsonb_build_object(
    'id', gen_random_uuid(), 'supplier_id', p_supplier, 'payment_date', '2026-05-01', 'amount_paisa', p_amount,
    'allocations', (select coalesce(jsonb_agg(jsonb_build_object('project_id', a ->> 0, 'amount_paisa', (a ->> 1)::bigint)), '[]')
                    from jsonb_array_elements(p_allocs) a))) ->> 'payment_id')::uuid
$$;
grant execute on function tests.pay to authenticated;
create function tests.ids(p_payment uuid) returns uuid[] language sql as $$
  select project_ids from public.payment_summaries where id = p_payment
$$;
grant execute on function tests.ids to authenticated;

select tests.create_user('owner') as owner \gset
select tests.create_company('Filter Nirman', :'owner') as co \gset
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Project A', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Project B', 1000000000) as pb \gset
select tests.supplier(:'co', 'Supplier X') as sx \gset

select tests.pay(:'sx', 100000) as advance \gset
select is(tests.ids(:'advance'), '{}'::uuid[], 'a payment not assigned to a project lists no projects');

select tests.pay(:'sx', 100000, jsonb_build_array(jsonb_build_array(:'pa', 100000))) as p1 \gset
select is(tests.ids(:'p1'), array[:'pa'::uuid], 'a payment assigned to A lists A');

-- Move part of it to B: both are listed.
select public.allocate_payment(gen_random_uuid(), :'p1', jsonb_build_array(
  jsonb_build_object('project_id', :'pa', 'amount_paisa', -40000),
  jsonb_build_object('project_id', :'pb', 'amount_paisa', 40000)), 'Split');
select is(tests.ids(:'p1')::text[] @> array[:'pa', :'pb'], true, 'after a part move, both projects are listed');

-- Move the rest: A drops out once it nets to zero.
select public.allocate_payment(gen_random_uuid(), :'p1', jsonb_build_array(
  jsonb_build_object('project_id', :'pa', 'amount_paisa', -60000),
  jsonb_build_object('project_id', :'pb', 'amount_paisa', 60000)), 'All to B');
select is(tests.ids(:'p1'), array[:'pb'::uuid], 'a project that nets to zero is not listed');

select is((select count(*) from public.payment_summaries where company_id = :'co' and project_ids @> array[:'pb'::uuid]),
  1::bigint, 'the list can filter payments by project');

select tests.logout();
select * from finish();
rollback;
