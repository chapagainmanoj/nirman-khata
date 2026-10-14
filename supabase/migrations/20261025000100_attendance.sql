-- Attendance (company setting, req §14): crews get members with an hourly or daily rate, site
-- staff mark each member's in, out and hours per day, and closing the day turns it into one
-- ordinary labour cost per crew per project per day, through the existing labour writer. The
-- crew stays the party paid; members are never parties (GLOSSARY: Crew Member).
--
-- A member can be marked on another project's crew for a day ("brought in"): the hours count for
-- that project and are owed to the crew they were marked on (product owner, 2026-10-13). One row
-- per member per project per day, so a day can be split between projects by times.

-- ---------------------------------------------------------------------------
-- Company settings
-- ---------------------------------------------------------------------------
alter table public.companies
  add column labour_mode text not null default 'day_total' check (labour_mode in ('day_total', 'attendance')),
  add column standard_day_minutes integer not null default 480 check (standard_day_minutes between 60 and 1440),
  add column day_start time not null default '08:00',
  add column day_end time not null default '17:00',
  add constraint companies_working_day check (day_end > day_start);

-- ---------------------------------------------------------------------------
-- Crew members: a worker for attendance and rate only. Moving to another project for good is
-- moving to that project's crew; earlier days keep the crew they were marked on.
-- ---------------------------------------------------------------------------
create table public.crew_members (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  crew_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  work_type text,
  rate_kind text not null check (rate_kind in ('daily', 'hourly')),
  rate_paisa bigint not null check (rate_paisa > 0),
  phone text,
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, crew_id) references public.crews (company_id, id)
);
create unique index crew_members_unique_name on public.crew_members (crew_id, lower(trim(name)));

-- ---------------------------------------------------------------------------
-- Attendance: one row per member per project per day. Unset = no row. The rate and amount are
-- copied in when the day is closed, so a later rate change leaves closed days alone.
-- ---------------------------------------------------------------------------
create table public.attendance (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  project_id uuid not null,
  crew_id uuid not null,      -- the crew owed for these hours: the one the member was marked on
  member_id uuid not null,
  work_date date not null,
  time_in time,
  time_out time,
  minutes integer not null check (minutes between 1 and 1440),
  rate_kind text check (rate_kind in ('daily', 'hourly')),
  rate_paisa bigint check (rate_paisa > 0),
  amount_paisa bigint check (amount_paisa >= 0),
  labour_cost_id uuid,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (member_id, project_id, work_date),
  constraint attendance_times check (time_in is null or time_out is null or time_out > time_in),
  constraint attendance_minutes_fit check (
    time_in is null or time_out is null or minutes <= extract(epoch from time_out - time_in) / 60),
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, crew_id) references public.crews (company_id, id),
  foreign key (company_id, member_id) references public.crew_members (company_id, id),
  foreign key (company_id, labour_cost_id) references public.labour_costs (company_id, id)
);
create index attendance_day on public.attendance (project_id, crew_id, work_date);
create index attendance_member on public.attendance (member_id, work_date);

