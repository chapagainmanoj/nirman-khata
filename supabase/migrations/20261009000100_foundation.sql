-- NirmanKhata milestone 1: foundation
-- Tenancy, staff, projects, catalog, contract/budget revisions, attachments, audit.
-- Design: docs/technical-design.md sections 3 and 4.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'project_manager', 'site_staff', 'accounts', 'viewer');
create type public.project_status as enum ('planned', 'active', 'on_hold', 'completed', 'closed', 'cancelled');
create type public.vat_treatment as enum ('vat_as_cost', 'vat_recoverable');
create type public.date_display as enum ('bs', 'ad');
create type public.heading_kind as enum ('materials', 'labour', 'subcontract', 'equipment', 'transport', 'site', 'other');

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create function private.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Companies, profiles, memberships
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  pan_vat text,
  address text,
  phone text,
  logo_path text,
  default_date_display public.date_display not null default 'bs',
  slip_approval_required boolean not null default true,
  tax_fields_enabled boolean not null default true,
  labour_module_enabled boolean not null default true,
  vat_treatment public.vat_treatment not null default 'vat_as_cost',
  rate_variance_tolerance_pct numeric(5, 2) not null default 5 check (rate_variance_tolerance_pct >= 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global identity: no company_id (req §23).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  email text,
  date_display public.date_display, -- null = use company default
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles (id),
  roles public.app_role[] not null check (cardinality(roles) > 0),
  can_view_finance boolean not null default false,
  can_record_payments boolean not null default false,
  can_approve_slips boolean not null default false,
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, user_id)
);
-- One company per login in v1 (design §3.1).
create unique index memberships_one_active_company on public.memberships (user_id) where active;

-- ---------------------------------------------------------------------------
-- Access helpers (design §3.3). All check the membership is active now.
-- ---------------------------------------------------------------------------
create function private.my_company_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.company_id from public.memberships m
  where m.user_id = auth.uid() and m.active
$$;

create function private.is_member(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company and m.user_id = auth.uid() and m.active
  )
$$;

create function private.has_role(p_company uuid, p_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company and m.user_id = auth.uid() and m.active
      and p_role = any (m.roles)
  )
$$;

create function private.is_admin(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(p_company, 'admin')
$$;

-- Admin and Accounts see all projects (req §5).
create function private.sees_all_projects(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company and m.user_id = auth.uid() and m.active
      and m.roles && array['admin', 'accounts']::public.app_role[]
  )
$$;

create function private.can_see_finance(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company and m.user_id = auth.uid() and m.active
      and (m.can_view_finance or m.roles && array['admin', 'accounts']::public.app_role[])
  )
$$;

-- Defined after projects/project_assignments exist (below).

-- ---------------------------------------------------------------------------
-- Projects and assignments
-- ---------------------------------------------------------------------------
create table public.projects (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  code text not null check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  client_name text,
  client_phone text,
  district text,
  municipality text,
  ward text,
  location_note text,
  manager_id uuid,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  status public.project_status not null default 'planned',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code),
  foreign key (company_id, manager_id) references public.memberships (company_id, user_id)
);

create table public.project_assignments (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  project_id uuid not null,
  user_id uuid not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, project_id, user_id),
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, user_id) references public.memberships (company_id, user_id)
);

create function private.can_see_project(p_company uuid, p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.sees_all_projects(p_company)
    or exists (
      select 1
      from public.project_assignments a
      join public.memberships m on m.company_id = a.company_id and m.user_id = a.user_id
      where a.company_id = p_company and a.project_id = p_project
        and a.user_id = auth.uid() and m.active
    )
$$;

-- ---------------------------------------------------------------------------
-- Catalog: cost headings, units, materials
-- ---------------------------------------------------------------------------
create table public.cost_headings (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  parent_id uuid,
  name text not null check (length(trim(name)) > 0),
  kind public.heading_kind not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, parent_id) references public.cost_headings (company_id, id)
);

create table public.units (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  code text not null check (length(trim(code)) > 0),
  name text not null,
  needs_note boolean not null default false, -- trip/load must describe the vehicle (req §3.2)
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code)
);

