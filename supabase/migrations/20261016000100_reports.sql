-- Milestone 5: dashboards and reports (req §18, §19; acceptance #14, #19; H1).
-- Everything here only reads, as security invoker: row-level security decides what each person
-- sees, exactly as on the screens. Money figures come from ledger_entries, the same source as the
-- khata and project cost, so a dashboard, a report and a ledger agree for the same date (#14).
-- Amounts are returned as null, not 0, to someone who may not see a project's money.

-- Where a cost came from, by the kind of party it is owed to (req §18.2 "cost by source").
create function private.party_kind(l public.ledger_entries) returns text
language sql immutable set search_path = '' as $$
  select case
    when l.supplier_id is not null then 'supplier'
    when l.subcontractor_id is not null then 'subcontractor'
    when l.crew_id is not null then 'crew'
    else 'payee'
  end
$$;

create function private.party_name(p_party uuid) returns text
language sql stable set search_path = '' as $$
  select coalesce(
    (select name from public.suppliers where id = p_party),
    (select name from public.subcontractors where id = p_party),
    (select name from public.crews where id = p_party),
    (select name from public.payees where id = p_party))
$$;

-- Unbilled receipts on a project as of a date: lines and an estimate from the last billed rate.
create function private.unbilled_estimate(p_project uuid, p_as_of date)
returns table (lines bigint, value_paisa bigint, lines_without_rate bigint)
language sql stable set search_path = '' as $$
  with u as (
    select s.billable_qty, dl.material_id, d.supplier_id,
      (select r.rate_paisa from public.last_billed_rate(d.supplier_id, dl.material_id) r) as rate
    from public.delivery_line_status s
    join public.deliveries d on d.id = s.delivery_id
    join public.delivery_lines dl on dl.id = s.id
    where s.project_id = p_project and s.billable_qty > 0 and d.receipt_date <= p_as_of
  )
  select count(*), coalesce(sum(round(billable_qty * rate)), 0)::bigint, count(*) filter (where rate is null)
  from u
$$;

-- ===========================================================================
-- Project dashboard (req §18.2)
-- ===========================================================================
create function public.project_dashboard(p_project uuid, p_as_of date default null, p_as_known boolean default false)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_as_of date := coalesce(p_as_of, private.today());
  v_cutoff timestamptz := ((v_as_of + 1)::timestamp at time zone 'Asia/Kathmandu');
  p public.projects;
  a jsonb := '{}';
  v_money boolean;
  v_cost jsonb;
  v_headings jsonb;
  v_sources jsonb;
  v_advances bigint;
  v_progress numeric;
  v_unbilled record;
  v_drafts jsonb := '{}';
  v_last_report date;
  v_waiting bigint;
begin
  select * into p from public.projects where id = p_project;
  if not found then
    return null;
  end if;
  v_money := private.can_see_project_money(p.company_id, p.id);
  select pct into v_progress from public.progress_as_of(p_project, v_as_of) where stage_id is null;
  select max(work_date) into v_last_report from public.daily_reports where project_id = p_project and work_date <= v_as_of;
  select * into v_unbilled from private.unbilled_estimate(p_project, v_as_of);
  select count(*) into v_waiting
  from public.order_slips s join public.order_slip_progress g on g.id = s.id
  where s.status = 'approved' and g.fulfilment in ('not_received', 'partially_received')
    and exists (select 1 from public.order_slip_lines l where l.slip_id = s.id and l.project_id = p_project);

  if v_money then
    select to_jsonb(x) into a from public.project_amounts_as_of(p_project, v_as_of) x;
    a := coalesce(a, '{}');
    v_cost := public.project_cost_summary(p_project, v_as_of, p_as_known);

    -- Heading budget (the revision effective on the date) against recorded cost.
    select coalesce(jsonb_agg(jsonb_build_object(
        'heading_id', h.id, 'name', h.name, 'parent', ph.name,
        'budget_paisa', bl.amount_paisa, 'cost_paisa', coalesce(c.cost, 0),
        'over', bl.amount_paisa is not null and coalesce(c.cost, 0) > bl.amount_paisa)
      order by coalesce(ph.sort_order, h.sort_order), ph.name nulls first, h.sort_order, h.name), '[]')
    into v_headings
    from public.cost_headings h
    left join public.cost_headings ph on ph.id = h.parent_id
    left join public.budget_lines bl on bl.heading_id = h.id and bl.budget_revision_id = (a ->> 'budget_revision_id')::uuid
    left join (
      select l.heading_id, sum(l.cost_paisa)::bigint as cost from public.ledger_entries l
      where l.project_id = p_project and l.business_date <= v_as_of and (not p_as_known or l.posted_at < v_cutoff)
      group by l.heading_id
    ) c on c.heading_id = h.id
    where h.company_id = p.company_id and (bl.id is not null or coalesce(c.cost, 0) <> 0);

    select jsonb_build_object(
        'materials', coalesce(sum(l.cost_paisa) filter (where l.supplier_id is not null), 0),
        'subcontract', coalesce(sum(l.cost_paisa) filter (where l.subcontractor_id is not null), 0),
        'labour', coalesce(sum(l.cost_paisa) filter (where l.crew_id is not null), 0),
        'other', coalesce(sum(l.cost_paisa) filter (where l.payee_id is not null), 0))
    into v_sources
    from public.ledger_entries l
    where l.project_id = p_project and l.business_date <= v_as_of and (not p_as_known or l.posted_at < v_cutoff);

    -- Advances: parties paid more than they have charged on this project.
    select coalesce(sum(-least(b.balance, 0)), 0)::bigint into v_advances
    from (
      select l.party_id, sum(l.balance_paisa) as balance from public.ledger_entries l
      where l.project_id = p_project and l.business_date <= v_as_of and (not p_as_known or l.posted_at < v_cutoff)
      group by l.party_id
    ) b;

    select jsonb_build_object('bills', count(distinct b.id), 'typed_paisa', coalesce(sum(l.amount_paisa), 0)) into v_drafts
    from public.supplier_bills b join public.bill_lines l on l.bill_id = b.id
    where b.status in ('draft', 'under_review') and l.project_id = p_project;
  end if;

  return jsonb_build_object(
    'project_id', p.id, 'status', p.status, 'as_of', v_as_of,
    'view', case when p_as_known then 'as_known' else 'current' end,
    'money_visible', v_money,
    'progress_pct', v_progress,
    'last_report_date', v_last_report,
    'days_since_report', v_as_of - v_last_report,
    'slips_waiting', v_waiting,
    'unbilled_lines', v_unbilled.lines,
    'unbilled_estimate_paisa', case when v_money then v_unbilled.value_paisa end,
    'unbilled_without_rate', v_unbilled.lines_without_rate,
    'draft_bills', v_drafts -> 'bills',
    'draft_bills_paisa', v_drafts -> 'typed_paisa',
    'contract_paisa', a -> 'contract_paisa',
    'original_contract_paisa', a -> 'original_contract_paisa',
    'budget_paisa', a -> 'budget_paisa',
    'original_budget_paisa', a -> 'original_budget_paisa',
    'budget_revision_id', a -> 'budget_revision_id',
    'budget_effective_date', (select effective_date from public.budget_revisions where id = (a ->> 'budget_revision_id')::uuid),
    'planned_margin_paisa', a -> 'planned_margin_paisa',
    'cost_paisa', v_cost -> 'cost_paisa',
    'cash_paid_paisa', v_cost -> 'cash_paid_paisa',
    'payable_paisa', v_cost -> 'payable_paisa',
    'payable_by_kind', v_cost -> 'payable_by_kind',
    'advances_paisa', v_advances,
    'by_heading', v_headings,
    'by_source', v_sources,
    'final_result_paisa', case when v_money and p.status in ('completed', 'closed')
      then (a ->> 'contract_paisa')::bigint - (v_cost ->> 'cost_paisa')::bigint end
  );
end $$;

-- ===========================================================================
-- Company dashboard (req §18.1)
-- ===========================================================================
create function public.company_dashboard(p_company uuid, p_from date, p_to date, p_as_of date default null)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_as_of date := coalesce(p_as_of, private.today());
  v_money boolean := private.can_see_finance(p_company);
  v_projects jsonb;
  v_totals jsonb;
  v_parties jsonb;
  v_counts jsonb;
begin
  select coalesce(jsonb_agg(x.d order by x.status_order, x.code), '[]') into v_projects
  from (
    select pr.code, case when pr.status = 'active' then 0 when pr.status in ('planned', 'on_hold') then 1 else 2 end as status_order,
      jsonb_build_object('id', pr.id, 'code', pr.code, 'name', pr.name) || public.project_dashboard(pr.id, v_as_of) as d
    from public.projects pr
    where pr.company_id = p_company and pr.status not in ('cancelled', 'closed')
  ) x;

  if v_money then
    select jsonb_build_object(
        'cost_period_paisa', coalesce(sum(l.cost_paisa) filter (where l.business_date between p_from and p_to), 0),
        'cash_period_paisa', coalesce(sum(l.cash_paisa) filter (where l.business_date between p_from and p_to), 0),
        'cost_to_date_paisa', coalesce(sum(l.cost_paisa), 0),
        'cash_to_date_paisa', coalesce(sum(l.cash_paisa), 0))
    into v_totals
    from public.ledger_entries l
    where l.company_id = p_company and l.business_date <= v_as_of;

    -- Per party, whole company (I-10): positive is owed to them, negative is an advance.
    -- Payments not yet given to a project sit in the unallocated bucket (project null).
    select jsonb_build_object(
        'payable_by_kind', jsonb_build_object(
          'supplier', coalesce(sum(greatest(b.balance, 0)) filter (where b.kind = 'supplier'), 0),
          'subcontractor', coalesce(sum(greatest(b.balance, 0)) filter (where b.kind = 'subcontractor'), 0),
          'crew', coalesce(sum(greatest(b.balance, 0)) filter (where b.kind = 'crew'), 0),
          'payee', coalesce(sum(greatest(b.balance, 0)) filter (where b.kind = 'payee'), 0)),
        'advances_paisa', coalesce(sum(-least(b.balance, 0)), 0),
        'unallocated_paisa', coalesce(sum(-b.unallocated), 0),
        'unallocated_parties', count(*) filter (where b.unallocated <> 0))
    into v_parties
    from (
      select l.party_id, private.party_kind(l) as kind, sum(l.balance_paisa) as balance,
        sum(l.balance_paisa) filter (where l.project_id is null) as unallocated
      from public.ledger_entries l
      where l.company_id = p_company and l.business_date <= v_as_of
      group by l.party_id, private.party_kind(l)
    ) b;
  end if;

  select jsonb_build_object(
      'slips_to_approve', (select count(*) from public.order_slips s where s.company_id = p_company and s.status = 'pending'),
      'slips_waiting', (select count(*) from public.order_slips s join public.order_slip_progress g on g.id = s.id
        where s.company_id = p_company and s.status = 'approved' and g.fulfilment in ('not_received', 'partially_received')),
      'unbilled_lines', (select count(*) from public.delivery_line_status s where s.company_id = p_company and s.billable_qty > 0),
      'bills_to_post', (select count(*) from public.supplier_bills b where b.company_id = p_company and b.status = 'under_review'))
  into v_counts;

  return jsonb_build_object('as_of', v_as_of, 'from', p_from, 'to', p_to, 'money_visible', v_money,
    'projects', v_projects, 'counts', v_counts)
    || coalesce(v_totals, '{}') || coalesce(v_parties, '{}');
end $$;

-- ===========================================================================
-- Reports (req §18.3). Ledgers (4, 5) are party_khata; the cost summary (1) is project_dashboard.
-- ===========================================================================

-- 2, 3. Cost by heading, against the budget revision effective on the date (#19).
create function public.report_cost_by_heading(
  p_company uuid, p_as_of date default null, p_project uuid default null, p_as_known boolean default false
)
returns table (
  project_id uuid, heading_id uuid, heading text, parent_heading text,
  budget_paisa bigint, cost_paisa bigint, budget_revision_id uuid, budget_effective_date date
)
language sql stable security invoker set search_path = '' as $$
  with d as (
    select coalesce(p_as_of, private.today()) as as_of,
      ((coalesce(p_as_of, private.today()) + 1)::timestamp at time zone 'Asia/Kathmandu') as cutoff
  ),
  pr as (
    select pr.id, a.budget_revision_id, r.effective_date
    from public.projects pr, d
    cross join lateral public.project_amounts_as_of(pr.id, d.as_of) a
    left join public.budget_revisions r on r.id = a.budget_revision_id
    where pr.company_id = p_company and (p_project is null or pr.id = p_project)
      and private.can_see_project_money(pr.company_id, pr.id)
  ),
  c as (
    select l.project_id, l.heading_id, sum(l.cost_paisa)::bigint as cost
    from public.ledger_entries l, d
    where l.company_id = p_company and l.project_id in (select id from pr)
      and l.business_date <= d.as_of and (not p_as_known or l.posted_at < d.cutoff)
    group by l.project_id, l.heading_id
  ),
  b as (
    select pr.id as project_id, bl.heading_id, bl.amount_paisa
    from pr join public.budget_lines bl on bl.budget_revision_id = pr.budget_revision_id
  )
  select pr.id, h.id, h.name, ph.name, b.amount_paisa, coalesce(c.cost, 0), pr.budget_revision_id, pr.effective_date
  from pr
  join (select project_id, heading_id from c union select project_id, heading_id from b) k on k.project_id = pr.id
  join public.cost_headings h on h.id = k.heading_id
  left join public.cost_headings ph on ph.id = h.parent_id
  left join b on b.project_id = k.project_id and b.heading_id = k.heading_id
  left join c on c.project_id = k.project_id and c.heading_id = k.heading_id
  where coalesce(c.cost, 0) <> 0 or b.amount_paisa is not null
  order by pr.id, coalesce(ph.sort_order, h.sort_order), ph.name nulls first, h.sort_order, h.name
$$;

-- 6. Payment register: payments in a date range, what each settled as of a date (H1), and
-- whether it was reversed by then. A reversal never hides the original before its own date.
create function public.report_payments(
  p_company uuid, p_from date, p_to date, p_project uuid default null, p_party uuid default null, p_as_of date default null
)
returns table (
  payment_id uuid, number text, payment_date date, party_kind text, party_id uuid, party_name text,
  method public.payment_method, reference text, amount_paisa bigint, project_paisa bigint,
  settled_paisa bigint, reversed_on date
)
language sql stable security invoker set search_path = '' as $$
  with d as (select coalesce(p_as_of, greatest(p_to, private.today())) as as_of)
  select p.id, p.number, p.payment_date,
    case when p.supplier_id is not null then 'supplier' when p.subcontractor_id is not null then 'subcontractor'
         when p.crew_id is not null then 'crew' else 'payee' end,
    p.party_id, private.party_name(p.party_id), p.method, p.reference, p.amount_paisa,
    (select sum(l.cash_paisa)::bigint from public.ledger_entries l join public.posting_events e on e.id = l.event_id
     where e.payment_id = p.id and e.event_type = 'payment_post' and l.project_id = p_project),
    (select coalesce(sum(s.amount_paisa), 0)::bigint from public.settlement_events s, d
     where s.payment_id = p.id and s.business_date <= d.as_of and (p_project is null or s.project_id = p_project)),
    (select r.reversal_date from public.reversals r, d where r.payment_id = p.id and r.reversal_date <= d.as_of)
  from public.payments p
  where p.company_id = p_company and p.payment_date between p_from and p_to
    and (p_party is null or p.party_id = p_party)
    and (p_project is null or exists (
      select 1 from public.ledger_entries l join public.posting_events e on e.id = l.event_id
      where e.payment_id = p.id and l.project_id = p_project and l.cash_paisa <> 0))
  order by p.payment_date, p.number
$$;

-- 7. Material purchases: quantity and cost per material per project, from posted bill lines
-- (bills reversed on or before the end date are left out).
create function public.report_material_purchases(
  p_company uuid, p_from date, p_to date, p_project uuid default null, p_supplier uuid default null
)
returns table (
  project_id uuid, material_id uuid, material text, unit text, qty numeric, cost_paisa bigint,
  bills bigint, suppliers text
)
language sql stable security invoker set search_path = '' as $$
  select l.project_id, l.material_id, coalesce(m.name, l.description), u.code,
    sum(l.qty), sum(l.cost_amount_paisa)::bigint, count(distinct b.id),
    string_agg(distinct s.name, ', ')
  from public.bill_lines l
  join public.supplier_bills b on b.id = l.bill_id
  join public.suppliers s on s.id = b.supplier_id
  left join public.materials m on m.id = l.material_id
  left join public.units u on u.id = l.unit_id
  where b.company_id = p_company and b.status in ('posted', 'reversed') and l.line_type = 'material'
    and b.cost_date between p_from and p_to
    and not exists (select 1 from public.reversals r where r.bill_id = b.id and r.reversal_date <= p_to)
    and (p_project is null or l.project_id = p_project) and (p_supplier is null or b.supplier_id = p_supplier)
    and private.can_see_project_money(b.company_id, l.project_id)
  group by l.project_id, l.material_id, coalesce(m.name, l.description), u.code
  order by l.project_id, 3
$$;

-- 8. Pending orders and deliveries: ordered but not received, and received but not billed.
create function public.report_pending_orders(p_company uuid, p_project uuid default null)
returns table (
  kind text, project_id uuid, doc_id uuid, doc_number text, doc_date date, supplier_name text,
  item text, unit text, qty numeric, age_days integer
)
language sql stable security invoker set search_path = '' as $$
  select 'to_receive', l.project_id, s.id, s.number, s.request_date, sp.name,
    coalesce(m.name, l.material_text), u.code, g.remaining_qty, private.today() - s.request_date
  from public.order_slip_lines l
  join public.order_slips s on s.id = l.slip_id
  join public.order_slip_line_progress g on g.id = l.id
  left join public.suppliers sp on sp.id = s.supplier_id
  left join public.materials m on m.id = l.material_id
  join public.units u on u.id = l.unit_id
  where s.company_id = p_company and s.status = 'approved' and g.remaining_qty > 0
    and private.slip_fulfilment(s.id) in ('not_received', 'partially_received')
    and (p_project is null or l.project_id = p_project)
  union all
  select 'to_bill', st.project_id, d.id, d.challan_no, d.receipt_date, sp.name,
    coalesce(m.name, dl.material_text), u.code, st.billable_qty, private.today() - d.receipt_date
  from public.delivery_line_status st
  join public.deliveries d on d.id = st.delivery_id
  join public.delivery_lines dl on dl.id = st.id
  left join public.suppliers sp on sp.id = d.supplier_id
  left join public.materials m on m.id = dl.material_id
  join public.units u on u.id = dl.unit_id
  where st.company_id = p_company and st.billable_qty > 0 and (p_project is null or st.project_id = p_project)
  order by 1, 5
$$;

-- 9. Daily activity: the reports sent in a date range.
create function public.report_daily_activity(p_company uuid, p_from date, p_to date, p_project uuid default null)
returns table (
  report_id uuid, project_id uuid, work_date date, stage text, area text, work_done text, headcount integer,
  issues text, weather text, created_by uuid, labour_paisa bigint
)
language sql stable security invoker set search_path = '' as $$
  select r.id, r.project_id, r.work_date, s.name, r.area, r.work_done, r.headcount, r.issues, r.weather, r.created_by,
    (select lc.amount_paisa from public.labour_costs lc where lc.daily_report_id = r.id)
  from public.daily_reports r
  left join public.stages s on s.id = r.stage_id
  where r.company_id = p_company and r.work_date between p_from and p_to and (p_project is null or r.project_id = p_project)
  order by r.work_date, r.submitted_at
$$;

-- 10. Progress history: every update in a date range, with the figure before it.
create function public.report_progress_history(p_company uuid, p_from date, p_to date, p_project uuid default null)
returns table (
  update_id uuid, project_id uuid, effective_date date, stage text, pct numeric, previous_pct numeric,
  reason text, notes text, created_by uuid, created_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select u.id, u.project_id, u.effective_date, coalesce(s.name, 'Overall'), u.pct,
    lag(u.pct) over (partition by u.project_id, u.stage_id order by u.effective_date, u.created_at),
    u.reason, u.notes, u.created_by, u.created_at
  from public.progress_updates u
  left join public.stages s on s.id = u.stage_id
  where u.company_id = p_company and (p_project is null or u.project_id = p_project) and u.effective_date <= p_to
  order by u.effective_date, u.created_at
$$;

-- 11. Labour cost: each day's labour in a range, what is paid, and reversals.
create function public.report_labour(
  p_company uuid, p_from date, p_to date, p_project uuid default null, p_crew uuid default null
)
returns table (
  labour_cost_id uuid, project_id uuid, work_date date, crew_id uuid, crew text, work_type text,
  headcount integer, person_days numeric, amount_paisa bigint, paid_paisa bigint, reversed_on date,
  daily_report_id uuid
)
language sql stable security invoker set search_path = '' as $$
  select lc.id, lc.project_id, lc.work_date, lc.crew_id, c.name, lc.work_type, lc.headcount, lc.person_days, lc.amount_paisa,
    (select coalesce(sum(s.amount_paisa), 0)::bigint from public.settlement_events s
     where s.labour_cost_id = lc.id and s.business_date <= p_to),
    (select r.reversal_date from public.reversals r where r.labour_cost_id = lc.id and r.reversal_date <= p_to),
    lc.daily_report_id
  from public.labour_costs lc
  join public.crews c on c.id = lc.crew_id
  where lc.company_id = p_company and lc.work_date between p_from and p_to
    and (p_project is null or lc.project_id = p_project) and (p_crew is null or lc.crew_id = p_crew)
  order by lc.work_date, c.name
$$;

-- Grants (read only).
do $$
declare f text;
begin
  foreach f in array array[
    'public.project_dashboard(uuid, date, boolean)', 'public.company_dashboard(uuid, date, date, date)',
    'public.report_cost_by_heading(uuid, date, uuid, boolean)', 'public.report_payments(uuid, date, date, uuid, uuid, date)',
    'public.report_material_purchases(uuid, date, date, uuid, uuid)', 'public.report_pending_orders(uuid, uuid)',
    'public.report_daily_activity(uuid, date, date, uuid)', 'public.report_progress_history(uuid, date, date, uuid)',
    'public.report_labour(uuid, date, date, uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function private.party_kind(public.ledger_entries), private.party_name(uuid),
  private.unbilled_estimate(uuid, date) from public, anon;
grant execute on function private.party_kind(public.ledger_entries), private.party_name(uuid),
  private.unbilled_estimate(uuid, date) to authenticated;

-- ===========================================================================
-- Full company export (req §22, design §11.3): the data part. STABLE, so every query below
-- reads the same snapshot as the call itself: no table is newer than another (E2).
-- Admin only; the Edge Function company-export adds the files and builds the zip.
-- ===========================================================================
create function public.export_company_data(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  t record;
  v_rows jsonb;
  v_tables jsonb := '{}';
begin
  if not private.is_admin(p_company) then
    raise exception 'Only an admin can export company data' using errcode = '42501';
  end if;
  for t in
    select c.table_name, array_agg(c.column_name::text order by c.ordinal_position) as columns,
      bool_or(c.column_name = 'id') as has_id
    from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
    where c.table_schema = 'public' and x.table_type = 'BASE TABLE'
      and (c.table_name = 'companies' or exists (
        select 1 from information_schema.columns k
        where k.table_schema = 'public' and k.table_name = c.table_name and k.column_name = 'company_id'))
    group by c.table_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) %s), ''[]'') from public.%I r where r.%I = $1',
      case when t.has_id then 'order by r.id' else '' end, t.table_name,
      case when t.table_name = 'companies' then 'id' else 'company_id' end)
    into v_rows using p_company;
    v_tables := v_tables || jsonb_build_object(t.table_name, jsonb_build_object('columns', to_jsonb(t.columns), 'rows', v_rows));
  end loop;
  return jsonb_build_object(
    'snapshot_at', to_char(transaction_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'schema_version', (select max(version) from supabase_migrations.schema_migrations),
    'tables', v_tables,
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'full_name', p.full_name, 'phone', p.phone,
        'email', p.email, 'roles', m.roles, 'active', m.active) order by p.full_name), '[]')
      from public.memberships m left join public.profiles p on p.id = m.user_id where m.company_id = p_company));
end $$;
revoke execute on function public.export_company_data(uuid) from public, anon;
grant execute on function public.export_company_data(uuid) to authenticated;
