-- Long reports are read page by page in a stable order (app data/rpc.ts rpcAll): each row needs a
-- unique key, and the key order must be the order the report shows when it fits on one page.
begin;
\ir helpers/helpers.psql
select plan(4);

select tests.create_user('owner') as owner \gset
select tests.create_company('Keys Nirman', :'owner') as co \gset

select tests.login(:'owner');
select public.create_project(p_company => :'co', p_code => 'A', p_name => 'Project A', p_contract_paisa => 120000000,
  p_budget_paisa => 100000000, p_effective_date => '2026-04-01') as pa \gset
select tests.supplier(:'co', 'Gandaki Hardware') as sup \gset
select tests.material(:'co', 'Cement') as cement \gset
select tests.unit(:'co', 'bag') as bag \gset

-- One slip lists the same material four times: before, these rows were alike in every column.
select public.save_slip_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-000000000001', 'supplier_id', :'sup', 'request_date', '2026-05-01',
  'lines', (select jsonb_agg(jsonb_build_object(
      'id', format('bbbbbbbb-0000-0000-0001-%s', lpad(i::text, 12, '0')),
      'project_id', :'pa', 'material_id', :'cement', 'qty', 10, 'unit_id', :'bag') order by i)
    from generate_series(1, 4) i)));
select public.submit_slip('bbbbbbbb-0000-0000-0000-000000000001');
select public.decide_slip('bbbbbbbb-0000-0000-0000-000000000001', true);

select is((select count(*)::int from public.report_pending_orders(:'co') where doc_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 4,
  'pending orders: one row per slip line');
select is((select count(distinct line_id)::int from public.report_pending_orders(:'co')),
  (select count(*)::int from public.report_pending_orders(:'co')), 'pending orders: each row has its own line_id');

-- Budget on several headings, so the heading tree has an order to keep.
select public.add_budget_revision(:'pa', '2026-05-01', 100000000, 'Detailed budget',
  (select jsonb_agg(jsonb_build_object('heading_id', h.id, 'amount_paisa', 1000000))
   from public.cost_headings h where h.company_id = :'co' and h.active));

select cmp_ok((select count(*)::int from public.report_cost_by_heading(:'co')), '>', 5, 'cost by heading has several rows');
select is((select array_agg(row_order) from public.report_cost_by_heading(:'co')),
  (select array_agg(i::bigint order by i) from generate_series(1, (select count(*)::int from public.report_cost_by_heading(:'co'))) i),
  'cost by heading: row_order numbers the rows 1..n in the order the report shows them');

select * from finish();
rollback;
