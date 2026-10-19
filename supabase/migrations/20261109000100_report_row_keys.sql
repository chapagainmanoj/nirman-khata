-- Reports longer than one API page (max_rows) are read page by page in a stable order (app
-- data/rpc.ts rpcAll), which needs a column that is unique per row and keeps the screen's order.
-- report_pending_orders: a slip or delivery can list the same material twice, so rows had no
-- unique key; it now returns the line's id. report_cost_by_heading: the heading tree order needs
-- sort columns the report does not return; it now returns the row's place in that order.
-- New columns go last, so callers reading the earlier ones are unchanged.

drop function public.report_pending_orders(uuid, uuid);
create function public.report_pending_orders(p_company uuid, p_project uuid default null)
returns table (
  kind text, project_id uuid, doc_id uuid, doc_number text, doc_date date, supplier_name text,
  item text, unit text, qty numeric, age_days integer, line_id uuid
)
language sql stable security invoker set search_path = '' as $$
  select 'to_receive', l.project_id, s.id, s.number, s.request_date, sp.name,
    coalesce(m.name, l.material_text), u.code, g.remaining_qty, private.today() - s.request_date, l.id
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
    coalesce(m.name, dl.material_text), u.code, st.billable_qty, private.today() - d.receipt_date, dl.id
  from public.delivery_line_status st
  join public.deliveries d on d.id = st.delivery_id
  join public.delivery_lines dl on dl.id = st.id
  left join public.suppliers sp on sp.id = d.supplier_id
  left join public.materials m on m.id = dl.material_id
  join public.units u on u.id = dl.unit_id
  where st.company_id = p_company and st.billable_qty > 0 and (p_project is null or st.project_id = p_project)
  order by 1, 5, 11
$$;

drop function public.report_cost_by_heading(uuid, date, uuid, boolean);
create function public.report_cost_by_heading(
  p_company uuid, p_as_of date default null, p_project uuid default null, p_as_known boolean default false
)
returns table (
  project_id uuid, heading_id uuid, heading text, parent_heading text,
  budget_paisa bigint, cost_paisa bigint, budget_revision_id uuid, budget_effective_date date,
  row_order bigint
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
  select pr.id, h.id, h.name, ph.name, b.amount_paisa, coalesce(c.cost, 0), pr.budget_revision_id, pr.effective_date,
    row_number() over (order by pr.id, coalesce(ph.sort_order, h.sort_order), ph.name nulls first, h.sort_order, h.name, h.id)
  from pr
  join (select project_id, heading_id from c union select project_id, heading_id from b) k on k.project_id = pr.id
  join public.cost_headings h on h.id = k.heading_id
  left join public.cost_headings ph on ph.id = h.parent_id
  left join b on b.project_id = k.project_id and b.heading_id = k.heading_id
  left join c on c.project_id = k.project_id and c.heading_id = k.heading_id
  where coalesce(c.cost, 0) <> 0 or b.amount_paisa is not null
  order by 9
$$;

revoke execute on function public.report_pending_orders(uuid, uuid) from public, anon;
grant execute on function public.report_pending_orders(uuid, uuid) to authenticated;
revoke execute on function public.report_cost_by_heading(uuid, date, uuid, boolean) from public, anon;
grant execute on function public.report_cost_by_heading(uuid, date, uuid, boolean) to authenticated;
