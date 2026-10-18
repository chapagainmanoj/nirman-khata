-- Labour by attendance and subcontract money (2026-10-18). Eight changes, made one after another
-- that day and merged here before release, in the order they were written; each section keeps its
-- own notes. A later section may replace a function an earlier one created (e.g. private.use_held,
-- public.worker_advance): the later definition is the one in force.
--   1. Attendance: Absent, a batch mark, labour not added to cost yet
--   2. Farchhyaut for workers
--   3. Paying a worker in one place (pay_worker)
--   4. The khata lists every project of an entry
--   5. The advance a worker holds (worker_advance)
--   6. Work package status: Active, Completed, Cancelled
--   7. Attendance days: Draft and Verified
--   8. An opening balance they hold pays later bills; pay_subcontractor

-- ===========================================================================
-- 1. (was 20261104000100_attendance_absent.sql)
-- ===========================================================================

-- Attendance: Absent, a batch mark, and the labour not added to cost yet (req §14, revised 2026-10-18;
-- GLOSSARY: Attendance, Close day).
--  * Absent is kept as a row with no hours (absent = true, minutes 0), so an absent day is told
--    apart from a day not marked yet, and "Everyone in" does not mark the absent worker again.
--    Absent rows are never priced, closed or split; closing skips them.
--  * set_attendance_many marks several workers in one call (Everyone in on a weak network): each
--    row saves on its own, and the rows that could not be saved come back with the reason.
--  * open_labour: days marked but not added to labour cost yet, per project, crew and worker, so the
--    lists and the project can show what is still to come (amounts only to those who see the
--    project's money).

alter table public.attendance add column absent boolean not null default false;
alter table public.attendance drop constraint attendance_minutes_check;
alter table public.attendance add constraint attendance_minutes_check check (
  case when absent then minutes = 0 and time_in is null and time_out is null else minutes between 1 and 1440 end);

create or replace function public.set_attendance(p_row jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_row ->> 'project_id')::uuid;
  v_crew uuid := (p_row ->> 'crew_id')::uuid;
  v_worker uuid := coalesce((p_row ->> 'worker_id')::uuid, (p_row ->> 'member_id')::uuid);
  v_date date := (p_row ->> 'work_date')::date;
  v_in time := nullif(p_row ->> 'time_in', '')::time;
  v_out time := nullif(p_row ->> 'time_out', '')::time;
  v_minutes integer := coalesce((p_row ->> 'minutes')::integer, 0);
  v_absent boolean := coalesce((p_row ->> 'absent')::boolean, false);
  v_company uuid := private.attendance_scope(v_project, v_crew);
  v_row public.attendance;
begin
  -- The worker's lock: two marks of one worker on two projects take turns, so the overlap and
  -- 24-hour checks below see each other, and closing (which takes it fully) waits for a mark.
  perform private.lock_worker(v_worker);
  if v_date is null or v_date > private.today() then
    raise exception 'Attendance cannot be marked for a future date' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workers w where w.id = v_worker and w.company_id = v_company and w.active) then
    raise exception 'Choose a worker who is still working' using errcode = 'P0001';
  end if;
  if v_minutes < 0 or v_minutes > 1440 then
    raise exception 'Hours must be between 0 and 24' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.attendance a
    where a.worker_id = v_worker and a.project_id = v_project and a.work_date = v_date
      and private.attendance_is_closed(a.labour_cost_id)
  ) then
    raise exception 'day_closed: this day is closed; reverse its labour cost to change it' using errcode = 'P0001';
  end if;

  -- Absent is kept as a row (no hours, no times), so it is told apart from a day not marked yet.
  if v_absent then
    insert into public.attendance (company_id, project_id, crew_id, worker_id, work_date, time_in, time_out, minutes, absent)
    values (v_company, v_project, v_crew, v_worker, v_date, null, null, 0, true)
    on conflict (worker_id, project_id, work_date) do update
      set crew_id = excluded.crew_id, time_in = null, time_out = null, minutes = 0, absent = true,
        labour_cost_id = null, rate_kind = null, rate_paisa = null, amount_paisa = null
    returning * into v_row;
    return to_jsonb(v_row);
  end if;

  if v_minutes = 0 then
    delete from public.attendance where worker_id = v_worker and project_id = v_project and work_date = v_date;
    return jsonb_build_object('removed', true);
  end if;

  if v_in is not null and v_out is not null and exists (
    select 1 from public.attendance a
    where a.worker_id = v_worker and a.work_date = v_date and a.project_id <> v_project
      and a.time_in is not null and a.time_out is not null and a.time_in < v_out and v_in < a.time_out
  ) then
    raise exception 'attendance_overlap: these times overlap the same worker''s time on another project' using errcode = 'P0001';
  end if;
  if v_minutes + (select coalesce(sum(a.minutes), 0) from public.attendance a
      where a.worker_id = v_worker and a.work_date = v_date and a.project_id <> v_project) > 1440 then
    raise exception 'attendance_overlap: more than 24 hours on one day' using errcode = 'P0001';
  end if;

  insert into public.attendance (company_id, project_id, crew_id, worker_id, work_date, time_in, time_out, minutes)
  values (v_company, v_project, v_crew, v_worker, v_date, v_in, v_out, v_minutes)
  on conflict (worker_id, project_id, work_date) do update
    set crew_id = excluded.crew_id, time_in = excluded.time_in, time_out = excluded.time_out,
      minutes = excluded.minutes, absent = false, labour_cost_id = null, rate_kind = null, rate_paisa = null, amount_paisa = null
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.split_attendance(p_split jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_worker uuid := coalesce((p_split ->> 'worker_id')::uuid, (p_split ->> 'member_id')::uuid);
  v_date date := (p_split ->> 'work_date')::date;
  v_from uuid := (p_split ->> 'from_project')::uuid;
  v_to uuid := (p_split ->> 'to_project')::uuid;
  v_row public.attendance;
  v_first integer;
  v_second integer;
  v_span integer;
  v_mid time;
  v_first_out time;
  v_second_in time;
begin
  perform private.lock_worker(v_worker);
  select * into v_row from public.attendance a
  where a.worker_id = v_worker and a.project_id = v_from and a.work_date = v_date;
  if not found or v_row.absent then
    raise exception 'Mark the day before splitting it' using errcode = 'P0001';
  end if;
  if v_to is null or v_to = v_from then
    raise exception 'Choose another project for the rest of the day' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.attendance a where a.worker_id = v_worker and a.project_id = v_to and a.work_date = v_date) then
    raise exception 'The worker is already marked on that project this day' using errcode = 'P0001';
  end if;
  v_first := v_row.minutes / 2;
  v_second := v_row.minutes - v_first;
  if v_first = 0 then
    raise exception 'This day is too short to split' using errcode = 'P0001';
  end if;

  if v_row.time_in is not null and v_row.time_out is not null then
    v_span := (extract(epoch from v_row.time_out - v_row.time_in) / 60)::integer;
    if v_span >= v_row.minutes then
      v_first_out := v_row.time_in + make_interval(mins => v_first);
      v_second_in := v_row.time_out - make_interval(mins => v_second);
    else
      -- More hours than in to out: share the span in the same proportion.
      v_mid := v_row.time_in + make_interval(mins => round(v_span::numeric * v_first / v_row.minutes)::integer);
      v_first_out := v_mid;
      v_second_in := v_mid;
    end if;
  end if;

  -- The first project shrinks before the other is marked, so the two never overlap.
  perform public.set_attendance(jsonb_build_object('project_id', v_from, 'crew_id', v_row.crew_id, 'worker_id', v_worker,
    'work_date', v_date, 'time_in', v_row.time_in, 'time_out', v_first_out, 'minutes', v_first));
  perform public.set_attendance(jsonb_build_object('project_id', v_to, 'crew_id', nullif(p_split ->> 'to_crew', ''),
    'worker_id', v_worker, 'work_date', v_date, 'time_in', v_second_in, 'time_out', v_row.time_out, 'minutes', v_second));
  return jsonb_build_object('first_minutes', v_first, 'second_minutes', v_second);
end $$;

create or replace function public.close_worker_days(p_op_key uuid, p_close jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_worker uuid := coalesce((p_close ->> 'worker_id')::uuid, (p_close ->> 'member_id')::uuid);
  v_project uuid := nullif(p_close ->> 'project_id', '')::uuid;
  v_from date := (p_close ->> 'from_date')::date;
  v_to date := (p_close ->> 'to_date')::date;
  v_company uuid := (select w.company_id from public.workers w where w.id = v_worker);
  v_prior jsonb;
  v_one jsonb;
  v_total bigint := 0;
  v_days integer := 0;
  v_payments jsonb := '[]'::jsonb;
  v_groups integer := 0;
  g record;
begin
  if v_company is null then
    raise exception 'Choose a worker' using errcode = 'P0001';
  end if;
  if not private.is_member(v_company) then
    raise exception 'You cannot close this worker''s days' using errcode = '42501';
  end if;
  if jsonb_typeof(p_close -> 'pay_now') = 'object' and not private.can_record_payments(v_company) then
    raise exception 'You cannot record payments; close it as unpaid' using errcode = '42501';
  end if;
  -- A retry returns the first result only while the user may still enter labour on every project
  -- that close covered (design §6, C4).
  if exists (
    select 1 from public.posting_events e join public.labour_costs l on l.id = e.labour_cost_id
    where e.company_id = v_company and e.op_key = p_op_key and not private.can_work_on_project(v_company, l.project_id)
  ) then
    raise exception 'You cannot enter labour on a project these days were closed on' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'close_worker_days', p_close);
  if v_prior is not null then
    return v_prior;
  end if;
  if v_to is null or v_to > private.today() or (v_from is not null and (v_to < v_from or v_to - v_from > 31)) then
    raise exception 'Choose up to 32 days to close' using errcode = '22023';
  end if;

  for g in
    select a.project_id, a.crew_id, min(a.work_date) as first_day, max(a.work_date) as last_day
    from public.attendance a
    where a.worker_id = v_worker and a.work_date between coalesce(v_from, '-infinity'::date) and v_to
      and (v_project is null or a.project_id = v_project)
      and not private.attendance_is_closed(a.labour_cost_id) and not a.absent
      and private.can_work_on_project(v_company, a.project_id)
    group by a.project_id, a.crew_id
    order by a.crew_id, a.project_id
  loop
    perform private.attendance_scope(g.project_id, g.crew_id);
    v_one := private.close_crew_days(v_company, g.project_id, g.crew_id, g.first_day, g.last_day,
      p_close -> 'pay_now', (p_close ->> 'confirm_duplicate')::boolean, p_op_key, v_worker);
    v_total := v_total + (v_one ->> 'total_paisa')::bigint;
    v_days := v_days + (v_one ->> 'days')::integer;
    v_payments := v_payments || (v_one -> 'payments');
    v_groups := v_groups + 1;
  end loop;
  if v_groups = 0 then
    raise exception 'No open days to close' using errcode = 'P0001';
  end if;

  return private.finish_op(v_company, p_op_key, jsonb_build_object(
    'total_paisa', v_total, 'days', v_days, 'crews', v_groups, 'payments', v_payments));
end $$;

create or replace function public.worker_month(p_worker uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_company uuid := (select w.company_id from public.workers w where w.id = p_worker);
  v_worker jsonb;
  v_rows jsonb;
begin
  if v_company is null or not (
    private.can_see_finance(v_company)
    or exists (select 1 from public.projects p where p.company_id = v_company and private.can_work_on_project(v_company, p.id))
  ) then
    raise exception 'You cannot see this worker' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 31 then
    raise exception 'Choose up to 32 days' using errcode = '22023';
  end if;

  select jsonb_build_object('id', w.id, 'name', w.name, 'work_type', w.work_type, 'rate_kind', w.rate_kind,
      'rate_paisa', w.rate_paisa, 'active', w.active,
      'crews', coalesce((
        select jsonb_agg(jsonb_build_object('crew_id', c.id, 'crew_name', c.name, 'project_id', c.project_id) order by c.name)
        from public.crew_members m join public.crews c on c.id = m.crew_id
        where m.worker_id = w.id and m.active and c.active), '[]'::jsonb))
  into v_worker
  from public.workers w
  where w.id = p_worker;

  select coalesce(jsonb_agg(jsonb_build_object(
      'work_date', a.work_date,
      'project_id', case when r.seen then a.project_id end,
      'crew_id', case when r.seen then a.crew_id end,
      'time_in', a.time_in, 'time_out', a.time_out, 'minutes', a.minutes, 'absent', a.absent,
      'amount_paisa', case when r.seen then a.amount_paisa end,
      'closed', private.attendance_is_closed(a.labour_cost_id),
      'editable', r.editable) order by a.work_date, a.time_in nulls last), '[]'::jsonb)
  into v_rows
  from public.attendance a
  cross join lateral (
    select private.can_work_on_project(v_company, a.project_id) as editable,
      private.can_work_on_project(v_company, a.project_id) or private.can_see_project_money(v_company, a.project_id) as seen
  ) r
  where a.worker_id = p_worker and a.work_date between p_from and p_to;

  return jsonb_build_object('worker', v_worker, 'rows', v_rows);
end $$;

create or replace function public.crew_month(p_crew uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_crew public.crews;
  v_std integer;
  v_money boolean;
  v_post boolean;
  v_workers jsonb;
begin
  select * into v_crew from public.crews where id = p_crew;
  if v_crew.id is null or not (
    case when v_crew.project_id is null
      then private.can_manage_parties(v_crew.company_id) or private.can_see_finance(v_crew.company_id)
      else private.can_work_on_project(v_crew.company_id, v_crew.project_id)
        or private.can_see_project_money(v_crew.company_id, v_crew.project_id) end
  ) then
    raise exception 'You cannot see this crew' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 41 then
    raise exception 'Choose up to 42 days' using errcode = '22023';
  end if;
  v_std := (select standard_day_minutes from public.companies where id = v_crew.company_id);
  v_money := case when v_crew.project_id is null then private.can_see_finance(v_crew.company_id)
    else private.can_see_project_money(v_crew.company_id, v_crew.project_id) end;
  v_post := private.can_post(v_crew.company_id);

  select coalesce(jsonb_agg(x.j order by x.on_crew desc, x.name), '[]'::jsonb) into v_workers
  from (
    select w.name, coalesce(m.active, false) as on_crew, jsonb_build_object(
      'id', w.id, 'name', w.name, 'work_type', w.work_type, 'rate_kind', w.rate_kind, 'rate_paisa', w.rate_paisa,
      'phone', w.phone, 'active', w.active, 'on_crew', coalesce(m.active, false),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
            'work_date', a.work_date, 'project_id', a.project_id, 'time_in', a.time_in, 'time_out', a.time_out,
            'minutes', a.minutes, 'absent', a.absent, 'closed', private.attendance_is_closed(a.labour_cost_id),
            'amount_paisa', case when v_money then case when private.attendance_is_closed(a.labour_cost_id) then a.amount_paisa
              else round(w.rate_paisa::numeric * a.minutes / case when w.rate_kind = 'hourly' then 60 else v_std end)::bigint end end
          ) order by a.work_date)
        from public.attendance a
        where a.worker_id = w.id and a.crew_id = p_crew and a.work_date between p_from and p_to), '[]'::jsonb),
      'minutes', (select coalesce(sum(a.minutes), 0) from public.attendance a
        where a.worker_id = w.id and a.crew_id = p_crew and a.work_date between p_from and p_to),
      'paid_paisa', case when v_money then (
        select coalesce(sum(l.cash_paisa), 0)::bigint from public.ledger_entries l
        where l.worker_id = w.id and l.business_date between p_from and p_to
          and (v_crew.project_id is null or l.project_id = v_crew.project_id)) end,
      'balance_paisa', case when v_money then (
        select coalesce(sum(l.balance_paisa), 0)::bigint from public.ledger_entries l
        where l.worker_id = w.id and l.business_date <= private.today()
          and (case when v_crew.project_id is null then l.project_id is not null else l.project_id = v_crew.project_id end)) end,
      'open_paisa', case when v_money then (
        select coalesce(sum(round(w.rate_paisa::numeric * a.minutes / case when w.rate_kind = 'hourly' then 60 else v_std end)), 0)::bigint
        from public.attendance a
        where a.worker_id = w.id and not private.attendance_is_closed(a.labour_cost_id) and not a.absent
          and (case when v_crew.project_id is null then a.crew_id = p_crew else a.project_id = v_crew.project_id end)) end,
      'open_days', (select count(*)::int from public.attendance a
        where a.worker_id = w.id and not private.attendance_is_closed(a.labour_cost_id) and not a.absent
          and (case when v_crew.project_id is null then a.crew_id = p_crew else a.project_id = v_crew.project_id end)),
      'company_balance_paisa', case when v_post then (
        select coalesce(sum(l.balance_paisa), 0)::bigint from public.ledger_entries l
        where l.worker_id = w.id and l.business_date <= private.today()) end
    ) as j
    from public.workers w
    left join public.crew_members m on m.worker_id = w.id and m.crew_id = p_crew
    where w.company_id = v_crew.company_id
      and (m.active or exists (
        select 1 from public.attendance a where a.worker_id = w.id and a.crew_id = p_crew and a.work_date between p_from and p_to))
  ) x;

  return jsonb_build_object(
    'crew', jsonb_build_object('id', v_crew.id, 'name', v_crew.name, 'project_id', v_crew.project_id, 'active', v_crew.active),
    'standard_day_minutes', v_std, 'can_see_money', v_money, 'workers', v_workers);
