-- NirmanKhata milestone 3: subcontract work, own labour and other expenses (req §13-§15).
-- New parties (subcontractors, crews, payees) and documents (work charges, labour costs,
-- expenses). The money core from milestone 2 is widened from suppliers to any party:
-- payments, posting events, ledger rows, settlements, reversals and opening balances
-- carry exactly one party column, and settlements and reversals exactly one document.
-- Design: docs/technical-design.md §3.4-§3.6, §4.2-§4.3, §5, §6.

create type public.package_status as enum ('planned', 'in_progress', 'completed', 'cancelled');
create type public.rate_basis as enum ('lump_sum', 'rate');
create type public.charge_status as enum ('draft', 'approved', 'rejected', 'reversed');

-- ---------------------------------------------------------------------------
-- Parties (req §13, §14, §15). Contact details only; every member reads them.
-- ---------------------------------------------------------------------------
create table public.subcontractors (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  name text not null check (length(trim(name)) > 0),
  contact_person text,
  phone text,
  address text,
  pan_vat text,
  work_types text[] not null default '{}',
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);
create unique index subcontractors_unique_name on public.subcontractors (company_id, lower(trim(name)));

-- A crew is the payee for own labour; no worker profiles (req §14). project_id null = any project.
create table public.crews (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  name text not null check (length(trim(name)) > 0),
  project_id uuid,
  phone text,
  notes text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id),
  constraint crew_default_has_project check (not is_default or project_id is not null)
);
create unique index crews_unique_name
  on public.crews (company_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)));
create unique index crews_one_default on public.crews (project_id) where is_default;

-- Lightweight payee for expenses (JCB owner, transporter, shop). Can become a supplier later.
create table public.payees (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  name text not null check (length(trim(name)) > 0),
  phone text,
  kind text,
  notes text,
  promoted_supplier_id uuid,
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, promoted_supplier_id) references public.suppliers (company_id, id)
);
create unique index payees_unique_name on public.payees (company_id, lower(trim(name)));

-- ---------------------------------------------------------------------------
-- Subcontract work (req §13). Package scope is not financial; its terms are.
-- ---------------------------------------------------------------------------
create table public.work_packages (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  project_id uuid not null,
  subcontractor_id uuid not null,
  heading_id uuid not null,
  scope text not null check (length(trim(scope)) > 0),
  rate_basis public.rate_basis not null default 'lump_sum',
  unit_id uuid,
  planned_start date,
  planned_end date,
  status public.package_status not null default 'planned',
  progress_pct numeric(5, 2) not null default 0 check (progress_pct between 0 and 100),
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, subcontractor_id) references public.subcontractors (company_id, id),
  foreign key (company_id, heading_id) references public.cost_headings (company_id, id),
  foreign key (company_id, unit_id) references public.units (company_id, id),
  constraint package_rate_has_unit check (rate_basis = 'lump_sum' or unit_id is not null),
  constraint package_dates check (planned_end is null or planned_start is null or planned_end >= planned_start)
);
create index work_packages_project on public.work_packages (company_id, project_id);
create index work_packages_subcontractor on public.work_packages (company_id, subcontractor_id);

-- Financial (design §3.4): agreed value, and rate x quantity when the package is rate based.
create table public.work_package_terms (
  company_id uuid not null references public.companies (id),
  id uuid not null primary key, -- = work_packages.id
  agreed_value_paisa bigint not null check (agreed_value_paisa >= 0),
  rate_paisa bigint check (rate_paisa >= 0),
  quantity numeric(14, 3) check (quantity > 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, id) references public.work_packages (company_id, id) on delete cascade,
  constraint terms_rate_and_qty check ((rate_paisa is null) = (quantity is null))
);

-- A claim from the subcontractor; the approved amount is the cost (req §13, §19).
create table public.subcontract_charges (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  work_package_id uuid not null,
  project_id uuid not null,       -- copied from the package
  subcontractor_id uuid not null, -- copied from the package
  heading_id uuid not null,
  charge_date date not null,      -- date of the claim / measurement
  claim_no text,
  description text,
  claimed_paisa bigint not null check (claimed_paisa > 0),
  approved_paisa bigint check (approved_paisa > 0),
  approved_date date,             -- business date of the cost
  status public.charge_status not null default 'draft',
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  decision_note text,
  posted_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, work_package_id) references public.work_packages (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, subcontractor_id) references public.subcontractors (company_id, id),
  foreign key (company_id, heading_id) references public.cost_headings (company_id, id),
  constraint charge_approved_amount check ((status in ('approved', 'reversed')) = (approved_paisa is not null and approved_date is not null))
);
create index subcontract_charges_package on public.subcontract_charges (work_package_id);

