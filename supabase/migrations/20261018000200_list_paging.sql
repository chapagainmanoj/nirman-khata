-- Milestone 6: lists load 50 rows at a time (req §22 "pagination for large lists"). Tabs and
-- the project filter must then run on the server, so a page holds the right rows and a tab
-- count covers every row, not just the loaded ones.

-- Slips with their fulfilment and projects, so "Open" and the project filter are server-side.
create view public.slip_summaries with (security_invoker = true) as
  select s.id, s.company_id, s.number, s.status, s.supplier_id, s.request_date, s.required_date,
    s.created_by, s.created_at, s.sent_at,
    private.slip_fulfilment(s.id) as fulfilment,
    coalesce((select array_agg(distinct l.project_id) from public.order_slip_lines l where l.slip_id = s.id), '{}'::uuid[]) as project_ids
  from public.order_slips s;
grant select on public.slip_summaries to authenticated;

-- What is still owed on posted bills (net of credits and settlements), for the Bills list
-- header. Same rule as before, but over every bill, not just the loaded page.
create function public.bills_owed(p_company uuid, p_project uuid default null, p_supplier uuid default null) returns bigint
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(greatest(0, b.payable_paisa - b.credited_paisa - b.settled_paisa)), 0)::bigint
  from public.bill_summaries b
  where b.company_id = p_company and b.status = 'posted'
    and (p_project is null or b.project_ids @> array[p_project])
    and (p_supplier is null or b.supplier_id = p_supplier)
$$;
revoke execute on function public.bills_owed(uuid, uuid, uuid) from public, anon;
grant execute on function public.bills_owed(uuid, uuid, uuid) to authenticated;
