-- Worker's time card (req §14, attendance step 2): one worker's month across every project, and
-- closing a worker's open days in one step. Closing still works per crew-day: each open day the
-- worker has on a project closes for that project's crew, with everyone marked on it, through the
-- same writer as the day roster.

-- ---------------------------------------------------------------------------
-- Closing, shared by the roster (one crew, one project) and the time card (one worker)
-- ---------------------------------------------------------------------------
-- Prices one crew's open rows on one project between two dates and posts one labour cost per
-- work date. The caller has checked scope and the operation key and holds no locks.
create function private.close_crew_days(
  p_company uuid, p_project uuid, p_crew uuid, p_from date, p_to date, p_pay jsonb, p_confirm boolean, p_op_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_std integer := (select standard_day_minutes from public.companies where id = p_company);
  v_days jsonb;
  v_result jsonb;
begin
  perform private.lock_party(p_crew);
  -- Price the open rows from the members' current rates.
  update public.attendance a
  set rate_kind = m.rate_kind, rate_paisa = m.rate_paisa,
    amount_paisa = round(m.rate_paisa::numeric * a.minutes / case when m.rate_kind = 'hourly' then 60 else v_std end)
  from public.crew_members m
  where m.id = a.member_id and a.project_id = p_project and a.crew_id = p_crew
    and a.work_date between p_from and p_to and not private.attendance_is_closed(a.labour_cost_id);

  select jsonb_agg(jsonb_build_object(
      'work_date', d.work_date, 'amount_paisa', d.amount, 'headcount', d.workers,
      'person_days', round(d.minutes::numeric / v_std, 2)) order by d.work_date)
  into v_days
  from (
    select a.work_date, sum(a.amount_paisa) as amount, count(*) as workers, sum(a.minutes) as minutes
    from public.attendance a
    where a.project_id = p_project and a.crew_id = p_crew and a.work_date between p_from and p_to
      and not private.attendance_is_closed(a.labour_cost_id)
    group by a.work_date
    having sum(a.amount_paisa) > 0
  ) d;
  if v_days is null then
    raise exception 'Mark at least one worker before closing' using errcode = 'P0001';
  end if;

  v_result := private.post_labour(
    jsonb_build_object('project_id', p_project, 'crew_id', p_crew, 'work_type', 'Mixed', 'description', 'From attendance'),
    v_days, null, p_pay, p_confirm, p_op_key, null);

  update public.attendance a
  set labour_cost_id = l.id
  from public.labour_costs l
  where l.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_result -> 'labour_cost_ids') x)
    and a.project_id = p_project and a.crew_id = p_crew and a.work_date = l.work_date
    and not private.attendance_is_closed(a.labour_cost_id);

  return v_result || jsonb_build_object('days', jsonb_array_length(v_days));
end $$;

-- The roster's close, now through the shared helper. Same contract as before.
create or replace function public.close_labour_day(p_op_key uuid, p_close jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_close ->> 'project_id')::uuid;
  v_crew uuid := (p_close ->> 'crew_id')::uuid;
  v_from date := (p_close ->> 'from_date')::date;
  v_to date := coalesce((p_close ->> 'to_date')::date, (p_close ->> 'from_date')::date);
  v_company uuid := private.attendance_scope(v_project, v_crew);
  v_prior jsonb;
begin
  if jsonb_typeof(p_close -> 'pay_now') = 'object' and not private.can_record_payments(v_company) then
    raise exception 'You cannot record payments; close it as unpaid' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'close_labour_day', p_close);
  if v_prior is not null then
    return v_prior;
  end if;
  if v_from is null or v_to < v_from or v_to - v_from > 31 then
    raise exception 'Choose up to 32 days to close' using errcode = '22023';
  end if;
  return private.finish_op(v_company, p_op_key, private.close_crew_days(
    v_company, v_project, v_crew, v_from, v_to, p_close -> 'pay_now', (p_close ->> 'confirm_duplicate')::boolean, p_op_key));
end $$;