-- ---------------------------------------------------------------------------
-- Own labour (req §14): day-wise cost per project; a weekly entry is a batch of days.
-- ---------------------------------------------------------------------------
create table public.labour_batches (
  company_id uuid not null references public.companies (id),
  id uuid not null primary key,
  project_id uuid not null,
  crew_id uuid not null,
  from_date date not null,
  to_date date not null check (to_date >= from_date),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, crew_id) references public.crews (company_id, id)
);

create table public.labour_costs (
  company_id uuid not null references public.companies (id),
  id uuid not null primary key,
  project_id uuid not null,
  crew_id uuid not null,
  heading_id uuid not null,
  work_date date not null,
  work_type text,     -- Dakarmi, Jyami, Mixed
  description text,
  headcount integer check (headcount > 0),
  person_days numeric(8, 2) check (person_days > 0),
  rate_paisa bigint check (rate_paisa > 0),
  amount_paisa bigint not null check (amount_paisa > 0),
  batch_id uuid,
  status public.doc_status not null default 'posted',
  posted_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (batch_id, work_date), -- L1: a batch has one record per day
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, crew_id) references public.crews (company_id, id),
  foreign key (company_id, heading_id) references public.cost_headings (company_id, id),
  foreign key (company_id, batch_id) references public.labour_batches (company_id, id)
);
create index labour_costs_project_date on public.labour_costs (company_id, project_id, work_date);

-- ---------------------------------------------------------------------------
-- Other project expenses (req §15)
-- ---------------------------------------------------------------------------
create table public.expenses (
  company_id uuid not null references public.companies (id),
  id uuid not null primary key,
  project_id uuid not null,
  heading_id uuid not null,
  payee_id uuid not null,
  expense_date date not null,
  amount_paisa bigint not null check (amount_paisa > 0),
  description text not null check (length(trim(description)) > 0),
  bill_no text,
  status public.doc_status not null default 'posted',
  posted_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, heading_id) references public.cost_headings (company_id, id),
  foreign key (company_id, payee_id) references public.payees (company_id, id)
);
create index expenses_project_date on public.expenses (company_id, project_id, expense_date);

-- ---------------------------------------------------------------------------
-- Money core: any party, any document (design §4.3)
-- ---------------------------------------------------------------------------
alter table public.payments
  alter column supplier_id drop not null,
  add column subcontractor_id uuid,
  add column crew_id uuid,
  add column payee_id uuid,
  add column work_package_id uuid, -- optional: an advance or payment for this package
  add foreign key (company_id, subcontractor_id) references public.subcontractors (company_id, id),
  add foreign key (company_id, crew_id) references public.crews (company_id, id),
  add foreign key (company_id, payee_id) references public.payees (company_id, id),
  add foreign key (company_id, work_package_id) references public.work_packages (company_id, id),
  add column party_id uuid generated always as (coalesce(supplier_id, subcontractor_id, crew_id, payee_id)) stored,
  add constraint payments_one_party check (num_nonnulls(supplier_id, subcontractor_id, crew_id, payee_id) = 1),
  add constraint payments_package_subcontractor check (work_package_id is null or subcontractor_id is not null);
create index payments_party on public.payments (company_id, party_id, payment_date);

alter table public.party_opening_balances
  alter column supplier_id drop not null,
  add column subcontractor_id uuid,
  add column crew_id uuid,
  add column payee_id uuid,
  add foreign key (company_id, subcontractor_id) references public.subcontractors (company_id, id),
  add foreign key (company_id, crew_id) references public.crews (company_id, id),
  add foreign key (company_id, payee_id) references public.payees (company_id, id),
  add column party_id uuid generated always as (coalesce(supplier_id, subcontractor_id, crew_id, payee_id)) stored,
  add constraint opening_balances_one_party check (num_nonnulls(supplier_id, subcontractor_id, crew_id, payee_id) = 1);
