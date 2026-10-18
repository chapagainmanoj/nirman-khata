-- Second full review (2026-10-14): slip rights follow the user's current role and projects, a
-- retried close is re-checked (C4), closed projects take no client receipts, the payment register
-- follows moves, and Peski as of a date ignores later reversals. Races are in concurrency.sh.
begin;
\ir helpers/helpers.psql
-- These tests mark days long past as site staff; the 7-day limit has its own tests (038).
create or replace function private.can_mark_day(p_company uuid, p_date date) returns boolean language sql as $$ select true $$;
select plan(33);

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_company('Review Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Bhandari house', 1000000000) as pa \gset
select public.create_project(:'co', 'B', 'Lakeside', 1000000000) as pb \gset
select tests.supplier(:'co', 'Shrestha Suppliers') as sup \gset
select tests.material(:'co', 'Cement') as cement \gset
select tests.unit(:'co', 'bag') as bag \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select tests.assign(:'co', :'pb', :'site');

create function tests.rf_slip(p_id uuid, p_supplier uuid, p_lines jsonb) returns jsonb language sql as $$
  select public.save_slip_draft(jsonb_build_object('id', p_id, 'supplier_id', p_supplier, 'request_date', '2026-05-01',
    'lines', p_lines))
$$;
create function tests.rf_line(p_project uuid, p_material uuid, p_unit uuid) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'project_id', p_project,
    'material_id', p_material, 'qty', 10, 'unit_id', p_unit))
$$;
create function tests.rf_close(p_worker uuid) returns jsonb language sql as $$
  select public.close_worker_days('00000000-0000-0000-0000-0000000000c4', jsonb_build_object('worker_id', p_worker,
    'from_date', '2026-05-01', 'to_date', '2026-05-31'))
$$;
create function tests.rf_receipt(p_op uuid, p_id uuid, p_project uuid) returns jsonb language sql as $$
  select public.record_client_receipt(p_op, jsonb_build_object('id', p_id, 'project_id', p_project,
    'receipt_date', '2026-05-05', 'amount_paisa', 5000000, 'kind', 'running_bill', 'method', 'cheque'))
$$;
create function tests.rf_pay(p_supplier uuid, p_amount bigint, p_project uuid, p_date date, p_peski boolean default false)
returns uuid language sql as $$
  select (public.record_payment(gen_random_uuid(), jsonb_build_object(
    'id', gen_random_uuid(), 'supplier_id', p_supplier, 'payment_date', p_date, 'amount_paisa', p_amount,
    'is_peski', p_peski,
    'allocations', jsonb_build_array(jsonb_build_object('project_id', p_project, 'amount_paisa', p_amount))
  )) ->> 'payment_id')::uuid
$$;
create function tests.rf_move(p_payment uuid, p_from uuid, p_to uuid, p_amount bigint) returns jsonb language sql as $$
  select public.allocate_payment(gen_random_uuid(), p_payment, jsonb_build_array(
    jsonb_build_object('project_id', p_from, 'amount_paisa', -p_amount),
    jsonb_build_object('project_id', p_to, 'amount_paisa', p_amount)), 'Moved')
$$;
create function tests.rf_register(p_company uuid, p_project uuid, p_payment uuid) returns bigint language sql as $$
  select r.project_paisa from public.report_payments(p_company, '2026-05-01', '2026-05-31', p_project) r where r.payment_id = p_payment
$$;
create function tests.rf_held(p_party uuid, p_project uuid, p_as_of date) returns bigint[] language sql as $$
  select array[peski_paisa, overpaid_paisa] from private.held_split(p_party, p_project, false, p_as_of)
$$;
grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Slips
-- ---------------------------------------------------------------------------
select tests.login(:'site');
select tests.rf_slip('cccccccc-0000-0000-0000-000000000001', :'sup', tests.rf_line(:'pa', :'cement', :'bag'));
select tests.rf_slip('cccccccc-0000-0000-0000-000000000002', :'sup', '[]'::jsonb);
select tests.rf_slip('cccccccc-0000-0000-0000-000000000003', :'sup', tests.rf_line(:'pa', :'cement', :'bag'));
select tests.rf_slip('cccccccc-0000-0000-0000-000000000004', :'sup', tests.rf_line(:'pa', :'cement', :'bag'));
select tests.rf_slip('cccccccc-0000-0000-0000-000000000005', :'sup',
  tests.rf_line(:'pa', :'cement', :'bag') || tests.rf_line(:'pb', :'cement', :'bag'));
select tests.rf_slip('cccccccc-0000-0000-0000-000000000006', :'sup',
  tests.rf_line(:'pa', :'cement', :'bag') || tests.rf_line(:'pb', :'cement', :'bag'));
select public.submit_slip('cccccccc-0000-0000-0000-000000000006');
select public.submit_slip('cccccccc-0000-0000-0000-000000000003');
select public.submit_slip('cccccccc-0000-0000-0000-000000000004');
select tests.login(:'owner');
select public.decide_slip('cccccccc-0000-0000-0000-000000000003', true);
select public.decide_slip('cccccccc-0000-0000-0000-000000000004', true);
select public.decide_slip('cccccccc-0000-0000-0000-000000000006', true);

