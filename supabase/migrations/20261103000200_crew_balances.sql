-- What each crew's workers are owed (GLOSSARY: Crew, Worker). With attendance, labour is owed to
-- each worker, so a crew's own balance stays at what it was owed before workers became parties.
-- The crew list shows both together: what its workers are owed on the crew's project, plus the
-- crew's own balance. "Its workers" are those on it and anyone marked on it (brought in for a day,
-- or taken off since). Read only; amounts come from ledger_entries, so its RLS decides what each user
-- sees (design §3.4), exactly as party_balances does. A worker on two crews of one project counts on
-- each; their own page has the one true balance.
create or replace function public.crew_balances(p_company uuid, p_as_of date default null)
returns table (crew_id uuid, workers integer, workers_owed_paisa bigint, crew_owed_paisa bigint, balance_paisa bigint)
language sql stable set search_path = '' as $$
  select c.id,
    (select count(*)::int from public.crew_members m where m.crew_id = c.id and m.active),
    w.owed,
    o.owed,
    w.owed + o.owed
  from public.crews c
  cross join lateral (
    select coalesce(sum(l.balance_paisa), 0)::bigint as owed
    from public.ledger_entries l
    where c.project_id is not null and l.project_id = c.project_id
      and l.business_date <= coalesce(p_as_of, private.today())
      and l.worker_id in (select m.worker_id from public.crew_members m where m.crew_id = c.id
                          union select a.worker_id from public.attendance a where a.crew_id = c.id)
  ) w
  cross join lateral (
    select coalesce(sum(l.balance_paisa), 0)::bigint as owed
    from public.ledger_entries l
    where l.crew_id = c.id and l.business_date <= coalesce(p_as_of, private.today())
  ) o
  where c.company_id = p_company
$$;

revoke execute on function public.crew_balances(uuid, date) from public, anon;
grant execute on function public.crew_balances(uuid, date) to authenticated;
