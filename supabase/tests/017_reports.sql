-- Dashboards and reports (req §18, §19): acceptance #14 (dashboard, reports and ledgers agree),
-- #19 (as-of uses the budget revision effective then), H1 (settlement before a reversal),
-- H3 (I-10 property test), and who sees which amounts.
begin;
\ir helpers/helpers.psql
select plan(23);

create function tests.pay(p_supplier uuid, p_date date, p_amount bigint, p_allocs jsonb default '[]')
returns uuid language sql as $$
  select (public.record_payment(gen_random_uuid(), jsonb_build_object(
    'id', gen_random_uuid(), 'supplier_id', p_supplier, 'payment_date', p_date, 'amount_paisa', p_amount,
    'allocations', (select coalesce(jsonb_agg(jsonb_build_object('project_id', a ->> 0, 'amount_paisa', (a ->> 1)::bigint)), '[]')
                    from jsonb_array_elements(p_allocs) a))) ->> 'payment_id')::uuid
$$;
create function tests.credit(p_bill uuid, p_date date, p_amount bigint) returns uuid
language sql as $$
  select (public.post_credit(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'bill_id', p_bill,
    'credit_date', p_date, 'reason', 'Rate correction', 'lines', jsonb_build_array(jsonb_build_object(
      'bill_line_id', (select id from public.bill_lines where bill_id = p_bill limit 1), 'amount_paisa', p_amount))))
    ->> 'credit_id')::uuid
$$;
grant execute on all functions in schema tests to authenticated;

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_company('Report Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);

select tests.login(:'owner');
select public.create_project(p_company => :'co', p_code => 'A', p_name => 'Project A', p_contract_paisa => 120000000,
  p_budget_paisa => 100000000, p_effective_date => '2026-04-01') as pa \gset
select public.create_project(p_company => :'co', p_code => 'B', p_name => 'Project B', p_contract_paisa => 50000000,
  p_effective_date => '2026-04-01') as pb \gset
select tests.supplier(:'co', 'Gandaki Hardware') as s1 \gset
select tests.supplier(:'co', 'Pokhara Steel') as s2 \gset
select id as crew from public.crews where project_id = :'pa' and is_default \gset
select tests.heading(:'co', 'Cement') as h_cement \gset
-- Budget revised from June: Cement 1,00,000 within a 9,00,000 total.
select public.add_budget_revision(:'pa', '2026-06-01', 90000000, 'Scope cut',
  jsonb_build_array(jsonb_build_object('heading_id', :'h_cement', 'amount_paisa', 10000000)));

-- Fixture for #14 on Project A: bill, credit, a bill later reversed, payment matched, labour paid now, expense.
select tests.posted_bill(:'co', :'s1', :'pa', 30000000, '2026-05-01') as b1 \gset
select tests.credit(:'b1', '2026-05-03', 1000000);
select tests.posted_bill(:'co', :'s1', :'pa', 5000000, '2026-05-02') as b2 \gset
select public.reverse_bill(gen_random_uuid(), :'b2', '2026-05-10', 'Entered twice');
select tests.pay(:'s1', '2026-05-05', 20000000, jsonb_build_array(jsonb_build_array(:'pa', 20000000))) as p1 \gset
select public.settle(gen_random_uuid(), jsonb_build_array(jsonb_build_object(
  'payment_id', :'p1', 'bill_id', :'b1', 'project_id', :'pa', 'amount_paisa', 20000000)));
select public.save_labour_cost(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', :'pa',
  'crew_id', :'crew', 'work_date', '2026-05-06', 'amount_paisa', 1440000, 'pay_now', jsonb_build_object('method', 'cash')));
select public.save_expense(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(), 'project_id', :'pa',
  'heading_id', tests.heading(:'co', 'Equipment / Machinery Hire'), 'expense_date', '2026-05-07', 'amount_paisa', 600000,
  'description', 'JCB 2 hours', 'payee', jsonb_build_object('name', 'Shyam JCB')));

-- #14: dashboard, reports, khata and the ledger agree for the same date.
select public.project_dashboard(:'pa', '2026-05-31') as dash \gset
select is((:'dash'::jsonb ->> 'cost_paisa')::bigint, 30000000 - 1000000 + 1440000 + 600000::bigint,
  '#14: recorded cost = bill - credit + labour + expense (the reversed bill nets out)');
select is((:'dash'::jsonb ->> 'cost_paisa')::bigint, tests.project_cost(:'pa'), '#14: dashboard cost = ledger');
select is((select sum(cost_paisa) from public.report_cost_by_heading(:'co', '2026-05-31', :'pa'))::bigint,
  (:'dash'::jsonb ->> 'cost_paisa')::bigint, '#14: cost-by-heading report total = dashboard cost');
select is((select sum(balance_paisa) from public.party_khata(:'s1', null, '2026-05-31', :'pa'))::bigint,
  (:'dash'::jsonb -> 'payable_by_kind' ->> 'supplier')::bigint, '#14: supplier khata = dashboard supplier payable');