create table public.materials (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  name text not null check (length(trim(name)) > 0),
  local_name text,
  spec text,
  default_unit_id uuid not null,
  default_heading_id uuid,
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, default_unit_id) references public.units (company_id, id),
  foreign key (company_id, default_heading_id) references public.cost_headings (company_id, id)
);

-- Empty in v1; no automatic conversion unless a rule exists (req §3.2).
create table public.unit_conversions (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  material_id uuid,
  from_unit_id uuid not null,
  to_unit_id uuid not null,
  factor numeric(18, 6) not null check (factor > 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, material_id) references public.materials (company_id, id),
  foreign key (company_id, from_unit_id) references public.units (company_id, id),
  foreign key (company_id, to_unit_id) references public.units (company_id, id)
);

-- ---------------------------------------------------------------------------
-- Contract and budget revisions (financial; insert-only history, req §6)
-- ---------------------------------------------------------------------------
create table public.contract_revisions (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  project_id uuid not null,
  effective_date date not null,
  amount_paisa bigint not null check (amount_paisa >= 0),
  is_original boolean not null default false,
  reason text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id)
);

create table public.budget_revisions (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  project_id uuid not null,
  effective_date date not null,
  total_paisa bigint not null check (total_paisa >= 0),
  is_original boolean not null default false,
  reason text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id)
);

create table public.budget_lines (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  budget_revision_id uuid not null,
  heading_id uuid not null,
  amount_paisa bigint not null check (amount_paisa >= 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, budget_revision_id, heading_id),
  foreign key (company_id, budget_revision_id) references public.budget_revisions (company_id, id),
  foreign key (company_id, heading_id) references public.cost_headings (company_id, id)
);

create unique index contract_revisions_one_original on public.contract_revisions (project_id) where is_original;
create unique index budget_revisions_one_original on public.budget_revisions (project_id) where is_original;

-- ---------------------------------------------------------------------------
-- Attachments (design §3.7). Path = {company_id}/{attachment_id}.
-- One owner FK per owner type; later milestones add owner columns.
-- ---------------------------------------------------------------------------
create table public.attachments (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  contract_revision_id uuid,
  budget_revision_id uuid,
  kind text not null default 'document',
  file_name text,
  content_type text,
  size_bytes bigint,
  uploaded_at timestamptz,
  removed_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, contract_revision_id) references public.contract_revisions (company_id, id),
  foreign key (company_id, budget_revision_id) references public.budget_revisions (company_id, id),
  constraint attachments_one_owner check (num_nonnulls(contract_revision_id, budget_revision_id) = 1)
);

-- ---------------------------------------------------------------------------
-- Document numbering (OS-0001 ...), audit log
-- ---------------------------------------------------------------------------
create table public.doc_sequences (
  company_id uuid not null references public.companies (id),
  kind text not null,
  next_value bigint not null default 1,
  primary key (company_id, kind)
);

create table public.audit_log (
  company_id uuid not null references public.companies (id),
  id bigint generated always as identity primary key,
  user_id uuid,
  entity text not null,
  entity_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_log_entity on public.audit_log (company_id, entity, entity_id);

-- ---------------------------------------------------------------------------
-- updated_at + audit triggers on tenant tables
-- ---------------------------------------------------------------------------
create function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_company uuid;
begin
  v_company := case when tg_table_name = 'companies' then (v_row ->> 'id')::uuid
                    else (v_row ->> 'company_id')::uuid end;
  insert into public.audit_log (company_id, user_id, entity, entity_id, action, before, after)
  values (
    v_company, auth.uid(), tg_table_name, (v_row ->> 'id')::uuid, lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'memberships', 'projects', 'project_assignments', 'cost_headings', 'units',
    'materials', 'unit_conversions', 'contract_revisions', 'budget_revisions', 'budget_lines', 'attachments'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit()', t);
  end loop;
end $$;

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- created_by is always the caller, never client-supplied.
create function private.set_created_by() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'memberships', 'projects', 'project_assignments', 'cost_headings', 'units',
    'materials', 'unit_conversions', 'contract_revisions', 'budget_revisions', 'budget_lines', 'attachments'
  ] loop
    execute format('create trigger set_created_by before insert on public.%I for each row execute function private.set_created_by()', t);
  end loop;
end $$;

-- Revisions are history: never edited or deleted (req §6, §20).
create function private.reject_change() returns trigger
language plpgsql as $$
begin
  raise exception '% rows cannot be changed or deleted; add a new revision instead', tg_table_name
    using errcode = 'P0001';
end $$;

create trigger no_change before update or delete on public.contract_revisions
  for each row execute function private.reject_change();
create trigger no_change before update or delete on public.budget_revisions
  for each row execute function private.reject_change();
create trigger no_change before update or delete on public.budget_lines
  for each row execute function private.reject_change();

-- A company must keep at least one active admin.
create function private.keep_one_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.memberships m
    where m.company_id = old.company_id and m.active and 'admin' = any (m.roles)
  ) then
    raise exception 'A company must keep at least one active admin' using errcode = 'P0001';
  end if;
  return null;
