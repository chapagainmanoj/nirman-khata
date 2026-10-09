-- NirmanKhata milestone 2: supplier loop tables.
-- Suppliers, order slips, deliveries, returns, bills, payments, settlement, credits,
-- reversals and the money core (operations, posting events, ledger).
-- Design: docs/technical-design.md sections 3.4-3.7, 4.2-4.4 and 5.
-- Functions that write these tables are in the next migration.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.doc_status as enum ('posted', 'reversed');
create type public.slip_status as enum ('draft', 'pending', 'approved', 'rejected', 'cancelled');
create type public.bill_status as enum ('draft', 'under_review', 'posted', 'reversed');
create type public.bill_line_type as enum ('material', 'charge');
create type public.bill_charge as enum ('discount', 'transport', 'vat');
create type public.payment_method as enum ('cash', 'bank_transfer', 'cheque', 'wallet', 'other');
create type public.delivery_issue as enum ('shortage', 'damage', 'rejected', 'spec_difference', 'other');

-- ---------------------------------------------------------------------------
-- More access helpers (design §3.3, §3.6)
-- ---------------------------------------------------------------------------

-- Can add records on a project: project access and any role except Viewer.
create function private.can_work_on_project(p_company uuid, p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_see_project(p_company, p_project)
    and exists (
      select 1 from public.memberships m
      where m.company_id = p_company and m.user_id = auth.uid() and m.active
        and m.roles && array['admin', 'project_manager', 'site_staff', 'accounts']::public.app_role[]
    )
$$;

-- Post bills, credits and reversals; see unallocated amounts and company balances (Admin, Accounts).
create function private.can_post(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.sees_all_projects(p_company)
$$;

create function private.can_record_payments(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company and m.user_id = auth.uid() and m.active
      and (m.can_record_payments or m.roles && array['admin', 'accounts']::public.app_role[])
  )
$$;

-- Suppliers are shared across projects; Admin, PM and Accounts keep the list.
create function private.can_manage_parties(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company and m.user_id = auth.uid() and m.active
      and m.roles && array['admin', 'project_manager', 'accounts']::public.app_role[]
  )
$$;

-- ---------------------------------------------------------------------------
-- Suppliers and opening balances (req §8.2)
-- ---------------------------------------------------------------------------
create table public.suppliers (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  name text not null check (length(trim(name)) > 0),
  contact_person text,
  phone text,
  address text,
  pan_vat text,
  categories text[] not null default '{}',
  payment_terms text,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);
create unique index suppliers_unique_name on public.suppliers (company_id, lower(trim(name)));

-- Financial: Admin and Accounts only (design §3.4). Positive = company owes (baki).
create table public.party_opening_balances (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  supplier_id uuid not null,
  cutover_date date not null,
  amount_paisa bigint not null check (amount_paisa <> 0),
  note text not null check (length(trim(note)) > 0),
  status public.doc_status not null default 'posted',
  posted_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id)
);
create unique index opening_balances_one_active on public.party_opening_balances (supplier_id) where status = 'posted';

-- ---------------------------------------------------------------------------
-- Order slips (req §9). Never cost or payable (I-1).
-- ---------------------------------------------------------------------------
create table public.order_slips (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  number text not null,
  supplier_id uuid not null,
  request_date date not null,
  required_date date,
  delivery_instructions text,
  site_contact text,
  notes text,
  status public.slip_status not null default 'draft',
  submitted_at timestamptz,
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  rejected_reason text,
  cancelled_reason text,
  sent_at timestamptz,
  sent_by uuid references auth.users (id),
  sent_via text,
  closed_short_at timestamptz,
  closed_short_reason text,
  closed_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, number),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id)
);

create table public.order_slip_lines (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  slip_id uuid not null,
  project_id uuid not null,
  material_id uuid,
  material_text text, -- typed by staff when the material is not in the catalog (req §8.1)
  spec text,
  qty numeric(14, 3) not null check (qty > 0),
  unit_id uuid not null,
  unit_note text,
  note text,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, slip_id) references public.order_slips (company_id, id) on delete cascade,
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, material_id) references public.materials (company_id, id),
  foreign key (company_id, unit_id) references public.units (company_id, id),
  constraint slip_line_material check (material_id is not null or coalesce(trim(material_text), '') <> '')
);
create index order_slip_lines_slip on public.order_slip_lines (slip_id);