end $$;

-- Several marks in one call, worker by worker in id order (the same order closing locks them).
-- Each row is saved or refused on its own; refused rows come back with the reason.
-- p_rows: [{project_id, crew_id, worker_id, work_date, time_in, time_out, minutes, absent}]
create or replace function public.set_attendance_many(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_saved integer := 0;
  v_failed jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 200 then
    raise exception 'Send up to 200 rows' using errcode = '22023';
  end if;
  for r in select x from jsonb_array_elements(p_rows) x order by coalesce(x ->> 'worker_id', x ->> 'member_id') loop
    begin
      perform public.set_attendance(r);
      v_saved := v_saved + 1;
    exception when others then
      v_failed := v_failed || jsonb_build_array(jsonb_build_object(
        'worker_id', coalesce(r ->> 'worker_id', r ->> 'member_id'), 'code', sqlstate, 'message', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('saved', v_saved, 'failed', v_failed);
end $$;
revoke execute on function public.set_attendance_many(jsonb) from public, anon;
grant execute on function public.set_attendance_many(jsonb) to authenticated;

-- Days marked but not added to labour cost yet, grouped by project, crew and worker, for the
-- projects the user works on or sees the money of. The amount is at the worker's current rate and
-- only for those who see that project's money (design §3.4).
create or replace function public.open_labour(p_company uuid)
returns table (project_id uuid, crew_id uuid, worker_id uuid, days integer, minutes integer, amount_paisa bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_std integer := (select c.standard_day_minutes from public.companies c where c.id = p_company);
begin
  if not private.is_member(p_company) then
    raise exception 'You cannot see this company' using errcode = '42501';
  end if;
  return query
    select a.project_id, a.crew_id, a.worker_id, count(*)::int, sum(a.minutes)::int,
      case when private.can_see_project_money(p_company, a.project_id) then
        sum(round(w.rate_paisa::numeric * a.minutes / case when w.rate_kind = 'hourly' then 60 else v_std end))::bigint end
    from public.attendance a
    join public.workers w on w.id = a.worker_id
    where a.company_id = p_company and not a.absent and not private.attendance_is_closed(a.labour_cost_id)
      and (private.can_work_on_project(p_company, a.project_id) or private.can_see_project_money(p_company, a.project_id))
    group by a.project_id, a.crew_id, a.worker_id;
end $$;
revoke execute on function public.open_labour(uuid) from public, anon;
grant execute on function public.open_labour(uuid) to authenticated;

-- ===========================================================================
-- 2. (was 20261104000200_worker_farchhyaut.sql)
-- ===========================================================================

-- Farchhyaut for workers (GLOSSARY: Farchhyaut, Peski, Overpayment). A worker often takes money before
-- payday: peski while nothing is owed, or more than is owed ("paid ahead", Overpayment). When their
-- days are added to labour cost, that money is matched to the new days first, before any cash, so the
-- days show only what is still owed and Pay, "Paid now" and the payment form ask for no more than that.
--
-- Money held on the same project is used (a payment's allocation to it, less what it already
-- settled), oldest payment first, onto the days oldest first. Money held on another project or not
-- yet given a project stays where it is: the khata still nets it, and Accounts move it by a Transfer.
-- Only attendance closes do this (private.close_crew_days, all workers); day totals for a crew and
-- supplier or subcontractor bills are unchanged.

-- Match the party's free money on p_project to p_docs. The caller holds the party lock; payments are
-- locked here in id order (design §5.1: party, payments, documents). Returns the amount matched.
create function private.use_held(p_party uuid, p_project uuid, p_docs uuid[], p_op_key uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_used bigint := 0;
  v_take bigint;
  v_free bigint;
  v_owed bigint;
  p record;
  d record;
begin
  perform 1 from public.payments where party_id = p_party and status = 'posted' order by id for update;
  for d in
    select l.id, l.work_date from public.labour_costs l where l.id = any (p_docs) order by l.work_date, l.id
  loop
    v_owed := private.doc_settleable(d.id, p_project) - private.doc_settled(d.id, p_project);
    for p in
      select x.id from public.payments x
      where x.party_id = p_party and x.status = 'posted' and x.work_package_id is null
        and private.payment_allocated(x.id, p_project) - private.payment_settled(x.id, p_project) > 0
      order by x.payment_date, x.id
    loop
      exit when v_owed <= 0;
      v_free := private.payment_allocated(p.id, p_project) - private.payment_settled(p.id, p_project);
      v_take := least(v_free, v_owed);
      perform private.settle_one(p.id, d.id, p_project, v_take, null, p_op_key, 'Deducted from money paid before');
      v_used := v_used + v_take;
      v_owed := v_owed - v_take;
    end loop;
  end loop;
  return v_used;
end $$;
revoke execute on function private.use_held(uuid, uuid, uuid[], uuid) from public, anon;
grant execute on function private.use_held(uuid, uuid, uuid[], uuid) to authenticated;

-- Pay what is still owed on p_docs (after Farchhyaut): one payment, matched to them. Null when
-- nothing is left to pay.
create function private.pay_rest(
  p_company uuid, p_party uuid, p_project uuid, p_docs uuid[], p_date date, p_pay jsonb, p_op_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_total bigint := 0;
  v_id uuid := gen_random_uuid();
  v_result jsonb;
  v_left bigint;
  d uuid;
begin
  if not private.can_record_payments(p_company) then
    raise exception 'You cannot record payments; save it as unpaid' using errcode = '42501';
  end if;
  foreach d in array p_docs loop
    v_total := v_total + private.doc_settleable(d, p_project) - private.doc_settled(d, p_project);
  end loop;
  if v_total <= 0 then
    return null;
  end if;
  v_result := private.post_payment(p_company, v_id, p_party, p_date, v_total, coalesce(p_pay ->> 'method', 'cash'),
    nullif(trim(p_pay ->> 'reference'), ''), 'Paid when entered', null,
    jsonb_build_array(jsonb_build_object('project_id', p_project, 'amount_paisa', v_total)), p_op_key);
  foreach d in array p_docs loop
    v_left := private.doc_settleable(d, p_project) - private.doc_settled(d, p_project);
    if v_left > 0 then
      perform private.settle_one(v_id, d, p_project, v_left, null, p_op_key, 'Paid when entered');
    end if;
  end loop;
  return v_result;
end $$;
revoke execute on function private.pay_rest(uuid, uuid, uuid, uuid[], date, jsonb, uuid) from public, anon;
grant execute on function private.pay_rest(uuid, uuid, uuid, uuid[], date, jsonb, uuid) to authenticated;

-- As before (20261103000100_workers.sql), with two changes: each worker's new days first use the
-- money they already hold on the project, and "Paid now" pays only what is left. The result adds
-- 'held_used_paisa', the amount deducted.
create or replace function private.close_crew_days(
  p_company uuid, p_project uuid, p_crew uuid, p_from date, p_to date, p_pay jsonb, p_confirm boolean, p_op_key uuid,
  p_worker uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_std integer := (select standard_day_minutes from public.companies where id = p_company);
  v_days jsonb;
  v_one jsonb;
  v_new uuid[];
  v_ids uuid[] := '{}';
  v_total bigint := 0;
  v_used bigint := 0;
  v_dates integer;
  v_payment jsonb;
  v_payments jsonb := '[]'::jsonb;
  w record;
begin
  for w in
    select distinct a.worker_id from public.attendance a
    where a.project_id = p_project and a.crew_id = p_crew and a.work_date between p_from and p_to
      and (p_worker is null or a.worker_id = p_worker) and not private.attendance_is_closed(a.labour_cost_id)
    order by a.worker_id
  loop
    perform private.lock_party(w.worker_id);
  end loop;

  -- Price the open rows from the workers' current rates.
  update public.attendance a
  set rate_kind = k.rate_kind, rate_paisa = k.rate_paisa,
    amount_paisa = round(k.rate_paisa::numeric * a.minutes / case when k.rate_kind = 'hourly' then 60 else v_std end)
  from public.workers k
  where k.id = a.worker_id and a.project_id = p_project and a.crew_id = p_crew
    and a.work_date between p_from and p_to and (p_worker is null or a.worker_id = p_worker)
    and not private.attendance_is_closed(a.labour_cost_id);

  select count(distinct a.work_date) into v_dates
  from public.attendance a
  where a.project_id = p_project and a.crew_id = p_crew and a.work_date between p_from and p_to
    and (p_worker is null or a.worker_id = p_worker) and not private.attendance_is_closed(a.labour_cost_id)
    and a.amount_paisa > 0;

  for w in
    select a.worker_id, k.work_type
    from public.attendance a join public.workers k on k.id = a.worker_id
    where a.project_id = p_project and a.crew_id = p_crew and a.work_date between p_from and p_to
      and (p_worker is null or a.worker_id = p_worker) and not private.attendance_is_closed(a.labour_cost_id)
      and a.amount_paisa > 0
    group by a.worker_id, k.work_type
    order by a.worker_id
  loop
    select jsonb_agg(jsonb_build_object(
        'work_date', a.work_date, 'amount_paisa', a.amount_paisa, 'headcount', 1, 'rate_paisa', a.rate_paisa,
        'person_days', round(a.minutes::numeric / v_std, 2)) order by a.work_date)
    into v_days
    from public.attendance a
    where a.worker_id = w.worker_id and a.project_id = p_project and a.crew_id = p_crew
      and a.work_date between p_from and p_to and not private.attendance_is_closed(a.labour_cost_id) and a.amount_paisa > 0;

    -- Posted unpaid here; any payment comes after the deduction below.
    v_one := private.post_labour(
      jsonb_build_object('project_id', p_project, 'crew_id', p_crew, 'worker_id', w.worker_id,
        'work_type', coalesce(w.work_type, 'Mixed'), 'description', 'From attendance'),
      v_days, null, null, p_confirm, p_op_key, null);
    v_new := array(select (x #>> '{}')::uuid from jsonb_array_elements(v_one -> 'labour_cost_ids') x);

    update public.attendance a
    set labour_cost_id = l.id
    from public.labour_costs l
    where l.id = any (v_new)
      and a.worker_id = w.worker_id and a.project_id = p_project and a.crew_id = p_crew and a.work_date = l.work_date
      and not private.attendance_is_closed(a.labour_cost_id);

    -- Farchhyaut: money the worker already holds on this project pays these days first.
    v_used := v_used + private.use_held(w.worker_id, p_project, v_new, p_op_key);
    if jsonb_typeof(p_pay) = 'object' then
      v_payment := private.pay_rest(p_company, w.worker_id, p_project, v_new,
        coalesce((p_pay ->> 'date')::date, (select max((x ->> 'work_date')::date) from jsonb_array_elements(v_days) x)),
        p_pay, p_op_key);
      if v_payment is not null then
        v_payments := v_payments || jsonb_build_array(v_payment);
      end if;
    end if;

    v_ids := v_ids || v_new;
    v_total := v_total + (v_one ->> 'total_paisa')::bigint;
  end loop;

  if cardinality(v_ids) = 0 then
    raise exception 'Mark at least one worker before closing' using errcode = 'P0001';
  end if;
  return jsonb_build_object('labour_cost_ids', to_jsonb(v_ids), 'crew_id', p_crew, 'total_paisa', v_total,
    'days', v_dates, 'payments', v_payments, 'held_used_paisa', v_used);
end $$;

-- As in section 1, adding up 'held_used_paisa' over the crews closed.
create or replace function public.close_worker_days(p_op_key uuid, p_close jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_worker uuid := coalesce((p_close ->> 'worker_id')::uuid, (p_close ->> 'member_id')::uuid);
  v_project uuid := nullif(p_close ->> 'project_id', '')::uuid;
  v_from date := (p_close ->> 'from_date')::date;
  v_to date := (p_close ->> 'to_date')::date;
  v_company uuid := (select w.company_id from public.workers w where w.id = v_worker);
  v_prior jsonb;
  v_one jsonb;
  v_total bigint := 0;
  v_days integer := 0;
  v_used bigint := 0;
  v_payments jsonb := '[]'::jsonb;
  v_groups integer := 0;
  g record;
begin
  if v_company is null then
    raise exception 'Choose a worker' using errcode = 'P0001';
  end if;
  if not private.is_member(v_company) then
    raise exception 'You cannot close this worker''s days' using errcode = '42501';
  end if;
  if jsonb_typeof(p_close -> 'pay_now') = 'object' and not private.can_record_payments(v_company) then
    raise exception 'You cannot record payments; close it as unpaid' using errcode = '42501';
  end if;
  -- A retry returns the first result only while the user may still enter labour on every project
  -- that close covered (design §6, C4).
  if exists (
    select 1 from public.posting_events e join public.labour_costs l on l.id = e.labour_cost_id
    where e.company_id = v_company and e.op_key = p_op_key and not private.can_work_on_project(v_company, l.project_id)
  ) then
    raise exception 'You cannot enter labour on a project these days were closed on' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'close_worker_days', p_close);
  if v_prior is not null then
    return v_prior;
  end if;
  if v_to is null or v_to > private.today() or (v_from is not null and (v_to < v_from or v_to - v_from > 31)) then
    raise exception 'Choose up to 32 days to close' using errcode = '22023';
  end if;

  for g in
    select a.project_id, a.crew_id, min(a.work_date) as first_day, max(a.work_date) as last_day
    from public.attendance a
    where a.worker_id = v_worker and a.work_date between coalesce(v_from, '-infinity'::date) and v_to
      and (v_project is null or a.project_id = v_project)
      and not private.attendance_is_closed(a.labour_cost_id) and not a.absent
      and private.can_work_on_project(v_company, a.project_id)
    group by a.project_id, a.crew_id
    order by a.crew_id, a.project_id
  loop
    perform private.attendance_scope(g.project_id, g.crew_id);
    v_one := private.close_crew_days(v_company, g.project_id, g.crew_id, g.first_day, g.last_day,
      p_close -> 'pay_now', (p_close ->> 'confirm_duplicate')::boolean, p_op_key, v_worker);
    v_total := v_total + (v_one ->> 'total_paisa')::bigint;
    v_days := v_days + (v_one ->> 'days')::integer;
    v_used := v_used + (v_one ->> 'held_used_paisa')::bigint;
    v_payments := v_payments || (v_one -> 'payments');
    v_groups := v_groups + 1;
  end loop;
  if v_groups = 0 then
    raise exception 'No open days to close' using errcode = 'P0001';
  end if;

  return private.finish_op(v_company, p_op_key, jsonb_build_object(
    'total_paisa', v_total, 'days', v_days, 'crews', v_groups, 'payments', v_payments, 'held_used_paisa', v_used));
end $$;

-- ===========================================================================
-- 3. (was 20261104000300_pay_worker.sql)
-- ===========================================================================

-- Paying a worker in one place (req §14, GLOSSARY: Worker, Farchhyaut). Every "Pay" for a worker opens
-- the payment form, which lists their days still to pay: posted labour not yet paid and days marked
-- but not added to labour cost yet. Saving runs pay_worker: the ticked open days are added to labour
-- cost, money the worker already holds (an advance, on any project) comes off the days first, and the
-- payment pays the rest. Paying more leaves an advance; paying less pays the oldest days first.
--
-- An advance is a worker's money wherever it sits: Farchhyaut now also takes it from another project
-- (moving it as "Change split" does) or from money not given a project yet, after the same project.

-- Move part of a payment's allocation from one bucket to another: p_from or p_to null is the
-- payment's unallocated money. The same events and ledger rows as allocate_payment, one per change.
create function private.move_allocation(p_payment uuid, p_from uuid, p_to uuid, p_amount bigint, p_op_key uuid, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  v_alloc uuid;
  v_event uuid;
  ch record;
begin
  select * into p from public.payments where id = p_payment;
  for ch in
    select x.project_id, x.delta from (values (p_from, -p_amount), (p_to, p_amount)) x (project_id, delta)
    where x.project_id is not null
  loop
    insert into public.payment_allocation_events (company_id, payment_id, project_id, amount_paisa, business_date, reason, created_by)
    values (p.company_id, p_payment, ch.project_id, ch.delta, p.payment_date, p_reason, auth.uid())
    returning id into v_alloc;
    v_event := private.new_event(p.company_id, 'allocation_move', p.party_id, p.payment_date, p_op_key, p_allocation_event => v_alloc);
    perform private.add_ledger(v_event, 'project', ch.project_id, null, 0, -ch.delta, ch.delta);
    perform private.add_ledger(v_event, 'unallocated', null, null, 0, ch.delta, -ch.delta);
  end loop;
  -- I-4 and I-5, as allocate_payment checks them.
  if (select coalesce(sum(amount_paisa), 0) from public.payment_allocation_events where payment_id = p_payment) > p.amount_paisa
     or exists (select 1 from public.payment_allocation_events where payment_id = p_payment group by project_id having sum(amount_paisa) < 0)
     or (p_from is not null and private.payment_allocated(p_payment, p_from) < private.payment_settled(p_payment, p_from)) then
    raise exception 'Moving this money would break the payment''s split' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function private.move_allocation(uuid, uuid, uuid, bigint, uuid, text) from public, anon;
grant execute on function private.move_allocation(uuid, uuid, uuid, bigint, uuid, text) to authenticated;

-- What the party holds in one bucket (a project, or unallocated when null): money there beyond what
-- they are owed there. Only that much may leave the bucket, so unpaid days there keep their money.
create function private.held_in(p_party uuid, p_project uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select greatest(0, -coalesce(sum(l.balance_paisa), 0))::bigint from public.ledger_entries l
  where l.party_id = p_party and l.project_id is not distinct from p_project
$$;

-- Farchhyaut for a worker's days (replaces section 2's; p_project is no longer used: each day's own): money they hold pays p_docs first, oldest
-- day first. Sources in order: free money on the day's own project; then money they hold on other
-- projects the user may see; then money not given a project (Accounts or Admin only, who may assign
-- it). Money from elsewhere is moved to the day's project, then matched. Returns the amount used.
create or replace function private.use_held(p_party uuid, p_project uuid, p_docs uuid[], p_op_key uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.party_company(p_party);
  v_used bigint := 0;
  v_take bigint;
  v_owed bigint;
  s record;
  d record;
begin
  perform 1 from public.payments where party_id = p_party and status = 'posted' order by id for update;
  for d in
    select l.id, l.project_id from public.labour_costs l where l.id = any (p_docs) order by l.work_date, l.id
  loop
    v_owed := private.doc_settleable(d.id, d.project_id) - private.doc_settled(d.id, d.project_id);
    -- 1. On the day's own project.
    for s in
      select x.id from public.payments x
      where x.party_id = p_party and x.status = 'posted' and x.work_package_id is null
        and private.payment_allocated(x.id, d.project_id) - private.payment_settled(x.id, d.project_id) > 0
      order by x.payment_date, x.id
    loop
      exit when v_owed <= 0;
      v_take := least(private.payment_allocated(s.id, d.project_id) - private.payment_settled(s.id, d.project_id), v_owed);
      perform private.settle_one(s.id, d.id, d.project_id, v_take, null, p_op_key, 'Deducted from money paid before');
      v_used := v_used + v_take;
      v_owed := v_owed - v_take;
    end loop;
    -- 2. Held on other projects, then 3. not given a project.
    for s in
      select x.id, e.project_id, x.payment_date,
        case when e.project_id is null
          then x.amount_paisa - (select coalesce(sum(a.amount_paisa), 0) from public.payment_allocation_events a where a.payment_id = x.id)
          else private.payment_allocated(x.id, e.project_id) - private.payment_settled(x.id, e.project_id) end as free
      from public.payments x
      cross join lateral (
        select distinct a.project_id from public.payment_allocation_events a where a.payment_id = x.id
        union select null::uuid
      ) e
      where x.party_id = p_party and x.status = 'posted' and x.work_package_id is null
        and e.project_id is distinct from d.project_id
        and (case when e.project_id is null then private.can_post(v_company) else private.can_see_project(v_company, e.project_id) end)
      order by e.project_id is null, x.payment_date, x.id
    loop
      exit when v_owed <= 0;
      v_take := least(s.free, v_owed, private.held_in(p_party, s.project_id));
      continue when v_take <= 0;
      perform private.move_allocation(s.id, s.project_id, d.project_id, v_take, p_op_key, 'Advance used on another project');
      perform private.settle_one(s.id, d.id, d.project_id, v_take, null, p_op_key, 'Deducted from money paid before');
      v_used := v_used + v_take;
      v_owed := v_owed - v_take;
    end loop;
  end loop;
  return v_used;
end $$;

-- A worker's days marked but not added to labour cost yet, one row per day and project, priced at
-- today's rate. Amounts only for those who see that project's money.
create function public.worker_open_days(p_worker uuid)
returns table (project_id uuid, crew_id uuid, work_date date, minutes integer, amount_paisa bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_company uuid := (select w.company_id from public.workers w where w.id = p_worker);
  v_std integer := (select c.standard_day_minutes from public.companies c where c.id = v_company);
begin
  if v_company is null or not private.is_member(v_company) then
    raise exception 'You cannot see this worker' using errcode = '42501';
  end if;
  return query
    select a.project_id, a.crew_id, a.work_date, a.minutes,
      case when private.can_see_project_money(v_company, a.project_id) then
        round(w.rate_paisa::numeric * a.minutes / case when w.rate_kind = 'hourly' then 60 else v_std end)::bigint end
    from public.attendance a
    join public.workers w on w.id = a.worker_id
    where a.worker_id = p_worker and not a.absent and not private.attendance_is_closed(a.labour_cost_id)
      and a.work_date <= private.today()
      and (private.can_work_on_project(v_company, a.project_id) or private.can_see_project_money(v_company, a.project_id))
    order by a.work_date, a.project_id;
end $$;
revoke execute on function public.worker_open_days(uuid) from public, anon;
grant execute on function public.worker_open_days(uuid) to authenticated;

-- p_pay: {id, worker_id, payment_date, amount_paisa (0 when the advance covers it all), method,
--   reference, notes, confirm_duplicate,
--   open_days: [{project_id, crew_id, work_date}]  marked days to add to labour cost now,
--   docs: [{doc_id}]                               posted labour of the worker still unpaid,
--   extra_project}                                 where money beyond the days goes (an advance)
-- Posting contract (design §5.1): authorize, op_key, lock the worker, add the days (which locks
-- their payments and uses their advance), write the payment, match it oldest day first.
create function public.pay_worker(p_op_key uuid, p_pay jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_worker uuid := (p_pay ->> 'worker_id')::uuid;
  v_company uuid := (select w.company_id from public.workers w where w.id = (p_pay ->> 'worker_id')::uuid);
  v_id uuid := (p_pay ->> 'id')::uuid;
  v_amount bigint := coalesce((p_pay ->> 'amount_paisa')::bigint, 0);
  v_date date := coalesce((p_pay ->> 'payment_date')::date, private.today());
  v_extra_project uuid := nullif(p_pay ->> 'extra_project', '')::uuid;
  v_prior jsonb;
  v_docs uuid[] := '{}';
  v_one jsonb;
  v_used bigint := 0;
  v_added integer := 0;
  v_left bigint;
  v_take bigint;
  v_allocs jsonb := '[]'::jsonb;
  v_settles jsonb := '[]'::jsonb;
  v_payment jsonb;
  v_s jsonb;
  g record;
  d record;
begin
  -- 1. Authorize.
  if v_company is null then
    raise exception 'Choose a worker' using errcode = 'P0001';
  end if;
  if not private.can_record_payments(v_company) or not private.can_see_finance(v_company) then
    raise exception 'You cannot record payments' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_pay -> 'open_days', '[]')) x
    where not private.can_work_on_project(v_company, (x ->> 'project_id')::uuid)
  ) or (v_extra_project is not null and not private.can_see_project(v_company, v_extra_project)) then
    raise exception 'You can only pay days on projects you are assigned to' using errcode = '42501';
  end if;
  if v_amount < 0 or (v_amount = 0 and jsonb_array_length(coalesce(p_pay -> 'open_days', '[]')) = 0) then
    raise exception 'Enter the amount paid' using errcode = '22023';
  end if;

  -- 2. Operation key.
  v_prior := private.begin_op(v_company, p_op_key, 'pay_worker', p_pay);
  if v_prior is not null then
    return v_prior;
  end if;

  -- 3. Lock the worker, then the posted days being paid.
  perform private.lock_party(v_worker);
  select coalesce(array_agg(l.id order by l.work_date, l.id), '{}') into v_docs
  from public.labour_costs l
  where l.id in (select (x ->> 'doc_id')::uuid from jsonb_array_elements(coalesce(p_pay -> 'docs', '[]')) x);
  if cardinality(v_docs) <> jsonb_array_length(coalesce(p_pay -> 'docs', '[]')) or exists (
    select 1 from public.labour_costs l where l.id = any (v_docs)
    and (l.worker_id is distinct from v_worker or l.status <> 'posted' or not private.can_see_project(v_company, l.project_id))
  ) then
    raise exception 'A day to pay is not this worker''s' using errcode = 'P0001';
  end if;
  perform private.lock_docs(v_docs);
  -- The posted days ticked: the worker's advance comes off them first.
  v_used := private.use_held(v_worker, null, v_docs, p_op_key);

  -- 4. Add the ticked open days to labour cost, one crew and day at a time. Each also takes the
  -- worker's advance off its days.
  for g in
    select distinct (x ->> 'project_id')::uuid as project_id, (x ->> 'crew_id')::uuid as crew_id, (x ->> 'work_date')::date as work_date
    from jsonb_array_elements(coalesce(p_pay -> 'open_days', '[]')) x
    order by 3, 1, 2
  loop
    if not exists (
      select 1 from public.attendance a
      where a.worker_id = v_worker and a.project_id = g.project_id and a.crew_id = g.crew_id and a.work_date = g.work_date
        and not a.absent and not private.attendance_is_closed(a.labour_cost_id)
    ) then
      raise exception 'day_changed: a day to add was changed or added to labour cost already; check the days again'
        using errcode = 'P0001';
    end if;
    perform private.attendance_scope(g.project_id, g.crew_id);
    v_one := private.close_crew_days(v_company, g.project_id, g.crew_id, g.work_date, g.work_date, null,
      (p_pay ->> 'confirm_duplicate')::boolean, p_op_key, v_worker);
    v_docs := v_docs || array(select (x #>> '{}')::uuid from jsonb_array_elements(v_one -> 'labour_cost_ids') x);
    v_used := v_used + (v_one ->> 'held_used_paisa')::bigint;
    v_added := v_added + (v_one ->> 'days')::integer;
  end loop;

  -- 5. The payment: oldest day first, the rest an advance.
  if v_amount > 0 then
    v_left := v_amount;
    for d in
      select l.id, l.project_id, private.doc_settleable(l.id, l.project_id) - private.doc_settled(l.id, l.project_id) as owed
      from public.labour_costs l where l.id = any (v_docs) order by l.work_date, l.id
    loop
      exit when v_left <= 0;
      continue when d.owed <= 0;
      v_take := least(d.owed, v_left);
      v_settles := v_settles || jsonb_build_array(jsonb_build_object('doc_id', d.id, 'project_id', d.project_id, 'amount_paisa', v_take));
      v_left := v_left - v_take;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('project_id', k.project_id, 'amount_paisa', k.amount)), '[]') into v_allocs
    from (
      select x.project_id, sum(x.amount)::bigint as amount from (
        select (s ->> 'project_id')::uuid as project_id, (s ->> 'amount_paisa')::bigint as amount from jsonb_array_elements(v_settles) s
        union all
        select coalesce(v_extra_project, (select l.project_id from public.labour_costs l where l.id = any (v_docs) order by l.work_date desc limit 1)), v_left
        where v_left > 0
      ) x where x.project_id is not null group by x.project_id
    ) k;
    if not private.can_post(v_company)
       and (select coalesce(sum((a ->> 'amount_paisa')::bigint), 0) from jsonb_array_elements(v_allocs) a) <> v_amount then
      raise exception 'Choose the project the extra money is for' using errcode = 'P0001';
    end if;
    v_payment := private.post_payment(v_company, v_id, v_worker, v_date, v_amount, p_pay ->> 'method',
      nullif(trim(p_pay ->> 'reference'), ''), nullif(trim(p_pay ->> 'notes'), ''), null, v_allocs, p_op_key, false);
    for v_s in select x from jsonb_array_elements(v_settles) x loop
      perform private.settle_one(v_id, (v_s ->> 'doc_id')::uuid, (v_s ->> 'project_id')::uuid, (v_s ->> 'amount_paisa')::bigint,
        null, p_op_key, null);
    end loop;
  end if;

  return private.finish_op(v_company, p_op_key, jsonb_build_object(
    'payment_id', v_payment ->> 'payment_id', 'number', v_payment ->> 'number', 'days_added', v_added,
    'held_used_paisa', v_used, 'advance_paisa', greatest(coalesce(v_left, 0), 0)));
end $$;
revoke execute on function public.pay_worker(uuid, jsonb) from public, anon;
grant execute on function public.pay_worker(uuid, jsonb) to authenticated;

-- ===========================================================================
-- 4. (was 20261104000400_khata_projects.sql)
-- ===========================================================================

-- The khata says which projects an entry is on. project_id is set only when an entry is on one
-- project, so a payment split across projects read as "not assigned to a project"; project_ids lists
-- them all ('{}' when none). Same rows otherwise (20261018000100_refunds).
drop function public.party_khata(uuid, date, date, uuid);
create function public.party_khata(
  p_party uuid, p_from date default null, p_to date default null, p_project uuid default null
)
returns table (
  event_id uuid, business_date date, posted_at timestamptz, event_type text, label text, reason text,
  doc_kind text, doc_id uuid, project_id uuid,
  cost_paisa bigint, balance_paisa bigint, cash_paisa bigint, running_balance_paisa bigint,
  project_ids uuid[]
)
language sql stable security invoker set search_path = '' as $$
  with rows as (
    select l.* from public.ledger_entries l
    where l.party_id = p_party
      and (p_project is null or l.project_id = p_project)
      and (p_to is null or l.business_date <= p_to)
  ),
  opening as (
    select coalesce(sum(r.balance_paisa), 0)::bigint as b from rows r where p_from is not null and r.business_date < p_from
  ),
  ev as (
    select r.event_id, min(r.business_date) as business_date, min(r.posted_at) as posted_at, min(r.event_type) as event_type,
      case when count(distinct coalesce(r.project_id::text, '-')) = 1 then (array_agg(r.project_id))[1] end as project_id,
      sum(r.cost_paisa)::bigint as cost, sum(r.balance_paisa)::bigint as balance, sum(r.cash_paisa)::bigint as cash,
      array_agg(distinct r.project_id) filter (where r.project_id is not null) as project_ids
    from rows r
    where p_from is null or r.business_date >= p_from
    group by r.event_id
    having sum(r.cost_paisa) <> 0 or sum(r.balance_paisa) <> 0 or sum(r.cash_paisa) <> 0
  )
  select null::uuid, p_from, null::timestamptz, 'opening'::text, 'Balance brought forward'::text, null::text,
    null::text, null::uuid, p_project, 0::bigint, o.b, 0::bigint, o.b, null::uuid[]
  from opening o where p_from is not null
  union all
  select ev.event_id, ev.business_date, ev.posted_at, ev.event_type, lbl ->> 'label', lbl ->> 'reason',
    case
      when lbl ->> 'bill_id' is not null then 'bill' when lbl ->> 'charge_id' is not null then 'charge'
      when lbl ->> 'labour_cost_id' is not null then 'labour' when lbl ->> 'expense_id' is not null then 'expense'
      when lbl ->> 'credit_id' is not null then 'credit' when lbl ->> 'payment_id' is not null then 'payment'
      when lbl ->> 'refund_id' is not null then 'refund'
    end,
    coalesce(lbl ->> 'bill_id', lbl ->> 'charge_id', lbl ->> 'labour_cost_id', lbl ->> 'expense_id',
             lbl ->> 'credit_id', lbl ->> 'payment_id', lbl ->> 'refund_id')::uuid,
    ev.project_id, ev.cost, ev.balance, ev.cash,
    ((select o.b from opening o) + sum(ev.balance) over (order by ev.business_date, ev.posted_at, ev.event_id))::bigint,
    coalesce(ev.project_ids, '{}')
  from ev cross join lateral private.event_label(ev.event_id) lbl
  order by 2 nulls first, 3 nulls first, 1 nulls first
$$;
revoke execute on function public.party_khata(uuid, date, date, uuid) from public, anon;
grant execute on function public.party_khata(uuid, date, date, uuid) to authenticated;

-- ===========================================================================
-- 5. (was 20261104000500_worker_advance.sql)
-- ===========================================================================

-- The advance a worker holds that pay_worker may take off their days (GLOSSARY: Farchhyaut): what
-- they hold on each project the user may see, plus money not given a project for Accounts or Admin.
-- The same buckets and limits as private.use_held, so the payment form's "Less advance" matches what
-- saving does. party_held nets the whole khata instead: 400 held on one project and 3,000 owed on
-- another is no advance there, yet use_held moves the 400.
create function public.worker_advance(p_worker uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_company uuid := (select w.company_id from public.workers w where w.id = p_worker);
begin
  if v_company is null or not private.is_member(v_company) or not private.can_see_finance(v_company) then
    raise exception 'You cannot see this worker''s money' using errcode = '42501';
  end if;
  return (
    select coalesce(sum(private.held_in(p_worker, b.project_id)), 0)::bigint
    from (select distinct l.project_id from public.ledger_entries l where l.party_id = p_worker and l.project_id is not null) b
    where private.can_see_project(v_company, b.project_id)
  ) + (
    -- Not given a project: only payments' unassigned money, as use_held takes (not an opening balance).
    select case when private.can_post(v_company) then least(private.held_in(p_worker, null), coalesce(sum(
      x.amount_paisa - (select coalesce(sum(a.amount_paisa), 0) from public.payment_allocation_events a where a.payment_id = x.id)), 0))
      else 0 end::bigint
    from public.payments x where x.party_id = p_worker and x.status = 'posted' and x.work_package_id is null
  );
end $$;
revoke execute on function public.worker_advance(uuid) from public, anon;
grant execute on function public.worker_advance(uuid) to authenticated;

-- ===========================================================================
-- 6. (was 20261104000600_package_status.sql)
-- ===========================================================================

-- A work package's status is Active, Completed or Cancelled (product owner, 2026-10-18). "Planned"
-- and "In progress" were two names for the same thing: the work is agreed and not finished. Nothing
-- on the server read the difference; the status is a label for lists and the package page.
-- Cancelled stays: nothing is deleted, so a package entered by mistake or a subcontractor who left
-- before finishing needs a way off the active lists without being called completed.

create type public.package_status_v2 as enum ('active', 'completed', 'cancelled');
alter table public.work_packages alter column status drop default;
alter table public.work_packages alter column status type public.package_status_v2
  using (case status::text when 'completed' then 'completed' when 'cancelled' then 'cancelled' else 'active' end)::public.package_status_v2;
drop type public.package_status;
alter type public.package_status_v2 rename to package_status;
alter table public.work_packages alter column status set default 'active';

-- As 20261012000200, with 'active' the new default. An app still on the old labels (installed PWA
-- not yet updated) may send 'planned' or 'in_progress'; both mean active.
create or replace function public.save_work_package(p_package jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_package ->> 'id')::uuid;
  v_project uuid := (p_package ->> 'project_id')::uuid;
  v_sub uuid := (p_package ->> 'subcontractor_id')::uuid;
  v_company uuid := (select company_id from public.projects where id = (p_package ->> 'project_id')::uuid);
  v_heading uuid;
  v_basis public.rate_basis := coalesce((p_package ->> 'rate_basis')::public.rate_basis, 'lump_sum');
  v_terms jsonb := p_package -> 'terms';
  v_status public.package_status := (case p_package ->> 'status' when 'planned' then 'active' when 'in_progress' then 'active'
    else p_package ->> 'status' end)::public.package_status;
  w public.work_packages;
begin
  if v_id is null then
    raise exception 'Work package id is required' using errcode = '22023';
  end if;
  if v_company is null or not private.can_manage_parties(v_company) or not private.can_work_on_project(v_company, v_project) then
    raise exception 'You cannot manage subcontract work on this project' using errcode = '42501';
  end if;
  if not exists (select 1 from public.subcontractors where id = v_sub and company_id = v_company) then
    raise exception 'Subcontractor not found' using errcode = 'P0002';
  end if;
  v_heading := coalesce((p_package ->> 'heading_id')::uuid, private.default_heading(v_company, 'subcontract'));
  if jsonb_typeof(v_terms) = 'object' and not private.can_see_finance(v_company) then
    raise exception 'You cannot enter amounts' using errcode = '42501';
  end if;

  select * into w from public.work_packages where id = v_id for update;
  if found then
    if w.project_id <> v_project or w.subcontractor_id <> v_sub then
      raise exception 'The project and subcontractor of a work package cannot change' using errcode = 'P0001';
    end if;
    update public.work_packages set
      heading_id = v_heading, scope = p_package ->> 'scope', rate_basis = v_basis,
      unit_id = (p_package ->> 'unit_id')::uuid, planned_start = (p_package ->> 'planned_start')::date,
      planned_end = (p_package ->> 'planned_end')::date,
      status = coalesce(v_status, status),
      progress_pct = coalesce((p_package ->> 'progress_pct')::numeric, progress_pct), notes = p_package ->> 'notes'
    where id = v_id;
  else
    insert into public.work_packages (
      company_id, id, project_id, subcontractor_id, heading_id, scope, rate_basis, unit_id,
      planned_start, planned_end, status, progress_pct, notes
    ) values (
      v_company, v_id, v_project, v_sub, v_heading, p_package ->> 'scope', v_basis, (p_package ->> 'unit_id')::uuid,
      (p_package ->> 'planned_start')::date, (p_package ->> 'planned_end')::date,
      coalesce(v_status, 'active'),
      coalesce((p_package ->> 'progress_pct')::numeric, 0), p_package ->> 'notes'
    );
  end if;

  if jsonb_typeof(v_terms) = 'object' then
    if (v_terms ->> 'rate_paisa') is not null and (v_terms ->> 'quantity') is not null
       and (v_terms ->> 'agreed_value_paisa')::bigint
           <> round((v_terms ->> 'rate_paisa')::numeric * (v_terms ->> 'quantity')::numeric)::bigint then
      raise exception 'The agreed value must be rate x quantity' using errcode = '22023';
    end if;
    insert into public.work_package_terms (company_id, id, agreed_value_paisa, rate_paisa, quantity)
    values (v_company, v_id, (v_terms ->> 'agreed_value_paisa')::bigint, (v_terms ->> 'rate_paisa')::bigint,
            (v_terms ->> 'quantity')::numeric)
    on conflict (id) do update set
      agreed_value_paisa = excluded.agreed_value_paisa, rate_paisa = excluded.rate_paisa, quantity = excluded.quantity;
  elsif p_package ? 'terms' and private.can_see_finance(v_company) then
    delete from public.work_package_terms where id = v_id;
  end if;
  return v_id;
end $$;

-- ===========================================================================
-- 7. (was 20261104000700_attendance_verify.sql)
-- ===========================================================================

-- Attendance days: Draft and Verified (req §14, product owner 2026-10-18; GLOSSARY: Attendance).
-- A marked day is a Draft: no cost, no money anywhere. Verified makes it labour cost, owed to the
-- worker, at their rate then (the old close, one day at a time). Whoever may mark a day may verify
-- it. A verified day can still be changed: its labour cost is reversed and the new one posted in
-- the same transaction, at the same rate, even when paid; the worker's balance takes the
-- difference and money they hold pays the new cost first (Farchhyaut). Site staff mark, change and
-- verify up to 7 days back; Accounts and Admin any day. The khata shows a changed day once.
--  * A worked day is verified when its labour cost is posted (so days closed before are verified);
--    an absent day has no cost, so verifying it stamps verified_at.
--  * labour_cost_changes links a changed day's new cost to the one it replaced (a posted cost row
--    does not change, so the link has its own table).

alter table public.attendance add column verified_at timestamptz, add column verified_by uuid;
create table public.labour_cost_changes (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  old_cost_id uuid not null,
  new_cost_id uuid not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, new_cost_id),
  unique (company_id, old_cost_id),
  foreign key (company_id, old_cost_id) references public.labour_costs (company_id, id),
  foreign key (company_id, new_cost_id) references public.labour_costs (company_id, id)
);
create trigger audit after insert or update or delete on public.labour_cost_changes for each row execute function private.audit();
create trigger set_created_by before insert on public.labour_cost_changes for each row execute function private.set_created_by();
create trigger no_change before update or delete on public.labour_cost_changes for each row execute function private.reject_change();
alter table public.labour_cost_changes enable row level security;
create policy labour_cost_changes_select on public.labour_cost_changes for select to authenticated
  using (exists (select 1 from public.labour_costs l where l.id = new_cost_id));
revoke insert, update, delete on public.labour_cost_changes from authenticated, anon;
grant select on public.labour_cost_changes to authenticated;

create function private.attendance_verified(p_absent boolean, p_verified_at timestamptz, p_labour_cost uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_absent then p_verified_at is not null else private.attendance_is_closed(p_labour_cost) end
$$;

-- Site staff (anyone who does not see every project) mark days up to 7 days back.
create function private.can_mark_day(p_company uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_post(p_company) or p_date >= private.today() - 7
$$;

create or replace function public.set_attendance(p_row jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_row ->> 'project_id')::uuid;
  v_crew uuid := (p_row ->> 'crew_id')::uuid;
  v_worker uuid := coalesce((p_row ->> 'worker_id')::uuid, (p_row ->> 'member_id')::uuid);
  v_date date := (p_row ->> 'work_date')::date;
  v_in time := nullif(p_row ->> 'time_in', '')::time;
  v_out time := nullif(p_row ->> 'time_out', '')::time;
  v_minutes integer := coalesce((p_row ->> 'minutes')::integer, 0);
  v_absent boolean := coalesce((p_row ->> 'absent')::boolean, false);
  v_company uuid := private.attendance_scope(v_project, v_crew);
  v_row public.attendance;
begin
  -- The worker's lock: two marks of one worker on two projects take turns, so the overlap and
  -- 24-hour checks below see each other, and closing (which takes it fully) waits for a mark.
  perform private.lock_worker(v_worker);
  if v_date is null or v_date > private.today() then
    raise exception 'Attendance cannot be marked for a future date' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workers w where w.id = v_worker and w.company_id = v_company and w.active) then
    raise exception 'Choose a worker who is still working' using errcode = 'P0001';
  end if;
  if v_minutes < 0 or v_minutes > 1440 then
    raise exception 'Hours must be between 0 and 24' using errcode = '22023';
  end if;

  if not private.can_mark_day(v_company, v_date) then
    raise exception 'day_too_old: days more than 7 days back are changed by Accounts or Admin' using errcode = '42501';
  end if;
  -- A verified day changes through change_attendance, which adjusts its labour cost.
  if exists (
    select 1 from public.attendance a
    where a.worker_id = v_worker and a.project_id = v_project and a.work_date = v_date
      and private.attendance_verified(a.absent, a.verified_at, a.labour_cost_id)
  ) then
    raise exception 'day_verified: this day is verified; change it with Save change' using errcode = 'P0001';
  end if;

  -- Absent is kept as a row (no hours, no times), so it is told apart from a day not marked yet.
  if v_absent then
    insert into public.attendance (company_id, project_id, crew_id, worker_id, work_date, time_in, time_out, minutes, absent)
    values (v_company, v_project, v_crew, v_worker, v_date, null, null, 0, true)
    on conflict (worker_id, project_id, work_date) do update
      set crew_id = excluded.crew_id, time_in = null, time_out = null, minutes = 0, absent = true,
        labour_cost_id = null, rate_kind = null, rate_paisa = null, amount_paisa = null
    returning * into v_row;
    return to_jsonb(v_row);
  end if;

  if v_minutes = 0 then
    delete from public.attendance where worker_id = v_worker and project_id = v_project and work_date = v_date;
    return jsonb_build_object('removed', true);
  end if;

  if v_in is not null and v_out is not null and exists (
    select 1 from public.attendance a
    where a.worker_id = v_worker and a.work_date = v_date and a.project_id <> v_project
      and a.time_in is not null and a.time_out is not null and a.time_in < v_out and v_in < a.time_out
  ) then
    raise exception 'attendance_overlap: these times overlap the same worker''s time on another project' using errcode = 'P0001';
  end if;
  if v_minutes + (select coalesce(sum(a.minutes), 0) from public.attendance a
      where a.worker_id = v_worker and a.work_date = v_date and a.project_id <> v_project) > 1440 then
    raise exception 'attendance_overlap: more than 24 hours on one day' using errcode = 'P0001';
  end if;

  insert into public.attendance (company_id, project_id, crew_id, worker_id, work_date, time_in, time_out, minutes)
  values (v_company, v_project, v_crew, v_worker, v_date, v_in, v_out, v_minutes)
  on conflict (worker_id, project_id, work_date) do update
    set crew_id = excluded.crew_id, time_in = excluded.time_in, time_out = excluded.time_out,
      minutes = excluded.minutes, absent = false, labour_cost_id = null, rate_kind = null, rate_paisa = null, amount_paisa = null
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.crew_month(p_crew uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_crew public.crews;
  v_std integer;
  v_money boolean;
  v_post boolean;
  v_workers jsonb;
begin
  select * into v_crew from public.crews where id = p_crew;
  if v_crew.id is null or not (
    case when v_crew.project_id is null
      then private.can_manage_parties(v_crew.company_id) or private.can_see_finance(v_crew.company_id)
      else private.can_work_on_project(v_crew.company_id, v_crew.project_id)
        or private.can_see_project_money(v_crew.company_id, v_crew.project_id) end
  ) then
    raise exception 'You cannot see this crew' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 41 then
    raise exception 'Choose up to 42 days' using errcode = '22023';
  end if;
  v_std := (select standard_day_minutes from public.companies where id = v_crew.company_id);
  v_money := case when v_crew.project_id is null then private.can_see_finance(v_crew.company_id)
    else private.can_see_project_money(v_crew.company_id, v_crew.project_id) end;
  v_post := private.can_post(v_crew.company_id);

  select coalesce(jsonb_agg(x.j order by x.on_crew desc, x.name), '[]'::jsonb) into v_workers
  from (
    select w.name, coalesce(m.active, false) as on_crew, jsonb_build_object(
      'id', w.id, 'name', w.name, 'work_type', w.work_type, 'rate_kind', w.rate_kind, 'rate_paisa', w.rate_paisa,
      'phone', w.phone, 'active', w.active, 'on_crew', coalesce(m.active, false),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
            'work_date', a.work_date, 'project_id', a.project_id, 'time_in', a.time_in, 'time_out', a.time_out,
            'minutes', a.minutes, 'absent', a.absent, 'closed', private.attendance_is_closed(a.labour_cost_id),
            'verified', private.attendance_verified(a.absent, a.verified_at, a.labour_cost_id),
            -- A draft carries no money: only a verified day is priced.
            'amount_paisa', case when v_money and private.attendance_is_closed(a.labour_cost_id) then a.amount_paisa end
          ) order by a.work_date)
        from public.attendance a
        where a.worker_id = w.id and a.crew_id = p_crew and a.work_date between p_from and p_to), '[]'::jsonb),
      'minutes', (select coalesce(sum(a.minutes), 0) from public.attendance a
        where a.worker_id = w.id and a.crew_id = p_crew and a.work_date between p_from and p_to),
      'paid_paisa', case when v_money then (
        select coalesce(sum(l.cash_paisa), 0)::bigint from public.ledger_entries l
        where l.worker_id = w.id and l.business_date between p_from and p_to
          and (v_crew.project_id is null or l.project_id = v_crew.project_id)) end,
      'balance_paisa', case when v_money then (
        select coalesce(sum(l.balance_paisa), 0)::bigint from public.ledger_entries l
        where l.worker_id = w.id and l.business_date <= private.today()
          and (case when v_crew.project_id is null then l.project_id is not null else l.project_id = v_crew.project_id end)) end,
      'draft_days', (select count(*)::int from public.attendance a
        where a.worker_id = w.id and not private.attendance_verified(a.absent, a.verified_at, a.labour_cost_id)
          and (case when v_crew.project_id is null then a.crew_id = p_crew else a.project_id = v_crew.project_id end)),
      'company_balance_paisa', case when v_post then (
        select coalesce(sum(l.balance_paisa), 0)::bigint from public.ledger_entries l
        where l.worker_id = w.id and l.business_date <= private.today()) end
    ) as j
    from public.workers w
    left join public.crew_members m on m.worker_id = w.id and m.crew_id = p_crew
    where w.company_id = v_crew.company_id
      and (m.active or exists (
        select 1 from public.attendance a where a.worker_id = w.id and a.crew_id = p_crew and a.work_date between p_from and p_to))
  ) x;

  return jsonb_build_object(
    'crew', jsonb_build_object('id', v_crew.id, 'name', v_crew.name, 'project_id', v_crew.project_id, 'active', v_crew.active),
    'standard_day_minutes', v_std, 'can_see_money', v_money, 'workers', v_workers,
    'mark_from', case when v_post then null else private.today() - 7 end);
end $$;

create or replace function public.worker_month(p_worker uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_company uuid := (select w.company_id from public.workers w where w.id = p_worker);
  v_worker jsonb;
  v_rows jsonb;
begin
  if v_company is null or not (
    private.can_see_finance(v_company)
    or exists (select 1 from public.projects p where p.company_id = v_company and private.can_work_on_project(v_company, p.id))
  ) then
    raise exception 'You cannot see this worker' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 31 then
    raise exception 'Choose up to 32 days' using errcode = '22023';
  end if;

  select jsonb_build_object('id', w.id, 'name', w.name, 'work_type', w.work_type, 'rate_kind', w.rate_kind,
      'rate_paisa', w.rate_paisa, 'active', w.active,
      'crews', coalesce((
        select jsonb_agg(jsonb_build_object('crew_id', c.id, 'crew_name', c.name, 'project_id', c.project_id) order by c.name)
        from public.crew_members m join public.crews c on c.id = m.crew_id
        where m.worker_id = w.id and m.active and c.active), '[]'::jsonb))
  into v_worker
  from public.workers w
  where w.id = p_worker;

  select coalesce(jsonb_agg(jsonb_build_object(
      'work_date', a.work_date,
      'project_id', case when r.seen then a.project_id end,
      'crew_id', case when r.seen then a.crew_id end,
      'time_in', a.time_in, 'time_out', a.time_out, 'minutes', a.minutes, 'absent', a.absent,
      'amount_paisa', case when r.seen then a.amount_paisa end,
      'closed', private.attendance_is_closed(a.labour_cost_id),
      'verified', private.attendance_verified(a.absent, a.verified_at, a.labour_cost_id),
      'editable', r.editable) order by a.work_date, a.time_in nulls last), '[]'::jsonb)
  into v_rows
  from public.attendance a
  cross join lateral (
    select private.can_work_on_project(v_company, a.project_id) as editable,
      private.can_work_on_project(v_company, a.project_id) or private.can_see_project_money(v_company, a.project_id) as seen
  ) r
  where a.worker_id = p_worker and a.work_date between p_from and p_to;

  return jsonb_build_object('worker', v_worker, 'rows', v_rows);
end $$;

-- Verify one day on a crew: every draft that day (or one worker's), worked days into labour cost at
-- the workers' rates now, absent days stamped. Posting contract as close_labour_day.
-- p_verify: {project_id, crew_id, work_date, worker_id?, confirm_duplicate}
create function public.verify_attendance(p_op_key uuid, p_verify jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_verify ->> 'project_id')::uuid;
  v_crew uuid := (p_verify ->> 'crew_id')::uuid;
  v_date date := (p_verify ->> 'work_date')::date;
  v_worker uuid := nullif(p_verify ->> 'worker_id', '')::uuid;
  v_company uuid := private.attendance_scope(v_project, v_crew);
  v_prior jsonb;
  v_one jsonb;
  v_absent integer;
begin
  if v_date is null or v_date > private.today() then
    raise exception 'Choose a day up to today' using errcode = '22023';
  end if;
  if not private.can_mark_day(v_company, v_date) then
    raise exception 'day_too_old: days more than 7 days back are changed by Accounts or Admin' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'verify_attendance', p_verify);
  if v_prior is not null then
    return v_prior;
  end if;

  if exists (
    select 1 from public.attendance a
    where a.project_id = v_project and a.crew_id = v_crew and a.work_date = v_date and (v_worker is null or a.worker_id = v_worker)
      and not a.absent and not private.attendance_is_closed(a.labour_cost_id)
  ) then
    v_one := private.close_crew_days(v_company, v_project, v_crew, v_date, v_date, null,
      coalesce((p_verify ->> 'confirm_duplicate')::boolean, false), p_op_key, v_worker);
  end if;
  update public.attendance a set verified_at = now(), verified_by = auth.uid()
  where a.project_id = v_project and a.crew_id = v_crew and a.work_date = v_date and (v_worker is null or a.worker_id = v_worker)
    and a.absent and a.verified_at is null;
  get diagnostics v_absent = row_count;
  if v_one is null and v_absent = 0 then
    raise exception 'Nothing to verify on this day' using errcode = 'P0001';
  end if;

  return private.finish_op(v_company, p_op_key, jsonb_build_object(
    'days', coalesce(jsonb_array_length(v_one -> 'labour_cost_ids'), 0) + v_absent,
    'total_paisa', coalesce((v_one ->> 'total_paisa')::bigint, 0),
    'held_used_paisa', coalesce((v_one ->> 'held_used_paisa')::bigint, 0)));
end $$;
revoke execute on function public.verify_attendance(uuid, jsonb) from public, anon;
grant execute on function public.verify_attendance(uuid, jsonb) to authenticated;

-- Change a verified day (a draft just saves). The day's labour cost is unmatched from its payments
-- and reversed, the row saved as asked, and a new cost posted at the same rate, linked to the old
-- one; then money the worker holds pays it first, so a paid day changed to more hours leaves only
-- the difference owed, and to fewer hours leaves the difference paid ahead. Changed to absent:
-- verified absent, no cost. Cleared: no row, no cost.
-- p_row: as set_attendance.
create function public.change_attendance(p_op_key uuid, p_row jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_row ->> 'project_id')::uuid;
  v_crew uuid := (p_row ->> 'crew_id')::uuid;
  v_worker uuid := (p_row ->> 'worker_id')::uuid;
  v_date date := (p_row ->> 'work_date')::date;
  v_company uuid := private.attendance_scope(v_project, v_crew);
  v_std integer := (select standard_day_minutes from public.companies where id = v_company);
  v_prior jsonb;
  v_old public.attendance;
  v_new public.attendance;
  v_cost uuid;
  v_ids uuid[] := '{}';
  v_one jsonb;
  v_amount bigint;
  v_used bigint := 0;
  v_total bigint := 0;
  v_was text;
begin
  if not private.can_mark_day(v_company, v_date) then
    raise exception 'day_too_old: days more than 7 days back are changed by Accounts or Admin' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'change_attendance', p_row);
  if v_prior is not null then
    return v_prior;
  end if;
  perform private.lock_party(v_worker);
  select * into v_old from public.attendance a
  where a.worker_id = v_worker and a.project_id = v_project and a.work_date = v_date for update;
  if not found or not private.attendance_verified(v_old.absent, v_old.verified_at, v_old.labour_cost_id) then
    -- Not verified (or changed meanwhile): an ordinary mark.
    return private.finish_op(v_company, p_op_key, jsonb_build_object('row', public.set_attendance(p_row), 'total_paisa', 0, 'held_used_paisa', 0));
  end if;

  v_was := case when v_old.absent then 'absent' else trim(to_char(v_old.minutes / 60.0, 'FM990.##')) || ' h' end;
  if private.attendance_is_closed(v_old.labour_cost_id) then
    v_cost := v_old.labour_cost_id;
    perform 1 from public.payments where id in (select payment_id from public.settlement_events where doc_id = v_cost)
    order by id for update;
    perform private.lock_docs(array[v_cost]);
    perform private.unsettle_where(v_cost, null, null, null, v_date, p_op_key, 'Day changed');
    perform private.reverse_with_event(v_company, v_worker, v_date, 'Changed from ' || v_was, p_op_key, p_labour_cost => v_cost);
    update public.labour_costs set status = 'reversed' where id = v_cost;
  end if;
  update public.attendance set verified_at = null, verified_by = null where id = v_old.id;

  perform public.set_attendance(p_row);
  select * into v_new from public.attendance a
  where a.worker_id = v_worker and a.project_id = v_project and a.work_date = v_date;

  if v_new.id is not null and v_new.absent then
    update public.attendance set verified_at = now(), verified_by = auth.uid() where id = v_new.id;
  elsif v_new.id is not null and v_old.rate_paisa is null then
    -- Was absent: priced like any verified day, at the rate now.
    v_one := private.close_crew_days(v_company, v_project, v_new.crew_id, v_date, v_date, null, true, p_op_key, v_worker);
    v_ids := array(select (x #>> '{}')::uuid from jsonb_array_elements(v_one -> 'labour_cost_ids') x);
    v_used := (v_one ->> 'held_used_paisa')::bigint;
    v_total := (v_one ->> 'total_paisa')::bigint;
  elsif v_new.id is not null then
    -- The same rate as the day had.
    v_amount := round(v_old.rate_paisa::numeric * v_new.minutes / case when v_old.rate_kind = 'hourly' then 60 else v_std end);
    update public.attendance set rate_kind = v_old.rate_kind, rate_paisa = v_old.rate_paisa, amount_paisa = v_amount where id = v_new.id;
    if v_amount > 0 then
      v_one := private.post_labour(
        jsonb_build_object('project_id', v_project, 'crew_id', v_new.crew_id, 'worker_id', v_worker,
          'work_type', coalesce((select work_type from public.workers where id = v_worker), 'Mixed'), 'description', 'From attendance'),
        jsonb_build_array(jsonb_build_object('work_date', v_date, 'amount_paisa', v_amount, 'headcount', 1,
          'rate_paisa', v_old.rate_paisa, 'person_days', round(v_new.minutes::numeric / v_std, 2))),
        null, null, true, p_op_key, null);
      v_ids := array(select (x #>> '{}')::uuid from jsonb_array_elements(v_one -> 'labour_cost_ids') x);
      update public.attendance set labour_cost_id = v_ids[1] where id = v_new.id;
      v_used := private.use_held(v_worker, v_project, v_ids, p_op_key);
      v_total := v_amount;
    end if;
  end if;
  if v_cost is not null and cardinality(v_ids) = 1 then
    insert into public.labour_cost_changes (company_id, old_cost_id, new_cost_id) values (v_company, v_cost, v_ids[1]);
  end if;

  return private.finish_op(v_company, p_op_key, jsonb_build_object(
    'total_paisa', v_total, 'held_used_paisa', v_used, 'was', v_was));
end $$;
revoke execute on function public.change_attendance(uuid, jsonb) from public, anon;
grant execute on function public.change_attendance(uuid, jsonb) to authenticated;

-- The khata shows a changed day once: the replaced cost and its reversal (which net to zero) are
-- left out, and the new cost says what it was changed from.
create function private.event_replaced(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posting_events e
    where e.id = p_event and (
      (e.event_type = 'labour_save' and exists (select 1 from public.labour_cost_changes c where c.old_cost_id = e.labour_cost_id))
      or (e.event_type = 'reversal' and exists (
        select 1 from public.reversals r join public.labour_cost_changes c on c.old_cost_id = r.labour_cost_id where r.id = e.reversal_id))))
$$;
create function private.labour_change_note(p_cost uuid) returns text
language sql stable security definer set search_path = '' as $$
  select r.reason from public.labour_cost_changes c join public.reversals r on r.labour_cost_id = c.old_cost_id where c.new_cost_id = p_cost
$$;

create or replace function public.party_khata(
  p_party uuid, p_from date default null, p_to date default null, p_project uuid default null
)
returns table (
  event_id uuid, business_date date, posted_at timestamptz, event_type text, label text, reason text,
  doc_kind text, doc_id uuid, project_id uuid,
  cost_paisa bigint, balance_paisa bigint, cash_paisa bigint, running_balance_paisa bigint,
  project_ids uuid[]
)
language sql stable security invoker set search_path = '' as $$
  with rows as (
    select l.* from public.ledger_entries l
    where l.party_id = p_party
      and (p_project is null or l.project_id = p_project)
      and (p_to is null or l.business_date <= p_to)
      and not private.event_replaced(l.event_id)
  ),
  opening as (
    select coalesce(sum(r.balance_paisa), 0)::bigint as b from rows r where p_from is not null and r.business_date < p_from
  ),
  ev as (
    select r.event_id, min(r.business_date) as business_date, min(r.posted_at) as posted_at, min(r.event_type) as event_type,
      case when count(distinct coalesce(r.project_id::text, '-')) = 1 then (array_agg(r.project_id))[1] end as project_id,
      sum(r.cost_paisa)::bigint as cost, sum(r.balance_paisa)::bigint as balance, sum(r.cash_paisa)::bigint as cash,
      array_agg(distinct r.project_id) filter (where r.project_id is not null) as project_ids
    from rows r
    where p_from is null or r.business_date >= p_from
    group by r.event_id
    having sum(r.cost_paisa) <> 0 or sum(r.balance_paisa) <> 0 or sum(r.cash_paisa) <> 0
  )
  select null::uuid, p_from, null::timestamptz, 'opening'::text, 'Balance brought forward'::text, null::text,
    null::text, null::uuid, p_project, 0::bigint, o.b, 0::bigint, o.b, null::uuid[]
  from opening o where p_from is not null
  union all
  select ev.event_id, ev.business_date, ev.posted_at, ev.event_type, lbl ->> 'label',
    coalesce(lbl ->> 'reason', private.labour_change_note((lbl ->> 'labour_cost_id')::uuid)),
    case
      when lbl ->> 'bill_id' is not null then 'bill' when lbl ->> 'charge_id' is not null then 'charge'
      when lbl ->> 'labour_cost_id' is not null then 'labour' when lbl ->> 'expense_id' is not null then 'expense'
      when lbl ->> 'credit_id' is not null then 'credit' when lbl ->> 'payment_id' is not null then 'payment'
      when lbl ->> 'refund_id' is not null then 'refund'
    end,
    coalesce(lbl ->> 'bill_id', lbl ->> 'charge_id', lbl ->> 'labour_cost_id', lbl ->> 'expense_id',
             lbl ->> 'credit_id', lbl ->> 'payment_id', lbl ->> 'refund_id')::uuid,
    ev.project_id, ev.cost, ev.balance, ev.cash,
    ((select o.b from opening o) + sum(ev.balance) over (order by ev.business_date, ev.posted_at, ev.event_id))::bigint,
    coalesce(ev.project_ids, '{}')
  from ev cross join lateral private.event_label(ev.event_id) lbl
  order by 2 nulls first, 3 nulls first, 1 nulls first
$$;

-- ===========================================================================
-- 8. (was 20261104000800_opening_farchhyaut.sql)
-- ===========================================================================

-- Money a party held before the company started on the app pays their later bills (product owner,
-- 2026-10-18; GLOSSARY: Farchhyaut). An opening balance "they hold" (negative) sat in the party's
-- no-project bucket and could never settle anything: only payments could. A subcontractor holding
-- Rs 10,000 of old peski was paid Rs 2,000 cash for a Rs 2,000 bill.
--
-- An opening balance becomes a second source of money that settles documents, next to payments:
--   * settlement_events and payment_allocation_events take opening_balance_id in place of
--     payment_id (exactly one of the two). Everything that sums by document counts it; everything
--     that filters by payment ignores it.
--   * Before it settles a document, the credit is moved from the no-project bucket into the
--     document's project, as a payment's money is (allocation_move, no cash). The move is dated
--     when it is used, not at cutover, so a project's past "as of" figures do not change.
--   * use_held_docs is Farchhyaut for any party and document: money they hold pays the documents
--     first. Its sources, in order: payments for the charge's own work package, payments on the
--     document's project, the opening credit already there, money held on other projects (and not
--     on any project, Accounts or Admin only), then the opening credit from elsewhere.
--   * pay_subcontractor pays a subcontractor's approved work charges in one step: what they hold
--     first, then cash for the rest (as pay_worker does for a worker's days).
-- Reversing a document, or the opening balance itself, undoes these settlements first (design §5.4).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

alter table public.settlement_events
  alter column payment_id drop not null,
  add column opening_balance_id uuid,
  add foreign key (company_id, opening_balance_id) references public.party_opening_balances (company_id, id),
  add constraint settlement_one_source check (num_nonnulls(payment_id, opening_balance_id) = 1);
create index settlement_events_opening on public.settlement_events (opening_balance_id, project_id)
  where opening_balance_id is not null;

alter table public.payment_allocation_events
  alter column payment_id drop not null,
  add column opening_balance_id uuid,
  add foreign key (company_id, opening_balance_id) references public.party_opening_balances (company_id, id),
  add constraint allocation_one_source check (num_nonnulls(payment_id, opening_balance_id) = 1);
create index allocation_events_opening on public.payment_allocation_events (opening_balance_id, project_id)
  where opening_balance_id is not null;

-- ---------------------------------------------------------------------------
-- The opening credit's buckets
-- ---------------------------------------------------------------------------

create function private.opening_allocated(p_ob uuid, p_project uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(a.amount_paisa), 0)::bigint from public.payment_allocation_events a
  where a.opening_balance_id = p_ob and a.project_id = p_project
$$;

create function private.opening_settled(p_ob uuid, p_project uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(s.amount_paisa), 0)::bigint from public.settlement_events s
  where s.opening_balance_id = p_ob and s.project_id = p_project
$$;

-- What of a posted "they hold" opening balance is still on no project. 0 for one owed to them.
create function private.opening_unallocated(p_ob uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select greatest(0, -o.amount_paisa
    - (select coalesce(sum(a.amount_paisa), 0) from public.payment_allocation_events a where a.opening_balance_id = o.id))::bigint
  from public.party_opening_balances o where o.id = p_ob and o.status = 'posted' and o.amount_paisa < 0
$$;

-- Move part of the opening credit between buckets (null = no project), as move_allocation does for
-- a payment: the same events and ledger rows, with no cash.
create function private.move_opening(p_ob uuid, p_from uuid, p_to uuid, p_amount bigint, p_op_key uuid, p_reason text, p_date date)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.party_opening_balances;
  v_alloc uuid;
  v_event uuid;
  ch record;
begin
  select * into o from public.party_opening_balances where id = p_ob;
  if o.status <> 'posted' or o.amount_paisa >= 0 then
    raise exception 'Only money they hold from the opening balance can be used' using errcode = 'P0001';
  end if;
  for ch in
    select x.project_id, x.delta from (values (p_from, -p_amount), (p_to, p_amount)) x (project_id, delta)
    where x.project_id is not null
  loop
    insert into public.payment_allocation_events (company_id, opening_balance_id, project_id, amount_paisa, business_date, reason, created_by)
    values (o.company_id, p_ob, ch.project_id, ch.delta, p_date, p_reason, auth.uid())
    returning id into v_alloc;
    v_event := private.new_event(o.company_id, 'allocation_move', o.party_id, p_date, p_op_key, p_allocation_event => v_alloc);
    perform private.add_ledger(v_event, 'project', ch.project_id, null, 0, -ch.delta, 0);
    perform private.add_ledger(v_event, 'unallocated', null, null, 0, ch.delta, 0);
  end loop;
  if (select coalesce(sum(amount_paisa), 0) from public.payment_allocation_events where opening_balance_id = p_ob) > -o.amount_paisa
     or exists (select 1 from public.payment_allocation_events where opening_balance_id = p_ob group by project_id having sum(amount_paisa) < 0)
     or (p_from is not null and private.opening_allocated(p_ob, p_from) < private.opening_settled(p_ob, p_from)) then
    raise exception 'Moving this would use more of the opening balance than they hold' using errcode = 'P0001';
  end if;
end $$;

-- settle_one for the opening credit: the same checks, and dated no earlier than the cutover.
create function private.settle_opening(p_ob uuid, p_doc uuid, p_project uuid, p_amount bigint, p_date date, p_op_key uuid, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.party_opening_balances;
  d record;
  v_min date;
  v_id uuid;
begin
  select * into o from public.party_opening_balances where id = p_ob;
  select * into d from private.doc_info(p_doc);
  if o.id is null or d.kind is null or o.company_id <> d.company_id then
    raise exception 'Opening balance or bill not found' using errcode = 'P0002';
  end if;
  if o.party_id <> d.party_id then
    raise exception 'The opening balance and the % are for different parties', lower(d.label) using errcode = 'P0001';
  end if;
  if o.status <> 'posted' or o.amount_paisa >= 0 then
    raise exception 'Only money they hold from the opening balance can be used' using errcode = 'P0001';
  end if;
  if not d.posted then
    raise exception '% is not posted, so it cannot be settled', d.label using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Settlement amount must be more than zero' using errcode = '22023';
  end if;
  v_min := greatest(o.cutover_date, d.doc_date);
  if p_date is not null and p_date < v_min then
    raise exception 'A settlement cannot be dated before the opening balance or the bill' using errcode = '22023';
  end if;
  if private.opening_allocated(p_ob, p_project) - private.opening_settled(p_ob, p_project) < p_amount then
    raise exception 'Not enough of the opening balance is on this project' using errcode = 'P0001';
  end if;
  if private.doc_settleable(p_doc, p_project) - private.doc_settled(p_doc, p_project) < p_amount then
    raise exception 'This is more than % still owes for the project', d.label using errcode = 'P0001';
  end if;
  insert into public.settlement_events (
    company_id, opening_balance_id, project_id, bill_id, charge_id, labour_cost_id, expense_id,
    amount_paisa, business_date, op_key, reason, created_by
  ) values (
    o.company_id, p_ob, p_project,
    case when d.kind = 'bill' then p_doc end, case when d.kind = 'charge' then p_doc end,
    case when d.kind = 'labour' then p_doc end, case when d.kind = 'expense' then p_doc end,
    p_amount, coalesce(p_date, v_min), p_op_key, p_reason, auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

revoke execute on function private.opening_allocated(uuid, uuid), private.opening_settled(uuid, uuid),
  private.opening_unallocated(uuid), private.move_opening(uuid, uuid, uuid, bigint, uuid, text, date),
  private.settle_opening(uuid, uuid, uuid, bigint, date, uuid, text) from public, anon;
-- Read by party_open_items, which runs as the caller.
grant execute on function private.opening_allocated(uuid, uuid), private.opening_settled(uuid, uuid),
  private.opening_unallocated(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Farchhyaut for any party: money they hold pays p_docs first
-- ---------------------------------------------------------------------------

-- Oldest document first (a bill once per project on it). Money from another bucket is moved to the
-- document's project, then matched; a bucket gives no more than the party holds there, so what is
-- unpaid there keeps its money. Money on no project: Accounts or Admin only, who may assign it.
-- The caller has locked the party and the documents. Returns how much came from each source.
create function private.use_held_docs(p_party uuid, p_docs uuid[], p_op_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.party_company(p_party);
  v_package bigint := 0;
  v_payments bigint := 0;
  v_opening bigint := 0;
  v_take bigint;
  v_owed bigint;
  o public.party_opening_balances;
  s record;
  d record;
begin
  perform 1 from public.payments where party_id = p_party and status = 'posted' order by id for update;
  select * into o from public.party_opening_balances
  where party_id = p_party and status = 'posted' and amount_paisa < 0 for update;
  for d in
    select x.doc_id, x.project_id, x.package_id, x.doc_date from (
      select b.id as doc_id, l.project_id, null::uuid as package_id, b.bill_date as doc_date
      from public.supplier_bills b join (select distinct y.bill_id, y.project_id from public.bill_lines y) l on l.bill_id = b.id
      where b.id = any (p_docs)
      union all
      select c.id, c.project_id, c.work_package_id, c.approved_date from public.subcontract_charges c where c.id = any (p_docs)
      union all
      select l.id, l.project_id, null, l.work_date from public.labour_costs l where l.id = any (p_docs)
      union all
      select e.id, e.project_id, null, e.expense_date from public.expenses e where e.id = any (p_docs) and e.project_id is not null
    ) x order by x.doc_date, x.doc_id, x.project_id
  loop
    v_owed := private.doc_settleable(d.doc_id, d.project_id) - private.doc_settled(d.doc_id, d.project_id);
    continue when v_owed <= 0;
    -- 1. Peski for this charge's own work package; 2. other payments on the document's project.
    for s in
      select x.id, x.work_package_id from public.payments x
      where x.party_id = p_party and x.status = 'posted'
        and (x.work_package_id is null or x.work_package_id = d.package_id)
        and private.payment_allocated(x.id, d.project_id) - private.payment_settled(x.id, d.project_id) > 0
      order by x.work_package_id is null, x.payment_date, x.id
    loop
      exit when v_owed <= 0;
      v_take := least(private.payment_allocated(s.id, d.project_id) - private.payment_settled(s.id, d.project_id), v_owed);
      perform private.settle_one(s.id, d.doc_id, d.project_id, v_take, null, p_op_key, 'Deducted from money paid before');
      if s.work_package_id is null then v_payments := v_payments + v_take; else v_package := v_package + v_take; end if;
      v_owed := v_owed - v_take;
    end loop;
    -- 3. The opening credit already on the document's project.
    if o.id is not null and v_owed > 0 then
      v_take := least(private.opening_allocated(o.id, d.project_id) - private.opening_settled(o.id, d.project_id), v_owed);
      if v_take > 0 then
        perform private.settle_opening(o.id, d.doc_id, d.project_id, v_take, null, p_op_key, 'Deducted from the opening balance');
        v_opening := v_opening + v_take;
        v_owed := v_owed - v_take;
      end if;
    end if;
    -- 4. Payments held on other projects, then not given a project.
    for s in
      select x.id, e.project_id,
        case when e.project_id is null
          then x.amount_paisa - (select coalesce(sum(a.amount_paisa), 0) from public.payment_allocation_events a where a.payment_id = x.id)
          else private.payment_allocated(x.id, e.project_id) - private.payment_settled(x.id, e.project_id) end as free
      from public.payments x
      cross join lateral (
        select distinct a.project_id from public.payment_allocation_events a where a.payment_id = x.id
        union select null::uuid
      ) e
      where x.party_id = p_party and x.status = 'posted' and x.work_package_id is null
        and e.project_id is distinct from d.project_id
        and (case when e.project_id is null then private.can_post(v_company) else private.can_see_project(v_company, e.project_id) end)
      order by e.project_id is null, x.payment_date, x.id
    loop
      exit when v_owed <= 0;
      v_take := least(s.free, v_owed, private.held_in(p_party, s.project_id));
      continue when v_take <= 0;
      perform private.move_allocation(s.id, s.project_id, d.project_id, v_take, p_op_key, 'Advance used on another project');
      perform private.settle_one(s.id, d.doc_id, d.project_id, v_take, null, p_op_key, 'Deducted from money paid before');
      v_payments := v_payments + v_take;
      v_owed := v_owed - v_take;
    end loop;
    -- 5. The opening credit on other projects, then on no project.
    if o.id is not null and v_owed > 0 then
      for s in
        select b.project_id,
          case when b.project_id is null then private.opening_unallocated(o.id)
            else private.opening_allocated(o.id, b.project_id) - private.opening_settled(o.id, b.project_id) end as free
        from (
          select distinct a.project_id from public.payment_allocation_events a where a.opening_balance_id = o.id
          union select null::uuid
        ) b
        where b.project_id is distinct from d.project_id
          and (case when b.project_id is null then private.can_post(v_company) else private.can_see_project(v_company, b.project_id) end)
        order by b.project_id is null, b.project_id
      loop
        exit when v_owed <= 0;
        v_take := least(s.free, v_owed, private.held_in(p_party, s.project_id));
        continue when v_take <= 0;
        perform private.move_opening(o.id, s.project_id, d.project_id, v_take, p_op_key, 'Opening balance used',
          greatest(o.cutover_date, d.doc_date));
        perform private.settle_opening(o.id, d.doc_id, d.project_id, v_take, null, p_op_key, 'Deducted from the opening balance');
        v_opening := v_opening + v_take;
        v_owed := v_owed - v_take;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('total_paisa', v_package + v_payments + v_opening, 'package_paisa', v_package,
    'payments_paisa', v_payments, 'opening_paisa', v_opening);
end $$;
revoke execute on function private.use_held_docs(uuid, uuid[], uuid) from public, anon;

-- A worker's days (sections 2 and 3): now through use_held_docs, so an opening balance pays them too.
create or replace function private.use_held(p_party uuid, p_project uuid, p_docs uuid[], p_op_key uuid) returns bigint
language sql security definer set search_path = '' as $$
  select (private.use_held_docs(p_party, p_docs, p_op_key) ->> 'total_paisa')::bigint
$$;

-- What use_held_docs could take for documents on p_project (and p_package's charges), for a form
-- to show before saving: everything free on the project, plus from each other bucket the user may
-- use, no more than the party holds there.
create function public.party_usable_held(p_party uuid, p_project uuid, p_package uuid default null) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_company uuid := private.party_company(p_party);
  v_ob uuid := (select o.id from public.party_opening_balances o
                where o.party_id = p_party and o.status = 'posted' and o.amount_paisa < 0);
begin
  if v_company is null or not private.is_member(v_company) or not private.can_see_finance(v_company)
     or not private.can_see_project(v_company, p_project) then
    raise exception 'You cannot see this party''s money' using errcode = '42501';
  end if;
  return (
    select coalesce(sum(private.payment_allocated(x.id, p_project) - private.payment_settled(x.id, p_project)), 0)
    from public.payments x
    where x.party_id = p_party and x.status = 'posted' and (x.work_package_id is null or x.work_package_id = p_package)
  ) + coalesce(private.opening_allocated(v_ob, p_project) - private.opening_settled(v_ob, p_project), 0) + (
    select coalesce(sum(least(b.free, private.held_in(p_party, b.project_id))), 0)
    from (
      select k.project_id, sum(k.free) as free from (
        select e.project_id,
          case when e.project_id is null
            then x.amount_paisa - (select coalesce(sum(a.amount_paisa), 0) from public.payment_allocation_events a where a.payment_id = x.id)
            else private.payment_allocated(x.id, e.project_id) - private.payment_settled(x.id, e.project_id) end as free
        from public.payments x
        cross join lateral (
          select distinct a.project_id from public.payment_allocation_events a where a.payment_id = x.id
          union select null::uuid
        ) e
        where x.party_id = p_party and x.status = 'posted' and x.work_package_id is null
        union all
        select a.project_id, private.opening_allocated(v_ob, a.project_id) - private.opening_settled(v_ob, a.project_id)
        from (select distinct y.project_id from public.payment_allocation_events y where y.opening_balance_id = v_ob) a
        union all
        select null::uuid, coalesce(private.opening_unallocated(v_ob), 0)
      ) k
      where k.project_id is distinct from p_project
        and (case when k.project_id is null then private.can_post(v_company) else private.can_see_project(v_company, k.project_id) end)
      group by k.project_id
    ) b
    where b.free > 0
  );
end $$;
revoke execute on function public.party_usable_held(uuid, uuid, uuid) from public, anon;
grant execute on function public.party_usable_held(uuid, uuid, uuid) to authenticated;

-- A worker's advance (section 5): the opening credit on no project counts too, as use_held now takes it.
create or replace function public.worker_advance(p_worker uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_company uuid := (select w.company_id from public.workers w where w.id = p_worker);
begin
  if v_company is null or not private.is_member(v_company) or not private.can_see_finance(v_company) then
    raise exception 'You cannot see this worker''s money' using errcode = '42501';
  end if;
  return (
    select coalesce(sum(private.held_in(p_worker, b.project_id)), 0)::bigint
    from (select distinct l.project_id from public.ledger_entries l where l.party_id = p_worker and l.project_id is not null) b
    where private.can_see_project(v_company, b.project_id)
  ) + (
    -- Not given a project: payments' unassigned money and the opening credit, as use_held takes them.
    select case when private.can_post(v_company) then least(private.held_in(p_worker, null), coalesce(sum(
      x.amount_paisa - (select coalesce(sum(a.amount_paisa), 0) from public.payment_allocation_events a where a.payment_id = x.id)), 0)
      + coalesce((select private.opening_unallocated(o.id) from public.party_opening_balances o
                  where o.party_id = p_worker and o.status = 'posted' and o.amount_paisa < 0), 0))
      else 0 end::bigint
    from public.payments x where x.party_id = p_worker and x.status = 'posted' and x.work_package_id is null
  );
end $$;

-- ---------------------------------------------------------------------------
-- Undoing: settlements from the opening credit are undone like a payment's
-- ---------------------------------------------------------------------------

-- As 20261012000200, with the opening balance as a source: p_opening limits it to one.
drop function private.unsettle_where(uuid, uuid, uuid, bigint, date, uuid, text);
create function private.unsettle_where(
  p_doc uuid, p_payment uuid, p_project uuid, p_limit bigint, p_date date, p_op_key uuid, p_reason text, p_opening uuid default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_left bigint := p_limit; -- null = everything
  v_amt bigint;
  v_done bigint := 0;
begin
  for r in
    select s.company_id, s.payment_id, s.opening_balance_id, s.project_id, s.bill_id, s.charge_id, s.labour_cost_id, s.expense_id,
      sum(s.amount_paisa) as net
    from public.settlement_events s
    where (p_doc is null or s.doc_id = p_doc)
      and (p_payment is null or s.payment_id = p_payment)
      and (p_opening is null or s.opening_balance_id = p_opening)
      and (p_project is null or s.project_id = p_project)
    group by s.company_id, s.payment_id, s.opening_balance_id, s.project_id, s.bill_id, s.charge_id, s.labour_cost_id, s.expense_id
    having sum(s.amount_paisa) > 0
    order by max(s.posted_at) desc, s.payment_id, s.opening_balance_id
  loop
    exit when v_left is not null and v_left <= 0;
    v_amt := case when v_left is null then r.net else least(r.net, v_left) end;
    insert into public.settlement_events (
      company_id, payment_id, opening_balance_id, project_id, bill_id, charge_id, labour_cost_id, expense_id,
      amount_paisa, business_date, op_key, reason, created_by
    ) values (
      r.company_id, r.payment_id, r.opening_balance_id, r.project_id, r.bill_id, r.charge_id, r.labour_cost_id, r.expense_id,
      -v_amt, p_date, p_op_key, p_reason, auth.uid()
    );
    v_done := v_done + v_amt;
    if v_left is not null then
      v_left := v_left - v_amt;
    end if;
  end loop;
  return v_done;
end $$;
revoke execute on function private.unsettle_where(uuid, uuid, uuid, bigint, date, uuid, text, uuid) from public, anon;

-- As 20261103000100, plus the opening credit's moves when the opening balance is reversed (C8).
create or replace function private.reverse_with_event(
  p_company uuid, p_party uuid, p_date date, p_reason text, p_op_key uuid, p_bill uuid default null, p_payment uuid default null,
  p_credit uuid default null, p_opening_balance uuid default null, p_charge uuid default null, p_labour_cost uuid default null,
  p_expense uuid default null, p_refund uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := private.party_kind(p_party);
  v_reversal uuid;
  v_events uuid[];
  v_event uuid;
begin
  insert into public.reversals (
    company_id, supplier_id, subcontractor_id, crew_id, payee_id, worker_id, bill_id, payment_id, credit_id, opening_balance_id,
    charge_id, labour_cost_id, expense_id, refund_id, reversal_date, reason, created_by
  ) values (
    p_company,
    case when v_kind = 'supplier' then p_party end, case when v_kind = 'subcontractor' then p_party end,
    case when v_kind = 'crew' then p_party end, case when v_kind = 'payee' then p_party end,
    case when v_kind = 'worker' then p_party end,
    p_bill, p_payment, p_credit, p_opening_balance, p_charge, p_labour_cost, p_expense, p_refund, p_date, p_reason, auth.uid()
  ) returning id into v_reversal;
  -- A payment's or opening balance's own event plus every allocation move made on it (C8).
  select array_agg(e.id order by e.posted_at, e.id) into v_events
  from public.posting_events e
  where (p_bill is not null and e.bill_id = p_bill and e.event_type = 'bill_post')
     or (p_credit is not null and e.credit_id = p_credit and e.event_type = 'credit_post')
     or (p_opening_balance is not null and e.opening_balance_id = p_opening_balance and e.event_type = 'opening_balance')
     or (p_opening_balance is not null and e.allocation_event_id in (
           select a.id from public.payment_allocation_events a where a.opening_balance_id = p_opening_balance))
     or (p_charge is not null and e.charge_id = p_charge and e.event_type = 'charge_approve')
     or (p_labour_cost is not null and e.labour_cost_id = p_labour_cost and e.event_type = 'labour_save')
     or (p_expense is not null and e.expense_id = p_expense and e.event_type = 'expense_save')
     or (p_refund is not null and e.refund_id = p_refund and e.event_type = 'refund')
     or (p_payment is not null and e.payment_id = p_payment and e.event_type = 'payment_post')
     or (p_payment is not null and e.allocation_event_id in (
           select a.id from public.payment_allocation_events a where a.payment_id = p_payment));
  v_event := private.new_event(p_company, 'reversal', p_party, p_date, p_op_key,
    p_reversal => v_reversal, p_reversed_events => v_events);
  perform private.negate_events(v_event, v_events);
  return v_reversal;
end $$;

-- As 20261012000200: what the opening credit settled is undone first, then it and its moves.
create or replace function public.reverse_opening_balance(p_op_key uuid, p_opening_balance uuid, p_date date, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ob public.party_opening_balances;
  v_company uuid := (select company_id from public.party_opening_balances where id = p_opening_balance);
  v_prior jsonb;
  v_reversal uuid;
  v_date date := coalesce(p_date, private.today());
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can reverse opening balances' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'reverse_opening_balance',
    jsonb_build_object('opening_balance', p_opening_balance, 'date', p_date, 'reason', p_reason));
  if v_prior is not null then
    return v_prior;
  end if;
  perform private.lock_party((select party_id from public.party_opening_balances where id = p_opening_balance));
  select * into ob from public.party_opening_balances where id = p_opening_balance for update;
  perform private.lock_docs(array(select distinct s.doc_id from public.settlement_events s where s.opening_balance_id = p_opening_balance));
  if ob.status = 'reversed' then
    raise exception 'already_reversed: this opening balance was already reversed' using errcode = 'P0001';
  end if;
  if v_date < ob.cutover_date then
    raise exception 'The reversal cannot be dated before the cutover date' using errcode = '22023';
  end if;
  perform private.unsettle_where(null, null, null, null, v_date, p_op_key, 'Opening balance reversed', p_opening_balance);
  v_reversal := private.reverse_with_event(v_company, ob.party_id, v_date, private.require_reason(p_reason), p_op_key,
    p_opening_balance => p_opening_balance);
  update public.party_opening_balances set status = 'reversed' where id = p_opening_balance;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('reversal_id', v_reversal));
end $$;

-- ---------------------------------------------------------------------------
-- Matching by hand, open items, figures, labels
-- ---------------------------------------------------------------------------

-- As 20261012000200: an item may name opening_balance_id in place of payment_id (Accounts or
-- Admin, who see opening balances). Opening credit not yet on the project moves there first.
create or replace function public.settle(p_op_key uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_docs uuid[] := array(select coalesce(x ->> 'doc_id', x ->> 'bill_id')::uuid from jsonb_array_elements(p_items) x);
  v_company uuid;
  v_party uuid;
  v_prior jsonb;
  s jsonb;
  v_ob uuid;
  v_project uuid;
  v_short bigint;
  v_ids uuid[] := '{}';
begin
  select d.company_id, d.party_id into v_company, v_party from private.doc_info(v_docs[1]) d;
  if v_company is null or not private.can_record_payments(v_company) or not private.can_see_finance(v_company) then
    raise exception 'You cannot match payments to bills' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where not private.can_see_project(v_company, (x ->> 'project_id')::uuid)
  ) then
    raise exception 'You can only match bills on projects you are assigned to' using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x where x ? 'opening_balance_id') and not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can use an opening balance' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(v_docs) doc left join lateral private.doc_info(doc) d on true
    where d.party_id is distinct from v_party
  ) then
    raise exception 'Match one supplier or other party at a time' using errcode = 'P0001';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'settle', p_items);
  if v_prior is not null then
    return v_prior;
  end if;
  perform private.lock_party(v_party);
  perform 1 from public.payments
  where id in (select (x ->> 'payment_id')::uuid from jsonb_array_elements(p_items) x) order by id for update;
  perform 1 from public.party_opening_balances
  where id in (select (x ->> 'opening_balance_id')::uuid from jsonb_array_elements(p_items) x) order by id for update;
  perform private.lock_docs(v_docs);
  for s in select * from jsonb_array_elements(p_items) loop
    if s ? 'opening_balance_id' then
      v_ob := (s ->> 'opening_balance_id')::uuid;
      v_project := (s ->> 'project_id')::uuid;
      v_short := (s ->> 'amount_paisa')::bigint - (private.opening_allocated(v_ob, v_project) - private.opening_settled(v_ob, v_project));
      if v_short > 0 then
        perform private.move_opening(v_ob, null, v_project, least(v_short, coalesce(private.opening_unallocated(v_ob), 0)),
          p_op_key, 'Opening balance used',
          greatest((select cutover_date from public.party_opening_balances where id = v_ob),
                   (select doc_date from private.doc_info(coalesce(s ->> 'doc_id', s ->> 'bill_id')::uuid))));
      end if;
      v_ids := v_ids || private.settle_opening(v_ob, coalesce(s ->> 'doc_id', s ->> 'bill_id')::uuid, v_project,
        (s ->> 'amount_paisa')::bigint, (s ->> 'date')::date, p_op_key, null);
    else
      v_ids := v_ids || private.settle_one((s ->> 'payment_id')::uuid, coalesce(s ->> 'doc_id', s ->> 'bill_id')::uuid,
        (s ->> 'project_id')::uuid, (s ->> 'amount_paisa')::bigint, (s ->> 'date')::date, p_op_key, null);
    end if;
  end loop;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('settlement_ids', to_jsonb(v_ids)));
end $$;

-- As 20261103000100, plus the opening credit free on each project and on none ("opening"). It runs
-- as the caller, so only those who see opening balances (Accounts, Admin) get those rows.
create or replace function public.party_open_items(p_party uuid)
returns table (kind text, doc_id uuid, label text, doc_date date, project_id uuid, amount_paisa bigint)
language sql stable set search_path = '' as $$
  select * from (
    select 'bill'::text, b.id, b.bill_no, b.bill_date, l.project_id,
      private.bill_settleable(b.id, l.project_id) - private.bill_settled(b.id, l.project_id)
    from public.supplier_bills b
    join (select distinct x.bill_id, x.project_id from public.bill_lines x) l on l.bill_id = b.id
    where b.supplier_id = p_party and b.status = 'posted'
    union all
    select 'charge', c.id, coalesce(nullif(trim(c.claim_no), ''), 'Work charge'), c.approved_date, c.project_id,
      c.approved_paisa - private.doc_settled(c.id, c.project_id)
    from public.subcontract_charges c where c.subcontractor_id = p_party and c.status = 'approved'
    union all
    select 'labour', l.id, coalesce(l.work_type, 'Labour'), l.work_date, l.project_id,
      l.amount_paisa - private.doc_settled(l.id, l.project_id)
    from public.labour_costs l where coalesce(l.worker_id, l.crew_id) = p_party and l.status = 'posted'
    union all
    select 'expense', e.id, e.description, e.expense_date, e.project_id,
      e.amount_paisa - private.doc_settled(e.id, e.project_id)
    from public.expenses e where e.payee_id = p_party and e.status = 'posted'
    union all
    select 'payment', p.id, p.number, p.payment_date, e.project_id,
      private.payment_allocated(p.id, e.project_id) - private.payment_settled(p.id, e.project_id)
    from public.payments p
    join (select distinct x.payment_id, x.project_id from public.payment_allocation_events x) e on e.payment_id = p.id
    where p.party_id = p_party and p.status = 'posted'
    union all
    select 'unallocated', p.id, p.number, p.payment_date, null::uuid,
      p.amount_paisa - (select coalesce(sum(x.amount_paisa), 0) from public.payment_allocation_events x where x.payment_id = p.id)
    from public.payments p
    where p.party_id = p_party and p.status = 'posted' and private.can_post(p.company_id)
    union all
    select 'opening', o.id, 'Opening balance', o.cutover_date, b.project_id,
      case when b.project_id is null then private.opening_unallocated(o.id)
        else private.opening_allocated(o.id, b.project_id) - private.opening_settled(o.id, b.project_id) end
    from public.party_opening_balances o
    cross join lateral (
      select distinct a.project_id from public.payment_allocation_events a where a.opening_balance_id = o.id
      union select null::uuid
    ) b
    where o.party_id = p_party and o.status = 'posted' and o.amount_paisa < 0
  ) t (kind, doc_id, label, doc_date, project_id, amount_paisa)
  where amount_paisa > 0
  order by doc_date, label
$$;

-- As 20261012000200: what the opening credit settled counts as paid on the package too.
create or replace function public.work_package_figures(p_project uuid)
returns table (
  work_package_id uuid, agreed_value_paisa bigint, approved_paisa bigint, pending_claims_paisa bigint,
  paid_paisa bigint, balance_paisa bigint, remaining_value_paisa bigint
)
language sql stable security definer set search_path = '' as $$
  with pk as (
    select w.id, w.company_id from public.work_packages w
    where w.project_id = p_project and private.can_see_project_money(w.company_id, w.project_id)
  ),
  f as (
    select pk.id,
      (select t.agreed_value_paisa from public.work_package_terms t where t.id = pk.id) as agreed,
      coalesce((select sum(c.approved_paisa) from public.subcontract_charges c
                where c.work_package_id = pk.id and c.status = 'approved'), 0)::bigint as approved,
      coalesce((select sum(c.claimed_paisa) from public.subcontract_charges c
                where c.work_package_id = pk.id and c.status = 'draft'), 0)::bigint as pending,
      (coalesce((select sum(p.amount_paisa) from public.payments p
                 where p.work_package_id = pk.id and p.status = 'posted'), 0)
       + coalesce((select sum(s.amount_paisa) from public.settlement_events s
                   join public.subcontract_charges c on c.id = s.charge_id
                   left join public.payments p on p.id = s.payment_id
                   where c.work_package_id = pk.id and p.work_package_id is distinct from pk.id), 0))::bigint as paid
    from pk
  )
  select f.id, f.agreed, f.approved, f.pending, f.paid, f.approved - f.paid, f.agreed - f.approved from f
$$;

-- As 20261022000100: the opening credit moved into a project reads "Opening balance used".
create or replace function private.event_label(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.posting_events;
  r public.reversals;
  v_label text;
  v_bill uuid;
  v_payment uuid;
  v_credit uuid;
  v_charge uuid;
  v_labour uuid;
  v_expense uuid;
  v_refund uuid;
  v_opening_move boolean := false;
begin
  select * into e from public.posting_events where id = p_event;
  if not found or not private.can_see_finance(e.company_id) then
    return null;
  end if;
  if e.event_type = 'reversal' then
    select * into r from public.reversals where id = e.reversal_id;
    v_bill := r.bill_id; v_payment := r.payment_id; v_credit := r.credit_id;
    v_charge := r.charge_id; v_labour := r.labour_cost_id; v_expense := r.expense_id; v_refund := r.refund_id;
  elsif e.event_type = 'allocation_move' then
    select a.payment_id, a.opening_balance_id is not null into v_payment, v_opening_move
    from public.payment_allocation_events a where a.id = e.allocation_event_id;
  else
    v_bill := e.bill_id; v_payment := e.payment_id; v_credit := e.credit_id;
    v_charge := e.charge_id; v_labour := e.labour_cost_id; v_expense := e.expense_id; v_refund := e.refund_id;
  end if;
  v_label := coalesce(
    (select 'Bill ' || b.bill_no from public.supplier_bills b where b.id = v_bill),
    (select 'Payment ' || p.number from public.payments p where p.id = v_payment),
    (select 'Credit ' || c.number from public.credits c where c.id = v_credit),
    (select 'Work charge' || coalesce(' ' || nullif(trim(c.claim_no), ''), '') || ': ' || w.scope
     from public.subcontract_charges c join public.work_packages w on w.id = c.work_package_id where c.id = v_charge),
    (select 'Labour' || coalesce(', ' || l.work_type, '') from public.labour_costs l where l.id = v_labour),
    (select 'Expense: ' || x.description from public.expenses x where x.id = v_expense),
    (select case when f.kind = 'peski_returned' then 'Peski returned ' else 'Refund ' end || f.number
     from public.refunds f where f.id = v_refund),
    case when e.event_type = 'opening_balance' or r.opening_balance_id is not null then 'Opening balance' end
  );
  v_label := case
    when v_opening_move then 'Opening balance used'
    when e.event_type = 'reversal' then 'Reversal of ' || lower(left(v_label, 1)) || substr(v_label, 2)
    when e.event_type = 'allocation_move' then 'Allocation change, ' || lower(left(v_label, 1)) || substr(v_label, 2)
    else v_label end;
  return jsonb_build_object('label', v_label, 'bill_id', v_bill, 'payment_id', v_payment, 'credit_id', v_credit,
    'charge_id', v_charge, 'labour_cost_id', v_labour, 'expense_id', v_expense, 'refund_id', v_refund, 'reason', r.reason);
end $$;

-- ---------------------------------------------------------------------------
-- Paying a subcontractor's work in one step
-- ---------------------------------------------------------------------------

-- p_pay: {id, subcontractor_id, work_package_id?, payment_date, amount_paisa (cash; 0 when what
-- they hold covers it), method, reference, notes, docs: [{doc_id}]}. The ticked approved charges
-- are paid first from what the subcontractor holds (use_held_docs), then from the cash, oldest
-- first. Cash beyond them stays with them (Overpayment, or the package's money when the payment
-- is for one package). Returns what came from where, and the payment, if any cash was paid.
create function public.pay_subcontractor(p_op_key uuid, p_pay jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub uuid := (p_pay ->> 'subcontractor_id')::uuid;
  v_company uuid := (select s.company_id from public.subcontractors s where s.id = (p_pay ->> 'subcontractor_id')::uuid);
  v_package uuid := nullif(p_pay ->> 'work_package_id', '')::uuid;
  v_id uuid := (p_pay ->> 'id')::uuid;
  v_amount bigint := coalesce((p_pay ->> 'amount_paisa')::bigint, 0);
  v_date date := coalesce((p_pay ->> 'payment_date')::date, private.today());
  v_prior jsonb;
  v_docs uuid[];
  v_held jsonb;
  v_owed bigint := 0;
  v_left bigint;
  v_take bigint;
  v_settles jsonb := '[]'::jsonb;
  v_allocs jsonb;
  v_payment jsonb;
  v_s jsonb;
  d record;
begin
  -- 1. Authorize.
  if v_company is null then
    raise exception 'Choose a subcontractor' using errcode = 'P0001';
  end if;
  if not private.can_record_payments(v_company) or not private.can_see_finance(v_company) then
    raise exception 'You cannot record payments' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct (x ->> 'doc_id')::uuid), '{}') into v_docs
  from jsonb_array_elements(coalesce(p_pay -> 'docs', '[]')) x;
  if cardinality(v_docs) = 0 then
    raise exception 'Choose the work to pay' using errcode = '22023';
  end if;
  if v_amount < 0 then
    raise exception 'Enter the amount paid' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_docs) doc
    left join public.subcontract_charges c on c.id = doc and c.company_id = v_company
    where c.id is null or c.subcontractor_id <> v_sub or not private.can_see_project(v_company, c.project_id)
      or (v_package is not null and c.work_package_id <> v_package)
  ) then
    raise exception 'Work to pay is not this subcontractor''s, or not on your projects' using errcode = 'P0001';
  end if;

  -- 2. Operation key.
  v_prior := private.begin_op(v_company, p_op_key, 'pay_subcontractor', p_pay);
  if v_prior is not null then
    return v_prior;
  end if;

  -- 3. Lock: the subcontractor, then their payments and opening balance, then the charges.
  perform private.lock_party(v_sub);
  perform 1 from public.payments where party_id = v_sub and status = 'posted' order by id for update;
  perform 1 from public.party_opening_balances where party_id = v_sub and status = 'posted' for update;
  perform private.lock_docs(v_docs);

  -- 4. State: approved, and something still to pay.
  if exists (select 1 from public.subcontract_charges c where c.id = any (v_docs) and c.status <> 'approved') then
    raise exception 'Only approved work can be paid' using errcode = 'P0001';
  end if;
  select coalesce(sum(c.approved_paisa - private.doc_settled(c.id, c.project_id)), 0) into v_owed
  from public.subcontract_charges c where c.id = any (v_docs);
  if v_owed <= 0 then
    raise exception 'already_paid: this work is paid already' using errcode = 'P0001';
  end if;

  -- 5. Write: what they hold first, then the cash, oldest charge first.
  v_held := private.use_held_docs(v_sub, v_docs, p_op_key);
  if v_amount > 0 then
    v_left := v_amount;
    for d in
      select c.id, c.project_id, c.approved_paisa - private.doc_settled(c.id, c.project_id) as owed
      from public.subcontract_charges c where c.id = any (v_docs) order by c.approved_date, c.id
    loop
      exit when v_left <= 0;
      continue when d.owed <= 0;
      v_take := least(d.owed, v_left);
      v_settles := v_settles || jsonb_build_array(jsonb_build_object('doc_id', d.id, 'project_id', d.project_id, 'amount_paisa', v_take));
      v_left := v_left - v_take;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('project_id', k.project_id, 'amount_paisa', k.amount)), '[]') into v_allocs
    from (
      select x.project_id, sum(x.amount)::bigint as amount from (
        select (s ->> 'project_id')::uuid as project_id, (s ->> 'amount_paisa')::bigint as amount from jsonb_array_elements(v_settles) s
        union all
        select (select c.project_id from public.subcontract_charges c where c.id = any (v_docs) order by c.approved_date desc, c.id limit 1), v_left
        where v_left > 0
      ) x group by x.project_id
    ) k;
    v_payment := private.post_payment(v_company, v_id, v_sub, v_date, v_amount, coalesce(p_pay ->> 'method', 'cash'),
      nullif(trim(p_pay ->> 'reference'), ''), nullif(trim(p_pay ->> 'notes'), ''), v_package, v_allocs, p_op_key, false);
    for v_s in select x from jsonb_array_elements(v_settles) x loop
      perform private.settle_one(v_id, (v_s ->> 'doc_id')::uuid, (v_s ->> 'project_id')::uuid, (v_s ->> 'amount_paisa')::bigint,
        null, p_op_key, null);
    end loop;
  end if;

  -- 6. Invariants: nothing paid beyond what the work is worth (settle_one and settle_opening check
  -- each charge), and the money they held used no more than was owed.
  if (v_held ->> 'total_paisa')::bigint > v_owed then
    raise exception 'More of what they hold was used than the work is worth' using errcode = 'P0001';
  end if;

  -- 7. Result.
  return private.finish_op(v_company, p_op_key, jsonb_build_object(
    'payment_id', v_payment ->> 'payment_id', 'number', v_payment ->> 'number',
    'held_used_paisa', (v_held ->> 'total_paisa')::bigint, 'from_package_paisa', (v_held ->> 'package_paisa')::bigint,
    'from_payments_paisa', (v_held ->> 'payments_paisa')::bigint, 'from_opening_paisa', (v_held ->> 'opening_paisa')::bigint,
    'cash_paisa', v_amount, 'extra_paisa', greatest(coalesce(v_left, 0), 0)));
end $$;
revoke execute on function public.pay_subcontractor(uuid, jsonb) from public, anon;
grant execute on function public.pay_subcontractor(uuid, jsonb) to authenticated;

