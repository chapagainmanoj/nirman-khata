-- Client receipts (pilot request, 2026-10-13; requirements open question #1). What the client the
-- project is built for has paid, recorded per project. One amount per receipt: what the client
-- settled, including anything they kept back as TDS or retention (no breakdown yet; companies with
-- an accountant may get optional deduction fields later).
--
-- Kept out of the ledger on purpose: ledger rows are about parties the company pays (exactly one
-- supplier, subcontractor, crew or payee; cash = money out; balance = owed to them). A receipt is
-- none of those, so it never changes recorded cost, cash paid, party balances or khata.
-- Received from client (as of D) = receipts dated on or before D, less those reversed on or before D.
-- To collect = current contract - received.

create type public.client_receipt_kind as enum ('advance', 'running_bill', 'final', 'other');

create table public.client_receipts (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  number text not null,
  project_id uuid not null,
  receipt_date date not null,
  amount_paisa bigint not null check (amount_paisa > 0),
  kind public.client_receipt_kind not null default 'running_bill',
  method public.payment_method not null default 'bank_transfer',
  reference text,
  notes text,
  status public.doc_status not null default 'posted',
  posted_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, number),
  foreign key (company_id, project_id) references public.projects (company_id, id)
);
create index client_receipts_project on public.client_receipts (company_id, project_id, receipt_date);

create trigger set_updated_at before update on public.client_receipts for each row execute function private.set_updated_at();
create trigger audit after insert or update or delete on public.client_receipts for each row execute function private.audit();
create trigger set_created_by before insert on public.client_receipts for each row execute function private.set_created_by();
-- A posted receipt changes only by reversal (its status), never by edit or delete.
create trigger guard_posted before update or delete on public.client_receipts
  for each row execute function private.guard_posted_document();

-- The shared reversals table needs exactly one party; a receipt has none, so it gets its own.
create table public.client_receipt_reversals (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  receipt_id uuid not null,
  reversal_date date not null,
  reason text not null check (length(trim(reason)) > 0),
  posted_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, receipt_id), -- reversed at most once
  foreign key (company_id, receipt_id) references public.client_receipts (company_id, id)
);
create trigger audit after insert or update or delete on public.client_receipt_reversals for each row execute function private.audit();
create trigger set_created_by before insert on public.client_receipt_reversals for each row execute function private.set_created_by();
create trigger no_change before update or delete on public.client_receipt_reversals
  for each row execute function private.reject_change();

-- Like refunds on a project: finance people on that project, and Admin/Accounts everywhere.
alter table public.client_receipts enable row level security;
create policy client_receipts_select on public.client_receipts for select to authenticated
  using (
    private.sees_all_projects(company_id)
    or (private.can_see_finance(company_id) and private.can_see_project(company_id, project_id))
  );
alter table public.client_receipt_reversals enable row level security;
create policy client_receipt_reversals_select on public.client_receipt_reversals for select to authenticated
  using (exists (select 1 from public.client_receipts r where r.id = receipt_id));
revoke insert, update, delete on public.client_receipts, public.client_receipt_reversals from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Record and reverse
-- ---------------------------------------------------------------------------
create function public.record_client_receipt(p_op_key uuid, p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_receipt ->> 'id')::uuid;
  v_project uuid := nullif(p_receipt ->> 'project_id', '')::uuid;
  v_company uuid := (select company_id from public.projects where id = v_project);
  v_amount bigint := (p_receipt ->> 'amount_paisa')::bigint;
  v_date date := coalesce((p_receipt ->> 'receipt_date')::date, private.today());
  v_prior jsonb;
  v_number text;
begin
  if v_company is null or not private.can_record_payments(v_company) or not private.can_see_project(v_company, v_project) then
    raise exception 'You cannot record client payments on this project' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'Receipt id is required' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'The amount must be more than zero' using errcode = '22023';
  end if;
  if v_date > private.today() then
    raise exception 'The date cannot be in the future' using errcode = '22023';
  end if;

  v_prior := private.begin_op(v_company, p_op_key, 'record_client_receipt', p_receipt);
  if v_prior is not null then
    return v_prior;
  end if;

  v_number := public.next_doc_number(v_company, 'client_receipt', 'CR');
  insert into public.client_receipts (company_id, id, number, project_id, receipt_date, amount_paisa, kind, method, reference, notes)
  values (
    v_company, v_id, v_number, v_project, v_date, v_amount,
    coalesce((p_receipt ->> 'kind')::public.client_receipt_kind, 'running_bill'),
    coalesce((p_receipt ->> 'method')::public.payment_method, 'bank_transfer'),
    nullif(trim(p_receipt ->> 'reference'), ''), nullif(trim(p_receipt ->> 'notes'), '')
  );
  return private.finish_op(v_company, p_op_key, jsonb_build_object('receipt_id', v_id, 'number', v_number));
