-- Company branding: admins set the logo and accent; nobody writes into another company's folder.
begin;
\ir helpers/helpers.psql
select plan(9);

select tests.create_user('owner') as owner \gset
select tests.create_user('site') as site \gset
select tests.create_user('mallory') as mallory \gset
select tests.create_company('Brand Nirman', :'owner') as co \gset
select tests.create_company('Other Co', :'mallory') as co_m \gset
select tests.add_member(:'co', :'site', array['site_staff']::public.app_role[], false);

select is((select accent from public.companies where id = :'co'), 'teal', 'a new company starts on the default accent');

-- Admin uploads a logo into the company folder and points the company at it.
select tests.login(:'owner');
select lives_ok(
  format($$insert into storage.objects (bucket_id, name) values ('logos', %L)$$, :'co' || '/11111111-1111-1111-1111-111111111111.webp'),
  'admin uploads a logo'
);
select lives_ok(
  format($$update public.companies set logo_path = %L, accent = 'indigo' where id = %L$$, :'co' || '/11111111-1111-1111-1111-111111111111.webp', :'co'),
  'admin sets the logo and accent'
);
select throws_ok(
  format($$update public.companies set accent = 'red' where id = %L$$, :'co'),
  '23514', null, 'an accent outside the checked list is rejected'
);
select throws_ok(
  format($$update public.companies set logo_path = %L where id = %L$$, :'co_m' || '/22222222-2222-2222-2222-222222222222.webp', :'co'),
  '23514', null, 'the logo must be in the company''s own folder'
);
select throws_ok(
  format($$insert into storage.objects (bucket_id, name) values ('logos', %L)$$, :'co' || '/logo.svg'),
  '42501', null, 'only uuid-named png, jpg or webp files'
);

-- Site staff cannot change the logo or upload one.
select tests.login(:'site');
select throws_ok(
  format($$insert into storage.objects (bucket_id, name) values ('logos', %L)$$, :'co' || '/33333333-3333-3333-3333-333333333333.png'),
  '42501', null, 'site staff cannot upload a logo'
);
update public.companies set accent = 'plum' where id = :'co';
select is((select accent from public.companies where id = :'co'), 'indigo', 'site staff cannot change the accent');

-- Another company's admin cannot write into this folder.
select tests.login(:'mallory');
select throws_ok(
  format($$insert into storage.objects (bucket_id, name) values ('logos', %L)$$, :'co' || '/44444444-4444-4444-4444-444444444444.png'),
  '42501', null, 'another company cannot upload into this folder'
);

select tests.logout();
select * from finish();
rollback;