-- Estimated rate is financial (design §3.4): a separate table, id = slip line id.
create table public.order_slip_line_prices (
  company_id uuid not null references public.companies (id),
  id uuid not null primary key,
  est_rate_paisa bigint not null check (est_rate_paisa >= 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, id) references public.order_slip_lines (company_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Deliveries (challan) and returns (req §10, §20). Quantities only.
-- ---------------------------------------------------------------------------
create table public.deliveries (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  supplier_id uuid not null,
  project_id uuid not null,
  slip_id uuid,
  challan_no text,
  receipt_date date not null,
  received_by uuid not null references auth.users (id),
  no_slip_reason text,
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, slip_id) references public.order_slips (company_id, id),
  constraint delivery_slip_or_reason check (slip_id is not null or coalesce(trim(no_slip_reason), '') <> '')
);
create index deliveries_project_date on public.deliveries (company_id, project_id, receipt_date);

create table public.delivery_lines (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  delivery_id uuid not null,
  slip_line_id uuid,
  material_id uuid,
  material_text text,
  spec text,
  unit_id uuid not null,
  unit_note text,
  received_qty numeric(14, 3) not null check (received_qty > 0),
  rejected_qty numeric(14, 3) not null default 0 check (rejected_qty >= 0 and rejected_qty <= received_qty),
  accepted_qty numeric(14, 3) generated always as (received_qty - rejected_qty) stored,
  issue public.delivery_issue,
  note text,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, delivery_id) references public.deliveries (company_id, id) on delete cascade,
  foreign key (company_id, slip_line_id) references public.order_slip_lines (company_id, id),
  foreign key (company_id, material_id) references public.materials (company_id, id),
  foreign key (company_id, unit_id) references public.units (company_id, id),
  constraint delivery_line_material check (material_id is not null or coalesce(trim(material_text), '') <> '')
);
create index delivery_lines_delivery on public.delivery_lines (delivery_id);
create index delivery_lines_slip_line on public.delivery_lines (slip_line_id);

create table public.supplier_returns (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  supplier_id uuid not null,
  project_id uuid not null,
  return_date date not null,
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id)
);

create table public.supplier_return_lines (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  return_id uuid not null,
  delivery_line_id uuid not null,
  qty numeric(14, 3) not null check (qty > 0),
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, return_id) references public.supplier_returns (company_id, id),
  foreign key (company_id, delivery_line_id) references public.delivery_lines (company_id, id)
);
create index return_lines_delivery_line on public.supplier_return_lines (delivery_line_id);

-- ---------------------------------------------------------------------------
-- Supplier bills (req §11). The header has no amounts; amounts live in
-- supplier_bill_charges and bill_lines so RLS can hide them (design §3.4).
-- ---------------------------------------------------------------------------
create table public.supplier_bills (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  supplier_id uuid not null,
  bill_no text not null check (length(trim(bill_no)) > 0),
  bill_date date not null,
  cost_date date not null,
  due_date date,
  vat_treatment public.vat_treatment not null, -- copied from the company when the draft is created (I-3)
  status public.bill_status not null default 'draft',
  notes text,
  submitted_at timestamptz,
  posted_at timestamptz,
  posted_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id)
);
create index supplier_bills_supplier on public.supplier_bills (company_id, supplier_id, bill_date);

-- Header amounts: visible only with access to every project on the bill (design §3.4).
create table public.supplier_bill_charges (
  company_id uuid not null references public.companies (id),
  id uuid not null primary key, -- = bill id
  discount_paisa bigint not null default 0 check (discount_paisa >= 0),
  transport_paisa bigint not null default 0 check (transport_paisa >= 0),
  vat_paisa bigint not null default 0 check (vat_paisa >= 0),
  vat_rate_pct numeric(5, 2) not null default 13 check (vat_rate_pct >= 0),
  total_paisa bigint, -- set when posted
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, id) references public.supplier_bills (company_id, id) on delete cascade
);