end $$;

create function public.reverse_client_receipt(p_op_key uuid, p_receipt uuid, p_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.client_receipts;
  v_company uuid := (select company_id from public.client_receipts where id = p_receipt);
  v_prior jsonb;
  v_reason text;
  v_date date := coalesce(p_date, private.today());
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can reverse client payments' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'reverse_client_receipt',
    jsonb_build_object('receipt', p_receipt, 'date', p_date, 'reason', p_reason));
  if v_prior is not null then
    return v_prior;
  end if;
  v_reason := private.require_reason(p_reason);
  select * into r from public.client_receipts where id = p_receipt for update;
  if r.status = 'reversed' then
    raise exception 'already_reversed: this payment was already reversed' using errcode = 'P0001';
  end if;
  if v_date < r.receipt_date then
    raise exception 'The reversal cannot be dated before the payment' using errcode = '22023';
  end if;
  if v_date > private.today() then
    raise exception 'The date cannot be in the future' using errcode = '22023';
  end if;
  insert into public.client_receipt_reversals (company_id, receipt_id, reversal_date, reason)
  values (v_company, p_receipt, v_date, v_reason);
  update public.client_receipts set status = 'reversed' where id = p_receipt;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('receipt_id', p_receipt));
end $$;

-- What the client has paid on a project as of a date. Security invoker: row security decides, so
-- someone who may not see the project's money gets 0 (the app only asks for people who may).
create function public.client_received_as_of(p_project uuid, p_as_of date) returns bigint
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(r.amount_paisa), 0)::bigint
  from public.client_receipts r
  where r.project_id = p_project and r.receipt_date <= p_as_of
    and not exists (select 1 from public.client_receipt_reversals v where v.receipt_id = r.id and v.reversal_date <= p_as_of)
$$;

-- ---------------------------------------------------------------------------
-- Photo of the cheque or voucher
-- ---------------------------------------------------------------------------
alter table public.attachments
  add column client_receipt_id uuid,
  add foreign key (company_id, client_receipt_id) references public.client_receipts (company_id, id),
  drop constraint attachments_one_owner,
  add constraint attachments_one_owner check (num_nonnulls(
    contract_revision_id, budget_revision_id, delivery_id, bill_id, payment_id,
    work_package_id, charge_id, labour_cost_id, expense_id, daily_report_id, progress_update_id, client_receipt_id) = 1);
create index attachments_client_receipt on public.attachments (client_receipt_id) where client_receipt_id is not null;