do $$
declare t text;
begin
  foreach t in array array['crew_members', 'attendance'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit()', t);
    execute format('create trigger set_created_by before insert on public.%I for each row execute function private.set_created_by()', t);
  end loop;
end $$;

-- A closed day is final: its rows change only after its labour cost is reversed.
create function private.attendance_is_closed(p_labour_cost uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.labour_costs l where l.id = p_labour_cost and l.status = 'posted')
$$;

create function private.guard_closed_attendance() returns trigger
language plpgsql as $$
begin
  if private.attendance_is_closed(old.labour_cost_id) then
    raise exception 'day_closed: this day is closed; reverse its labour cost to change it' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_closed before update or delete on public.attendance
  for each row execute function private.guard_closed_attendance();

-- ---------------------------------------------------------------------------
-- Access. Rates are money, so a worker row is seen by those who may edit it (party managers, and
-- staff who work on the crew's project) and by finance. Attendance is shared work on a project:
-- everyone who enters labour there sees it, and finance; a viewer does not. Bringing in a worker
-- from another project goes through project_workers() below. Writes only through the functions.
-- ---------------------------------------------------------------------------
alter table public.crew_members enable row level security;
alter table public.attendance enable row level security;

create function private.can_edit_crew_members(p_company uuid, p_crew uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_parties(p_company) or exists (
    select 1 from public.crews c
    where c.id = p_crew and c.company_id = p_company and c.project_id is not null
      and private.can_work_on_project(p_company, c.project_id))
$$;

create policy crew_members_select on public.crew_members for select to authenticated
  using (private.can_edit_crew_members(company_id, crew_id) or private.can_see_finance(company_id));
create policy crew_members_insert on public.crew_members for insert to authenticated
  with check (private.can_edit_crew_members(company_id, crew_id));
create policy crew_members_update on public.crew_members for update to authenticated
  using (private.can_edit_crew_members(company_id, crew_id))
  with check (private.can_edit_crew_members(company_id, crew_id));

create policy attendance_select on public.attendance for select to authenticated
  using (private.can_work_on_project(company_id, project_id) or private.can_see_project_money(company_id, project_id));

-- Everyone who can be marked on this project today: the company's active workers with their crew
-- and rate, for the roster and "Bring a worker". Only for those who enter labour on the project.
create function public.project_workers(p_project uuid)
returns table (id uuid, name text, work_type text, rate_kind text, rate_paisa bigint,
  crew_id uuid, crew_name text, crew_project_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid := (select p.company_id from public.projects p where p.id = p_project);
begin
  if v_company is null or not private.can_work_on_project(v_company, p_project) then
    raise exception 'You cannot enter labour on this project' using errcode = '42501';
  end if;
  return query
    select m.id, m.name, m.work_type, m.rate_kind, m.rate_paisa, c.id, c.name, c.project_id
    from public.crew_members m join public.crews c on c.id = m.crew_id
    where m.company_id = v_company and m.active and c.active
    order by c.name, m.name;
end $$;

-- One project's attendance for one day, with whether each row is closed. Site staff may not see
-- the labour cost itself (X2), so the closed flag comes from here.
create function public.attendance_day(p_project uuid, p_date date)
returns table (member_id uuid, crew_id uuid, time_in time, time_out time, minutes integer,
  amount_paisa bigint, closed boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid := (select p.company_id from public.projects p where p.id = p_project);
begin
  if v_company is null or not (private.can_work_on_project(v_company, p_project) or private.can_see_project_money(v_company, p_project)) then
    raise exception 'You cannot see labour on this project' using errcode = '42501';
  end if;
  return query
    select a.member_id, a.crew_id, a.time_in, a.time_out, a.minutes, a.amount_paisa, private.attendance_is_closed(a.labour_cost_id)
    from public.attendance a
    where a.project_id = p_project and a.work_date = p_date;
end $$;

revoke delete on public.crew_members from authenticated, anon;
revoke insert, update, delete on public.attendance from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Writing attendance
-- ---------------------------------------------------------------------------
-- Checks shared by marking and closing: labour by attendance is on, the user works on the
-- project, the crew may work there. Returns the company.
create function private.attendance_scope(p_project uuid, p_crew uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid := (select company_id from public.projects where id = p_project);
begin
  if v_company is null or not private.can_work_on_project(v_company, p_project) then
    raise exception 'You cannot enter labour on this project' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = v_company and c.labour_module_enabled and c.labour_mode = 'attendance') then
    raise exception 'attendance_off: attendance is not turned on; choose it in Settings' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.crews c
    where c.id = p_crew and c.company_id = v_company and c.active and (c.project_id is null or c.project_id = p_project)
  ) then
    raise exception 'Choose a crew for this project' using errcode = 'P0001';
  end if;
  return v_company;
end $$;

-- Mark, change or unset one member's day on one project.
-- p_row: {project_id, crew_id, member_id, work_date, time_in, time_out, minutes}. No minutes (or 0)
-- removes the row. Saving the same row again gives the same result, so no operation key is needed.
create function public.set_attendance(p_row jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_row ->> 'project_id')::uuid;
  v_crew uuid := (p_row ->> 'crew_id')::uuid;
  v_member uuid := (p_row ->> 'member_id')::uuid;
  v_date date := (p_row ->> 'work_date')::date;
  v_in time := nullif(p_row ->> 'time_in', '')::time;
  v_out time := nullif(p_row ->> 'time_out', '')::time;
  v_minutes integer := coalesce((p_row ->> 'minutes')::integer, 0);
  v_company uuid := private.attendance_scope(v_project, v_crew);
  v_row public.attendance;
begin
  if v_date is null or v_date > private.today() then
    raise exception 'Attendance cannot be marked for a future date' using errcode = '22023';
  end if;
  if not exists (select 1 from public.crew_members m where m.id = v_member and m.company_id = v_company and m.active) then
    raise exception 'Choose a worker who is still on a crew' using errcode = 'P0001';
  end if;
  if v_minutes < 0 or v_minutes > 1440 then
    raise exception 'Hours must be between 0 and 24' using errcode = '22023';
  end if;

  -- Same lock as closing, so a day cannot change while it is being closed.
  perform private.lock_party(v_crew);
  if exists (
    select 1 from public.attendance a
    where a.project_id = v_project and a.crew_id = v_crew and a.work_date = v_date
      and private.attendance_is_closed(a.labour_cost_id)
  ) then
    raise exception 'day_closed: this day is closed; reverse its labour cost to change it' using errcode = 'P0001';
  end if;

  if v_minutes = 0 then
    delete from public.attendance where member_id = v_member and project_id = v_project and work_date = v_date;
    return jsonb_build_object('removed', true);
  end if;

  if v_in is not null and v_out is not null and exists (
    select 1 from public.attendance a
    where a.member_id = v_member and a.work_date = v_date and a.project_id <> v_project
      and a.time_in is not null and a.time_out is not null and a.time_in < v_out and v_in < a.time_out
  ) then
    raise exception 'attendance_overlap: these times overlap the same worker''s time on another project' using errcode = 'P0001';
  end if;
  if v_minutes + (select coalesce(sum(a.minutes), 0) from public.attendance a
      where a.member_id = v_member and a.work_date = v_date and a.project_id <> v_project) > 1440 then
    raise exception 'attendance_overlap: more than 24 hours on one day' using errcode = 'P0001';
  end if;

  insert into public.attendance (company_id, project_id, crew_id, member_id, work_date, time_in, time_out, minutes)
  values (v_company, v_project, v_crew, v_member, v_date, v_in, v_out, v_minutes)
  on conflict (member_id, project_id, work_date) do update
    set crew_id = excluded.crew_id, time_in = excluded.time_in, time_out = excluded.time_out,
      minutes = excluded.minutes, labour_cost_id = null, rate_kind = null, rate_paisa = null, amount_paisa = null
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

-- Close one crew's days on one project: each day with attendance becomes one labour cost, priced
-- from each member's rate (hourly: rate × hours; daily: rate × minutes ÷ the standard day).
-- p_close: {project_id, crew_id, from_date, to_date (default from_date), pay_now: {method, reference} | null,
--   confirm_duplicate}
create function public.close_labour_day(p_op_key uuid, p_close jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_close ->> 'project_id')::uuid;
  v_crew uuid := (p_close ->> 'crew_id')::uuid;
  v_from date := (p_close ->> 'from_date')::date;
  v_to date := coalesce((p_close ->> 'to_date')::date, (p_close ->> 'from_date')::date);
  v_company uuid := private.attendance_scope(v_project, v_crew);
  v_std integer := (select standard_day_minutes from public.companies where id = v_company);
  v_prior jsonb;
  v_days jsonb;
  v_result jsonb;
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

  perform private.lock_party(v_crew);
  -- Price the open rows from the members' current rates.
  update public.attendance a
  set rate_kind = m.rate_kind, rate_paisa = m.rate_paisa,
    amount_paisa = round(m.rate_paisa::numeric * a.minutes / case when m.rate_kind = 'hourly' then 60 else v_std end)
  from public.crew_members m
  where m.id = a.member_id and a.project_id = v_project and a.crew_id = v_crew
    and a.work_date between v_from and v_to and not private.attendance_is_closed(a.labour_cost_id);

  select jsonb_agg(jsonb_build_object(
      'work_date', d.work_date, 'amount_paisa', d.amount, 'headcount', d.workers,
      'person_days', round(d.minutes::numeric / v_std, 2)) order by d.work_date)
  into v_days
  from (
    select a.work_date, sum(a.amount_paisa) as amount, count(*) as workers, sum(a.minutes) as minutes
    from public.attendance a
    where a.project_id = v_project and a.crew_id = v_crew and a.work_date between v_from and v_to
      and not private.attendance_is_closed(a.labour_cost_id)
    group by a.work_date
    having sum(a.amount_paisa) > 0
  ) d;
  if v_days is null then
    raise exception 'Mark at least one worker before closing' using errcode = 'P0001';
  end if;

  v_result := private.post_labour(
    jsonb_build_object('project_id', v_project, 'crew_id', v_crew, 'work_type', 'Mixed', 'description', 'From attendance'),
    v_days, null, p_close -> 'pay_now', (p_close ->> 'confirm_duplicate')::boolean, p_op_key, null);

  update public.attendance a
  set labour_cost_id = l.id
  from public.labour_costs l
  where l.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_result -> 'labour_cost_ids') x)
    and a.project_id = v_project and a.crew_id = v_crew and a.work_date = l.work_date
    and not private.attendance_is_closed(a.labour_cost_id);

  return private.finish_op(v_company, p_op_key, v_result || jsonb_build_object('days', jsonb_array_length(v_days)));
end $$;

revoke execute on function
  public.set_attendance(jsonb), public.close_labour_day(uuid, jsonb), public.project_workers(uuid), public.attendance_day(uuid, date),
  private.attendance_scope(uuid, uuid), private.can_edit_crew_members(uuid, uuid), private.attendance_is_closed(uuid)
from public, anon;
grant execute on function
  public.set_attendance(jsonb), public.close_labour_day(uuid, jsonb), public.project_workers(uuid), public.attendance_day(uuid, date),
  private.attendance_scope(uuid, uuid), private.can_edit_crew_members(uuid, uuid), private.attendance_is_closed(uuid)
to authenticated;