create table public.bill_lines (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  bill_id uuid not null,
  line_type public.bill_line_type not null default 'material',
  project_id uuid not null,
  heading_id uuid not null,
  material_id uuid,
  description text,
  qty numeric(14, 3) check (qty > 0),
  unit_id uuid,
  unit_note text,
  rate_paisa bigint check (rate_paisa >= 0),
  amount_paisa bigint not null check (amount_paisa >= 0),
  -- Set by post_bill (I-2, I-3).
  discount_share_paisa bigint,
  transport_share_paisa bigint,
  vat_share_paisa bigint,
  payable_amount_paisa bigint,
  cost_amount_paisa bigint,
  unmatched_reason text,
  rate_variance_reason text,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, bill_id) references public.supplier_bills (company_id, id) on delete cascade,
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, heading_id) references public.cost_headings (company_id, id),
  foreign key (company_id, material_id) references public.materials (company_id, id),
  foreign key (company_id, unit_id) references public.units (company_id, id),
  constraint bill_line_material check (
    line_type = 'charge'
    or (qty is not null and unit_id is not null and (material_id is not null or coalesce(trim(description), '') <> ''))
  )
);
create index bill_lines_bill on public.bill_lines (bill_id);

-- Explicit per-project amounts for a header charge (e.g. transport only for Project A).
create table public.bill_charge_overrides (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  bill_id uuid not null,
  charge public.bill_charge not null,
  project_id uuid not null,
  amount_paisa bigint not null check (amount_paisa >= 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (bill_id, charge, project_id),
  foreign key (company_id, bill_id) references public.supplier_bills (company_id, id) on delete cascade,
  foreign key (company_id, project_id) references public.projects (company_id, id)
);

-- Bill line <-> delivery line matches. Quantities only, so project access is enough to read.
create table public.bill_line_delivery_lines (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  bill_line_id uuid not null,
  delivery_line_id uuid not null,
  project_id uuid not null, -- copied from the bill line for RLS
  billed_qty numeric(14, 3) not null check (billed_qty > 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (bill_line_id, delivery_line_id),
  foreign key (company_id, bill_line_id) references public.bill_lines (company_id, id) on delete cascade,
  foreign key (company_id, delivery_line_id) references public.delivery_lines (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id)
);
create index bill_matches_delivery_line on public.bill_line_delivery_lines (delivery_line_id);

-- ---------------------------------------------------------------------------
-- Payments, project allocation, settlement (req §12, design §5.3)
-- ---------------------------------------------------------------------------
create table public.payments (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  number text not null,
  supplier_id uuid not null,
  payment_date date not null,
  amount_paisa bigint not null check (amount_paisa > 0),
  method public.payment_method not null default 'cash',
  reference text,
  notes text,
  status public.doc_status not null default 'posted',
  posted_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, number),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id)
);
create index payments_supplier on public.payments (company_id, supplier_id, payment_date);

-- Append-only. Current allocation of a payment to a project = sum of its events.
create table public.payment_allocation_events (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  payment_id uuid not null,
  project_id uuid not null,
  amount_paisa bigint not null check (amount_paisa <> 0),
  business_date date not null, -- the payment's date (I-9)
  posted_at timestamptz not null default now(),
  reason text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, payment_id) references public.payments (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id)
);
create index allocation_events_payment on public.payment_allocation_events (payment_id, project_id);

-- Append-only. Bill settled from a payment's project allocation; negative = unsettle.
create table public.settlement_events (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  payment_id uuid not null,
  project_id uuid not null,
  bill_id uuid not null, -- later milestones add charge/labour/expense columns with an exactly-one check
  amount_paisa bigint not null check (amount_paisa <> 0),
  business_date date not null,
  posted_at timestamptz not null default now(),
  op_key uuid,
  reason text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, payment_id) references public.payments (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, bill_id) references public.supplier_bills (company_id, id)
);
create index settlement_events_bill on public.settlement_events (bill_id, project_id);
create index settlement_events_payment on public.settlement_events (payment_id, project_id);

