-- Attachments follow their owning record; files are immutable (design §3.7, S1/S2).
begin;
\ir helpers/helpers.psql
select plan(15);

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_user('fin') as fin \gset
select tests.create_user('mallory') as mallory \gset
select tests.create_company('Hotel Nirman', :'owner') as co \gset
select tests.create_company('Other Co', :'mallory') as co_m \gset
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);
select tests.add_member(:'co', :'fin', array['project_manager']::public.app_role[], true);

select tests.login(:'owner');
select public.create_project(:'co', 'H-1', 'Files', 100000) as p \gset
select id as rev from public.contract_revisions where project_id = :'p' \gset
select tests.logout();
select tests.assign(:'co', :'p', :'site');
select tests.assign(:'co', :'p', :'fin');

-- Site staff cannot attach to a financial record.
select tests.login(:'site');
select throws_ok(
  format($$insert into public.attachments (company_id, contract_revision_id) values (%L, %L)$$, :'co', :'rev'),
  '42501', null, 'site staff cannot attach files to a contract revision'
);

-- Admin attaches; the files function asks the database before handing out an upload link.
select tests.login(:'owner');
insert into public.attachments (id, company_id, contract_revision_id, file_name, content_type, size_bytes)
values ('11111111-1111-1111-1111-111111111111', :'co', :'rev', 'agreement.pdf', 'application/pdf', 2048);
select is((select size_bytes from public.attachment_upload_target('11111111-1111-1111-1111-111111111111')), 2048::bigint,
  'the admin who created the row may upload its file');

select tests.login(:'fin');
select throws_ok($$select public.attachment_upload_target('11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'only the user who created the row may upload its file');

-- Only the files function (service key), after seeing the object, marks it uploaded.
select tests.login(:'owner');
select throws_ok($$select public.mark_attachment_uploaded('11111111-1111-1111-1111-111111111111', auth.uid(), 2048)$$,
  '42501', null, 'users cannot mark a file uploaded themselves');
select tests.logout();
set local role service_role;
select throws_ok(format($$select public.mark_attachment_uploaded('11111111-1111-1111-1111-111111111111', %L, 999)$$, :'owner'),
  'P0001', null, 'a file of the wrong size is not accepted');
select lives_ok(format($$select public.mark_attachment_uploaded('11111111-1111-1111-1111-111111111111', %L, 2048)$$, :'owner'),
  'the files function marks the upload');
reset role;

-- Uploaded files cannot be replaced.
select tests.login(:'owner');
select throws_ok($$select public.attachment_upload_target('11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'an uploaded file gets no new upload link');

-- Reading follows the owner: finance + project access.
select tests.login(:'fin');
select is((select count(*) from public.attachments), 1::bigint, 'finance user on the project can see the file');

select tests.login(:'site');
select is((select count(*) from public.attachments), 0::bigint, 'site staff without finance cannot');

select tests.login(:'mallory');
select is((select count(*) from public.attachments), 0::bigint, 'another company cannot');
select throws_ok($$select public.attachment_upload_target('11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'or get an upload link');

-- Size and type limits.
select tests.login(:'owner');
insert into public.attachments (id, company_id, contract_revision_id, content_type, size_bytes)
values ('22222222-2222-2222-2222-222222222222', :'co', :'rev', 'image/jpeg', 20000000),
       ('33333333-3333-3333-3333-333333333333', :'co', :'rev', 'text/html', 100);
select throws_ok($$select public.attachment_upload_target('22222222-2222-2222-2222-222222222222')$$,
  '22023', null, 'a file over 10 MB gets no upload link');
select throws_ok($$select public.attachment_upload_target('33333333-3333-3333-3333-333333333333')$$,
  '22023', null, 'only photos and PDFs get an upload link');

-- Revision files are history: removing one hides it and keeps the file.
select is(public.remove_attachment('11111111-1111-1111-1111-111111111111'), false, 'a revision file is hidden, not deleted');
select tests.logout();
select isnt((select removed_at from public.attachments where id = '11111111-1111-1111-1111-111111111111'), null, 'and marked removed');

select * from finish();
rollback;