select is((:'dash'::jsonb -> 'payable_by_kind' ->> 'supplier')::bigint, 30000000 - 1000000 - 20000000::bigint,
  '... 2,90,000 billed less 2,00,000 paid');
select is((select sum(project_paisa) from public.report_payments(:'co', '2026-05-01', '2026-05-31', :'pa'))::bigint,
  (:'dash'::jsonb ->> 'cash_paid_paisa')::bigint, '#14: payment register total = dashboard cash paid');
select is((:'dash'::jsonb -> 'by_source' ->> 'materials')::bigint + (:'dash'::jsonb -> 'by_source' ->> 'labour')::bigint
  + (:'dash'::jsonb -> 'by_source' ->> 'other')::bigint, (:'dash'::jsonb ->> 'cost_paisa')::bigint,
  'cost by source adds up to recorded cost');
select is((public.company_dashboard(:'co', '2026-05-01', '2026-05-31', '2026-05-31') ->> 'cost_period_paisa')::bigint,
  tests.project_cost(:'pa') + tests.project_cost(:'pb'), '#14: company dashboard period cost = sum of projects');
select is((select sum(qty) from public.report_material_purchases(:'co', '2026-05-01', '2026-05-31', :'pa')), 1::numeric,
  'material purchases leave out the reversed bill');

-- #19: as of May the original budget applies (no heading split); from June the revision.
select is((:'dash'::jsonb ->> 'budget_paisa')::bigint, 100000000::bigint, '#19: as of May, the original budget');
select is((select distinct budget_effective_date from public.report_cost_by_heading(:'co', '2026-05-31', :'pa')), '2026-04-01'::date,
  '#19: the May report says which revision it uses');
select is((select budget_paisa from public.report_cost_by_heading(:'co', '2026-05-31', :'pa') where heading_id = :'h_cement'), null::bigint,
  '#19: ... which had no Cement budget');
select is((select budget_paisa from public.report_cost_by_heading(:'co', '2026-06-30', :'pa') where heading_id = :'h_cement'), 10000000::bigint,
  '#19: as of June, the revised Cement budget');
select is((public.project_dashboard(:'pa', '2026-06-30') -> 'by_heading') @> jsonb_build_array(jsonb_build_object('heading_id', :'h_cement', 'over', true)),
  true, 'the dashboard flags Cement over its heading budget');

-- H1: a settlement shows in reports dated before the payment's reversal.
select tests.posted_bill(:'co', :'s2', :'pb', 10000000, '2026-05-01') as b3 \gset
select tests.pay(:'s2', '2026-05-02', 10000000, jsonb_build_array(jsonb_build_array(:'pb', 10000000))) as p2 \gset
select public.settle(gen_random_uuid(), jsonb_build_array(jsonb_build_object(
  'payment_id', :'p2', 'bill_id', :'b3', 'project_id', :'pb', 'amount_paisa', 10000000)));
select public.reverse_payment(gen_random_uuid(), :'p2', '2026-05-20', 'Cheque bounced');
select results_eq(
  format($$select settled_paisa, reversed_on from public.report_payments(%L, '2026-05-01', '2026-05-31', null, %L, '2026-05-19')$$, :'co', :'s2'),
  $$values (10000000::bigint, null::date)$$, 'H1: as of 19 May the payment settled the bill');
select results_eq(
  format($$select settled_paisa, reversed_on from public.report_payments(%L, '2026-05-01', '2026-05-31', null, %L, '2026-05-25')$$, :'co', :'s2'),
  $$values (0::bigint, '2026-05-20'::date)$$, 'H1: as of 25 May it is reversed and settles nothing');

-- H3: random postings, payments, splits, credits and reversals; I-10 and the documents agree throughout.
create temp table h3 (step integer, party uuid, ledger bigint, split bigint, docs bigint);
do $$
declare
  v_co uuid := (select id from public.companies where name = 'Report Nirman');
  v_parties uuid[] := array(select id from public.suppliers where company_id = v_co order by name);
  v_projects uuid[] := array(select id from public.projects where company_id = v_co order by code);
  v_party uuid; v_project uuid; v_other uuid; v_doc uuid; v_amt bigint; v_doc_amt bigint; i integer; r integer;