-- ---------------------------------------------------------------------------
-- Credits and reversals (req §20, design §5.4)
-- ---------------------------------------------------------------------------
create table public.credits (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  number text not null,
  supplier_id uuid not null,
  bill_id uuid not null,
  credit_date date not null,
  reason text not null check (length(trim(reason)) > 0),
  supplier_credit_no text,
  status public.doc_status not null default 'posted',
  posted_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, number),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  foreign key (company_id, bill_id) references public.supplier_bills (company_id, id)
);

create table public.credit_lines (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  credit_id uuid not null,
  bill_line_id uuid not null,
  project_id uuid not null,
  heading_id uuid not null,
  amount_paisa bigint not null check (amount_paisa > 0), -- reduces payable
  cost_paisa bigint not null check (cost_paisa >= 0),    -- reduces cost
  supplier_return_line_id uuid,
  credited_qty numeric(14, 3) check (credited_qty > 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, credit_id) references public.credits (company_id, id),
  foreign key (company_id, bill_line_id) references public.bill_lines (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, heading_id) references public.cost_headings (company_id, id),
  foreign key (company_id, supplier_return_line_id) references public.supplier_return_lines (company_id, id),
  constraint credit_line_return_qty check ((supplier_return_line_id is null) = (credited_qty is null))
);
create index credit_lines_bill_line on public.credit_lines (bill_line_id);
create index credit_lines_return_line on public.credit_lines (supplier_return_line_id);

create table public.reversals (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  supplier_id uuid not null,
  bill_id uuid,
  payment_id uuid,
  credit_id uuid,
  opening_balance_id uuid,
  target_id uuid generated always as (coalesce(bill_id, payment_id, credit_id, opening_balance_id)) stored,
  reversal_date date not null,
  reason text not null check (length(trim(reason)) > 0),
  posted_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, target_id), -- a document is reversed at most once (C5)
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  foreign key (company_id, bill_id) references public.supplier_bills (company_id, id),
  foreign key (company_id, payment_id) references public.payments (company_id, id),
  foreign key (company_id, credit_id) references public.credits (company_id, id),
  foreign key (company_id, opening_balance_id) references public.party_opening_balances (company_id, id),
  constraint reversal_one_target check (num_nonnulls(bill_id, payment_id, credit_id, opening_balance_id) = 1)
);

-- ---------------------------------------------------------------------------
-- Money core (design §4.3, §5.1)
-- ---------------------------------------------------------------------------

-- Idempotency: one row per op_key; the stored result answers retries.
create table public.operations (
  company_id uuid not null references public.companies (id),
  op_key uuid not null,
  kind text not null,
  request_hash text not null,
  user_id uuid not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (company_id, op_key)
);

create table public.posting_events (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  event_type text not null check (event_type in (
    'opening_balance', 'bill_post', 'payment_post', 'allocation_move', 'credit_post', 'reversal'
  )),
  supplier_id uuid not null,
  opening_balance_id uuid,
  bill_id uuid,
  payment_id uuid,
  allocation_event_id uuid,
  credit_id uuid,
  reversal_id uuid,
  source_id uuid generated always as (
    coalesce(opening_balance_id, bill_id, payment_id, allocation_event_id, credit_id, reversal_id)
  ) stored,
  business_date date not null,
  posted_at timestamptz not null default now(),
  op_key uuid,
  reversed_event_ids uuid[], -- reversal events: the events whose rows they negate (§4.3)
  created_by uuid references auth.users (id),
  unique (company_id, id),
  unique (company_id, event_type, source_id), -- I-12: each source posted once per type
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  foreign key (company_id, opening_balance_id) references public.party_opening_balances (company_id, id),
  foreign key (company_id, bill_id) references public.supplier_bills (company_id, id),
  foreign key (company_id, payment_id) references public.payments (company_id, id),
  foreign key (company_id, allocation_event_id) references public.payment_allocation_events (company_id, id),
  foreign key (company_id, credit_id) references public.credits (company_id, id),
  foreign key (company_id, reversal_id) references public.reversals (company_id, id),
  constraint posting_event_one_source check (
    num_nonnulls(opening_balance_id, bill_id, payment_id, allocation_event_id, credit_id, reversal_id) = 1
  )
);

