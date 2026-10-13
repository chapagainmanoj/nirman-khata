-- Simple forms (company setting): the same records and rules, but forms fold their less-used
-- fields into an expandable "More" section. Admins change it through the companies update policy.
alter table public.companies add column simple_forms boolean not null default false;
