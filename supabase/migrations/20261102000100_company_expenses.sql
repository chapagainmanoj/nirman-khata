-- Company expenses and unnamed cash (product owner, 2026-10-17; GLOSSARY: Company Expense, Cash
-- payee; req §15).
--   * An Other Expense with no project is a Company Expense: money already spent for the company
--     as a whole (sabal, measuring tape). It is a record only: no cost, no party, no payment, no
--     ledger row. Cost always sits on a project (unchanged), so reports and khatas never see it.
--   * Paid now without a name: the expense is filed under the company's one Cash payee, made the
--     first time it is needed. Its khata nets to zero. An unpaid expense still names who is owed.
--   * X2 for company expenses: the creator for 7 days; Admin and Accounts always.
--   * A cost and the payment that paid it point at each other (paid_for / paid_by, last section).

alter table public.expenses
  alter column project_id drop not null,
  alter column payee_id drop not null,
  add column paid_method public.payment_method,
  add constraint expense_project_or_company check (
    (project_id is not null and payee_id is not null and paid_method is null)
    or (project_id is null and payee_id is null and paid_method is not null));
create index expenses_company_date on public.expenses (company_id, expense_date) where project_id is null;

alter table public.payees add column is_cash boolean not null default false;
create unique index payees_one_cash on public.payees (company_id) where is_cash;

-- Reversed with who, when and why; the shared reversals table needs a party, so its own (like
-- client receipts).
create table public.company_expense_reversals (
  company_id uuid not null references public.companies (id),
  id uuid not null default gen_random_uuid() primary key,
  expense_id uuid not null,
  reversal_date date not null,
  reason text not null check (length(trim(reason)) > 0),
  posted_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, expense_id), -- reversed at most once
  foreign key (company_id, expense_id) references public.expenses (company_id, id)
);
create trigger audit after insert or update or delete on public.company_expense_reversals for each row execute function private.audit();
create trigger set_created_by before insert on public.company_expense_reversals for each row execute function private.set_created_by();
create trigger no_change before update or delete on public.company_expense_reversals
  for each row execute function private.reject_change();
alter table public.company_expense_reversals enable row level security;
create policy company_expense_reversals_select on public.company_expense_reversals for select to authenticated
  using (exists (select 1 from public.expenses x where x.id = expense_id));
revoke insert, update, delete on public.company_expense_reversals from authenticated, anon;

-- X2, widened: an entry with no project (a company expense) belongs to the company, so the creator
-- keeps it while they work for the company. Entries on a project are unchanged. The expenses
-- policy needs nothing else: can_see_project_money with no project is Admin and Accounts only.
create or replace function private.is_own_recent_entry(
  p_company uuid, p_project uuid, p_created_by uuid, p_created_at timestamptz, p_status public.doc_status
) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_created_by = auth.uid() and p_status = 'posted' and p_created_at > now() - interval '7 days'
    and private.is_member(p_company)
    and (case when p_project is null then private.has_working_role(p_company)
              else private.can_see_project(p_company, p_project) end)
$$;

