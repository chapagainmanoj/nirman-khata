-- Milestone 4: site work (req §16, §17). Stages and manual progress, daily site reports
-- (with the day's labour cost in the same step), and the activity calendar.
-- Nothing here is money except the labour a report creates, which goes through the
-- existing labour writer (post_labour), so pay-now, near-duplicates and op_keys behave
-- exactly as on the labour screen.

-- ---------------------------------------------------------------------------
-- Stages (req §16.2)
-- ---------------------------------------------------------------------------
create table public.stages (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  project_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null default 100,
  planned_start date,
  planned_end date check (planned_end is null or planned_start is null or planned_end >= planned_start),
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id)
);
create unique index stages_unique_name on public.stages (project_id, lower(trim(name)));

-- ---------------------------------------------------------------------------
-- Progress updates: never edited or deleted; a mistake is followed by a new update
-- (with a reason when the % goes down). stage_id null = the project's overall progress,
-- which is entered by hand, never averaged from stages.
-- ---------------------------------------------------------------------------
create table public.progress_updates (
  company_id uuid not null references public.companies (id),
  id uuid not null primary key,
  project_id uuid not null,
  stage_id uuid,
  effective_date date not null,
  pct numeric(5, 2) not null check (pct between 0 and 100),
  notes text,
  reason text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, stage_id) references public.stages (company_id, id)
);
create index progress_updates_project on public.progress_updates (company_id, project_id, stage_id, effective_date);

-- ---------------------------------------------------------------------------
-- Daily site reports (Dainik Bibaran, req §16.1). Several per project and day, shown
-- together, never overwritten. Unsent work lives in the device draft, so a report is
-- created already submitted and does not change afterwards.
-- ---------------------------------------------------------------------------
create table public.daily_reports (
  company_id uuid not null references public.companies (id),
  id uuid not null primary key,
  project_id uuid not null,
  work_date date not null,
  stage_id uuid,
  area text,
  work_done text not null check (length(trim(work_done)) > 0),
  headcount integer check (headcount >= 0),
  labour_note text,
  equipment text,
  issues text,
  weather text,
  submitted_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, stage_id) references public.stages (company_id, id)
);
create index daily_reports_project_date on public.daily_reports (company_id, project_id, work_date);

create table public.daily_report_lines (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  report_id uuid not null,
  description text not null check (length(trim(description)) > 0),
  qty numeric(14, 3) check (qty > 0),
  unit_id uuid,
  sort_order integer not null default 0,
  unique (company_id, id),
  foreign key (company_id, report_id) references public.daily_reports (company_id, id) on delete cascade,
  foreign key (company_id, unit_id) references public.units (company_id, id)
);

-- L2: a report creates at most one labour cost.
alter table public.labour_costs add column daily_report_id uuid unique,
  add foreign key (company_id, daily_report_id) references public.daily_reports (company_id, id);

-- ---------------------------------------------------------------------------
-- Photos on reports and progress updates (design §3.7)
-- ---------------------------------------------------------------------------
alter table public.attachments
  add column daily_report_id uuid,
  add column progress_update_id uuid,
  add foreign key (company_id, daily_report_id) references public.daily_reports (company_id, id),
  add foreign key (company_id, progress_update_id) references public.progress_updates (company_id, id),
  drop constraint attachments_one_owner,
  add constraint attachments_one_owner check (num_nonnulls(
    contract_revision_id, budget_revision_id, delivery_id, bill_id, payment_id,
    work_package_id, charge_id, labour_cost_id, expense_id, daily_report_id, progress_update_id) = 1);