drop index public.opening_balances_one_active;
create unique index opening_balances_one_active on public.party_opening_balances (party_id) where status = 'posted';

alter table public.settlement_events
  alter column bill_id drop not null,
  add column charge_id uuid,
  add column labour_cost_id uuid,
  add column expense_id uuid,
  add foreign key (company_id, charge_id) references public.subcontract_charges (company_id, id),
  add foreign key (company_id, labour_cost_id) references public.labour_costs (company_id, id),
  add foreign key (company_id, expense_id) references public.expenses (company_id, id),
  add column doc_id uuid generated always as (coalesce(bill_id, charge_id, labour_cost_id, expense_id)) stored,
  add constraint settlement_one_document check (num_nonnulls(bill_id, charge_id, labour_cost_id, expense_id) = 1);
create index settlement_events_doc on public.settlement_events (doc_id, project_id);

alter table public.reversals
  drop constraint reversal_one_target,
  drop column target_id, -- also drops unique (company_id, target_id); re-added below
  alter column supplier_id drop not null,
  add column subcontractor_id uuid,
  add column crew_id uuid,
  add column payee_id uuid,
  add column charge_id uuid,
  add column labour_cost_id uuid,
  add column expense_id uuid,
  add foreign key (company_id, subcontractor_id) references public.subcontractors (company_id, id),
  add foreign key (company_id, crew_id) references public.crews (company_id, id),
  add foreign key (company_id, payee_id) references public.payees (company_id, id),
  add foreign key (company_id, charge_id) references public.subcontract_charges (company_id, id),
  add foreign key (company_id, labour_cost_id) references public.labour_costs (company_id, id),
  add foreign key (company_id, expense_id) references public.expenses (company_id, id),
  add column target_id uuid generated always as (
    coalesce(bill_id, payment_id, credit_id, opening_balance_id, charge_id, labour_cost_id, expense_id)) stored,
  add constraint reversals_company_id_target_id_key unique (company_id, target_id), -- C5: reversed at most once
  add constraint reversal_one_target check (
    num_nonnulls(bill_id, payment_id, credit_id, opening_balance_id, charge_id, labour_cost_id, expense_id) = 1),
  add column party_id uuid generated always as (coalesce(supplier_id, subcontractor_id, crew_id, payee_id)) stored,
  add constraint reversals_one_party check (num_nonnulls(supplier_id, subcontractor_id, crew_id, payee_id) = 1);

alter table public.posting_events
  drop constraint posting_events_event_type_check,
  drop constraint posting_event_one_source,
  drop column source_id, -- also drops unique (company_id, event_type, source_id); re-added below
  alter column supplier_id drop not null,
  add column subcontractor_id uuid,
  add column crew_id uuid,
  add column payee_id uuid,
  add column charge_id uuid,
  add column labour_cost_id uuid,
  add column expense_id uuid,
  add foreign key (company_id, subcontractor_id) references public.subcontractors (company_id, id),
  add foreign key (company_id, crew_id) references public.crews (company_id, id),
  add foreign key (company_id, payee_id) references public.payees (company_id, id),
  add foreign key (company_id, charge_id) references public.subcontract_charges (company_id, id),
  add foreign key (company_id, labour_cost_id) references public.labour_costs (company_id, id),
  add foreign key (company_id, expense_id) references public.expenses (company_id, id),
  add constraint posting_events_event_type_check check (event_type in (
    'opening_balance', 'bill_post', 'payment_post', 'allocation_move', 'credit_post', 'reversal',
    'charge_approve', 'labour_save', 'expense_save'
  )),
  add column source_id uuid generated always as (coalesce(
    opening_balance_id, bill_id, payment_id, allocation_event_id, credit_id, reversal_id,
    charge_id, labour_cost_id, expense_id)) stored,
  add constraint posting_events_company_id_event_type_source_id_key unique (company_id, event_type, source_id), -- I-12
  add constraint posting_event_one_source check (num_nonnulls(
    opening_balance_id, bill_id, payment_id, allocation_event_id, credit_id, reversal_id,
    charge_id, labour_cost_id, expense_id) = 1),
  add column party_id uuid generated always as (coalesce(supplier_id, subcontractor_id, crew_id, payee_id)) stored,
  add constraint posting_events_one_party check (num_nonnulls(supplier_id, subcontractor_id, crew_id, payee_id) = 1);

