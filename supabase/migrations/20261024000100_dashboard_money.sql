-- Company dashboard: money coming in, and specific things to deal with (pilot request, 2026-10-13).
-- Adds, for people who may see money:
--   received_period_paisa, received_to_date_paisa: client receipts, net of reversals by their date.
--   to_collect_paisa: per project not cancelled or closed (closed means the books are final), current
--     contract less received, never below 0.
--   overpaid_parties: who holds an Overpayment (whole khata), largest first.
--   unallocated_paisa (replaced): payments not given to a project, per party never below 0. The
--     unallocated bucket also holds opening balances, which are owed, not money to assign; netting
--     them across parties showed a negative figure and hid real unassigned payments.
-- And for everyone who sees the counts:
--   unbilled_by_supplier: delivered lines not billed yet, per supplier, oldest first.
-- The earlier function is kept, renamed into private, and wrapped, as before.

alter function public.company_dashboard(uuid, date, date, date) rename to company_dashboard_peski;
alter function public.company_dashboard_peski(uuid, date, date, date) set schema private;

create function public.company_dashboard(p_company uuid, p_from date, p_to date, p_as_of date default null)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_as_of date := coalesce(p_as_of, private.today());
  d jsonb := private.company_dashboard_peski(p_company, p_from, p_to, p_as_of);
  v_money jsonb := '{}';
  v_unbilled jsonb;
begin
  if (d ->> 'money_visible')::boolean then
    select jsonb_build_object(
        'received_period_paisa', coalesce(sum(public.client_received_as_of(pr.id, least(p_to, v_as_of))
          - public.client_received_as_of(pr.id, p_from - 1)), 0),
        'received_to_date_paisa', coalesce(sum(public.client_received_as_of(pr.id, v_as_of)), 0),
        'to_collect_paisa', coalesce(sum(greatest(0, coalesce(a.contract_paisa, 0) - public.client_received_as_of(pr.id, v_as_of)))
          filter (where pr.status <> 'closed'), 0))
    into v_money
    from public.projects pr
    left join lateral public.project_amounts_as_of(pr.id, v_as_of) a on true
    where pr.company_id = p_company and pr.status <> 'cancelled';

    -- Per party, whole khata (I-10). What a party holds beyond its open Peski is Overpayment, as in
    -- private.held_split, worked out here from the one pass over the ledger.
    with b as (
      select l.party_id, private.party_kind(l) as kind, sum(l.balance_paisa) as balance,
        coalesce(sum(l.balance_paisa) filter (where l.project_id is null), 0) as bucket
      from public.ledger_entries l
      where l.company_id = p_company and l.business_date <= v_as_of
      group by l.party_id, private.party_kind(l)
    ), o as (
      select b.party_id, b.kind,
        -b.balance - least(-b.balance, greatest(0, private.peski_open(b.party_id, null, true, v_as_of))) as overpaid
      from b where b.balance < 0
    )
    select v_money || jsonb_build_object(
        'unallocated_paisa', (select coalesce(sum(greatest(-b.bucket, 0)), 0) from b),
        'overpaid_parties', (
          select coalesce(jsonb_agg(jsonb_build_object('party_id', o.party_id, 'kind', o.kind,
              'name', private.party_name(o.party_id), 'overpaid_paisa', o.overpaid) order by o.overpaid desc), '[]')
          from o where o.overpaid > 0))
    into v_money;
  end if;

  select coalesce(jsonb_agg(x.j order by x.oldest, x.name), '[]') into v_unbilled
  from (
    select su.name, min(dv.receipt_date) as oldest,
      jsonb_build_object('supplier_id', su.id, 'name', su.name, 'lines', count(*), 'oldest_date', min(dv.receipt_date),
        'first_item', (array_agg(
          trim(to_char(s.billable_qty, 'FM999999990.###')) || ' ' || coalesce(un.code || ' ', '') || coalesce(mt.name, dl.material_text)
          order by dv.receipt_date, dl.id))[1]) as j
    from public.delivery_line_status s
    join public.delivery_lines dl on dl.id = s.id
    join public.deliveries dv on dv.id = s.delivery_id
    join public.suppliers su on su.id = s.supplier_id
    left join public.materials mt on mt.id = dl.material_id
    left join public.units un on un.id = dl.unit_id
    where s.company_id = p_company and s.billable_qty > 0 and dv.receipt_date <= v_as_of
    group by su.id, su.name
  ) x;

  return d || v_money || jsonb_build_object('unbilled_by_supplier', v_unbilled);
end $$;

revoke execute on function
  public.company_dashboard(uuid, date, date, date), private.company_dashboard_peski(uuid, date, date, date)
from public, anon;
grant execute on function
  public.company_dashboard(uuid, date, date, date), private.company_dashboard_peski(uuid, date, date, date)
to authenticated;
