-- Simple forms: a company setting, off by default, changed only by an admin.
begin;
\ir helpers/helpers.psql
select plan(4);

select tests.create_user('owner') as owner \gset
select tests.create_user('acc') as acc \gset
select tests.create_company('Sajilo Nirman', :'owner') as co \gset
insert into public.memberships (company_id, user_id, roles, can_view_finance, can_record_payments)
values (:'co', :'acc', '{accounts}', true, true);

select tests.login(:'owner');
select is((select simple_forms from public.companies where id = :'co'), false, 'new companies start with detailed forms');
update public.companies set simple_forms = true where id = :'co';
select is((select simple_forms from public.companies where id = :'co'), true, 'the admin switches to simple forms');

select tests.login(:'acc');
update public.companies set simple_forms = false where id = :'co';
select is((select simple_forms from public.companies where id = :'co'), true, 'accounts staff cannot change it');
select is((select simple_forms from public.companies where id = :'co'), true, '... and they can read it, so their forms fold too');

select * from finish();
rollback;