create table public.ledger_entries (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  event_id uuid not null,
  event_type text not null,
  component_key text not null,
  business_date date not null,
  posted_at timestamptz not null,
  project_id uuid, -- null = the supplier's unallocated bucket
  heading_id uuid,
  supplier_id uuid not null,
  cost_paisa bigint not null default 0,
  balance_paisa bigint not null default 0, -- positive = owed to the supplier (baki)
  cash_paisa bigint not null default 0,
  unique (company_id, id),
  unique (event_id, component_key), -- I-12
  foreign key (company_id, event_id) references public.posting_events (company_id, id),
  foreign key (company_id, project_id) references public.projects (company_id, id),
  foreign key (company_id, heading_id) references public.cost_headings (company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  -- I-6: payments and allocation moves never create cost.
  constraint ledger_payments_no_cost check (event_type not in ('payment_post', 'allocation_move') or cost_paisa = 0),
  -- Cost always sits on a project.
  constraint ledger_cost_has_project check (cost_paisa = 0 or project_id is not null)
);
create index ledger_supplier_date on public.ledger_entries (company_id, supplier_id, business_date);
create index ledger_project_date on public.ledger_entries (company_id, project_id, business_date);
create index ledger_event on public.ledger_entries (event_id);

-- I-7: no posting may touch a closed project.
create function private.ledger_project_open() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is not null and exists (
    select 1 from public.projects p where p.id = new.project_id and p.status = 'closed'
  ) then
    raise exception 'This project is closed. Reopen it before posting.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger project_open before insert on public.ledger_entries
  for each row execute function private.ledger_project_open();

-- ---------------------------------------------------------------------------
-- In-app notifications (req §18.4)
-- ---------------------------------------------------------------------------
create table public.notifications (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users (id),
  kind text not null,
  slip_id uuid,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, slip_id) references public.order_slips (company_id, id) on delete cascade
);
create index notifications_user on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Attachments: new owners (challan photo, bill photo, payment proof)
-- ---------------------------------------------------------------------------
alter table public.attachments
  add column delivery_id uuid,
  add column bill_id uuid,
  add column payment_id uuid,
  add foreign key (company_id, delivery_id) references public.deliveries (company_id, id),
  add foreign key (company_id, bill_id) references public.supplier_bills (company_id, id) on delete cascade,
  add foreign key (company_id, payment_id) references public.payments (company_id, id),
  drop constraint attachments_one_owner,
  add constraint attachments_one_owner
    check (num_nonnulls(contract_revision_id, budget_revision_id, delivery_id, bill_id, payment_id) = 1);
create index attachments_delivery on public.attachments (delivery_id) where delivery_id is not null;
create index attachments_bill on public.attachments (bill_id) where bill_id is not null;
create index attachments_payment on public.attachments (payment_id) where payment_id is not null;

