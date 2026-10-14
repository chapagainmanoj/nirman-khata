-- Platform admin (superuser) and the registration allow list.
--
-- A platform admin sees every company and how much it uses the app. New companies
-- may only be registered by a login on the allow list. Staff created by a company
-- admin are not affected: they never call create_company().
--
-- The allow list is enforced only where private.settings.registration_approval is on.
-- This migration turns it on (the hosted project); seed.sql turns it off, so local
-- dev, CI and e2e can register freely.

-- ---------------------------------------------------------------------------
-- Settings and platform admins (private: no grants, filled by hand with SQL)
-- ---------------------------------------------------------------------------
create table private.settings (
  id boolean primary key default true check (id),
  registration_approval boolean not null default true
);
insert into private.settings default values;

create table private.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function private.registration_approval_required() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select registration_approval from private.settings), true)
$$;

create function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.platform_admins where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Allow list. Phones are stored in their login-email form (977…@phone.nirmankhata.invalid).
-- ---------------------------------------------------------------------------
create table public.registration_allowlist (
  id uuid primary key default gen_random_uuid(),
  login_email text not null unique check (login_email = lower(btrim(login_email)) and login_email like '%@%'),
  note text,
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  used_company uuid references public.companies (id)
);
alter table public.registration_allowlist enable row level security;

create policy registration_allowlist_select on public.registration_allowlist
  for select to authenticated using (private.is_platform_admin());
create policy registration_allowlist_insert on public.registration_allowlist
  for insert to authenticated
  with check (private.is_platform_admin() and used_at is null and used_by is null and used_company is null);
-- Used entries are history: they cannot be removed (and so cannot be re-added unused).
create policy registration_allowlist_delete on public.registration_allowlist
  for delete to authenticated using (private.is_platform_admin() and used_at is null);

revoke all on public.registration_allowlist from anon, authenticated;
grant select, delete on public.registration_allowlist to authenticated;
grant insert (login_email, note) on public.registration_allowlist to authenticated;

-- Existing owners registered before the list existed.
insert into public.registration_allowlist (login_email, note, added_by, used_at, used_by, used_company)
select lower(btrim(u.email)), 'Registered before the allow list', null, c.created_at, c.created_by, c.id
from public.companies c
join auth.users u on u.id = c.created_by
where u.email is not null
on conflict (login_email) do nothing;

-- ---------------------------------------------------------------------------
-- create_company: claim an allow-list entry when approval is required.
-- ---------------------------------------------------------------------------
create or replace function public.create_company(p_name text, p_full_name text, p_phone text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  v_approval uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships where user_id = auth.uid() and active) then
    raise exception 'This login already belongs to a company' using errcode = 'P0001';
  end if;

  if private.registration_approval_required() then
    -- The "used_at is null" guard makes two concurrent claims of one entry safe.
    update public.registration_allowlist a
    set used_at = now(), used_by = auth.uid()
    from auth.users u
    where u.id = auth.uid() and a.login_email = lower(btrim(u.email)) and a.used_at is null
    returning a.id into v_approval;
    if v_approval is null then
      raise exception 'This phone or email is not approved to register.' using errcode = '42501';
    end if;
  end if;

  update public.profiles set full_name = p_full_name, phone = coalesce(p_phone, phone) where id = auth.uid();

  insert into public.companies (name, phone, created_by) values (p_name, p_phone, auth.uid())
  returning id into v_company;
  insert into public.memberships (company_id, user_id, roles, can_view_finance, can_record_payments, can_approve_slips, created_by)
  values (v_company, auth.uid(), array['admin']::public.app_role[], true, true, true, auth.uid());
  perform private.seed_company_defaults(v_company);

  if v_approval is not null then
    update public.registration_allowlist set used_company = v_company where id = v_approval;
  end if;
  return v_company;
end $$;

-- ---------------------------------------------------------------------------
-- Platform admin reads
-- ---------------------------------------------------------------------------
create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin()
$$;

create function public.registration_approval_required() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only a platform admin can see this' using errcode = '42501';
  end if;
  return private.registration_approval_required();
end $$;

-- Recent-activity lookups for the usage screen.
create index audit_log_company_at on public.audit_log (company_id, at desc);
create index audit_log_company_user_at on public.audit_log (company_id, user_id, at desc);