drop policy attachments_insert on public.attachments;
drop function private.can_create_attachment_for(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid);
create function private.can_create_attachment_for(
  p_company uuid, p_contract_revision uuid, p_budget_revision uuid, p_delivery uuid, p_bill uuid, p_payment uuid,
  p_work_package uuid, p_charge uuid, p_labour_cost uuid, p_expense uuid, p_daily_report uuid, p_progress_update uuid, p_client_receipt uuid
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
    or (p_client_receipt is not null and exists (
      select 1 from public.client_receipts r
      where r.company_id = p_company and r.id = p_client_receipt
        and private.can_record_payments(p_company) and private.can_see_project(p_company, r.project_id)))
$$;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    uploaded_at is null and removed_at is null
    and private.can_create_attachment_for(company_id, contract_revision_id, budget_revision_id, delivery_id, bill_id,
      payment_id, work_package_id, charge_id, labour_cost_id, expense_id, daily_report_id, progress_update_id, client_receipt_id)
  );

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
  -- Client receipts carry amounts: read like the receipt; added by whoever may record them.
  if a.client_receipt_id is not null then
    select project_id into v_project from public.client_receipts where id = a.client_receipt_id;
    if p_action = 'read' then
      return a.removed_at is null and (private.sees_all_projects(a.company_id)
        or (private.can_see_finance(a.company_id) and private.can_see_project(a.company_id, v_project)));
    elsif p_action = 'upload' then
      return a.uploaded_at is null and private.can_record_payments(a.company_id) and private.can_see_project(a.company_id, v_project);
    end if;
    return false;
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------------
-- Calendar: client receipts appear with their own amount column, so "Paid" stays money out.
-- ---------------------------------------------------------------------------
drop function public.calendar_events(uuid, date, date, uuid);
create function public.calendar_events(
  p_company uuid, p_from date, p_to date, p_project uuid default null
)
returns table (
  event_date date, kind text, label text, detail text, money text,
  cost_paisa bigint, cash_paisa bigint, project_id uuid, party_name text,
  link_kind text, link_id uuid, created_by uuid, at timestamptz, received_paisa bigint
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
      when e.event_type = 'refund' then 'refund'
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
      when lbl ->> 'refund_id' is not null then 'refund'
    end,
    coalesce(lbl ->> 'bill_id', lbl ->> 'charge_id', lbl ->> 'labour_cost_id', lbl ->> 'expense_id',
             lbl ->> 'credit_id', lbl ->> 'payment_id', lbl ->> 'refund_id')::uuid,
    null::uuid, m.at, null::bigint
  from money m
  join public.posting_events e on e.id = m.event_id
  cross join lateral private.event_label(m.event_id) lbl
  union all
  select r.work_date, 'report', 'Daily report: ' || r.work_done,
    concat_ws(' · ', r.area, case when r.headcount is not null then r.headcount || ' people' end, r.issues),
    null, null, null, r.project_id, null, 'report', r.id, r.created_by, r.submitted_at, null::bigint
  from public.daily_reports r
  where r.company_id = p_company and r.work_date between p_from and p_to and (p_project is null or r.project_id = p_project)
  union all
  select u.effective_date, 'progress',
    'Progress: ' || coalesce(s.name, 'Overall') || ' ' || trim(to_char(u.pct, 'FM990.##')) || '%',
    coalesce(u.reason, u.notes), null, null, null, u.project_id, null, 'progress', u.id, u.created_by, u.created_at, null::bigint
  from public.progress_updates u left join public.stages s on s.id = u.stage_id
  where u.company_id = p_company and u.effective_date between p_from and p_to and (p_project is null or u.project_id = p_project)
  union all
  select d.receipt_date, 'delivery', 'Delivery' || coalesce(', challan ' || d.challan_no, ''),
    (select string_agg(coalesce(mt.name, dl.material_text) || ' ' || trim(to_char(dl.received_qty - dl.rejected_qty, 'FM999999990.###')) || ' ' || un.code, ', ')
     from public.delivery_lines dl left join public.materials mt on mt.id = dl.material_id join public.units un on un.id = dl.unit_id
     where dl.delivery_id = d.id),
    null, null, null, d.project_id, sp.name, 'delivery', d.id, d.created_by, d.created_at, null::bigint
  from public.deliveries d left join public.suppliers sp on sp.id = d.supplier_id
  where d.company_id = p_company and d.receipt_date between p_from and p_to and (p_project is null or d.project_id = p_project)
  union all
  -- Slips the caller can see: requested (once out of draft) and marked sent.
  select x.day, x.kind, x.label, null, null, null, null, null, sp.name, 'slip', o.id, o.created_by, x.at, null::bigint
  from public.order_slips o
  left join public.suppliers sp on sp.id = o.supplier_id
  cross join lateral (values
    (o.request_date, 'slip', 'Order slip ' || o.number, o.created_at),
    ((o.sent_at at time zone 'Asia/Kathmandu')::date, 'slip_sent', 'Order slip ' || o.number || ' marked sent', o.sent_at)
  ) as x(day, kind, label, at)
  where o.company_id = p_company and o.status <> 'draft' and x.day between p_from and p_to
    and (p_project is null or exists (select 1 from public.order_slip_lines ol where ol.slip_id = o.id and ol.project_id = p_project))
  union all
  -- What the client paid (kept apart from cash paid out), and its reversal as a negative row.
  select x.day, x.kind, x.label, x.detail, 'received', null, null, cr.project_id, pj.client_name,
    'client_receipt', cr.id, x.by, x.at, x.amount
  from public.client_receipts cr
  join public.projects pj on pj.id = cr.project_id
  left join public.client_receipt_reversals rv on rv.receipt_id = cr.id
  cross join lateral (values
    (cr.receipt_date, 'client_receipt', 'Received ' || cr.number, cr.reference, cr.amount_paisa, cr.created_by, cr.created_at),
    (rv.reversal_date, 'client_receipt_reversal', 'Reversed ' || cr.number, rv.reason, -cr.amount_paisa, rv.created_by, rv.created_at)
  ) as x(day, kind, label, detail, amount, by, at)
  where cr.company_id = p_company and x.day is not null and x.day between p_from and p_to
    and (p_project is null or cr.project_id = p_project)
$$;

revoke execute on function public.record_client_receipt(uuid, jsonb), public.reverse_client_receipt(uuid, uuid, date, text),
  public.client_received_as_of(uuid, date), public.calendar_events(uuid, date, date, uuid) from public, anon;
grant execute on function public.record_client_receipt(uuid, jsonb), public.reverse_client_receipt(uuid, uuid, date, text),
  public.client_received_as_of(uuid, date), public.calendar_events(uuid, date, date, uuid) to authenticated;
revoke execute on function private.can_create_attachment_for(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function private.can_create_attachment_for(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