-- Who may add to an expense (its receipt photo): working on its project, or for a company
-- expense anyone who works for the company.
create function private.can_work_on_expense(p_company uuid, p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_project is null then private.has_working_role(p_company)
              else private.can_work_on_project(p_company, p_project) end
$$;
revoke execute on function private.can_work_on_expense(uuid, uuid) from public, anon;
grant execute on function private.can_work_on_expense(uuid, uuid) to authenticated;

-- Documents a payment can settle: a company expense is not one (it has no party).
create or replace function private.doc_info(p_doc uuid)
returns table (kind text, company_id uuid, party_id uuid, posted boolean, doc_date date, label text)
language sql stable security definer set search_path = '' as $$
  select 'bill', b.company_id, b.supplier_id, b.status = 'posted', b.bill_date, 'Bill ' || b.bill_no
  from public.supplier_bills b where b.id = p_doc
  union all
  select 'charge', c.company_id, c.subcontractor_id, c.status = 'approved', c.approved_date,
    'Work charge' || coalesce(' ' || nullif(trim(c.claim_no), ''), '')
  from public.subcontract_charges c where c.id = p_doc
  union all
  select 'labour', l.company_id, l.crew_id, l.status = 'posted', l.work_date, 'Labour ' || coalesce(l.work_type, '')
  from public.labour_costs l where l.id = p_doc
  union all
  select 'expense', e.company_id, e.payee_id, e.status = 'posted', e.expense_date, e.description
  from public.expenses e where e.id = p_doc and e.project_id is not null
$$;

-- The company's Cash payee: who an expense paid on the spot is filed under when no name is given.
-- Made on first use. A payee already named like it is taken over rather than duplicated.
create function private.cash_payee(p_company uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select id into v from public.payees where company_id = p_company and is_cash;
  if v is null then
    select id into v from public.payees where company_id = p_company and lower(trim(name)) = 'cash (not named)';
    if v is null then
      insert into public.payees (company_id, name, is_cash) values (p_company, 'Cash (not named)', true)
      on conflict do nothing returning id into v;
      if v is null then -- a concurrent save made it
        select id into v from public.payees where company_id = p_company and is_cash;
      end if;
    else
      update public.payees set is_cash = true where id = v;
    end if;
  end if;
  return v;
end $$;
revoke execute on function private.cash_payee(uuid) from public, anon, authenticated;

-- p_expense: {id, project_id | company_id, heading_id, expense_date, amount_paisa, description,
--   bill_no, payee_id | payee: {name, kind, phone}, pay_now: {method, reference}}
-- With a project: posts cost to the payee (or the Cash payee when paid now without a name).
-- Without one: a company expense, recorded only; pay_now.method says how it was paid.
create or replace function public.save_expense(p_op_key uuid, p_expense jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_expense ->> 'id')::uuid;
  v_project uuid := nullif(p_expense ->> 'project_id', '')::uuid;
  v_company uuid := case when nullif(p_expense ->> 'project_id', '') is null
    then nullif(p_expense ->> 'company_id', '')::uuid
    else (select company_id from public.projects where id = nullif(p_expense ->> 'project_id', '')::uuid) end;
  v_payee uuid := (p_expense ->> 'payee_id')::uuid;
  v_name text := nullif(trim(p_expense -> 'payee' ->> 'name'), '');
  v_heading uuid := (p_expense ->> 'heading_id')::uuid;
  v_date date := coalesce((p_expense ->> 'expense_date')::date, private.today());
  v_amount bigint := (p_expense ->> 'amount_paisa')::bigint;
  v_pay_now boolean := jsonb_typeof(p_expense -> 'pay_now') = 'object';
  v_prior jsonb;
  v_event uuid;
  v_payment jsonb;
begin
  if v_project is null then
    if v_company is null or not private.has_working_role(v_company) then
      raise exception 'You cannot enter company expenses' using errcode = '42501';
    end if;
  else
    if v_company is null or not private.can_work_on_project(v_company, v_project) then
      raise exception 'You cannot enter expenses on this project' using errcode = '42501';
    end if;
    if v_pay_now and not private.can_record_payments(v_company) then
      raise exception 'You cannot record payments; save it as unpaid' using errcode = '42501';
    end if;
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'save_expense', p_expense);
  if v_prior is not null then
    return v_prior;
  end if;
  if v_id is null then
    raise exception 'Expense id is required' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Enter the amount' using errcode = '22023';
  end if;
  if v_date > private.today() then
    raise exception 'The expense date cannot be in the future' using errcode = '22023';
  end if;
  if not exists (select 1 from public.cost_headings where id = v_heading and company_id = v_company) then
    raise exception 'Choose a cost heading' using errcode = 'P0001';
  end if;

  -- A company expense: already paid, owed to no one, no cost on any project.
  if v_project is null then
    insert into public.expenses (company_id, id, project_id, heading_id, payee_id, expense_date, amount_paisa,
      description, bill_no, paid_method)
    values (v_company, v_id, null, v_heading, null, v_date, v_amount,
            private.require_reason(p_expense ->> 'description', 'A description'), nullif(trim(p_expense ->> 'bill_no'), ''),
            coalesce(p_expense -> 'pay_now' ->> 'method', 'cash')::public.payment_method);
    return private.finish_op(v_company, p_op_key, jsonb_build_object(
      'expense_id', v_id, 'payee_id', null, 'event_id', null, 'payment', null));
  end if;

  if v_payee is null then
    if v_name is not null then
      select id into v_payee from public.payees where company_id = v_company and lower(trim(name)) = lower(v_name);
      if v_payee is null then
        insert into public.payees (company_id, name, phone, kind)
        values (v_company, v_name, nullif(trim(p_expense -> 'payee' ->> 'phone'), ''), nullif(trim(p_expense -> 'payee' ->> 'kind'), ''))
        returning id into v_payee;
      end if;
    elsif v_pay_now then
      v_payee := private.cash_payee(v_company);
    else
      raise exception 'Choose or type who is owed it, or mark it paid now' using errcode = '22023';
    end if;
  elsif not exists (select 1 from public.payees where id = v_payee and company_id = v_company) then
    raise exception 'Payee not found' using errcode = 'P0002';
  end if;

  perform private.lock_party(v_payee);
  insert into public.expenses (company_id, id, project_id, heading_id, payee_id, expense_date, amount_paisa, description, bill_no)
  values (v_company, v_id, v_project, v_heading, v_payee, v_date, v_amount,
          private.require_reason(p_expense ->> 'description', 'A description'), nullif(trim(p_expense ->> 'bill_no'), ''));
  v_event := private.new_event(v_company, 'expense_save', v_payee, v_date, p_op_key, p_expense => v_id);
  perform private.add_ledger(v_event, 'expense', v_project, v_heading, v_amount, v_amount, 0);
  if v_pay_now then
    v_payment := private.pay_now(v_company, v_payee, v_project, array[v_id], v_date, p_expense -> 'pay_now', p_op_key);
  end if;
  return private.finish_op(v_company, p_op_key, jsonb_build_object(
    'expense_id', v_id, 'payee_id', v_payee, 'event_id', v_event, 'payment', v_payment));
end $$;

-- Reverse a company expense entered by mistake (Accounts or Admin, like other reversals). Nothing
-- was posted, so this only marks it reversed and keeps who, when and why.
create function public.reverse_company_expense(p_op_key uuid, p_expense uuid, p_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  x public.expenses;
  v_company uuid := (select company_id from public.expenses where id = p_expense and project_id is null);
  v_prior jsonb;
  v_reason text;
  v_date date := coalesce(p_date, private.today());
begin
  if v_company is null or not private.can_post(v_company) then
    raise exception 'Only Accounts or Admin can reverse entries' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'reverse_company_expense',
    jsonb_build_object('expense', p_expense, 'date', p_date, 'reason', p_reason));
  if v_prior is not null then
    return v_prior;
  end if;
  v_reason := private.require_reason(p_reason);
  select * into x from public.expenses where id = p_expense for update;
  if x.status = 'reversed' then
    raise exception 'already_reversed: this entry was already reversed' using errcode = 'P0001';
  end if;
  if v_date < x.expense_date then
    raise exception 'The reversal cannot be dated before the entry' using errcode = '22023';
  end if;
  if v_date > private.today() then
    raise exception 'The date cannot be in the future' using errcode = '22023';
  end if;
  insert into public.company_expense_reversals (company_id, expense_id, reversal_date, reason)
  values (v_company, p_expense, v_date, v_reason);
  update public.expenses set status = 'reversed' where id = p_expense;
  return private.finish_op(v_company, p_op_key, jsonb_build_object('expense_id', p_expense));
end $$;
revoke execute on function public.reverse_company_expense(uuid, uuid, date, text) from public, anon;
grant execute on function public.reverse_company_expense(uuid, uuid, date, text) to authenticated;

-- A company expense is paid when entered: it shows as settled in full. New columns go last.
create or replace view public.expense_summaries with (security_invoker = true) as
  select e.id, e.company_id, e.project_id, e.heading_id, e.payee_id, e.expense_date, e.amount_paisa, e.description,
    e.bill_no, e.status, e.posted_at, e.created_by, e.created_at,
    case when e.project_id is null then e.amount_paisa else private.doc_settled(e.id, e.project_id) end as settled_paisa,
    e.paid_method
  from public.expenses e;

-- Receipt photos on a company expense: the same X2 rule, with "works for the company" in place of
-- "works on the project". Only the expense branches differ from 20261028000100_photo_retry.sql.
create or replace function private.can_create_attachment_for(p_company uuid, p_contract_revision uuid, p_budget_revision uuid, p_delivery uuid, p_bill uuid, p_payment uuid, p_work_package uuid, p_charge uuid, p_labour_cost uuid, p_expense uuid, p_daily_report uuid, p_progress_update uuid, p_client_receipt uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
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
      and private.can_add_bill_photo(p_bill))
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
      where x.company_id = p_company and x.id = p_expense and private.can_work_on_expense(p_company, x.project_id)
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

create or replace function private.can_access_attachment(p_attachment uuid, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
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
      return a.uploaded_at is null and private.can_add_bill_photo(a.bill_id);
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
                  else a.uploaded_at is null and private.can_work_on_expense(a.company_id, x.project_id) end;
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
-- A cost and the payment that paid it point at each other (product owner, 2026-10-17). "Paid now"
-- writes two records, the cost and the cash out (design §5.6 I-8); the lists showed them side by
-- side with nothing between them, so they looked like the same money twice.
--   * payment_summaries.paid_for: what the payment settled, e.g. "Kaja on Oct 17" or
--     "Bill B-12 and 2 more". Null when it settled nothing (unassigned, peski).
--   * expense_summaries.paid_by: the payments that paid an expense, [{id, number}].
-- Both views stay security_invoker, so these follow settlement_events' own rule: finance users on
-- the project. Anyone else gets null; nothing about the money is shown that was hidden before.

create or replace view public.payment_summaries with (security_invoker = true) as
  select
    p.id, p.company_id, p.number, p.supplier_id, p.payment_date, p.amount_paisa, p.method, p.reference,
    p.notes, p.status, p.posted_at, p.created_by,
    (select coalesce(sum(e.amount_paisa), 0) from public.payment_allocation_events e where e.payment_id = p.id)::bigint as allocated_paisa,
    (select coalesce(sum(s.amount_paisa), 0) from public.settlement_events s where s.payment_id = p.id)::bigint as settled_paisa,
    p.subcontractor_id, p.crew_id, p.payee_id, p.party_id, p.work_package_id,
    coalesce((
      select array_agg(a.project_id order by a.project_id) from (
        select e.project_id from public.payment_allocation_events e
        where e.payment_id = p.id group by e.project_id having sum(e.amount_paisa) <> 0
      ) a
    ), '{}'::uuid[]) as project_ids,
    p.is_peski,
    (
      select min(d.label) || case when count(*) > 1 then ' and ' || (count(*) - 1) || ' more' else '' end
      from (
        select s.doc_id from public.settlement_events s
        where s.payment_id = p.id group by s.doc_id having sum(s.amount_paisa) > 0
      ) x
      cross join lateral private.doc_info(x.doc_id) d
    ) as paid_for
  from public.payments p;

create or replace view public.expense_summaries with (security_invoker = true) as
  select e.id, e.company_id, e.project_id, e.heading_id, e.payee_id, e.expense_date, e.amount_paisa, e.description,
    e.bill_no, e.status, e.posted_at, e.created_by, e.created_at,
    case when e.project_id is null then e.amount_paisa else private.doc_settled(e.id, e.project_id) end as settled_paisa,
    e.paid_method,
    (
      select jsonb_agg(jsonb_build_object('id', p.id, 'number', p.number) order by p.number)
      from (
        select s.payment_id from public.settlement_events s
        where s.doc_id = e.id group by s.payment_id having sum(s.amount_paisa) > 0
      ) x
      join public.payments p on p.id = x.payment_id
    ) as paid_by
  from public.expenses e;
