-- Payments list follows the current project (UX: project filter on lists).
-- project_ids: the projects a payment is assigned to, net of moves; like bill_summaries.project_ids.
-- Appended at the end so "create or replace" keeps the existing columns and grants.
create or replace view public.payment_summaries with (security_invoker = true) as
  select
    p.id, p.company_id, p.number, p.supplier_id, p.payment_date, p.amount_paisa, p.method, p.reference,
    p.notes, p.status, p.posted_at, p.created_by,
    (select coalesce(sum(e.amount_paisa), 0) from public.payment_allocation_events e where e.payment_id = p.id)::bigint as allocated_paisa,
    (select coalesce(sum(s.amount_paisa), 0) from public.settlement_events s where s.payment_id = p.id)::bigint as settled_paisa,
    p.subcontractor_id, p.crew_id, p.payee_id, p.party_id, p.work_package_id,
    coalesce((
      select array_agg(a.project_id order by a.project_id) from (
        select e.project_id from public.payment_allocation_events e
        where e.payment_id = p.id group by e.project_id having sum(e.amount_paisa) <> 0
      ) a
    ), '{}'::uuid[]) as project_ids
  from public.payments p;
