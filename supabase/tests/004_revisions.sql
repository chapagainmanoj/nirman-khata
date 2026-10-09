-- Contract/budget revisions and as-of lookup (req v1.1 §6, §19.1; acceptance #19 budget part).
begin;
\ir helpers/helpers.psql
select plan(14);

select tests.create_user('owner') as owner \gset
select tests.create_company('Delta Nirman', :'owner') as co \gset
select tests.login(:'owner');

-- Budget omitted -> pre-filled from contract.
select public.create_project(:'co', 'D-1', 'Default budget', 500000000, null, '2026-04-01') as p1 \gset
select is((select budget_paisa from public.project_amounts_as_of(:'p1', '2026-05-01')), 500000000::bigint,
  'budget defaults to the contract amount');
select is((select planned_margin_paisa from public.project_amounts_as_of(:'p1', '2026-05-01')), 0::bigint,
  'planned margin is 0 when budget equals contract');

-- Explicit budget: contract 50 lakh, budget 40 lakh.
select public.create_project(:'co', 'D-2', 'Own budget', 500000000, 400000000, '2026-04-01') as p2 \gset
select is((select planned_margin_paisa from public.project_amounts_as_of(:'p2', '2026-05-01')), 100000000::bigint,
  'planned margin = contract - budget (10 lakh)');

-- Revisions effective later.
select public.add_contract_revision(:'p2', '2026-08-01', 550000000, 'Variation: extra floor');
select public.add_budget_revision(:'p2', '2026-08-01', 450000000, 'Extra floor') ->> 'id' as rev \gset

select is((select contract_paisa from public.project_amounts_as_of(:'p2', '2026-07-31')), 500000000::bigint,
  'as of the day before: original contract');
select is((select budget_paisa from public.project_amounts_as_of(:'p2', '2026-07-31')), 400000000::bigint,
  'as of the day before: original budget (acceptance #19)');
select is((select budget_paisa from public.project_amounts_as_of(:'p2', '2026-08-01')), 450000000::bigint,
  'from the effective date: revised budget');
select is((select original_budget_paisa from public.project_amounts_as_of(:'p2', '2026-09-01')), 400000000::bigint,
  'original budget still reported after revision');
select is((select count(*) from public.project_amounts_as_of(:'p2', '2026-03-31') where contract_paisa is null), 1::bigint,
  'before any revision: amounts are null (shown as Not available)');

-- Heading budgets: mismatch warns, does not block.
select id as h_cement from public.cost_headings where company_id = :'co' and name = 'Cement' \gset
select id as h_labour from public.cost_headings where company_id = :'co' and name = 'Own Labour (Jyala)' \gset
select is(
  (public.add_budget_revision(:'p2', '2026-09-01', 450000000, 'Split by heading',
    jsonb_build_array(
      jsonb_build_object('heading_id', :'h_cement', 'amount_paisa', 200000000),
      jsonb_build_object('heading_id', :'h_labour', 'amount_paisa', 200000000))) ->> 'lines_match_total')::boolean,
  false, 'heading budgets not adding up returns a warning flag');
select is(
  (public.add_budget_revision(:'p2', '2026-09-02', 400000000, 'Split matches',
    jsonb_build_array(
      jsonb_build_object('heading_id', :'h_cement', 'amount_paisa', 200000000),
      jsonb_build_object('heading_id', :'h_labour', 'amount_paisa', 200000000))) ->> 'lines_match_total')::boolean,
  true, 'heading budgets that add up pass');

select throws_ok(
  format($$select public.add_budget_revision(%L, '2026-09-03', 1, '  ')$$, :'p2'),
  '22023', null, 'a revision needs a reason'
);

-- History is immutable, even for the database owner.
select tests.logout();
select throws_ok(
  format($$update public.budget_revisions set total_paisa = 1 where id = %L$$, :'rev'),
  'P0001', null, 'budget revisions cannot be edited'
);
select throws_ok(
  format($$delete from public.contract_revisions where project_id = %L$$, :'p2'),
  'P0001', null, 'contract revisions cannot be deleted'
);
select throws_ok(
  format($$insert into public.contract_revisions (company_id, project_id, effective_date, amount_paisa, is_original) values (%L, %L, current_date, 1, true)$$, :'co', :'p2'),
  '23505', null, 'only one original contract per project'
);

select * from finish();
rollback;