begin
  perform setseed(0.42);
  for i in 1..60 loop
    v_party := v_parties[1 + floor(random() * array_length(v_parties, 1))::int];
    v_project := v_projects[1 + floor(random() * 2)::int];
    v_other := v_projects[case when v_project = v_projects[1] then 2 else 1 end];
    v_amt := (1 + floor(random() * 50)::bigint) * 10000;
    r := floor(random() * 7)::int;
    begin
      if r = 0 or r = 1 then
        perform tests.posted_bill(v_co, v_party, v_project, v_amt, date '2026-07-01' + i);
      elsif r = 2 then
        perform tests.pay(v_party, date '2026-07-01' + i, v_amt,
          case when random() < 0.3 then '[]'::jsonb
               else jsonb_build_array(jsonb_build_array(v_project, v_amt / 2), jsonb_build_array(v_other, v_amt - v_amt / 2)) end);
      elsif r = 3 then
        select p.id into v_doc from public.payments p where p.supplier_id = v_party and p.status = 'posted' order by random() limit 1;
        if v_doc is not null then
          perform public.allocate_payment(gen_random_uuid(), v_doc,
            jsonb_build_array(jsonb_build_object('project_id', v_project, 'amount_paisa', 10000)), 'Move');
        end if;
      elsif r = 4 then
        select b.id into v_doc from public.supplier_bills b where b.supplier_id = v_party and b.status = 'posted' order by random() limit 1;
        if v_doc is not null then perform tests.credit(v_doc, date '2026-07-01' + i, 10000); end if;
      elsif r = 6 then
        -- Refund from the bucket holding the most advance. When the party is owed money overall,
        -- overpay first (unallocated) so it holds an advance, as before a supplier sends one back.
        select coalesce(sum(balance_paisa), 0) into v_doc_amt from public.ledger_entries where party_id = v_party;
        if v_doc_amt >= 0 then
          perform tests.pay(v_party, date '2026-07-01' + i, v_doc_amt + v_amt, '[]'::jsonb);
        end if;
        select b into v_project from unnest(array[v_project, v_other, null]) b
        order by public.refund_available(v_party, b) desc limit 1;
        v_amt := least(v_amt / 2 + 1, public.refund_available(v_party, v_project));
        if v_amt > 0 then
          perform public.record_refund(gen_random_uuid(), jsonb_build_object('id', gen_random_uuid(),
            'supplier_id', v_party, 'project_id', v_project, 'refund_date', date '2026-07-01' + i, 'amount_paisa', v_amt));
        end if;
      else
        if random() < 0.5 then
          select b.id into v_doc from public.supplier_bills b where b.supplier_id = v_party and b.status = 'posted' order by random() limit 1;
          if v_doc is not null then perform public.reverse_bill(gen_random_uuid(), v_doc, date '2026-07-01' + i, 'Wrong'); end if;
        else
          select p.id into v_doc from public.payments p where p.supplier_id = v_party and p.status = 'posted' order by random() limit 1;
          if v_doc is not null then perform public.reverse_payment(gen_random_uuid(), v_doc, date '2026-07-01' + i, 'Bounced'); end if;
        end if;
      end if;
    exception when others then
      null; -- a refused step (over-allocation, credit above the bill) changes nothing; that is fine
    end;
    insert into h3
    select i, s.supplier_id, s.balance_paisa, s.project_balance_paisa + s.unallocated_paisa,
      coalesce((select sum(c.total_paisa) from public.supplier_bills b join public.supplier_bill_charges c on c.id = b.id
                where b.supplier_id = s.supplier_id and b.status = 'posted'), 0)
      - coalesce((select sum(cl.amount_paisa) from public.credits cr join public.credit_lines cl on cl.credit_id = cr.id
                  where cr.supplier_id = s.supplier_id and cr.status = 'posted'), 0)
      - coalesce((select sum(p.amount_paisa) from public.payments p where p.supplier_id = s.supplier_id and p.status = 'posted'), 0)
      + coalesce((select sum(f.amount_paisa) from public.refunds f where f.supplier_id = s.supplier_id and f.status = 'posted'), 0)
    from public.supplier_balances(v_co) s;
  end loop;
end $$;
select is((select count(*) from h3 where ledger <> split), 0::bigint, 'H3: I-10 holds after every step (balance = projects + unallocated)');
select is((select count(*) from h3 where ledger <> docs), 0::bigint, 'H3: every balance equals bills - credits - payments + refunds still posted');
select ok((select count(distinct step) from h3) = 60
  and (select count(*) from public.reversals r join public.suppliers x on x.id = r.supplier_id where x.company_id = :'co') >= 3
  and (select count(*) from public.credits c join public.suppliers x on x.id = c.supplier_id where x.company_id = :'co') >= 3
  and (select count(*) from public.payment_allocation_events e where e.company_id = :'co') >= 1
  and (select count(*) from public.refunds f where f.company_id = :'co') >= 1,
  'H3: checked after each of 60 steps that included reversals, credits, split moves and refunds');
select tests.logout();

-- Who sees what: site staff get the site figures, never amounts or unassigned projects.
select tests.assign(:'co', :'pa', :'site');
select tests.login(:'site');
select is((public.project_dashboard(:'pa') ->> 'money_visible')::boolean, false, 'site staff: no money on the dashboard');
select is(public.project_dashboard(:'pa') ->> 'cost_paisa', null, '... cost is not shown as 0, it is left out');
select is((select count(*) from public.report_cost_by_heading(:'co', null, :'pa')), 0::bigint, '... and the cost report is empty');
select is(public.project_dashboard(:'pb'), null, 'an unassigned project has no dashboard');
select tests.logout();

select * from finish();
rollback;