alter table public.ledger_entries
  alter column supplier_id drop not null,
  add column subcontractor_id uuid,
  add column crew_id uuid,
  add column payee_id uuid,
  add foreign key (company_id, subcontractor_id) references public.subcontractors (company_id, id),
  add foreign key (company_id, crew_id) references public.crews (company_id, id),
  add foreign key (company_id, payee_id) references public.payees (company_id, id),
  add column party_id uuid generated always as (coalesce(supplier_id, subcontractor_id, crew_id, payee_id)) stored,
  add constraint ledger_one_party check (num_nonnulls(supplier_id, subcontractor_id, crew_id, payee_id) = 1);
create index ledger_party_date on public.ledger_entries (company_id, party_id, business_date);

-- Attachments: agreement/measurement, claim, labour and expense receipts.
alter table public.attachments
  add column work_package_id uuid,
  add column charge_id uuid,
  add column labour_cost_id uuid,
  add column expense_id uuid,
  add foreign key (company_id, work_package_id) references public.work_packages (company_id, id),
  add foreign key (company_id, charge_id) references public.subcontract_charges (company_id, id) on delete cascade,
  add foreign key (company_id, labour_cost_id) references public.labour_costs (company_id, id),
  add foreign key (company_id, expense_id) references public.expenses (company_id, id),
  drop constraint attachments_one_owner,
  add constraint attachments_one_owner check (num_nonnulls(
    contract_revision_id, budget_revision_id, delivery_id, bill_id, payment_id,
    work_package_id, charge_id, labour_cost_id, expense_id) = 1);
create index attachments_work_package on public.attachments (work_package_id) where work_package_id is not null;
create index attachments_charge on public.attachments (charge_id) where charge_id is not null;
create index attachments_labour on public.attachments (labour_cost_id) where labour_cost_id is not null;
create index attachments_expense on public.attachments (expense_id) where expense_id is not null;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'subcontractors', 'crews', 'payees', 'work_packages', 'work_package_terms', 'subcontract_charges',
    'labour_costs', 'expenses'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit()', t);
  end loop;
  foreach t in array array[
    'subcontractors', 'crews', 'payees', 'work_packages', 'work_package_terms', 'subcontract_charges',
    'labour_batches', 'labour_costs', 'expenses'
  ] loop
    execute format('create trigger set_created_by before insert on public.%I for each row execute function private.set_created_by()', t);
  end loop;
end $$;

-- An approved work charge is posted: like a posted bill, only its status may change after that.
-- Generated columns (party_id) are not computed yet in NEW inside a before trigger, so
-- they are left out of the comparison.
create or replace function private.guard_posted_document() returns trigger
language plpgsql as $$
declare
  v_skip text[] := array['status', 'updated_at'] || array(
    select a.attname::text from pg_attribute a where a.attrelid = tg_relid and a.attgenerated <> '');
begin
  if tg_op = 'DELETE' then
    if old.status::text in ('posted', 'approved', 'reversed') then
      raise exception 'Posted records cannot be deleted; reverse them instead' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status::text = 'reversed' then
    raise exception 'A reversed record cannot be changed' using errcode = 'P0001';
  end if;
  if old.status::text in ('posted', 'approved') and (
    new.status::text not in (old.status::text, 'reversed')
    or (to_jsonb(new) - v_skip) is distinct from (to_jsonb(old) - v_skip)
  ) then
    raise exception 'Posted records change only by reversal or credit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger guard_posted before update or delete on public.subcontract_charges
  for each row execute function private.guard_posted_document();
create trigger guard_posted before update or delete on public.labour_costs
  for each row execute function private.guard_posted_document();
create trigger guard_posted before update or delete on public.expenses
  for each row execute function private.guard_posted_document();
create trigger no_change before update or delete on public.labour_batches
  for each row execute function private.reject_change();

-- One default crew per project, made when the project is created (req §14).
create function private.add_default_crew() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.crews (company_id, name, project_id, is_default, created_by)
  values (new.company_id, 'Site crew', new.id, true, new.created_by)
  on conflict do nothing;
  return new;
end $$;
create trigger default_crew after insert on public.projects
  for each row execute function private.add_default_crew();
