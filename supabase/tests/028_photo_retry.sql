-- A bill photo that failed to upload is kept on the phone and sent later, so it can arrive after
-- the bill was sent to Accounts or posted (second review #10; product owner, 2026-10-14). Adding a
-- photo then is allowed for the bill's creator and for Accounts or Admin; removing one is not.
begin;
\ir helpers/helpers.psql
select plan(10);

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_user('other') as other \gset
select tests.create_user('acct') as acct \gset
select tests.create_user('viewer') as viewer \gset
select tests.create_company('Photo Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'other', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'acct', array['accounts']::public.app_role[], true);
select tests.add_member(:'co', :'viewer', array['viewer']::public.app_role[], false);
select tests.login(:'owner');
select public.create_project(:'co', 'A', 'Bhandari house', 1000000000) as pa \gset
select tests.supplier(:'co', 'Shrestha Suppliers') as sup \gset
select tests.heading(:'co', 'Cement') as cement \gset
select tests.unit(:'co', 'bag') as bag \gset
select tests.logout();
select tests.assign(:'co', :'pa', :'site');
select tests.assign(:'co', :'pa', :'other');
select tests.assign(:'co', :'pa', :'viewer');

create function tests.pr_photo(p_company uuid, p_bill uuid) returns uuid language sql as $$
  insert into public.attachments (company_id, bill_id, kind, file_name, content_type, size_bytes)
  values (p_company, p_bill, 'photo', 'bill.jpg', 'image/jpeg', 1000) returning id
$$;
grant execute on all functions in schema tests to authenticated;

-- Site staff types a bill and sends it to Accounts.
select tests.login(:'site');
select public.save_bill_draft(jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000001', 'supplier_id', :'sup',
  'bill_no', 'B-77', 'bill_date', '2026-05-01', 'lines', jsonb_build_array(jsonb_build_object(
    'project_id', :'pa', 'heading_id', :'cement', 'description', 'Cement', 'qty', 1, 'unit_id', :'bag',
    'amount_paisa', 100000, 'unmatched_reason', 'test'))));
select public.submit_bill('eeeeeeee-0000-0000-0000-000000000001');
select tests.pr_photo(:'co', 'eeeeeeee-0000-0000-0000-000000000001') as sent_photo \gset
select ok(:'sent_photo' is not null, 'the creator can still add a photo after sending the bill to Accounts');
select is((select size_bytes from public.attachment_upload_target(:'sent_photo')), 1000::bigint, '... and upload its file');

select tests.login(:'other');
select throws_ok($$select tests.pr_photo('$$ || :'co' || $$', 'eeeeeeee-0000-0000-0000-000000000001')$$, '42501', null,
  'other site staff cannot add a photo to a bill they did not make');
select tests.login(:'viewer');
select throws_ok($$select tests.pr_photo('$$ || :'co' || $$', 'eeeeeeee-0000-0000-0000-000000000001')$$, '42501', null,
  'a viewer cannot add a photo');

-- Accounts posts it. Photos can still be added, by Accounts and by the creator.
select tests.login(:'acct');
select public.post_bill(gen_random_uuid(), 'eeeeeeee-0000-0000-0000-000000000001');
select lives_ok($$select tests.pr_photo('$$ || :'co' || $$', 'eeeeeeee-0000-0000-0000-000000000001')$$,
  'Accounts can add a photo to a posted bill');
select tests.login(:'site');
select tests.pr_photo(:'co', 'eeeeeeee-0000-0000-0000-000000000001') as posted_photo \gset
select ok(:'posted_photo' is not null, 'the creator can add a photo to the posted bill');

-- A photo on a posted bill cannot be removed by its creator (only hidden by an admin).
select tests.logout();
update public.attachments set uploaded_at = now() where id = :'posted_photo';
select tests.login(:'site');
select throws_ok($$select public.remove_attachment('$$ || :'posted_photo' || $$')$$, '42501', null,
  'a photo on a posted bill cannot be removed by its creator');

-- The creator loses the project: no more photos.
select tests.logout();
delete from public.project_assignments where project_id = :'pa' and user_id = :'site';
select tests.login(:'site');
select throws_ok($$select tests.pr_photo('$$ || :'co' || $$', 'eeeeeeee-0000-0000-0000-000000000001')$$, '42501', null,
  'a creator who lost the project cannot add photos');
select tests.logout();
select tests.assign(:'co', :'pa', :'site');

-- A reversed bill takes no new photos.
select tests.login(:'acct');
select public.reverse_bill(gen_random_uuid(), 'eeeeeeee-0000-0000-0000-000000000001', '2026-05-10', 'Wrong supplier');
select throws_ok($$select tests.pr_photo('$$ || :'co' || $$', 'eeeeeeee-0000-0000-0000-000000000001')$$, '42501', null,
  'a reversed bill takes no new photos');
select tests.login(:'site');
select throws_ok($$select tests.pr_photo('$$ || :'co' || $$', 'eeeeeeee-0000-0000-0000-000000000001')$$, '42501', null,
  '... not from its creator either');

select * from finish();
rollback;