-- One row per company. "Changes" are audit_log rows (entries made), not page views.
-- Rows written in the registration transaction itself (default catalog) share the
-- company's created_at and are left out, so a new company starts at zero.
-- p_search matches the company name, owner name or owner login (a phone's digits work).
-- The app pages through the result with PostgREST's range; the order ends with the id.
create function public.platform_company_usage(p_search text default null)
returns table (
  company_id uuid,
  name text,
  created_at timestamptz,
  owner_name text,
  owner_login text,
  active_users integer,
  project_count integer,
  last_sign_in timestamptz,
  last_activity timestamptz,
  changes_7d integer,
  changes_30d integer
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.is_platform_admin() then
    raise exception 'Only a platform admin can see this' using errcode = '42501';
  end if;
  return query
  with members as (
    select m.company_id, count(*)::integer as active_users, max(u.last_sign_in_at) as last_sign_in
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.active
    group by m.company_id
  ), projects as (
    select p.company_id, count(*)::integer as project_count
    from public.projects p
    group by p.company_id
  ), activity as (
    select a.company_id,
           max(a.at) as last_activity,
           (count(*) filter (where a.at >= now() - interval '7 days'))::integer as changes_7d,
           count(*)::integer as changes_30d
    from public.audit_log a
    join public.companies c on c.id = a.company_id
    where a.at >= now() - interval '30 days' and a.at <> c.created_at
    group by a.company_id
  ), last_seen as (
    -- Last change ever, so an idle company still shows when it was last used.
    select c.id as company_id,
           (select max(a.at) from public.audit_log a where a.company_id = c.id and a.at <> c.created_at) as last_activity
    from public.companies c
  )
  select c.id, c.name, c.created_at, pr.full_name, ou.email::text,
         coalesce(mb.active_users, 0), coalesce(pj.project_count, 0), mb.last_sign_in,
         ls.last_activity, coalesce(ac.changes_7d, 0), coalesce(ac.changes_30d, 0)
  from public.companies c
  left join public.profiles pr on pr.id = c.created_by
  left join auth.users ou on ou.id = c.created_by
  left join members mb on mb.company_id = c.id
  left join projects pj on pj.company_id = c.id
  left join activity ac on ac.company_id = c.id
  left join last_seen ls on ls.company_id = c.id
  where coalesce(btrim(p_search), '') = ''
     or c.name ilike '%' || btrim(p_search) || '%'
     or pr.full_name ilike '%' || btrim(p_search) || '%'
     or ou.email ilike '%' || btrim(p_search) || '%'
  order by ls.last_activity desc nulls last, c.created_at desc, c.id;
end $$;

-- Every login of one company, with its own activity.
create function public.platform_company_users(p_company uuid)
returns table (
  user_id uuid,
  full_name text,
  login text,
  roles public.app_role[],
  active boolean,
  last_sign_in timestamptz,
  last_activity timestamptz,
  changes_30d integer
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.is_platform_admin() then
    raise exception 'Only a platform admin can see this' using errcode = '42501';
  end if;
  return query
  select m.user_id, pr.full_name, u.email::text, m.roles, m.active, u.last_sign_in_at,
         (select max(a.at) from public.audit_log a
          where a.company_id = m.company_id and a.user_id = m.user_id and a.at <> c.created_at),
         (select count(*)::integer from public.audit_log a
          where a.company_id = m.company_id and a.user_id = m.user_id and a.at <> c.created_at
            and a.at >= now() - interval '30 days')
  from public.memberships m
  join public.companies c on c.id = m.company_id
  join auth.users u on u.id = m.user_id
  left join public.profiles pr on pr.id = m.user_id
  where m.company_id = p_company
  order by m.active desc, pr.full_name;
end $$;

-- Allow-list entries already used, with the company each one registered. Company names come
-- through here because the companies policy shows a company only to its own members.
create function public.platform_used_approvals()
returns table (id uuid, login_email text, note text, used_at timestamptz, company_name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.is_platform_admin() then
    raise exception 'Only a platform admin can see this' using errcode = '42501';
  end if;
  return query
  select a.id, a.login_email, a.note, a.used_at, c.name
  from public.registration_allowlist a
  left join public.companies c on c.id = a.used_company
  where a.used_at is not null
  order by a.used_at desc, a.id;
end $$;

-- ---------------------------------------------------------------------------
-- Edge Function helpers (service role only)
-- ---------------------------------------------------------------------------
-- register: true when this login may register a company (approval off, or an unused entry).
create function public.registration_precheck(p_login_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not private.registration_approval_required()
      or exists (select 1 from public.registration_allowlist
                 where login_email = lower(btrim(p_login_email)) and used_at is null)
$$;

-- admin-users: a company admin must not reset a platform admin's password.
create function public.is_platform_admin_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.platform_admins where user_id = p_user)
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function private.registration_approval_required() from public, anon;
revoke execute on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;
revoke execute on function private.registration_approval_required() from authenticated;

revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.registration_approval_required() from public, anon;
revoke execute on function public.platform_company_usage(text) from public, anon;
revoke execute on function public.platform_company_users(uuid) from public, anon;
revoke execute on function public.platform_used_approvals() from public, anon;
grant execute on function public.platform_used_approvals() to authenticated;
grant execute on function public.is_platform_admin(), public.registration_approval_required(),
  public.platform_company_usage(text), public.platform_company_users(uuid) to authenticated;

revoke execute on function public.registration_precheck(text) from public, anon, authenticated;
revoke execute on function public.is_platform_admin_user(uuid) from public, anon, authenticated;
grant execute on function public.registration_precheck(text), public.is_platform_admin_user(uuid) to service_role;