-- The creator loses one of two projects on a slip: still visible, but not theirs to change.
select tests.logout();
delete from public.project_assignments where project_id = :'pb' and user_id = :'site';
select tests.login(:'site');
select throws_ok($$select public.submit_slip('cccccccc-0000-0000-0000-000000000005')$$, '42501', null,
  'a creator who lost one of the slip''s projects cannot submit it');
select is(public.slip_permissions('cccccccc-0000-0000-0000-000000000006') ->> 'can_cancel', 'false',
  '... nor cancel it');
select tests.logout();
select tests.assign(:'co', :'pb', :'site');
select tests.login(:'site');
select lives_ok($$select public.submit_slip('cccccccc-0000-0000-0000-000000000005')$$,
  'given both projects back, the creator can submit it');
select tests.login(:'owner');

-- The creator is made a Viewer: their drafts cannot be changed, even an empty one.
select tests.logout();
update public.memberships set roles = array['viewer']::public.app_role[] where company_id = :'co' and user_id = :'site';
select tests.login(:'site');
select throws_ok($$select public.submit_slip('cccccccc-0000-0000-0000-000000000001')$$, '42501', null,
  'a creator made Viewer cannot submit their draft');
select throws_ok($$select public.delete_slip_draft('cccccccc-0000-0000-0000-000000000002')$$, '42501', null,
  '... nor delete a draft with no lines yet');
select throws_ok($$select tests.rf_slip('cccccccc-0000-0000-0000-000000000002', '$$ || :'sup' || $$', '[]'::jsonb)$$, '42501', null,
  '... nor edit it');
select throws_ok($$select public.cancel_slip('cccccccc-0000-0000-0000-000000000003', 'Not needed')$$, '42501', null,
  '... nor cancel their approved slip');
select tests.logout();
update public.memberships set roles = array['site_staff']::public.app_role[] where company_id = :'co' and user_id = :'site';

-- The creator loses the slip's project: no cancel or close short; the admin still can.
delete from public.project_assignments where project_id = :'pa' and user_id = :'site';
select tests.login(:'site');
select is(public.slip_permissions('cccccccc-0000-0000-0000-000000000003') ->> 'can_cancel', 'false',
  'a creator without the project cannot cancel the slip');
select throws_ok($$select public.cancel_slip('cccccccc-0000-0000-0000-000000000003', 'Not needed')$$, '42501', null,
  '... and the server refuses it');
select is(public.slip_permissions('cccccccc-0000-0000-0000-000000000004') ->> 'can_close_short', 'false',
  '... nor close it short');
select tests.login(:'owner');
select lives_ok($$select public.cancel_slip('cccccccc-0000-0000-0000-000000000004', 'Supplier out of stock')$$,
  'an admin can still cancel it');
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select tests.login(:'site');
select lives_ok($$select public.cancel_slip('cccccccc-0000-0000-0000-000000000003', 'Not needed')$$,
  'given the project back, the creator can cancel');

-- ---------------------------------------------------------------------------
-- 2. A retried worker close is checked against the projects it closed (C4)
-- ---------------------------------------------------------------------------
select tests.logout();
update public.companies set labour_mode = 'attendance' where id = :'co';
select id as crew_a from public.crews where project_id = :'pa' and is_default \gset
insert into public.workers (company_id, name, rate_kind, rate_paisa)
values (:'co', 'Ram Bahadur', 'daily', 120000) returning id as ram \gset
insert into public.crew_members (company_id, crew_id, worker_id) values (:'co', :'crew_a', :'ram');
select tests.login(:'site');
select public.set_attendance(jsonb_build_object('project_id', :'pa', 'crew_id', :'crew_a', 'worker_id', :'ram',
  'work_date', '2026-05-01', 'time_in', '08:00', 'time_out', '17:00', 'minutes', 480));
select tests.rf_close(:'ram') as closed \gset

-- Access to Lakeside is kept; access to Bhandari, where the day was closed, is not.
select tests.logout();
delete from public.project_assignments where project_id = :'pa' and user_id = :'site';
select tests.login(:'site');
select throws_ok($$select tests.rf_close('$$ || :'ram' || $$')$$, '42501', null,
  'C4: a retry after losing the closed project is refused, even with another project kept');
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
update public.memberships set active = false where company_id = :'co' and user_id = :'site';
select tests.login(:'site');
select throws_ok($$select tests.rf_close('$$ || :'ram' || $$')$$, '42501', null, 'C4: ... and after being deactivated');
select tests.logout();
update public.memberships set active = true where company_id = :'co' and user_id = :'site';
select tests.login(:'site');
select is(tests.rf_close(:'ram'), :'closed'::jsonb, 'with access back, the retry returns the first result');

-- ---------------------------------------------------------------------------
-- 6. A closed project takes no client receipts and no reversals of them
-- ---------------------------------------------------------------------------
select tests.login(:'owner');
select tests.rf_receipt('00000000-0000-0000-0000-00000000cc01', 'dddddddd-0000-0000-0000-000000000001', :'pb') as receipt \gset
select tests.logout();
update public.projects set status = 'closed' where id = :'pb';
select tests.login(:'owner');
select throws_like($$select tests.rf_receipt(gen_random_uuid(), gen_random_uuid(), '$$ || :'pb' || $$')$$,
  '%closed%', 'a closed project takes no client receipt');