create index attachments_daily_report on public.attachments (daily_report_id) where daily_report_id is not null;
create index attachments_progress_update on public.attachments (progress_update_id) where progress_update_id is not null;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.stages for each row execute function private.set_updated_at();
do $$
declare t text;
begin
  foreach t in array array['stages', 'progress_updates', 'daily_reports', 'daily_report_lines'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit()', t);
  end loop;
  foreach t in array array['stages', 'progress_updates', 'daily_reports'] loop
    execute format('create trigger set_created_by before insert on public.%I for each row execute function private.set_created_by()', t);
  end loop;
end $$;
create trigger no_change before update or delete on public.progress_updates
  for each row execute function private.reject_change();
create trigger no_change before update or delete on public.daily_reports
  for each row execute function private.reject_change();
create trigger no_change before update or delete on public.daily_report_lines
  for each row execute function private.reject_change();

-- ---------------------------------------------------------------------------
-- Row-level security: site records follow project access (design §3.6).
-- ---------------------------------------------------------------------------
alter table public.stages enable row level security;
alter table public.progress_updates enable row level security;
alter table public.daily_reports enable row level security;
alter table public.daily_report_lines enable row level security;

-- Who sets up stages: Admin, or a project manager working on the project.
create function private.can_plan_project(p_company uuid, p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_work_on_project(p_company, p_project)
    and (private.is_admin(p_company) or private.has_role(p_company, 'project_manager'))
$$;

create policy stages_select on public.stages for select to authenticated
  using (private.can_see_project(company_id, project_id));
create policy stages_insert on public.stages for insert to authenticated
  with check (private.can_plan_project(company_id, project_id));
create policy stages_update on public.stages for update to authenticated
  using (private.can_plan_project(company_id, project_id)) with check (private.can_plan_project(company_id, project_id));
create policy progress_updates_select on public.progress_updates for select to authenticated
  using (private.can_see_project(company_id, project_id));
create policy daily_reports_select on public.daily_reports for select to authenticated
  using (private.can_see_project(company_id, project_id));
create policy daily_report_lines_select on public.daily_report_lines for select to authenticated
  using (exists (select 1 from public.daily_reports r where r.id = daily_report_lines.report_id
                 and private.can_see_project(r.company_id, r.project_id)));

revoke delete on public.stages from authenticated, anon;
revoke insert, update, delete on public.progress_updates, public.daily_reports, public.daily_report_lines
from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Stage setup: the built-in list, or another project's stages.
-- ---------------------------------------------------------------------------
create function public.create_stages(p_project uuid, p_names text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := (select company_id from public.projects where id = p_project);
  v_next integer;
  v_added integer := 0;
  n text;
begin
  if v_company is null or not private.can_plan_project(v_company, p_project) then
    raise exception 'Only Admin or the project manager can set up stages' using errcode = '42501';
  end if;
  select coalesce(max(sort_order), 0) into v_next from public.stages where project_id = p_project;
  foreach n in array p_names loop
    continue when coalesce(trim(n), '') = '';
    v_next := v_next + 10;
    insert into public.stages (company_id, project_id, name, sort_order)
    values (v_company, p_project, trim(n), v_next)
    on conflict do nothing;
    if found then v_added := v_added + 1; end if;
  end loop;
  return v_added;
end $$;

create function public.copy_stages(p_from uuid, p_to uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_company uuid := (select company_id from public.projects where id = p_from);
begin
  if v_company is null or v_company <> (select company_id from public.projects where id = p_to)
     or not private.can_see_project(v_company, p_from) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  return public.create_stages(p_to, array(
    select s.name from public.stages s where s.project_id = p_from and s.active order by s.sort_order, s.name));
end $$;

-- ---------------------------------------------------------------------------
-- Progress (req §16.2). p_update: {id, project_id, stage_id, effective_date, pct, notes, reason}.
-- The id comes from the device, so a retry returns the update already saved.
-- ---------------------------------------------------------------------------
create function public.add_progress_update(p_update jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_update ->> 'id')::uuid;
  v_project uuid := (p_update ->> 'project_id')::uuid;
  v_company uuid := (select company_id from public.projects where id = (p_update ->> 'project_id')::uuid);
  v_stage uuid := nullif(p_update ->> 'stage_id', '')::uuid;
  v_date date := coalesce((p_update ->> 'effective_date')::date, private.today());
  v_pct numeric := (p_update ->> 'pct')::numeric;
  v_prev numeric;
  u public.progress_updates;
begin
  if v_id is null then
    raise exception 'Progress update id is required' using errcode = '22023';
  end if;
  select * into u from public.progress_updates where id = v_id;
  if found then
    if u.created_by is distinct from auth.uid() then
      raise exception 'op_key_reused: this update id belongs to someone else' using errcode = 'P0001';
    end if;
    return to_jsonb(u);
  end if;
  if v_company is null or not private.can_work_on_project(v_company, v_project) then
    raise exception 'You cannot update progress on this project' using errcode = '42501';
  end if;
  if v_stage is not null and not exists (select 1 from public.stages s where s.id = v_stage and s.project_id = v_project) then
    raise exception 'Stage not found on this project' using errcode = 'P0002';
  end if;
  if v_pct is null or v_pct < 0 or v_pct > 100 then
    raise exception 'Progress must be between 0 and 100%%' using errcode = '22023';
  end if;
  if v_date > private.today() then
    raise exception 'Progress cannot be dated in the future' using errcode = '22023';
  end if;
  -- Serialise updates for one project so two people cannot both skip the reason check.
  perform 1 from public.projects where id = v_project for update;
  select x.pct into v_prev from public.progress_updates x
  where x.project_id = v_project and x.stage_id is not distinct from v_stage and x.effective_date <= v_date
  order by x.effective_date desc, x.created_at desc limit 1;
  if v_prev is not null and v_pct < v_prev and coalesce(trim(p_update ->> 'reason'), '') = '' then
    raise exception 'reason_required: progress goes down from % to %; say why', trim(to_char(v_prev, 'FM990.##')) || '%', trim(to_char(v_pct, 'FM990.##')) || '%' using errcode = 'P0001';
  end if;
  insert into public.progress_updates (company_id, id, project_id, stage_id, effective_date, pct, notes, reason)
  values (v_company, v_id, v_project, v_stage, v_date, v_pct,
    nullif(trim(p_update ->> 'notes'), ''), nullif(trim(p_update ->> 'reason'), ''))
  returning * into u;
  return to_jsonb(u);
end $$;

-- Progress as of a date (H2): the latest update effective on or before it, per stage and overall.
-- Overdue: a stage whose planned end has passed (as of that date) and is below 100%.
create function public.progress_as_of(p_project uuid, p_date date default null)
returns table (
  stage_id uuid, name text, sort_order integer, planned_start date, planned_end date,
  pct numeric, effective_date date, updated_by uuid, overdue boolean
)
language sql stable security invoker set search_path = '' as $$
  with d as (select coalesce(p_date, private.today()) as day),
  latest as (
    select distinct on (u.stage_id) u.stage_id, u.pct, u.effective_date, u.created_by
    from public.progress_updates u, d
    where u.project_id = p_project and u.effective_date <= d.day
    order by u.stage_id, u.effective_date desc, u.created_at desc
  )
  select null::uuid, 'Overall'::text, 0, p.planned_start, p.planned_end,
    l.pct, l.effective_date, l.created_by,
    (p.planned_end < (select day from d) and coalesce(l.pct, 0) < 100 and p.status not in ('completed', 'closed'))
  from public.projects p left join latest l on l.stage_id is null
  where p.id = p_project
  union all
  select s.id, s.name, s.sort_order, s.planned_start, s.planned_end,
    l.pct, l.effective_date, l.created_by,
    (s.planned_end < (select day from d) and coalesce(l.pct, 0) < 100)
  from public.stages s left join latest l on l.stage_id = s.id
  where s.project_id = p_project and s.active
  order by 3, 2
$$;

-- ---------------------------------------------------------------------------
-- Labour from a report: the existing writer, with the report id on the labour cost.
-- ---------------------------------------------------------------------------
create or replace function private.post_labour(
  p_entry jsonb, p_days jsonb, p_batch jsonb, p_pay jsonb, p_confirm_duplicate boolean, p_op_key uuid, p_single_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid := (p_entry ->> 'project_id')::uuid;
  v_company uuid := (select company_id from public.projects where id = (p_entry ->> 'project_id')::uuid);
  v_crew uuid := coalesce((p_entry ->> 'crew_id')::uuid,
    (select id from public.crews where project_id = (p_entry ->> 'project_id')::uuid and is_default));
  v_heading uuid;
  v_batch uuid := (p_batch ->> 'id')::uuid;
  v_dup date;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_event uuid;
  v_payment jsonb;
  d jsonb;
begin
  if v_company is null or not private.can_work_on_project(v_company, v_project) then
    raise exception 'You cannot enter labour cost on this project' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.crews c
    where c.id = v_crew and c.company_id = v_company and c.active and (c.project_id is null or c.project_id = v_project)
  ) then
    raise exception 'Choose a crew for this project' using errcode = 'P0001';
  end if;
  v_heading := coalesce((p_entry ->> 'heading_id')::uuid, private.default_heading(v_company, 'labour'));
  if not exists (select 1 from public.cost_headings where id = v_heading and company_id = v_company) then
    raise exception 'Choose a cost heading' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days) = 0 then
    raise exception 'Enter at least one day' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_days) x where (x ->> 'work_date')::date > private.today()) then
    raise exception 'Labour cannot be entered for a future date' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_days) x where coalesce((x ->> 'amount_paisa')::bigint, 0) <= 0) then
    raise exception 'Each day needs an amount more than zero' using errcode = '22023';
  end if;
  if (select count(*) <> count(distinct x ->> 'work_date') from jsonb_array_elements(p_days) x) then
    raise exception 'A day is entered twice' using errcode = '22023';
  end if;

  -- 3. Lock: the crew (party), then check for near-duplicates under the lock.
  perform private.lock_party(v_crew);
  if v_batch is not null and exists (select 1 from public.labour_batches where id = v_batch) then
    raise exception 'This weekly entry was already saved' using errcode = 'P0001';
  end if;
  select l.work_date into v_dup
  from public.labour_costs l
  where l.project_id = v_project and l.crew_id = v_crew and l.status = 'posted'
    and l.work_date in (select (x ->> 'work_date')::date from jsonb_array_elements(p_days) x)
  order by l.work_date limit 1;
  if v_dup is not null and not coalesce(p_confirm_duplicate, false) then
    raise exception 'near_duplicate: this crew already has labour cost on % for this project', v_dup using errcode = 'P0001';
  end if;

  if v_batch is not null then
    insert into public.labour_batches (company_id, id, project_id, crew_id, from_date, to_date)
    values (v_company, v_batch, v_project, v_crew, (p_batch ->> 'from_date')::date, (p_batch ->> 'to_date')::date);
    if exists (
      select 1 from jsonb_array_elements(p_days) x
      where (x ->> 'work_date')::date not between (p_batch ->> 'from_date')::date and (p_batch ->> 'to_date')::date
    ) then
      raise exception 'Every day must be inside the week entered' using errcode = '22023';
    end if;
  end if;

  for d in select * from jsonb_array_elements(p_days) x order by (x ->> 'work_date')::date loop
    v_id := coalesce(p_single_id, gen_random_uuid());
    insert into public.labour_costs (
      company_id, id, project_id, crew_id, heading_id, work_date, work_type, description,
      headcount, person_days, rate_paisa, amount_paisa, batch_id, daily_report_id
    ) values (
      v_company, v_id, v_project, v_crew, v_heading, (d ->> 'work_date')::date,
      nullif(trim(p_entry ->> 'work_type'), ''), nullif(trim(p_entry ->> 'description'), ''),
      (d ->> 'headcount')::integer, (d ->> 'person_days')::numeric, (d ->> 'rate_paisa')::bigint,
      (d ->> 'amount_paisa')::bigint, v_batch, (p_entry ->> 'daily_report_id')::uuid
    );
    v_event := private.new_event(v_company, 'labour_save', v_crew, (d ->> 'work_date')::date, p_op_key, p_labour_cost => v_id);
    perform private.add_ledger(v_event, 'labour', v_project, v_heading,
      (d ->> 'amount_paisa')::bigint, (d ->> 'amount_paisa')::bigint, 0);
    v_ids := v_ids || v_id;
  end loop;

  if jsonb_typeof(p_pay) = 'object' then
    v_payment := private.pay_now(v_company, v_crew, v_project, v_ids,
      coalesce((p_pay ->> 'date')::date, (select max((x ->> 'work_date')::date) from jsonb_array_elements(p_days) x)),
      p_pay, p_op_key);
  end if;
  return jsonb_build_object('labour_cost_ids', to_jsonb(v_ids), 'batch_id', v_batch, 'crew_id', v_crew,
    'payment', v_payment, 'total_paisa', (select sum((x ->> 'amount_paisa')::bigint) from jsonb_array_elements(p_days) x));
