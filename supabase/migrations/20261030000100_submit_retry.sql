-- A slip or bill whose "submit" went through but whose answer was lost can be sent again (second
-- review #11). Sending stays three steps (save the draft, upload its photos, submit), since a
-- photo-only bill can be submitted only once its photo is up. The submit now carries an operation
-- key, so a retry can ask whether that submit already happened instead of failing on the draft
-- save of a record that is no longer a draft.

-- Submit with an operation key: the same submit, its result kept under the key.
create function public.submit_slip(p_slip uuid, p_op_key uuid) returns public.slip_status
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := (select company_id from public.order_slips where id = p_slip);
  v_prior jsonb;
  v_status public.slip_status;
begin
  if v_company is null or not private.can_edit_slip(p_slip) then
    raise exception 'You cannot submit this slip' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'submit_slip', jsonb_build_object('slip', p_slip));
  if v_prior is not null then
    return (v_prior ->> 'status')::public.slip_status;
  end if;
  v_status := public.submit_slip(p_slip);
  perform private.finish_op(v_company, p_op_key, jsonb_build_object('slip', p_slip, 'status', v_status));
  return v_status;
end $$;

create function public.submit_bill(p_bill uuid, p_op_key uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := (select company_id from public.supplier_bills where id = p_bill);
  v_prior jsonb;
begin
  if v_company is null or not private.can_edit_bill(p_bill) then
    raise exception 'You cannot submit this bill' using errcode = '42501';
  end if;
  v_prior := private.begin_op(v_company, p_op_key, 'submit_bill', jsonb_build_object('bill', p_bill));
  if v_prior is not null then
    return;
  end if;
  perform public.submit_bill(p_bill);
  perform private.finish_op(v_company, p_op_key, jsonb_build_object('bill', p_bill, 'status', 'under_review'));
end $$;

-- What a submit with this key did, for the user who made it, while they still work in the
-- company; null when it never finished. Answers only for submits: a slip's or bill's status.
create function public.finished_submit(p_op_key uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select o.result from public.operations o
  where o.op_key = p_op_key and o.user_id = auth.uid() and o.kind in ('submit_slip', 'submit_bill')
    and o.result is not null and private.has_working_role(o.company_id)
$$;

revoke execute on function public.submit_slip(uuid, uuid), public.submit_bill(uuid, uuid), public.finished_submit(uuid)
from public, anon;
grant execute on function public.submit_slip(uuid, uuid), public.submit_bill(uuid, uuid), public.finished_submit(uuid)
to authenticated;