-- ---------------------------------------------------------------------------
-- Reading one worker's month
-- ---------------------------------------------------------------------------
-- The worker (as project_workers shows them) and their days between two dates on every project.
-- Days on a project the user may not see are kept, so the card shows the time is taken, but
-- without the project or amount. Seen by those who enter labour on some project, and finance.
create function public.worker_month(p_member uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_company uuid := (select m.company_id from public.crew_members m where m.id = p_member);
  v_member jsonb;
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

  select jsonb_build_object('id', m.id, 'name', m.name, 'work_type', m.work_type, 'rate_kind', m.rate_kind,
      'rate_paisa', m.rate_paisa, 'active', m.active, 'crew_id', c.id, 'crew_name', c.name, 'crew_project_id', c.project_id)
  into v_member
  from public.crew_members m join public.crews c on c.id = m.crew_id
  where m.id = p_member;

  select coalesce(jsonb_agg(jsonb_build_object(
      'work_date', a.work_date,
      'project_id', case when r.seen then a.project_id end,
      'crew_id', case when r.seen then a.crew_id end,
      'time_in', a.time_in, 'time_out', a.time_out, 'minutes', a.minutes,
      'amount_paisa', case when r.seen then a.amount_paisa end,
      'closed', private.attendance_is_closed(a.labour_cost_id),
      'editable', r.editable) order by a.work_date, a.time_in nulls last), '[]'::jsonb)
  into v_rows
  from public.attendance a
  cross join lateral (
    select private.can_work_on_project(v_company, a.project_id) as editable,
      private.can_work_on_project(v_company, a.project_id) or private.can_see_project_money(v_company, a.project_id) as seen
  ) r
  where a.member_id = p_member and a.work_date between p_from and p_to;

  return jsonb_build_object('member', v_member, 'rows', v_rows);
end $$;

-- ---------------------------------------------------------------------------
-- Closing one worker's open days
-- ---------------------------------------------------------------------------
-- Closes every open crew-day this worker has between two dates, on the projects the user enters
-- labour on. A crew-day closes for the whole crew (everyone marked that day), since the labour
-- cost is the crew's. Paid now makes one payment per crew and project.
-- p_close: {member_id, from_date, to_date, pay_now: {method, reference} | null, confirm_duplicate}
create function public.close_worker_days(p_op_key uuid, p_close jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := (p_close ->> 'member_id')::uuid;
  v_from date := (p_close ->> 'from_date')::date;
  v_to date := (p_close ->> 'to_date')::date;
  v_company uuid := (select m.company_id from public.crew_members m where m.id = v_member);
  v_prior jsonb;
  v_one jsonb;
  v_total bigint := 0;
  v_days integer := 0;
  v_payments jsonb := '[]'::jsonb;
  v_groups integer := 0;
  v_ids uuid[];
  g record;
begin
  if v_company is null or not private.is_member(v_company) then
    raise exception 'Choose a worker' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_close -> 'pay_now') = 'object' and not private.can_record_payments(v_company) then
    raise exception 'You cannot record payments; close it as unpaid' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'close_worker_days', p_close);
  if v_prior is not null then
    return v_prior;
  end if;
  if v_from is null or v_to is null or v_to < v_from or v_to - v_from > 31 then
    raise exception 'Choose up to 32 days to close' using errcode = '22023';
  end if;

  -- Crews in a fixed order, so two closes that share crews take their locks the same way.
  for g in
    select a.project_id, a.crew_id, min(a.work_date) as first_day, max(a.work_date) as last_day
    from public.attendance a
    where a.member_id = v_member and a.work_date between v_from and v_to
      and not private.attendance_is_closed(a.labour_cost_id)
      and private.can_work_on_project(v_company, a.project_id)
    group by a.project_id, a.crew_id
    order by a.crew_id, a.project_id
  loop
    perform private.attendance_scope(g.project_id, g.crew_id);
    -- Only the dates this worker is on; other open days of the crew stay open.
    v_ids := '{}';
    for v_one in
      select private.close_crew_days(v_company, g.project_id, g.crew_id, d.work_date, d.work_date,
        null, (p_close ->> 'confirm_duplicate')::boolean, p_op_key)
      from (
        select distinct a.work_date from public.attendance a
        where a.member_id = v_member and a.project_id = g.project_id and a.crew_id = g.crew_id
          and a.work_date between g.first_day and g.last_day and not private.attendance_is_closed(a.labour_cost_id)
        order by a.work_date
      ) d
    loop
      v_total := v_total + (v_one ->> 'total_paisa')::bigint;
      v_days := v_days + 1;
      v_ids := v_ids || array(select (x #>> '{}')::uuid from jsonb_array_elements(v_one -> 'labour_cost_ids') x);
    end loop;
    -- One payment for this crew and project, covering the days just closed.
    if jsonb_typeof(p_close -> 'pay_now') = 'object' then
      v_payments := v_payments || jsonb_build_array(
        private.pay_now(v_company, g.crew_id, g.project_id, v_ids, g.last_day, p_close -> 'pay_now', p_op_key));
    end if;
    v_groups := v_groups + 1;
  end loop;
  if v_groups = 0 then
    raise exception 'No open days to close' using errcode = 'P0001';
  end if;

  return private.finish_op(v_company, p_op_key, jsonb_build_object(
    'total_paisa', v_total, 'days', v_days, 'crews', v_groups, 'payments', v_payments));
end $$;

-- ---------------------------------------------------------------------------
-- Splitting one day between two projects
-- ---------------------------------------------------------------------------
-- The worker's day on one project is split in two: that project keeps the first half of its hours,
-- the other project gets the rest. The recorded hours stay the same in total. The times stay inside
-- the day's in and out: the first part from the in, the second up to the out, with any unpaid break
-- (in to out less the hours) between them. Both sides are saved through set_attendance in one
-- transaction, so they succeed or fail together.
-- p_split: {member_id, work_date, from_project, to_project, to_crew}
create function public.split_attendance(p_split jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := (p_split ->> 'member_id')::uuid;
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
  select * into v_row from public.attendance a
  where a.member_id = v_member and a.project_id = v_from and a.work_date = v_date;
  if not found then
    raise exception 'Mark the day before splitting it' using errcode = 'P0001';
  end if;
  if v_to is null or v_to = v_from then
    raise exception 'Choose another project for the rest of the day' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.attendance a where a.member_id = v_member and a.project_id = v_to and a.work_date = v_date) then
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
  perform public.set_attendance(jsonb_build_object('project_id', v_from, 'crew_id', v_row.crew_id, 'member_id', v_member,
    'work_date', v_date, 'time_in', v_row.time_in, 'time_out', v_first_out, 'minutes', v_first));
  perform public.set_attendance(jsonb_build_object('project_id', v_to, 'crew_id', nullif(p_split ->> 'to_crew', ''),
    'member_id', v_member, 'work_date', v_date, 'time_in', v_second_in, 'time_out', v_row.time_out, 'minutes', v_second));
  return jsonb_build_object('first_minutes', v_first, 'second_minutes', v_second);
end $$;

revoke execute on function
  public.worker_month(uuid, date, date), public.close_worker_days(uuid, jsonb), public.split_attendance(jsonb),
  private.close_crew_days(uuid, uuid, uuid, date, date, jsonb, boolean, uuid)
from public, anon;
grant execute on function public.worker_month(uuid, date, date), public.close_worker_days(uuid, jsonb), public.split_attendance(jsonb) to authenticated;