end $$;

create trigger keep_one_admin after update or delete on public.memberships
  for each row execute function private.keep_one_admin();

-- New auth user -> profile.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone),
    case when new.email like '%@phone.nirmankhata.invalid' then null else new.email end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security (design §3.4, §3.6)
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.projects enable row level security;
alter table public.project_assignments enable row level security;
alter table public.cost_headings enable row level security;
alter table public.units enable row level security;
alter table public.materials enable row level security;
alter table public.unit_conversions enable row level security;
alter table public.contract_revisions enable row level security;
alter table public.budget_revisions enable row level security;
alter table public.budget_lines enable row level security;
alter table public.attachments enable row level security;
alter table public.doc_sequences enable row level security;
alter table public.audit_log enable row level security;

-- Companies: members read, admins update. Created only via create_company().
create policy companies_select on public.companies for select to authenticated
  using (private.is_member(id));
create policy companies_update on public.companies for update to authenticated
  using (private.is_admin(id)) with check (private.is_admin(id));

-- Profiles: self, or people in the same company.
create function private.shares_company(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = p_user and m.company_id in (select private.my_company_ids())
  )
$$;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or private.shares_company(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Memberships: members read the staff list; admins manage.
create policy memberships_select on public.memberships for select to authenticated
  using (private.is_member(company_id));
-- No insert policy: staff are created by the admin-users Edge Function (service role).
create policy memberships_update on public.memberships for update to authenticated
  using (private.is_admin(company_id)) with check (private.is_admin(company_id));

-- Projects: by assignment; admin creates; admin or assigned PM edits.
create policy projects_select on public.projects for select to authenticated
  using (private.can_see_project(company_id, id));
create policy projects_insert on public.projects for insert to authenticated
  with check (private.is_admin(company_id));
create policy projects_update on public.projects for update to authenticated
  using (
    private.is_admin(company_id)
    or (private.has_role(company_id, 'project_manager') and private.can_see_project(company_id, id))
  )
  with check (
    private.is_admin(company_id)
    or (private.has_role(company_id, 'project_manager') and private.can_see_project(company_id, id))
  );

create policy assignments_select on public.project_assignments for select to authenticated
  using (private.can_see_project(company_id, project_id));
create policy assignments_insert on public.project_assignments for insert to authenticated
  with check (private.is_admin(company_id));
create policy assignments_delete on public.project_assignments for delete to authenticated
  using (private.is_admin(company_id));

-- Catalog: members read; admins write. Deactivate instead of delete.
create policy headings_select on public.cost_headings for select to authenticated
  using (private.is_member(company_id));
create policy headings_insert on public.cost_headings for insert to authenticated
  with check (private.is_admin(company_id));
create policy headings_update on public.cost_headings for update to authenticated
  using (private.is_admin(company_id)) with check (private.is_admin(company_id));

create policy units_select on public.units for select to authenticated
  using (private.is_member(company_id));
create policy units_insert on public.units for insert to authenticated
  with check (private.is_admin(company_id));
create policy units_update on public.units for update to authenticated
  using (private.is_admin(company_id)) with check (private.is_admin(company_id));

create policy materials_select on public.materials for select to authenticated
  using (private.is_member(company_id));
create policy materials_insert on public.materials for insert to authenticated
  with check (private.is_admin(company_id));
create policy materials_update on public.materials for update to authenticated
  using (private.is_admin(company_id)) with check (private.is_admin(company_id));

create policy unit_conversions_select on public.unit_conversions for select to authenticated
  using (private.is_member(company_id));
create policy unit_conversions_insert on public.unit_conversions for insert to authenticated
  with check (private.is_admin(company_id));

-- Financial: finance permission AND project access. Admin adds revisions.
create policy contract_revisions_select on public.contract_revisions for select to authenticated
  using (private.can_see_finance(company_id) and private.can_see_project(company_id, project_id));
create policy contract_revisions_insert on public.contract_revisions for insert to authenticated
  with check (private.is_admin(company_id));

create policy budget_revisions_select on public.budget_revisions for select to authenticated
  using (private.can_see_finance(company_id) and private.can_see_project(company_id, project_id));
create policy budget_revisions_insert on public.budget_revisions for insert to authenticated
  with check (private.is_admin(company_id));

create policy budget_lines_select on public.budget_lines for select to authenticated
  using (exists (
    select 1 from public.budget_revisions r
    where r.company_id = budget_lines.company_id and r.id = budget_lines.budget_revision_id
  ));
create policy budget_lines_insert on public.budget_lines for insert to authenticated
  with check (private.is_admin(company_id));

-- Audit log: admins only (before/after JSON contains amounts).
create policy audit_select on public.audit_log for select to authenticated
  using (private.is_admin(company_id));

-- doc_sequences: no policies -> only security definer functions touch it.

-- ---------------------------------------------------------------------------
-- Attachment access follows the owning record (design §3.7)
-- ---------------------------------------------------------------------------
create function private.can_access_attachment(p_attachment uuid, p_action text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.attachments;
  v_project uuid;
begin
  select * into a from public.attachments where id = p_attachment;
  if not found or not private.is_member(a.company_id) then
    return false;
  end if;

  if a.contract_revision_id is not null then
    select project_id into v_project from public.contract_revisions where id = a.contract_revision_id;
  elsif a.budget_revision_id is not null then
    select project_id into v_project from public.budget_revisions where id = a.budget_revision_id;
  end if;

  -- Revision attachments: financial records, admin writes.
  if p_action = 'read' then
    return a.removed_at is null
      and private.can_see_finance(a.company_id)
      and private.can_see_project(a.company_id, v_project);
  elsif p_action = 'upload' then
    return a.uploaded_at is null and private.is_admin(a.company_id);
  elsif p_action = 'delete' then
    return false; -- revisions are history; their files are never deleted
  end if;
  return false;
end $$;

-- Storage object name -> attachment id ("{company_id}/{attachment_id}").
create function private.attachment_id_from_path(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  if p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$' then
    return null;
  end if;
  return split_part(p_name, '/', 2)::uuid;
end $$;

create function private.can_access_attachment_path(p_name text, p_action text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := private.attachment_id_from_path(p_name);
begin
  if v_id is null then
    return false;
  end if;
  return exists (
    select 1 from public.attachments a
    where a.id = v_id and a.company_id::text = split_part(p_name, '/', 1)
  ) and private.can_access_attachment(v_id, p_action);
end $$;

create policy attachments_select on public.attachments for select to authenticated
  using (private.can_access_attachment(id, 'read') or (created_by = auth.uid() and uploaded_at is null));
-- Who may attach a file to a record. Revisions: admin only.
create function private.can_create_attachment(
  p_company uuid, p_contract_revision uuid, p_budget_revision uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin(p_company)
    and (
      (p_contract_revision is not null and exists (
        select 1 from public.contract_revisions r where r.company_id = p_company and r.id = p_contract_revision))
      or (p_budget_revision is not null and exists (
        select 1 from public.budget_revisions r where r.company_id = p_company and r.id = p_budget_revision))
    )
$$;

create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    uploaded_at is null and removed_at is null
    and private.can_create_attachment(company_id, contract_revision_id, budget_revision_id)
  );

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do nothing;

create policy attachment_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and private.can_access_attachment_path(name, 'read'));
create policy attachment_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and private.can_access_attachment_path(name, 'upload'));
create policy attachment_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and private.can_access_attachment_path(name, 'delete'));
-- No update policy: uploaded files are immutable (design §3.7).

-- Marks an attachment uploaded once its object exists.
create function public.mark_attachment_uploaded(p_attachment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.attachments;
begin
  select * into a from public.attachments where id = p_attachment for update;
  if not found or a.created_by is distinct from auth.uid() or a.uploaded_at is not null then
    raise exception 'Attachment not found or already uploaded' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'attachments' and o.name = a.company_id || '/' || a.id
  ) then
    raise exception 'File has not been uploaded yet' using errcode = 'P0001';
  end if;
  update public.attachments set uploaded_at = now() where id = p_attachment;
end $$;

-- ---------------------------------------------------------------------------
-- Default catalog for a new company (req §3.2, §7)
-- ---------------------------------------------------------------------------
create function private.seed_company_defaults(p_company uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  h_materials uuid; h_subcontract uuid;
  h_cement uuid; h_rod uuid; h_aggregate uuid; h_bricks uuid; h_hardware uuid; h_electrical uuid; h_plumbing uuid;
  u_bag uuid; u_kg uuid; u_cft uuid; u_piece uuid;
  i integer := 0;
  v_name text;
begin
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Materials', 'materials', 10) returning id into h_materials;
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Own Labour (Jyala)', 'labour', 20);
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Subcontract Work', 'subcontract', 30) returning id into h_subcontract;
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Equipment / Machinery Hire', 'equipment', 40);
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Transport and Delivery', 'transport', 50);
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Site Expenses', 'site', 60);
  insert into public.cost_headings (company_id, name, kind, sort_order) values (p_company, 'Other', 'other', 70);

  insert into public.cost_headings (company_id, parent_id, name, kind, sort_order) values (p_company, h_materials, 'Cement', 'materials', 1) returning id into h_cement;
  insert into public.cost_headings (company_id, parent_id, name, kind, sort_order) values (p_company, h_materials, 'Rod/Steel', 'materials', 2) returning id into h_rod;
  insert into public.cost_headings (company_id, parent_id, name, kind, sort_order) values (p_company, h_materials, 'Baluwa/Gitti/Dhunga', 'materials', 3) returning id into h_aggregate;
  insert into public.cost_headings (company_id, parent_id, name, kind, sort_order) values (p_company, h_materials, 'Bricks', 'materials', 4) returning id into h_bricks;
  insert into public.cost_headings (company_id, parent_id, name, kind, sort_order) values (p_company, h_materials, 'Hardware', 'materials', 5) returning id into h_hardware;
  insert into public.cost_headings (company_id, parent_id, name, kind, sort_order) values (p_company, h_materials, 'Electrical', 'materials', 6) returning id into h_electrical;
  insert into public.cost_headings (company_id, parent_id, name, kind, sort_order) values (p_company, h_materials, 'Plumbing', 'materials', 7) returning id into h_plumbing;

  foreach v_name in array array['Plaster', 'Masonry', 'Electrical', 'Plumbing', 'Painting', 'Tiling', 'Shuttering'] loop
    i := i + 1;
    insert into public.cost_headings (company_id, parent_id, name, kind, sort_order) values (p_company, h_subcontract, v_name, 'subcontract', i);
  end loop;

  insert into public.units (company_id, code, name) values (p_company, 'bag', 'Bora (bag)') returning id into u_bag;
  insert into public.units (company_id, code, name) values (p_company, 'kg', 'Kg') returning id into u_kg;
  insert into public.units (company_id, code, name) values (p_company, 'quintal', 'Quintal'), (p_company, 'tonne', 'Tonne'), (p_company, 'bundle', 'Bundle'),
    (p_company, 'thousand', 'Thousand'), (p_company, 'meter', 'Meter'), (p_company, 'coil', 'Coil');
  insert into public.units (company_id, code, name) values (p_company, 'cft', 'Cft') returning id into u_cft;
  insert into public.units (company_id, code, name) values (p_company, 'piece', 'Piece') returning id into u_piece;
  insert into public.units (company_id, code, name, needs_note) values (p_company, 'trip', 'Trip', true), (p_company, 'load', 'Load', true);

  insert into public.materials (company_id, name, local_name, default_unit_id, default_heading_id) values
    (p_company, 'Cement', 'Cement', u_bag, h_cement),
    (p_company, 'Rod (TMT rebar)', 'Chhad', u_kg, h_rod),
    (p_company, 'Sand', 'Baluwa', u_cft, h_aggregate),
    (p_company, 'Aggregate', 'Gitti', u_cft, h_aggregate),
    (p_company, 'Stone', 'Dhunga', u_cft, h_aggregate),
    (p_company, 'Brick', 'Eeta', u_piece, h_bricks),
    (p_company, 'Metal / hardware', null, u_kg, h_hardware),
    (p_company, 'Electrical items', null, u_piece, h_electrical),
    (p_company, 'Plumbing items', null, u_piece, h_plumbing);
end $$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Owner sign-up: creates the company, the admin membership and default catalog.
create function public.create_company(p_name text, p_full_name text, p_phone text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships where user_id = auth.uid() and active) then
    raise exception 'This login already belongs to a company' using errcode = 'P0001';
  end if;

  update public.profiles set full_name = p_full_name, phone = coalesce(p_phone, phone) where id = auth.uid();

  insert into public.companies (name, phone, created_by) values (p_name, p_phone, auth.uid())
  returning id into v_company;
  insert into public.memberships (company_id, user_id, roles, can_view_finance, can_record_payments, can_approve_slips, created_by)
  values (v_company, auth.uid(), array['admin']::public.app_role[], true, true, true, auth.uid());
  perform private.seed_company_defaults(v_company);
  return v_company;
end $$;

-- Create a project with its original contract amount and spending budget.
-- Budget defaults to the contract amount (req v1.1 §6); the UI shows it pre-filled.
create function public.create_project(
  p_company uuid,
  p_code text,
  p_name text,
  p_contract_paisa bigint,
  p_budget_paisa bigint default null,
  p_effective_date date default null,
  p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid;
  v_date date := coalesce(p_effective_date, (now() at time zone 'Asia/Kathmandu')::date);
begin
  if not private.is_admin(p_company) then
    raise exception 'Only an admin can create projects' using errcode = '42501';
  end if;
  if p_contract_paisa is null or p_contract_paisa < 0 then
    raise exception 'Contract amount is required' using errcode = '22023';
  end if;

  insert into public.projects (
    company_id, code, name, client_name, client_phone, district, municipality, ward, location_note,
    manager_id, planned_start, planned_end, status, created_by
  ) values (
    p_company, p_code, p_name,
    p_details ->> 'client_name', p_details ->> 'client_phone', p_details ->> 'district',
    p_details ->> 'municipality', p_details ->> 'ward', p_details ->> 'location_note',
    (p_details ->> 'manager_id')::uuid, (p_details ->> 'planned_start')::date, (p_details ->> 'planned_end')::date,
    coalesce((p_details ->> 'status')::public.project_status, 'planned'), auth.uid()
  ) returning id into v_project;

  insert into public.contract_revisions (company_id, project_id, effective_date, amount_paisa, is_original, reason, created_by)
  values (p_company, v_project, v_date, p_contract_paisa, true, 'Original contract', auth.uid());
  insert into public.budget_revisions (company_id, project_id, effective_date, total_paisa, is_original, reason, created_by)
  values (p_company, v_project, v_date, coalesce(p_budget_paisa, p_contract_paisa), true, 'Original budget', auth.uid());

  if (p_details ->> 'manager_id') is not null then
    insert into public.project_assignments (company_id, project_id, user_id, created_by)
    values (p_company, v_project, (p_details ->> 'manager_id')::uuid, auth.uid());
  end if;
  return v_project;
end $$;

create function public.add_contract_revision(
  p_project uuid, p_effective_date date, p_amount_paisa bigint, p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_company uuid; v_id uuid;
begin
  select company_id into v_company from public.projects where id = p_project;
  if v_company is null or not private.is_admin(v_company) then
    raise exception 'Only an admin can revise the contract amount' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  insert into public.contract_revisions (company_id, project_id, effective_date, amount_paisa, reason, created_by)
  values (v_company, p_project, p_effective_date, p_amount_paisa, p_reason, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- p_lines: [{"heading_id": "...", "amount_paisa": 123}]. Returns the revision id and
-- whether heading budgets add up to the total (req §6: warn, don't block).
create function public.add_budget_revision(
  p_project uuid, p_effective_date date, p_total_paisa bigint, p_reason text, p_lines jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_company uuid; v_id uuid; v_sum bigint;
begin
  select company_id into v_company from public.projects where id = p_project;
  if v_company is null or not private.is_admin(v_company) then
    raise exception 'Only an admin can revise the budget' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  insert into public.budget_revisions (company_id, project_id, effective_date, total_paisa, reason, created_by)
  values (v_company, p_project, p_effective_date, p_total_paisa, p_reason, auth.uid())
  returning id into v_id;

  insert into public.budget_lines (company_id, budget_revision_id, heading_id, amount_paisa, created_by)
  select v_company, v_id, (l ->> 'heading_id')::uuid, (l ->> 'amount_paisa')::bigint, auth.uid()
  from jsonb_array_elements(p_lines) l;

  select coalesce(sum(amount_paisa), 0) into v_sum from public.budget_lines where budget_revision_id = v_id;
  return jsonb_build_object(
    'id', v_id,
    'lines_total_paisa', v_sum,
    'lines_match_total', jsonb_array_length(p_lines) = 0 or v_sum = p_total_paisa
  );
end $$;

-- Contract and budget effective on a date (req §19.1: latest effective date <= D).
-- Runs as the caller so RLS hides it from users without finance access.
create function public.project_amounts_as_of(p_project uuid, p_as_of date default null)
returns table (
  project_id uuid,
  as_of date,
  original_contract_paisa bigint,
  contract_paisa bigint,
  contract_revision_id uuid,
  original_budget_paisa bigint,
  budget_paisa bigint,
  budget_revision_id uuid,
  planned_margin_paisa bigint
)
language sql stable security invoker set search_path = '' as $$
  with d as (select coalesce(p_as_of, (now() at time zone 'Asia/Kathmandu')::date) as as_of),
  c as (
    select r.id, r.amount_paisa from public.contract_revisions r, d
    where r.project_id = p_project and r.effective_date <= d.as_of
    order by r.effective_date desc, r.created_at desc limit 1
  ),
  b as (
    select r.id, r.total_paisa from public.budget_revisions r, d
    where r.project_id = p_project and r.effective_date <= d.as_of
    order by r.effective_date desc, r.created_at desc limit 1
  )
  select
    p_project,
    d.as_of,
    (select amount_paisa from public.contract_revisions where project_id = p_project and is_original),
    c.amount_paisa,
    c.id,
    (select total_paisa from public.budget_revisions where project_id = p_project and is_original),
    b.total_paisa,
    b.id,
    c.amount_paisa - b.total_paisa
  from d left join c on true left join b on true
  where exists (select 1 from public.contract_revisions r where r.project_id = p_project)
$$;

create function public.next_doc_number(p_company uuid, p_kind text, p_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if not private.is_member(p_company) then
    raise exception 'Not a member of this company' using errcode = '42501';
  end if;
  insert into public.doc_sequences (company_id, kind) values (p_company, p_kind)
  on conflict (company_id, kind) do nothing;
  update public.doc_sequences set next_value = next_value + 1
  where company_id = p_company and kind = p_kind
  returning next_value - 1 into v;
  return p_prefix || '-' || lpad(v::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------------
-- Grants: functions are not callable by anon; helpers only via policies.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke execute on function private.seed_company_defaults(uuid) from authenticated;
revoke execute on function public.create_company(text, text, text) from public, anon;
revoke execute on function public.create_project(uuid, text, text, bigint, bigint, date, jsonb) from public, anon;
revoke execute on function public.add_contract_revision(uuid, date, bigint, text) from public, anon;
revoke execute on function public.add_budget_revision(uuid, date, bigint, text, jsonb) from public, anon;
revoke execute on function public.project_amounts_as_of(uuid, date) from public, anon;
revoke execute on function public.next_doc_number(uuid, text, text) from public, anon;
revoke execute on function public.mark_attachment_uploaded(uuid) from public, anon;

-- Memberships: admins may change roles and permission flags only.
revoke update on public.memberships from authenticated;
grant update (roles, can_view_finance, can_record_payments, can_approve_slips, active) on public.memberships to authenticated;
-- Attachments: only the upload marker changes, via mark_attachment_uploaded().
revoke update, delete on public.attachments from authenticated;
-- History tables: insert only.
revoke update, delete on public.contract_revisions, public.budget_revisions, public.budget_lines, public.audit_log from authenticated;
revoke insert on public.audit_log from authenticated;