end $$;

-- ---------------------------------------------------------------------------
-- Submit a daily report (req §16.1, L2). One op_key covers the report, its lines and the
-- labour cost it creates, so a retry after a lost reply returns the first result.
-- p_report: {id, project_id, work_date, stage_id, area, work_done, headcount, labour_note,
--   equipment, issues, weather, lines: [{description, qty, unit_id}],
--   labour: {crew_id, amount_paisa, work_type, pay_now: {method, reference} | null,
--            confirm_duplicate} | null}
-- The labour part is used only when the company tracks own labour.
-- ---------------------------------------------------------------------------
create function public.submit_daily_report(p_op_key uuid, p_report jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_report ->> 'id')::uuid;
  v_project uuid := (p_report ->> 'project_id')::uuid;
  v_company uuid := (select company_id from public.projects where id = (p_report ->> 'project_id')::uuid);
  v_date date := coalesce((p_report ->> 'work_date')::date, private.today());
  v_stage uuid := nullif(p_report ->> 'stage_id', '')::uuid;
  v_labour jsonb := p_report -> 'labour';
  v_use_labour boolean;
  v_lab jsonb;
  v_prior jsonb;
  l jsonb;
  v_order integer := 0;
begin
  if v_company is null or not private.can_work_on_project(v_company, v_project) then
    raise exception 'You cannot add reports on this project' using errcode = '42501';
  end if;
  v_use_labour := jsonb_typeof(v_labour) = 'object' and coalesce((v_labour ->> 'amount_paisa')::bigint, 0) > 0
    and (select c.labour_module_enabled from public.companies c where c.id = v_company);
  if v_use_labour and jsonb_typeof(v_labour -> 'pay_now') = 'object' and not private.can_record_payments(v_company) then
    raise exception 'You cannot record payments; save the labour as unpaid' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'submit_daily_report', p_report);
  if v_prior is not null then
    return v_prior;
  end if;
  if v_id is null then
    raise exception 'Report id is required' using errcode = '22023';
  end if;
  if exists (select 1 from public.daily_reports where id = v_id) then
    raise exception 'This report was already sent' using errcode = 'P0001';
  end if;
  if v_date > private.today() then
    raise exception 'A report cannot be dated in the future' using errcode = '22023';
  end if;
  if coalesce(trim(p_report ->> 'work_done'), '') = '' then
    raise exception 'Say what work was done' using errcode = '22023';
  end if;
  if v_stage is not null and not exists (select 1 from public.stages s where s.id = v_stage and s.project_id = v_project) then
    raise exception 'Stage not found on this project' using errcode = 'P0002';
  end if;

  insert into public.daily_reports (
    company_id, id, project_id, work_date, stage_id, area, work_done, headcount, labour_note, equipment, issues, weather
  ) values (
    v_company, v_id, v_project, v_date, v_stage, nullif(trim(p_report ->> 'area'), ''), trim(p_report ->> 'work_done'),
    (p_report ->> 'headcount')::integer, nullif(trim(p_report ->> 'labour_note'), ''),
    nullif(trim(p_report ->> 'equipment'), ''), nullif(trim(p_report ->> 'issues'), ''), nullif(trim(p_report ->> 'weather'), '')
  );
  for l in select * from jsonb_array_elements(coalesce(p_report -> 'lines', '[]'::jsonb)) loop
    continue when coalesce(trim(l ->> 'description'), '') = '';
    v_order := v_order + 1;
    insert into public.daily_report_lines (company_id, report_id, description, qty, unit_id, sort_order)
    values (v_company, v_id, trim(l ->> 'description'), (l ->> 'qty')::numeric, nullif(l ->> 'unit_id', '')::uuid, v_order);
  end loop;

  if v_use_labour then
    v_lab := private.post_labour(
      jsonb_build_object('project_id', v_project, 'crew_id', v_labour -> 'crew_id', 'daily_report_id', v_id,
        'work_type', coalesce(v_labour ->> 'work_type', 'Mixed'),
        'description', left(trim(p_report ->> 'work_done'), 200)),
      jsonb_build_array(jsonb_build_object('work_date', v_date, 'amount_paisa', v_labour -> 'amount_paisa',
        'headcount', nullif((p_report ->> 'headcount')::integer, 0))),
      null, v_labour -> 'pay_now', (v_labour ->> 'confirm_duplicate')::boolean, p_op_key, gen_random_uuid());
  end if;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('id', v_id, 'labour', v_lab));