select is(tests.rf_receipt('00000000-0000-0000-0000-00000000cc01', 'dddddddd-0000-0000-0000-000000000001', :'pb'),
  :'receipt'::jsonb, '... a receipt saved before closing still returns on retry');
select throws_like($$select public.reverse_client_receipt(gen_random_uuid(), 'dddddddd-0000-0000-0000-000000000001', '2026-05-20', 'Cheque bounced')$$,
  '%closed%', '... and its receipts cannot be reversed');
select tests.logout();
update public.projects set status = 'completed' where id = :'pb';
select tests.login(:'owner');
select lives_ok($$select public.reverse_client_receipt(gen_random_uuid(), 'dddddddd-0000-0000-0000-000000000001', '2026-05-20', 'Cheque bounced')$$,
  'reopened, the receipt can be reversed');

-- ---------------------------------------------------------------------------
-- 8. The payment register by project follows moves between projects
-- ---------------------------------------------------------------------------
select tests.rf_pay(:'sup', 100000, :'pa', '2026-05-06') as whole \gset
select tests.rf_pay(:'sup', 100000, :'pa', '2026-05-06') as part \gset
select tests.rf_move(:'whole', :'pa', :'pb', 100000);
select tests.rf_move(:'part', :'pa', :'pb', 40000);
select is(tests.rf_register(:'co', :'pa', :'whole'), null, 'a payment moved wholly to B is not in A''s register');
select is(tests.rf_register(:'co', :'pb', :'whole'), 100000::bigint, '... it is in B''s, with its full amount');
select is(tests.rf_register(:'co', :'pa', :'part'), 60000::bigint, 'a part move leaves the rest in A''s register');
select is(tests.rf_register(:'co', :'pb', :'part'), 40000::bigint, '... and shows the moved part in B''s');
create temp table register_as_of on commit drop as
  select r.as_of, (select x.project_paisa from public.report_payments(:'co', '2026-05-01', '2026-05-31', :'pb', null, r.as_of) x
    where x.payment_id = :'whole') as paisa
  from (values ('2026-05-05'::date), ('2026-05-06'), ('2026-05-31')) r (as_of);
select is((select paisa from register_as_of where as_of = '2026-05-05'), null,
  'as of the day before the payment, B''s register does not have it');
select is((select paisa from register_as_of where as_of = '2026-05-06'), 100000::bigint,
  '... from its date, it shows in B with the moved amount, as the ledger dates the move');
select is((select paisa from register_as_of where as_of = '2026-05-31'), 100000::bigint, '... and stays there');
select tests.rf_move(:'part', :'pb', :'pa', 40000);
select is(tests.rf_register(:'co', :'pb', :'part'), null, 'moved back, it leaves B''s register again');

-- ---------------------------------------------------------------------------
-- 9. Peski as of a date ignores a reversal made later
-- ---------------------------------------------------------------------------
select tests.supplier(:'co', 'New Dealer') as nd \gset
select tests.rf_pay(:'nd', 1000000, :'pa', '2026-05-01', true) as pk \gset
select public.reverse_payment(gen_random_uuid(), :'pk', '2026-05-10', 'Cheque bounced');
select is(tests.rf_held(:'nd', :'pa', '2026-05-05'), array[1000000, 0]::bigint[],
  'before its reversal, the payment shows as peski, not overpayment');
select is(tests.rf_held(:'nd', :'pa', '2026-05-10'), array[0, 0]::bigint[], 'from the reversal date, nothing is held');
select is(tests.rf_held(:'nd', null, '2026-05-05'), array[0, 0]::bigint[], '... and none of it is unallocated');


-- Peski partly used against a bill, then the payment is reversed.
select tests.supplier(:'co', 'Second Dealer') as sd \gset
select tests.rf_pay(:'sd', 1000000, :'pa', '2026-05-01', true) as pk2 \gset
select tests.posted_bill(:'co', :'sd', :'pa', 600000, '2026-05-02') as b2 \gset
select public.settle(gen_random_uuid(), jsonb_build_array(jsonb_build_object(
  'payment_id', :'pk2', 'bill_id', :'b2', 'project_id', :'pa', 'amount_paisa', 600000, 'date', '2026-05-03')));
select is(tests.rf_held(:'sd', :'pa', '2026-05-04'), array[400000, 0]::bigint[],
  'peski partly used: 4,000 of it is left');
select public.reverse_payment(gen_random_uuid(), :'pk2', '2026-05-10', 'Cheque bounced');
select is(tests.rf_held(:'sd', :'pa', '2026-05-04'), array[400000, 0]::bigint[],
  '... and is still 4,000 on that date after the payment is reversed later');
select is(tests.rf_held(:'sd', :'pa', '2026-05-10'), array[0, 0]::bigint[], '... from the reversal, nothing is held');

select * from finish();
rollback;
