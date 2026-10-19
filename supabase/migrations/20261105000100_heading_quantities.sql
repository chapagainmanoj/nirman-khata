-- Quantities beside cost by heading (req §18.3, 2026-10-19): units of material billed, and labour
-- hours and person-days. A separate function, so report_cost_by_heading keeps its shape.
--
-- It follows the money exactly: a posting counts when its posting event is dated on or before the
-- date (and, "as known", was entered before it), unless a reversal dated by then negates it (§4.3).
-- Units are never added across kinds: bags and trips come back as two rows.
--   material:    bill material lines, less quantities credited for returns.
--   person_days: labour entries that carry person-days.
--   hours:       minutes of the attendance days behind a labour entry. A verified day changed
--                later points at its new entry only, so an earlier date can miss that day's hours.

create function public.report_heading_quantities(
  p_company uuid, p_as_of date default null, p_project uuid default null, p_as_known boolean default false
)
returns table (project_id uuid, heading_id uuid, kind text, unit text, qty numeric)
language sql stable security invoker set search_path = '' as $$
  with d as (
    select coalesce(p_as_of, private.today()) as as_of,
      ((coalesce(p_as_of, private.today()) + 1)::timestamp at time zone 'Asia/Kathmandu') as cutoff
  ),
  pr as (
    select pr.id from public.projects pr
    where pr.company_id = p_company and (p_project is null or pr.id = p_project)
      and private.can_see_project_money(pr.company_id, pr.id)
  ),
  ev as (
    select e.event_type, e.bill_id, e.credit_id, e.labour_cost_id
    from public.posting_events e, d
    where e.company_id = p_company and e.event_type in ('bill_post', 'credit_post', 'labour_save')
      and e.business_date <= d.as_of and (not p_as_known or e.posted_at < d.cutoff)
      and not exists (
        select 1 from public.posting_events r
        where r.company_id = p_company and r.event_type = 'reversal' and e.id = any (r.reversed_event_ids)
          and r.business_date <= d.as_of and (not p_as_known or r.posted_at < d.cutoff))
  ),
  q as (
    select bl.project_id, bl.heading_id, 'material' as kind, u.code as unit, bl.qty
    from ev
    join public.bill_lines bl on bl.bill_id = ev.bill_id
    join public.units u on u.id = bl.unit_id
    where ev.event_type = 'bill_post' and bl.line_type = 'material' and bl.qty is not null
    union all
    -- A return credited on the bill line, in that line's unit.
    select cl.project_id, cl.heading_id, 'material', u.code, -cl.credited_qty
    from ev
    join public.credit_lines cl on cl.credit_id = ev.credit_id
    join public.bill_lines bl on bl.id = cl.bill_line_id
    join public.units u on u.id = bl.unit_id
    where ev.event_type = 'credit_post' and cl.credited_qty is not null
    union all
    select lc.project_id, lc.heading_id, 'person_days', null, lc.person_days
    from ev join public.labour_costs lc on lc.id = ev.labour_cost_id
    where ev.event_type = 'labour_save' and lc.person_days is not null
    union all
    select lc.project_id, lc.heading_id, 'hours', null, a.minutes / 60.0
    from ev
    join public.labour_costs lc on lc.id = ev.labour_cost_id
    join public.attendance a on a.labour_cost_id = lc.id
    where ev.event_type = 'labour_save' and not a.absent
  )
  -- Hours come from minutes, so they are rounded; quantities keep their three decimals.
  select q.project_id, q.heading_id, q.kind, q.unit, round(sum(q.qty), 3)
  from q
  where q.project_id in (select id from pr)
  group by q.project_id, q.heading_id, q.kind, q.unit
  having sum(q.qty) <> 0
  order by q.project_id, q.heading_id, q.kind, sum(q.qty) desc
$$;

revoke execute on function public.report_heading_quantities(uuid, date, uuid, boolean) from public, anon;
grant execute on function public.report_heading_quantities(uuid, date, uuid, boolean) to authenticated;