end $$;

-- What a day looked like on one project (acceptance #23): its reports, and the deliveries
-- already recorded, so nothing received is typed twice.
create function public.report_day(p_project uuid, p_date date)
returns table (kind text, id uuid, label text, detail text, created_by uuid, at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select 'report', r.id, r.work_done,
    concat_ws(' · ', r.area, case when r.headcount is not null then r.headcount || ' people' end),
    r.created_by, r.submitted_at
  from public.daily_reports r where r.project_id = p_project and r.work_date = p_date
  union all
  select 'delivery', d.id, coalesce(s.name, 'Delivery'),
    (select string_agg(coalesce(m.name, dl.material_text) || ' ' || trim(to_char(dl.received_qty - dl.rejected_qty, 'FM999999990.###')) || ' ' || u.code, ', ' order by dl.created_at)
     from public.delivery_lines dl left join public.materials m on m.id = dl.material_id join public.units u on u.id = dl.unit_id
     where dl.delivery_id = d.id),
    d.created_by, d.created_at
  from public.deliveries d left join public.suppliers s on s.id = d.supplier_id
  where d.project_id = p_project and d.receipt_date = p_date
  order by 6
$$;

-- ---------------------------------------------------------------------------
-- Activity calendar (req §17, acceptance #11). Runs as the caller, so row-level security
-- decides what each person sees: money rows come from the ledger (finance users only),
-- site rows from reports, progress, slips and deliveries. Business dates throughout; a
-- slip "sent" uses the Kathmandu date of the moment it was marked sent.
-- money: 'cost' | 'payment' | 'advance' (payment not matched to anything yet) | null.
-- ---------------------------------------------------------------------------
create function public.calendar_events(
  p_company uuid, p_from date, p_to date, p_project uuid default null
)
returns table (
  event_date date, kind text, label text, detail text, money text,
  cost_paisa bigint, cash_paisa bigint, project_id uuid, party_name text,
  link_kind text, link_id uuid, created_by uuid, at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  with money as (
    select l.event_id, l.business_date, l.project_id, l.party_id,
      sum(l.cost_paisa)::bigint as cost, sum(l.cash_paisa)::bigint as cash, min(l.posted_at) as at
    from public.ledger_entries l
    where l.company_id = p_company and l.business_date between p_from and p_to
      and (p_project is null or l.project_id = p_project)
    group by l.event_id, l.business_date, l.project_id, l.party_id
    having sum(l.cost_paisa) <> 0 or sum(l.cash_paisa) <> 0
  )
  select m.business_date, e.event_type, lbl ->> 'label', lbl ->> 'reason',
    case
      when m.cost <> 0 then 'cost'
      when lbl ->> 'payment_id' is not null and e.event_type = 'payment_post' and not exists (
        select 1 from public.settlement_events s where s.payment_id = (lbl ->> 'payment_id')::uuid) then 'advance'
      else 'payment'
    end,
    m.cost, m.cash, m.project_id,
    coalesce((select name from public.suppliers where id = m.party_id), (select name from public.subcontractors where id = m.party_id),
             (select name from public.crews where id = m.party_id), (select name from public.payees where id = m.party_id)),
    case
      when lbl ->> 'bill_id' is not null then 'bill' when lbl ->> 'charge_id' is not null then 'charge'
      when lbl ->> 'labour_cost_id' is not null then 'labour' when lbl ->> 'expense_id' is not null then 'expense'
      when lbl ->> 'credit_id' is not null then 'credit' when lbl ->> 'payment_id' is not null then 'payment'
    end,
    coalesce(lbl ->> 'bill_id', lbl ->> 'charge_id', lbl ->> 'labour_cost_id', lbl ->> 'expense_id',
             lbl ->> 'credit_id', lbl ->> 'payment_id')::uuid,
    null::uuid, m.at
  from money m
  join public.posting_events e on e.id = m.event_id
  cross join lateral private.event_label(m.event_id) lbl
  union all
  select r.work_date, 'report', 'Daily report: ' || r.work_done,
    concat_ws(' · ', r.area, case when r.headcount is not null then r.headcount || ' people' end, r.issues),
    null, null, null, r.project_id, null, 'report', r.id, r.created_by, r.submitted_at
  from public.daily_reports r
  where r.company_id = p_company and r.work_date between p_from and p_to and (p_project is null or r.project_id = p_project)
  union all
  select u.effective_date, 'progress',
    'Progress: ' || coalesce(s.name, 'Overall') || ' ' || trim(to_char(u.pct, 'FM990.##')) || '%',
    coalesce(u.reason, u.notes), null, null, null, u.project_id, null, 'progress', u.id, u.created_by, u.created_at
  from public.progress_updates u left join public.stages s on s.id = u.stage_id
  where u.company_id = p_company and u.effective_date between p_from and p_to and (p_project is null or u.project_id = p_project)
  union all
  select d.receipt_date, 'delivery', 'Delivery' || coalesce(', challan ' || d.challan_no, ''),
    (select string_agg(coalesce(mt.name, dl.material_text) || ' ' || trim(to_char(dl.received_qty - dl.rejected_qty, 'FM999999990.###')) || ' ' || un.code, ', ')
     from public.delivery_lines dl left join public.materials mt on mt.id = dl.material_id join public.units un on un.id = dl.unit_id
     where dl.delivery_id = d.id),
    null, null, null, d.project_id, sp.name, 'delivery', d.id, d.created_by, d.created_at
  from public.deliveries d left join public.suppliers sp on sp.id = d.supplier_id
  where d.company_id = p_company and d.receipt_date between p_from and p_to and (p_project is null or d.project_id = p_project)
  union all
  -- Slips the caller can see: requested (once out of draft) and marked sent.
  select x.day, x.kind, x.label, null, null, null, null, null, sp.name, 'slip', o.id, o.created_by, x.at
  from public.order_slips o
  left join public.suppliers sp on sp.id = o.supplier_id
  cross join lateral (values
    (o.request_date, 'slip', 'Order slip ' || o.number, o.created_at),
    ((o.sent_at at time zone 'Asia/Kathmandu')::date, 'slip_sent', 'Order slip ' || o.number || ' marked sent', o.sent_at)
  ) as x(day, kind, label, at)
  where o.company_id = p_company and o.status <> 'draft' and x.day between p_from and p_to
    and (p_project is null or exists (select 1 from public.order_slip_lines ol where ol.slip_id = o.id and ol.project_id = p_project))
$$;

-- ---------------------------------------------------------------------------
-- Attachments for reports and progress updates
-- ---------------------------------------------------------------------------
create or replace function private.can_access_attachment(p_attachment uuid, p_action text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.attachments;
  v_project uuid;
  v_status public.bill_status;
  c public.subcontract_charges;
  l public.labour_costs;
  x public.expenses;
begin
  select * into a from public.attachments where id = p_attachment;
  if not found or not private.is_member(a.company_id) then
    return false;
  end if;

  if a.contract_revision_id is not null or a.budget_revision_id is not null then
    if a.contract_revision_id is not null then
      select project_id into v_project from public.contract_revisions where id = a.contract_revision_id;
    else
      select project_id into v_project from public.budget_revisions where id = a.budget_revision_id;
    end if;
    -- Revision attachments: financial records, admin writes, never deleted.
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_finance(a.company_id) and private.can_see_project(a.company_id, v_project);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.is_admin(a.company_id);
    end if;
    return false;
  end if;

  if a.delivery_id is not null then
    select project_id into v_project from public.deliveries where id = a.delivery_id;
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_project(a.company_id, v_project);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_work_on_project(a.company_id, v_project);
    end if;
    return false;
  end if;

  if a.bill_id is not null then
    select status into v_status from public.supplier_bills where id = a.bill_id;
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_bill_amounts(a.bill_id);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_edit_bill(a.bill_id);
    elsif p_action = 'delete' then
      return v_status = 'draft' and private.can_edit_bill(a.bill_id);
    end if;
    return false;
  end if;

  if a.payment_id is not null then
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_payment(a.payment_id);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_record_payments(a.company_id) and private.can_see_payment(a.payment_id);
    end if;
    return false;
  end if;

  -- Agreement and measurement sheets carry amounts: finance + project to read.
  if a.work_package_id is not null then
    select project_id into v_project from public.work_packages where id = a.work_package_id;
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_project_money(a.company_id, v_project);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_manage_parties(a.company_id)
        and private.can_work_on_project(a.company_id, v_project) and private.can_see_finance(a.company_id);
    end if;
    return false;
  end if;

  if a.charge_id is not null then
    select * into c from public.subcontract_charges where id = a.charge_id;
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_project_money(a.company_id, c.project_id);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_see_project_money(a.company_id, c.project_id)
        and private.can_work_on_project(a.company_id, c.project_id);
    elsif p_action = 'delete' then
      return c.status = 'draft' and private.can_see_project_money(a.company_id, c.project_id)
        and (c.created_by = auth.uid() or private.can_post(a.company_id));
    end if;
    return false;
  end if;

  -- Labour and expense receipts: finance + project, or the creator within X2.
  if a.labour_cost_id is not null then
    select * into l from public.labour_costs where id = a.labour_cost_id;
    if p_action in ('read', 'upload') and (
      private.can_see_project_money(a.company_id, l.project_id)
      or private.is_own_recent_entry(a.company_id, l.project_id, l.created_by, l.created_at, l.status)
    ) then
      return case when p_action = 'read' then a.removed_at is null
                  else a.uploaded_at is null and private.can_work_on_project(a.company_id, l.project_id) end;
    end if;
    return false;
  end if;

  -- Site records carry no amounts: anyone on the project reads; anyone working on it adds.
  if a.daily_report_id is not null or a.progress_update_id is not null then
    v_project := coalesce(
      (select project_id from public.daily_reports where id = a.daily_report_id),
      (select project_id from public.progress_updates where id = a.progress_update_id));
    if p_action = 'read' then
      return a.removed_at is null and private.can_see_project(a.company_id, v_project);
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_work_on_project(a.company_id, v_project);
    end if;
    return false;
  end if;

  if a.expense_id is not null then
    select * into x from public.expenses where id = a.expense_id;
    if p_action in ('read', 'upload') and (
      private.can_see_project_money(a.company_id, x.project_id)
      or private.is_own_recent_entry(a.company_id, x.project_id, x.created_by, x.created_at, x.status)
    ) then
      return case when p_action = 'read' then a.removed_at is null
                  else a.uploaded_at is null and private.can_work_on_project(a.company_id, x.project_id) end;
    end if;
    return false;
  end if;
  return false;
end $$;

drop policy attachments_insert on public.attachments;
drop function private.can_create_attachment_for(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid);
create function private.can_create_attachment_for(
  p_company uuid, p_contract_revision uuid, p_budget_revision uuid, p_delivery uuid, p_bill uuid, p_payment uuid,
  p_work_package uuid, p_charge uuid, p_labour_cost uuid, p_expense uuid, p_daily_report uuid, p_progress_update uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    (p_contract_revision is not null and private.is_admin(p_company) and exists (
      select 1 from public.contract_revisions r where r.company_id = p_company and r.id = p_contract_revision))
    or (p_budget_revision is not null and private.is_admin(p_company) and exists (
      select 1 from public.budget_revisions r where r.company_id = p_company and r.id = p_budget_revision))
    or (p_delivery is not null and exists (
      select 1 from public.deliveries d
      where d.company_id = p_company and d.id = p_delivery and private.can_work_on_project(d.company_id, d.project_id)))
    or (p_bill is not null and exists (
      select 1 from public.supplier_bills b where b.company_id = p_company and b.id = p_bill)
      and private.can_edit_bill(p_bill))
    or (p_payment is not null and exists (
      select 1 from public.payments p where p.company_id = p_company and p.id = p_payment)
      and private.can_record_payments(p_company) and private.can_see_payment(p_payment))
    or (p_work_package is not null and exists (
      select 1 from public.work_packages w
      where w.company_id = p_company and w.id = p_work_package and private.can_manage_parties(p_company)
        and private.can_work_on_project(p_company, w.project_id) and private.can_see_finance(p_company)))
    or (p_charge is not null and exists (
      select 1 from public.subcontract_charges c
      where c.company_id = p_company and c.id = p_charge
        and private.can_see_project_money(p_company, c.project_id) and private.can_work_on_project(p_company, c.project_id)))
    or (p_labour_cost is not null and exists (
      select 1 from public.labour_costs l
      where l.company_id = p_company and l.id = p_labour_cost and private.can_work_on_project(p_company, l.project_id)
        and (private.can_see_project_money(p_company, l.project_id)
             or private.is_own_recent_entry(p_company, l.project_id, l.created_by, l.created_at, l.status))))
    or (p_expense is not null and exists (
      select 1 from public.expenses x
      where x.company_id = p_company and x.id = p_expense and private.can_work_on_project(p_company, x.project_id)
        and (private.can_see_project_money(p_company, x.project_id)
             or private.is_own_recent_entry(p_company, x.project_id, x.created_by, x.created_at, x.status))))
    or (p_daily_report is not null and exists (
      select 1 from public.daily_reports r
      where r.company_id = p_company and r.id = p_daily_report and private.can_work_on_project(p_company, r.project_id)))
    or (p_progress_update is not null and exists (
      select 1 from public.progress_updates u
      where u.company_id = p_company and u.id = p_progress_update and private.can_work_on_project(p_company, u.project_id)))
$$;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    uploaded_at is null and removed_at is null
    and private.can_create_attachment_for(company_id, contract_revision_id, budget_revision_id, delivery_id, bill_id,
      payment_id, work_package_id, charge_id, labour_cost_id, expense_id, daily_report_id, progress_update_id)
  );

-- ---------------------------------------------------------------------------
-- Grants: RPCs for signed-in users; read helpers too; private writers stay internal.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_stages(uuid, text[]) from public, anon;
revoke execute on function public.copy_stages(uuid, uuid) from public, anon;
revoke execute on function public.add_progress_update(jsonb) from public, anon;
revoke execute on function public.progress_as_of(uuid, date) from public, anon;
revoke execute on function public.submit_daily_report(uuid, jsonb) from public, anon;
revoke execute on function public.report_day(uuid, date) from public, anon;
revoke execute on function public.calendar_events(uuid, date, date, uuid) from public, anon;
grant execute on function public.create_stages(uuid, text[]), public.copy_stages(uuid, uuid),
  public.add_progress_update(jsonb), public.progress_as_of(uuid, date), public.submit_daily_report(uuid, jsonb),
  public.report_day(uuid, date), public.calendar_events(uuid, date, date, uuid) to authenticated;
revoke execute on function private.can_plan_project(uuid, uuid) from public, anon;
grant execute on function private.can_plan_project(uuid, uuid) to authenticated;
revoke execute on function private.can_create_attachment_for(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function private.can_create_attachment_for(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