insert into public.crews (company_id, name, project_id, is_default, created_by)
select p.company_id, 'Site crew', p.id, true, p.created_by from public.projects p
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Access helpers (design §3.5 X2)
-- ---------------------------------------------------------------------------

-- Which kind of party an id belongs to (ids are unique across tables).
create function private.party_kind(p_party uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.suppliers where id = p_party) then 'supplier'
    when exists (select 1 from public.subcontractors where id = p_party) then 'subcontractor'
    when exists (select 1 from public.crews where id = p_party) then 'crew'
    when exists (select 1 from public.payees where id = p_party) then 'payee'
  end
$$;

-- X2: the creator of a labour cost or expense reads that entry's amount and photo for
-- 7 days while it is not reversed and they can still see its project. Pay now settles an
-- entry at save, so "settled" does not end X2 (it would hide the entry just saved).
create function private.is_own_recent_entry(
  p_company uuid, p_project uuid, p_created_by uuid, p_created_at timestamptz, p_status public.doc_status
) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_created_by = auth.uid() and p_status = 'posted' and p_created_at > now() - interval '7 days'
    and private.is_member(p_company) and private.can_see_project(p_company, p_project)
$$;

create function private.can_see_project_money(p_company uuid, p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.sees_all_projects(p_company)
    or (private.can_see_finance(p_company) and private.can_see_project(p_company, p_project))
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.subcontractors enable row level security;
alter table public.crews enable row level security;
alter table public.payees enable row level security;
alter table public.work_packages enable row level security;
alter table public.work_package_terms enable row level security;
alter table public.subcontract_charges enable row level security;
alter table public.labour_batches enable row level security;
alter table public.labour_costs enable row level security;
alter table public.expenses enable row level security;

create policy subcontractors_select on public.subcontractors for select to authenticated
  using (private.is_member(company_id));
create policy subcontractors_insert on public.subcontractors for insert to authenticated
  with check (private.can_manage_parties(company_id));
create policy subcontractors_update on public.subcontractors for update to authenticated
  using (private.can_manage_parties(company_id)) with check (private.can_manage_parties(company_id));

create policy payees_select on public.payees for select to authenticated
  using (private.is_member(company_id));
create policy payees_update on public.payees for update to authenticated
  using (private.can_manage_parties(company_id)) with check (private.can_manage_parties(company_id));

create policy crews_select on public.crews for select to authenticated
  using (private.is_member(company_id) and (project_id is null or private.can_see_project(company_id, project_id)));
create policy crews_insert on public.crews for insert to authenticated
  with check (
    not is_default and private.can_manage_parties(company_id)
    and (project_id is null or private.can_see_project(company_id, project_id))
  );
create policy crews_update on public.crews for update to authenticated
  using (private.can_manage_parties(company_id) and (project_id is null or private.can_see_project(company_id, project_id)))
  with check (private.can_manage_parties(company_id) and (project_id is null or private.can_see_project(company_id, project_id)));

create policy work_packages_select on public.work_packages for select to authenticated
  using (private.can_see_project(company_id, project_id));
create policy work_package_terms_select on public.work_package_terms for select to authenticated
  using (exists (
    select 1 from public.work_packages p
    where p.id = work_package_terms.id and private.can_see_project_money(p.company_id, p.project_id)
  ));
create policy subcontract_charges_select on public.subcontract_charges for select to authenticated
  using (private.can_see_project_money(company_id, project_id));

create policy labour_batches_select on public.labour_batches for select to authenticated
  using (private.can_see_project(company_id, project_id));
create policy labour_costs_select on public.labour_costs for select to authenticated
  using (
    private.can_see_project_money(company_id, project_id)
    or private.is_own_recent_entry(company_id, project_id, created_by, created_at, status)
  );
create policy expenses_select on public.expenses for select to authenticated
  using (
    private.can_see_project_money(company_id, project_id)
    or private.is_own_recent_entry(company_id, project_id, created_by, created_at, status)
  );

-- Payees are created by save_expense or by party managers through promote/create functions.
revoke insert, delete on public.payees from authenticated, anon;
revoke delete on public.subcontractors, public.crews from authenticated, anon;
revoke insert, update, delete on
  public.work_packages, public.work_package_terms, public.subcontract_charges,
  public.labour_batches, public.labour_costs, public.expenses
from authenticated, anon;
