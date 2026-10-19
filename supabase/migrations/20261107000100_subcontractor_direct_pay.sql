-- Subcontractors paid directly for work done, and which projects a supplier works on
-- (product owner, 2026-10-19; GLOSSARY: Direct Payment).
--
-- A subcontractor is paid either directly (default: each payment is the work done, no bill to
-- enter) or against their bills (claim, approve, then pay; req §13). A direct payment is one
-- posting: pay_work_done records an approved work charge for the amount and pays it, with what
-- they hold (peski first) taken off before cash, exactly as paying an approved bill does.

-- ---------------------------------------------------------------------------
-- 1. How a subcontractor is paid
-- ---------------------------------------------------------------------------
alter table public.subcontractors add column pays_by text not null default 'direct'
  constraint subcontractors_pays_by_check check (pays_by in ('direct', 'bills'));

-- Those already giving bills keep doing so.
update public.subcontractors s set pays_by = 'bills'
where exists (select 1 from public.subcontract_charges c where c.subcontractor_id = s.id);

-- ---------------------------------------------------------------------------
-- 2. pay_work_done: one direct payment for work done (posting contract, design §5.1)
-- ---------------------------------------------------------------------------
-- p_pay: {id (payment), charge_id, approve_op_key, pay_op_key, subcontractor_id, work_package_id,
-- work_paisa (what the work is worth), amount_paisa (cash now: the work less what they hold),
-- payment_date, method, reference, notes}. The three steps run in one transaction under their own
-- op_keys, so a retry of the same request returns the stored result and records nothing twice.
create function public.pay_work_done(p_op_key uuid, p_pay jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub uuid := (p_pay ->> 'subcontractor_id')::uuid;
  v_charge uuid := (p_pay ->> 'charge_id')::uuid;
  v_work bigint := (p_pay ->> 'work_paisa')::bigint;
  v_cash bigint := coalesce((p_pay ->> 'amount_paisa')::bigint, 0);
  v_date date := coalesce((p_pay ->> 'payment_date')::date, private.today());
  w public.work_packages;
  v_prior jsonb;
  v_result jsonb;
begin
  -- 1. Authorize: the work is this subcontractor's, on a project the caller may pay on.
  select * into w from public.work_packages where id = (p_pay ->> 'work_package_id')::uuid;
  if w.id is null or w.subcontractor_id is distinct from v_sub then
    raise exception 'Choose the work to pay' using errcode = 'P0001';
  end if;
  if not private.can_post(w.company_id) or not private.can_record_payments(w.company_id)
     or not private.can_see_finance(w.company_id) or not private.can_work_on_project(w.company_id, w.project_id) then
    raise exception 'You cannot record payments' using errcode = '42501';
  end if;
  if v_charge is null or (p_pay ->> 'approve_op_key') is null or (p_pay ->> 'pay_op_key') is null then
    raise exception 'An operation key is required' using errcode = '22023';
  end if;
  if v_work is null or v_work <= 0 then
    raise exception 'Enter the amount for the work' using errcode = '22023';
  end if;
  if v_cash < 0 or v_cash > v_work then
    raise exception 'The cash paid cannot be more than the work' using errcode = '22023';
  end if;

  -- 2. Operation key.
  v_prior := private.begin_op(w.company_id, p_op_key, 'pay_work_done', p_pay);
  if v_prior is not null then
    return v_prior;
  end if;

  -- 3-4. State: work still going on. (The steps below lock the subcontractor, their payments and
  -- the charge in the global order themselves.)
  if w.status = 'cancelled' then
    raise exception 'This work was cancelled' using errcode = 'P0001';
  end if;

  -- 5. Write: the work done, approved on the payment date, then paid like any approved bill.
  perform public.save_charge_claim(jsonb_build_object(
    'id', v_charge, 'work_package_id', w.id, 'charge_date', v_date,
    'description', coalesce(nullif(trim(p_pay ->> 'notes'), ''), 'Paid directly'), 'claimed_paisa', v_work));
  perform public.approve_charge((p_pay ->> 'approve_op_key')::uuid, v_charge, v_work, v_date);
  v_result := public.pay_subcontractor((p_pay ->> 'pay_op_key')::uuid, jsonb_build_object(
    'id', p_pay ->> 'id', 'subcontractor_id', v_sub, 'work_package_id', w.id,
    'docs', jsonb_build_array(jsonb_build_object('doc_id', v_charge)),
    'amount_paisa', v_cash, 'payment_date', v_date, 'method', coalesce(p_pay ->> 'method', 'cash'),
    'reference', p_pay ->> 'reference', 'notes', p_pay ->> 'notes'));

  -- 6. Invariant: what they held and the cash pay exactly the work, no less and no more. The form
  -- works out the cash from what they hold; if that changed meanwhile, nothing is saved.
  if private.doc_settled(v_charge, w.project_id) <> v_work or coalesce((v_result ->> 'extra_paisa')::bigint, 0) <> 0 then
    raise exception 'held_changed: what they hold has changed, check the amount and save again' using errcode = 'P0001';
  end if;

  -- 7. Result.
  return private.finish_op(w.company_id, p_op_key, v_result || jsonb_build_object('charge_id', v_charge));
end $$;

revoke execute on function public.pay_work_done(uuid, jsonb) from public, anon;
grant execute on function public.pay_work_done(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Which projects a supplier works on: through their slips, deliveries and bills
-- ---------------------------------------------------------------------------
-- Read with the caller's rights (security_invoker): each table's RLS decides which links show,
-- so site staff see a supplier on a project only through records they may see.
create view public.supplier_projects with (security_invoker = true) as
  select s.company_id, s.supplier_id, l.project_id
  from public.order_slips s join public.order_slip_lines l on l.company_id = s.company_id and l.slip_id = s.id
  union
  select d.company_id, d.supplier_id, d.project_id from public.deliveries d
  union
  select b.company_id, b.supplier_id, l.project_id
  from public.supplier_bills b join public.bill_lines l on l.company_id = b.company_id and l.bill_id = b.id;

grant select on public.supplier_projects to authenticated;
