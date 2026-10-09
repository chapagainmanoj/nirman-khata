-- Local demo data, loaded by `supabase db reset` (never runs on the hosted project).
-- Every account's password is: password123
--
--   Login (mobile)  Name                Role                         Sees
--   9800000001      Ram Owner           Owner / Admin                everything
--   9800000002      Sita Engineer       Project Manager (+ money)    P-1, P-2
--   9800000003      Hari Supervisor     Site Staff                   P-1, no amounts
--   9800000004      Gita Accounts       Accounts                     all projects and amounts
--   9800000005      Bikash Viewer       Viewer                       P-2, no amounts

-- Auth users. Phone logins are stored as internal emails (docs/technical-design.md §8).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated',
  '97798000000' || u.n || '@phone.nirmankhata.invalid',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}',
  jsonb_build_object('full_name', u.full_name, 'phone', '+97798000000' || u.n),
  now(), now(), '', '', '', ''
from (values
  ('10000000-0000-0000-0000-000000000001', '01', 'Ram Owner'),
  ('10000000-0000-0000-0000-000000000002', '02', 'Sita Engineer'),
  ('10000000-0000-0000-0000-000000000003', '03', 'Hari Supervisor'),
  ('10000000-0000-0000-0000-000000000004', '04', 'Gita Accounts'),
  ('10000000-0000-0000-0000-000000000005', '05', 'Bikash Viewer')
) as u (id, n, full_name);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u
where u.email like '97798000000%@phone.nirmankhata.invalid';

-- Company, created as the owner so the normal setup (admin membership, default catalog) runs.
select set_config('request.jwt.claims', '{"sub": "10000000-0000-0000-0000-000000000001", "role": "authenticated"}', false);
select public.create_company('Demo Nirman Sewa', 'Ram Owner', '+9779800000001');

insert into public.memberships (company_id, user_id, roles, can_view_finance, can_record_payments, can_approve_slips)
select c.id, m.user_id::uuid, m.roles::public.app_role[], m.finance, m.payments, m.approve
from public.companies c,
(values
  ('10000000-0000-0000-0000-000000000002', '{project_manager}', true, false, true),
  ('10000000-0000-0000-0000-000000000003', '{site_staff}', false, false, false),
  ('10000000-0000-0000-0000-000000000004', '{accounts}', true, true, false),
  ('10000000-0000-0000-0000-000000000005', '{viewer}', false, false, false)
) as m (user_id, roles, finance, payments, approve)
where c.name = 'Demo Nirman Sewa';

-- Two projects: contract 50 lakh / budget 40 lakh, and contract 25 lakh with budget = contract.
select public.create_project(
  (select id from public.companies where name = 'Demo Nirman Sewa'),
  'P-1', 'Ward 5 school building', 500000000, 400000000, '2025-07-17',
  '{"client_name": "Pokhara Metropolitan City", "district": "Kaski", "municipality": "Pokhara", "ward": "5",
    "manager_id": "10000000-0000-0000-0000-000000000002", "planned_start": "2025-07-17", "planned_end": "2026-07-16",
    "status": "active"}'
);
select public.create_project(
  (select id from public.companies where name = 'Demo Nirman Sewa'),
  'P-2', 'Private house, Lakeside', 250000000, null, '2026-04-14',
  '{"client_name": "Shrestha family", "district": "Kaski", "municipality": "Pokhara", "ward": "6",
    "manager_id": "10000000-0000-0000-0000-000000000002", "planned_start": "2026-04-14", "status": "planned"}'
);

insert into public.project_assignments (company_id, project_id, user_id)
select p.company_id, p.id, a.user_id::uuid
from public.projects p
join (values ('P-1', '10000000-0000-0000-0000-000000000003'), ('P-2', '10000000-0000-0000-0000-000000000005')) as a (code, user_id)
  on a.code = p.code;

select set_config('request.jwt.claims', '', false);
