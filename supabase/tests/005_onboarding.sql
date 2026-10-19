-- Company registration, default catalog, one company per login, admin safety.
begin;
\ir helpers/helpers.psql
select plan(11);

select tests.create_user('owner') as owner \gset
select tests.create_user('other') as other \gset
select tests.create_company('Echo Builders', :'owner') as co \gset

select is((select count(*) from public.cost_headings where company_id = :'co' and parent_id is null), 7::bigint,
  '7 top-level cost headings seeded');
select is((select count(*) from public.cost_headings where company_id = :'co' and parent_id is not null), 17::bigint,
  '17 subheadings seeded (10 materials + 7 subcontract)');
select is((select count(*) from public.units where company_id = :'co'), 15::bigint, '15 units seeded (sq.ft, litre and running ft with the first 12)');
select is((select array_agg(code order by code) from public.units where company_id = :'co' and needs_note), array['load', 'trip'],
  'trip and load require a vehicle note');
select is((select count(*) from public.materials where company_id = :'co'), 22::bigint, '22 materials seeded (the owner''s full list, 2026-10-19)');
select is((select vat_treatment::text from public.companies where id = :'co'), 'vat_as_cost', 'VAT default is VAT as cost');
select is((select slip_approval_required from public.companies where id = :'co'), true, 'slip approval on by default');
select is((select default_date_display::text from public.companies where id = :'co'), 'bs', 'BS dates by default');

select tests.login(:'owner');
select throws_ok($$select public.create_company('Second', 'Owner again')$$, 'P0001', null,
  'one login cannot own a second company');

-- One active company per login, even when added by the service role.
select tests.logout();
select tests.create_company('Foxtrot', :'other') as co2 \gset
select throws_ok(
  format($$insert into public.memberships (company_id, user_id, roles) values (%L, %L, '{viewer}')$$, :'co', :'other'),
  '23505', null, 'a user cannot be active in two companies');

-- The last admin cannot be removed.
select throws_ok(
  format($$update public.memberships set active = false where company_id = %L and user_id = %L$$, :'co', :'owner'),
  'P0001', null, 'the last active admin cannot be deactivated');

select * from finish();
rollback;
