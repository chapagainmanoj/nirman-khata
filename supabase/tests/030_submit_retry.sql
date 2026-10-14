-- A submit whose answer was lost can be sent again (second review #11): the submit keeps its result
-- under an operation key, and the sender can ask whether it went through.
begin;
\ir helpers/helpers.psql
select plan(12);

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_user('other') as other \gset
select tests.create_company('Retry Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'other', array['site_staff']::public.app_role[], false);
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Bhandari house', 1000000000) as pa \gset
select tests.supplier(:'co', 'Shrestha Suppliers') as sup \gset
select tests.material(:'co', 'Cement') as cement \gset
select tests.heading(:'co', 'Cement') as heading \gset
select tests.unit(:'co', 'bag') as bag \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select tests.assign(:'co', :'pa', :'other');

-- Slip: sent with a key; the answer is "lost".
select tests.login(:'site');
select public.save_slip_draft(jsonb_build_object('id', 'ffffffff-0000-0000-0000-000000000001', 'supplier_id', :'sup',
  'request_date', '2026-05-01', 'lines', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(),
    'project_id', :'pa', 'material_id', :'cement', 'qty', 10, 'unit_id', :'bag'))));
select is(public.submit_slip('ffffffff-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000005a1'),
  'pending'::public.slip_status, 'a slip sent with a key is submitted');
select tests.logout();
select count(*) as notes_before from public.notifications where slip_id = 'ffffffff-0000-0000-0000-000000000001' \gset
select tests.login(:'site');
select throws_ok($$select public.save_slip_draft(jsonb_build_object('id', 'ffffffff-0000-0000-0000-000000000001',
  'supplier_id', '$$ || :'sup' || $$', 'lines', '[]'::jsonb))$$, null, null,
  'the retry''s draft save is refused: the slip is no longer a draft');
select is(public.finished_submit('00000000-0000-0000-0000-0000000005a1') ->> 'status', 'pending',
  '... so the form asks, and learns the slip was already sent');
select is(public.submit_slip('ffffffff-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000005a1'),
  'pending'::public.slip_status, 'sending again with the same key returns the first answer');
select tests.logout();
select is((select count(*) from public.notifications where slip_id = 'ffffffff-0000-0000-0000-000000000001'),
  :'notes_before'::bigint, '... and notifies nobody twice');
select ok(:'notes_before'::bigint > 0, '... (the first send did notify the approvers)');

select tests.login(:'other');
select is(public.finished_submit('00000000-0000-0000-0000-0000000005a1'), null, 'another user cannot read that answer');

-- Bill sent to Accounts by site staff, who can no longer see it once sent.
select tests.login(:'site');
select public.save_bill_draft(jsonb_build_object('id', 'ffffffff-0000-0000-0000-000000000002', 'supplier_id', :'sup',
  'bill_no', 'B-9', 'bill_date', '2026-05-01', 'lines', jsonb_build_array(jsonb_build_object(
    'project_id', :'pa', 'heading_id', :'heading', 'description', 'Cement', 'qty', 1, 'unit_id', :'bag',
    'amount_paisa', 100000, 'unmatched_reason', 'test'))));
select lives_ok($$select public.submit_bill('ffffffff-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000005b1')$$,
  'a bill sent with a key goes to Accounts');
select is(public.finished_submit('00000000-0000-0000-0000-0000000005b1') ->> 'status', 'under_review',
  'the sender learns it was already sent, though the bill is now out of their sight');

-- The one-argument submit still works.
select public.save_bill_draft(jsonb_build_object('id', 'ffffffff-0000-0000-0000-000000000003', 'supplier_id', :'sup',
  'bill_no', 'B-10', 'bill_date', '2026-05-01', 'lines', jsonb_build_array(jsonb_build_object(
    'project_id', :'pa', 'heading_id', :'heading', 'description', 'Cement', 'qty', 1, 'unit_id', :'bag',
    'amount_paisa', 100000, 'unmatched_reason', 'test'))));
select lives_ok($$select public.submit_bill('ffffffff-0000-0000-0000-000000000003')$$, 'a submit without a key still works');

-- Only submits answer, and only while the sender still works in the company.
select tests.login(:'owner');
select public.record_payment('00000000-0000-0000-0000-0000000005c1', jsonb_build_object('id', gen_random_uuid(),
  'supplier_id', :'sup', 'payment_date', '2026-05-02', 'amount_paisa', 1000));
select is(public.finished_submit('00000000-0000-0000-0000-0000000005c1'), null, 'a payment''s answer is not given out');
select tests.logout();
update public.memberships set active = false where company_id = :'co' and user_id = :'site';
select tests.login(:'site');
select is(public.finished_submit('00000000-0000-0000-0000-0000000005b1'), null, 'a deactivated sender gets no answer');

select * from finish();
rollback;
