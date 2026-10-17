-- Company dashboard: where the money went in the chosen period (product owner, 2026-10-17).
-- Adds, for people who may see money:
--   cost_by_source_period: the period's cost (the same lines as cost_period_paisa) split the way a
--     project's by_source is: materials (supplier bills), subcontract (work charges), labour (own
--     crews), other (expenses to payees). All projects, so it sits beside the period's Spent.
-- The earlier function is kept, renamed into private, and wrapped, as before.

alter function public.company_dashboard(uuid, date, date, date) rename to company_dashboard_money;
alter function public.company_dashboard_money(uuid, date, date, date) set schema private;

create function public.company_dashboard(p_company uuid, p_from date, p_to date, p_as_of date default null)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_as_of date := coalesce(p_as_of, private.today());
  d jsonb := private.company_dashboard_money(p_company, p_from, p_to, p_as_of);
  v_sources jsonb;
begin
  if not coalesce((d ->> 'money_visible')::boolean, false) then
    return d;
  end if;

  select jsonb_build_object(
      'materials', coalesce(sum(l.cost_paisa) filter (where l.supplier_id is not null), 0),
      'subcontract', coalesce(sum(l.cost_paisa) filter (where l.subcontractor_id is not null), 0),
      'labour', coalesce(sum(l.cost_paisa) filter (where l.crew_id is not null), 0),
      'other', coalesce(sum(l.cost_paisa) filter (where l.payee_id is not null), 0))
  into v_sources
  from public.ledger_entries l
  where l.company_id = p_company and l.business_date <= v_as_of and l.business_date between p_from and p_to;

  return d || jsonb_build_object('cost_by_source_period', v_sources);
end $$;

revoke execute on function
  public.company_dashboard(uuid, date, date, date), private.company_dashboard_money(uuid, date, date, date)
from public, anon;
grant execute on function
  public.company_dashboard(uuid, date, date, date), private.company_dashboard_money(uuid, date, date, date)
to authenticated;
