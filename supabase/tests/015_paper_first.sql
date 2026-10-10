-- Paper first (UX review flow A): a bill photographed before it is typed, and the paper total.
begin;
\ir helpers/helpers.psql
select plan(13);

select tests.create_user('owner') as owner \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('site') as site \gset
select tests.create_company('Paper Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);

select tests.login(:'owner');
select public.create_project(:'co', 'P1', 'School', 100000000) as p1 \gset
select tests.supplier(:'co', 'Gandaki Hardware') as sup \gset
select tests.heading(:'co', 'Cement') as h_cement \gset
select tests.logout();
select tests.assign(:'co', :'p1', :'site');

-- Site staff save a bill with only the supplier, then add the photo to it.
select tests.login(:'site');
select lives_ok($$ select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-0000000000f1', 'supplier_id', '$$ || :'sup' || $$')) $$,
  'A draft bill can be saved with only the supplier');
select is((select bill_no from public.supplier_bills where id = 'bbbbbbbb-0000-0000-0000-0000000000f1'), null,
  'It has no bill number yet');
select lives_ok($$ insert into public.attachments (id, company_id, bill_id, kind, file_name, content_type, size_bytes)
  values (gen_random_uuid(), '$$ || :'co' || $$', 'bbbbbbbb-0000-0000-0000-0000000000f1', 'photo', 'bill.jpg', 'image/jpeg', 1000) $$,
  'The photo can be attached to the bare draft');
select throws_like($$ select public.submit_bill('bbbbbbbb-0000-0000-0000-0000000000f1') $$,
  'Add the bill photo, or enter the bill number', 'Without an uploaded photo it cannot go to Accounts bare');
select tests.logout();
update public.attachments set uploaded_at = now() where bill_id = 'bbbbbbbb-0000-0000-0000-0000000000f1';
select tests.login(:'site');
select lives_ok($$ select public.submit_bill('bbbbbbbb-0000-0000-0000-0000000000f1') $$,
  'With the photo uploaded, site staff send it to Accounts untyped');
select tests.logout();

-- Accounts types it from the photo: one line of Rs 10,000 plus Rs 500 transport.
select tests.login(:'acct');
select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-0000000000f1', 'supplier_id', :'sup', 'bill_date', '2026-05-05',
  'transport_paisa', 50000, 'paper_total_paisa', 1100000,
  'lines', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'line_type', 'charge', 'heading_id', :'h_cement',
    'description', 'Cement', 'amount_paisa', 1000000))));
select ok(exists (select 1 from jsonb_to_recordset(public.bill_preview('bbbbbbbb-0000-0000-0000-0000000000f1') -> 'checks') as c(code text, severity text, message text) where code = 'no_bill_no' and severity = 'error'),
  'A missing bill number blocks posting');
select ok(exists (select 1 from jsonb_to_recordset(public.bill_preview('bbbbbbbb-0000-0000-0000-0000000000f1') -> 'checks') as c(code text, severity text, message text)
  where code = 'paper_total_mismatch' and severity = 'error' and message like '%10500.00%11000.00%'),
  'A paper total that does not match blocks posting and says both amounts');
select throws_like($$ select public.post_bill(gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-0000000000f1') $$,
  'Enter the bill number%', 'post_bill refuses a bill with no number');

-- Corrected from the paper: number added, the paper total was misread.
select public.save_bill_draft(jsonb_build_object(
  'id', 'bbbbbbbb-0000-0000-0000-0000000000f1', 'supplier_id', :'sup', 'bill_no', 'B-77', 'bill_date', '2026-05-05',
  'transport_paisa', 50000, 'paper_total_paisa', 1050000,
  'lines', jsonb_build_array(jsonb_build_object('project_id', :'p1', 'line_type', 'charge', 'heading_id', :'h_cement',
    'description', 'Cement', 'amount_paisa', 1000000))));
select ok(not exists (select 1 from jsonb_to_recordset(public.bill_preview('bbbbbbbb-0000-0000-0000-0000000000f1') -> 'checks') as c(code text, severity text, message text) where severity = 'error'),
  'With the number and a matching paper total, nothing blocks posting');
select lives_ok($$ select public.post_bill(gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-0000000000f1') $$,
  'The bill posts');
select is((select status::text from public.supplier_bills where id = 'bbbbbbbb-0000-0000-0000-0000000000f1'), 'posted', 'It is posted');
select is(tests.ledger(:'sup', :'p1', 'balance_paisa'), 1050000::bigint, 'The supplier is owed what the paper says');
select tests.logout();

-- The database itself refuses a numberless bill outside draft.
insert into public.supplier_bills (company_id, id, supplier_id, bill_date, cost_date, vat_treatment)
values (:'co', 'bbbbbbbb-0000-0000-0000-0000000000f2', :'sup', '2026-05-06', '2026-05-06', 'vat_as_cost');
select throws_ok($$ update public.supplier_bills set status = 'posted' where id = 'bbbbbbbb-0000-0000-0000-0000000000f2' $$,
  '23514', null, 'A posted bill always has its number');

select * from finish();
rollback;