-- ---------------------------------------------------------------------------
-- Triggers: updated_at, audit, created_by
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  -- Documents: audited.
  foreach t in array array[
    'suppliers', 'party_opening_balances', 'order_slips', 'order_slip_lines', 'order_slip_line_prices',
    'deliveries', 'delivery_lines', 'supplier_returns', 'supplier_return_lines', 'supplier_bills',
    'supplier_bill_charges', 'bill_lines', 'bill_charge_overrides', 'bill_line_delivery_lines', 'payments',
    'credits'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit()', t);
  end loop;
  -- Append-only records: created_by/posted_at say who and when; no audit copy needed.
  foreach t in array array[
    'suppliers', 'party_opening_balances', 'order_slips', 'order_slip_lines', 'order_slip_line_prices',
    'deliveries', 'delivery_lines', 'supplier_returns', 'supplier_return_lines', 'supplier_bills',
    'supplier_bill_charges', 'bill_lines', 'bill_charge_overrides', 'bill_line_delivery_lines', 'payments',
    'payment_allocation_events', 'settlement_events', 'credits', 'credit_lines', 'reversals', 'posting_events'
  ] loop
    execute format('create trigger set_created_by before insert on public.%I for each row execute function private.set_created_by()', t);
  end loop;
end $$;

-- I-11: posted money records are never changed or deleted, even by the owner role.
create trigger no_change before update or delete on public.posting_events
  for each row execute function private.reject_change();
create trigger no_change before update or delete on public.ledger_entries
  for each row execute function private.reject_change();
create trigger no_change before update or delete on public.payment_allocation_events
  for each row execute function private.reject_change();
create trigger no_change before update or delete on public.settlement_events
  for each row execute function private.reject_change();
create trigger no_change before update or delete on public.credit_lines
  for each row execute function private.reject_change();
create trigger no_change before update or delete on public.reversals
  for each row execute function private.reject_change();

-- Documents: only the status (and its stamp) may change once posted.
create function private.guard_posted_document() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status::text in ('posted', 'reversed') then
      raise exception 'Posted records cannot be deleted; reverse them instead' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status::text = 'reversed' then
    raise exception 'A reversed record cannot be changed' using errcode = 'P0001';
  end if;
  if old.status::text = 'posted' and (
    new.status::text not in ('posted', 'reversed')
    or (to_jsonb(new) - array['status', 'updated_at']) is distinct from (to_jsonb(old) - array['status', 'updated_at'])
  ) then
    raise exception 'Posted records change only by reversal or credit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger guard_posted before update or delete on public.supplier_bills
  for each row execute function private.guard_posted_document();
create trigger guard_posted before update or delete on public.payments
  for each row execute function private.guard_posted_document();
create trigger guard_posted before update or delete on public.credits
  for each row execute function private.guard_posted_document();
create trigger guard_posted before update or delete on public.party_opening_balances
  for each row execute function private.guard_posted_document();

-- Bill parts are frozen once the bill leaves draft/review.
create function private.guard_bill_part() returns trigger
language plpgsql as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_bill uuid;
  v_status public.bill_status;
begin
  if tg_table_name = 'supplier_bill_charges' then
    v_bill := (v_row ->> 'id')::uuid;
  elsif tg_table_name = 'bill_line_delivery_lines' then
    select l.bill_id into v_bill from public.bill_lines l where l.id = (v_row ->> 'bill_line_id')::uuid;
  else
    v_bill := (v_row ->> 'bill_id')::uuid;
  end if;
  select status into v_status from public.supplier_bills where id = v_bill;
  -- post_bill fills in the line shares and charge total before it flips the status.
  if v_status in ('posted', 'reversed') then
    raise exception 'A posted bill cannot be edited; use a credit or reversal' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_bill before insert or update or delete on public.supplier_bill_charges
  for each row execute function private.guard_bill_part();
create trigger guard_bill before insert or update or delete on public.bill_lines
  for each row execute function private.guard_bill_part();
create trigger guard_bill before insert or update or delete on public.bill_charge_overrides
  for each row execute function private.guard_bill_part();
create trigger guard_bill before insert or update or delete on public.bill_line_delivery_lines
  for each row execute function private.guard_bill_part();

-- ---------------------------------------------------------------------------
-- Visibility helpers for documents spanning several projects (design §3.4, §3.5)
-- ---------------------------------------------------------------------------

-- The caller can see at least one project on the slip.
create function private.can_see_slip(p_slip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.order_slips s
    where s.id = p_slip and private.is_member(s.company_id)
      and (
        s.created_by = auth.uid()
        or private.sees_all_projects(s.company_id)
        -- Other people's drafts stay private until submitted.
        or (s.status <> 'draft' and exists (
          select 1 from public.order_slip_lines l
          where l.slip_id = s.id and private.can_see_project(l.company_id, l.project_id)
        ))
      )
  )
$$;

-- The caller can currently see every project on the slip (share/print, approve; S4).
create function private.can_see_whole_slip(p_slip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.order_slips s where s.id = p_slip and private.is_member(s.company_id))
    and not exists (
      select 1 from public.order_slip_lines l
      where l.slip_id = p_slip and not private.can_see_project(l.company_id, l.project_id)
    )
$$;

create function private.bill_has_visible_project(p_bill uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bill_lines l
    where l.bill_id = p_bill and private.can_see_project(l.company_id, l.project_id)
  )
$$;

create function private.can_see_whole_bill(p_bill uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bill_lines l where l.bill_id = p_bill)
    and not exists (
      select 1 from public.bill_lines l
      where l.bill_id = p_bill and not private.can_see_project(l.company_id, l.project_id)
    )
$$;

-- X1: the creator of a draft bill reads and edits it while they can see all its projects.
create function private.is_own_draft_bill(p_bill uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.supplier_bills b
    where b.id = p_bill and b.status = 'draft' and b.created_by = auth.uid()
      and private.is_member(b.company_id)
      and not exists (
        select 1 from public.bill_lines l
        where l.bill_id = b.id and not private.can_see_project(l.company_id, l.project_id)
      )
  )
$$;

-- Header amounts of a bill: Admin/Accounts, X1, or finance + every project on it.
create function private.can_see_bill_amounts(p_bill uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.supplier_bills b
    where b.id = p_bill and (
      private.sees_all_projects(b.company_id)
      or private.is_own_draft_bill(b.id)
      or (private.can_see_finance(b.company_id) and private.can_see_whole_bill(b.id))
    )
  )
$$;

-- A payment amount: Admin/Accounts, or finance + fully allocated to projects the caller sees.
create function private.can_see_payment(p_payment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.payments p
    where p.id = p_payment and (
      private.sees_all_projects(p.company_id)
      or (
        private.can_see_finance(p.company_id)
        and p.amount_paisa = (
          select coalesce(sum(e.amount_paisa), 0) from public.payment_allocation_events e where e.payment_id = p.id)
        and not exists (
          select 1 from public.payment_allocation_events e
          where e.payment_id = p.id and not private.can_see_project(e.company_id, e.project_id)
        )
      )
    )
  )
$$;

create function private.credit_has_visible_project(p_credit uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.credit_lines l
    where l.credit_id = p_credit and private.can_see_project(l.company_id, l.project_id)
  )
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- Writes go through the functions in the next migration (security definer);
-- tables without insert/update/delete policies cannot be written by clients.
-- ---------------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.party_opening_balances enable row level security;
alter table public.order_slips enable row level security;
alter table public.order_slip_lines enable row level security;
alter table public.order_slip_line_prices enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_lines enable row level security;
alter table public.supplier_returns enable row level security;
alter table public.supplier_return_lines enable row level security;
alter table public.supplier_bills enable row level security;
alter table public.supplier_bill_charges enable row level security;
alter table public.bill_lines enable row level security;
alter table public.bill_charge_overrides enable row level security;
alter table public.bill_line_delivery_lines enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocation_events enable row level security;
alter table public.settlement_events enable row level security;
alter table public.credits enable row level security;
alter table public.credit_lines enable row level security;
alter table public.reversals enable row level security;
alter table public.operations enable row level security;
alter table public.posting_events enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.notifications enable row level security;

-- Suppliers: contact details are not financial; every member reads.
create policy suppliers_select on public.suppliers for select to authenticated
  using (private.is_member(company_id));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (private.can_manage_parties(company_id));
create policy suppliers_update on public.suppliers for update to authenticated
  using (private.can_manage_parties(company_id)) with check (private.can_manage_parties(company_id));

create policy opening_balances_select on public.party_opening_balances for select to authenticated
  using (private.can_post(company_id));

-- Slips: header if any line is visible (or own draft); lines by project; rates need finance.
create policy order_slips_select on public.order_slips for select to authenticated
  using (private.can_see_slip(id));
create policy order_slip_lines_select on public.order_slip_lines for select to authenticated
  using (private.can_see_project(company_id, project_id) and private.can_see_slip(slip_id));
create policy order_slip_line_prices_select on public.order_slip_line_prices for select to authenticated
  using (
    private.can_see_finance(company_id)
    and exists (select 1 from public.order_slip_lines l where l.id = order_slip_line_prices.id)
  );

-- Deliveries and returns: quantities; project access.
create policy deliveries_select on public.deliveries for select to authenticated
  using (private.can_see_project(company_id, project_id));
create policy delivery_lines_select on public.delivery_lines for select to authenticated
  using (exists (select 1 from public.deliveries d where d.id = delivery_lines.delivery_id));
create policy supplier_returns_select on public.supplier_returns for select to authenticated
  using (private.can_see_project(company_id, project_id));
create policy supplier_return_lines_select on public.supplier_return_lines for select to authenticated
  using (exists (select 1 from public.supplier_returns r where r.id = supplier_return_lines.return_id));

-- Bills (design §3.6).
create policy supplier_bills_select on public.supplier_bills for select to authenticated
  using (
    private.sees_all_projects(company_id)
    or private.is_own_draft_bill(id)
    or (private.can_see_finance(company_id) and private.bill_has_visible_project(id))
  );
create policy supplier_bill_charges_select on public.supplier_bill_charges for select to authenticated
  using (private.can_see_bill_amounts(id));
create policy bill_lines_select on public.bill_lines for select to authenticated
  using (
    private.sees_all_projects(company_id)
    or private.is_own_draft_bill(bill_id)
    or (private.can_see_finance(company_id) and private.can_see_project(company_id, project_id))
  );
create policy bill_charge_overrides_select on public.bill_charge_overrides for select to authenticated
  using (
    private.sees_all_projects(company_id)
    or private.is_own_draft_bill(bill_id)
    or (private.can_see_finance(company_id) and private.can_see_project(company_id, project_id))
  );
create policy bill_matches_select on public.bill_line_delivery_lines for select to authenticated
  using (private.can_see_project(company_id, project_id));

-- Payments.
create policy payments_select on public.payments for select to authenticated
  using (private.can_see_payment(id));
create policy allocation_events_select on public.payment_allocation_events for select to authenticated
  using (private.can_see_finance(company_id) and private.can_see_project(company_id, project_id));
create policy settlement_events_select on public.settlement_events for select to authenticated
  using (private.can_see_finance(company_id) and private.can_see_project(company_id, project_id));

-- Credits and reversals.
create policy credits_select on public.credits for select to authenticated
  using (
    private.sees_all_projects(company_id)
    or (private.can_see_finance(company_id) and private.credit_has_visible_project(id))
  );
create policy credit_lines_select on public.credit_lines for select to authenticated
  using (private.can_see_finance(company_id) and private.can_see_project(company_id, project_id));
create policy reversals_select on public.reversals for select to authenticated
  using (private.can_see_finance(company_id));

-- Money core. operations: no policies (functions only).
create policy posting_events_select on public.posting_events for select to authenticated
  using (private.can_see_finance(company_id));
-- Unallocated rows (project_id null) are company-level: Admin and Accounts only.
create policy ledger_entries_select on public.ledger_entries for select to authenticated
  using (
    private.sees_all_projects(company_id)
    or (project_id is not null and private.can_see_finance(company_id) and private.can_see_project(company_id, project_id))
  );

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid() and private.is_member(company_id));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Clients only mark notifications read; everything else is written by functions.
revoke insert, update, delete on
  public.party_opening_balances, public.order_slips, public.order_slip_lines, public.order_slip_line_prices,
  public.deliveries, public.delivery_lines, public.supplier_returns, public.supplier_return_lines,
  public.supplier_bills, public.supplier_bill_charges, public.bill_lines, public.bill_charge_overrides,
  public.bill_line_delivery_lines, public.payments, public.payment_allocation_events, public.settlement_events,
  public.credits, public.credit_lines, public.reversals, public.operations, public.posting_events,
  public.ledger_entries, public.notifications
from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;
revoke delete on public.suppliers from authenticated, anon;
