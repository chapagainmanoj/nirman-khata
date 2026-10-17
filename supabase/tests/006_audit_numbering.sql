-- Audit log, created_by enforcement, document numbering.
begin;
\ir helpers/helpers.psql
select plan(7);

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_company('Golf Nirman', :'owner') as co \gset
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[]);

select tests.login(:'owner');
select public.create_project(:'co', 'G-1', 'Audit me', 100000) as p \gset
update public.projects set status = 'on_hold' where id = :'p';

select ok(exists (
  select 1 from public.audit_log where entity = 'projects' and entity_id = :'p' and action = 'insert' and user_id = :'owner'
), 'project creation is audited with the user');
select is((select before ->> 'status' || '->' || (after ->> 'status') from public.audit_log
           where entity = 'projects' and entity_id = :'p' and action = 'update'), 'active->on_hold',
  'updates keep before and after values');

-- created_by cannot be spoofed.
insert into public.units (company_id, code, name, created_by) values (:'co', 'drum', 'Drum', :'site');
select is((select created_by from public.units where company_id = :'co' and code = 'drum'), :'owner'::uuid,
  'created_by is set to the caller, not the supplied value');

select tests.login(:'site');
select is((select count(*) from public.audit_log), 0::bigint, 'non-admins cannot read the audit log');
-- Only document-creating functions take numbers (they run as the owner); the caller is still the member.
reset role;
select is(public.next_doc_number(:'co', 'order_slip', 'OS'), 'OS-0001', 'first slip number');
select is(public.next_doc_number(:'co', 'order_slip', 'OS'), 'OS-0002', 'numbers increase');
set role authenticated;
select is((select count(*) from public.doc_sequences), 0::bigint, 'sequences are not readable directly');

select * from finish();
rollback;
