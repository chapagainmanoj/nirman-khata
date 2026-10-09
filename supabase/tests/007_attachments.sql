-- Attachments follow their owning record; files are immutable (design §3.7, S1/S2).
begin;
\ir helpers/helpers.psql
select plan(10);

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

-- Admin attaches and uploads.
select tests.login(:'owner');
insert into public.attachments (id, company_id, contract_revision_id, file_name)
values ('11111111-1111-1111-1111-111111111111', :'co', :'rev', 'agreement.pdf');
insert into storage.objects (bucket_id, name) values ('attachments', :'co' || '/11111111-1111-1111-1111-111111111111');
select lives_ok($$select public.mark_attachment_uploaded('11111111-1111-1111-1111-111111111111')$$, 'admin uploads and marks the file');

-- Uploaded files cannot be replaced.
update storage.objects set name = name where bucket_id = 'attachments';
select throws_ok(
  format($$insert into storage.objects (bucket_id, name) values ('attachments', %L)$$, :'co' || '/11111111-1111-1111-1111-111111111111'),
  null, null, 'an uploaded file cannot be uploaded again'
);

-- Reading follows the owner: finance + project access.
select tests.login(:'fin');
select is((select count(*) from storage.objects where bucket_id = 'attachments'), 1::bigint, 'finance user on the project can read the file');
select is((select count(*) from public.attachments), 1::bigint, 'and its attachment row');

select tests.login(:'site');
select is((select count(*) from storage.objects where bucket_id = 'attachments'), 0::bigint, 'site staff without finance cannot read the file');
select is((select count(*) from public.attachments), 0::bigint, 'or its attachment row');

select tests.login(:'mallory');
select is((select count(*) from storage.objects where bucket_id = 'attachments'), 0::bigint, 'another company cannot read the file');
select throws_ok(
  format($$insert into storage.objects (bucket_id, name) values ('attachments', %L)$$, :'co_m' || '/' || gen_random_uuid()),
  '42501', null, 'cannot upload to a path without an attachment row'
);

select tests.logout();
select is((select count(*) from storage.objects where bucket_id = 'attachments' and name like :'co' || '/%'), 1::bigint,
  'still exactly one stored object');

select * from finish();
rollback;
