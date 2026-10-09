-- Catalog-level security checks (design §3.4, test S3).
begin;
\ir helpers/helpers.psql
select plan(6);

select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null,
  'every public table has row-level security enabled'
);

select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
  null,
  'every public view uses security_invoker'
);

select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname not in ('companies', 'profiles')
     and not exists (
       select 1 from pg_attribute a
       where a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped)),
  null,
  'every tenant table has company_id (only companies and profiles are exempt)'
);

select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not coalesce(p.proconfig @> array['search_path=""'], false)),
  null,
  'every security definer function pins an empty search_path'
);

select ok(
  not has_table_privilege('authenticated', 'public.contract_revisions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.budget_revisions', 'DELETE')
  and not has_table_privilege('authenticated', 'public.audit_log', 'INSERT'),
  'history tables are not updatable or deletable by users'
);

select ok(
  not has_function_privilege('anon', 'public.create_project(uuid, text, text, bigint, bigint, date, jsonb)', 'EXECUTE'),
  'anonymous users cannot call RPCs'
);

select * from finish();
rollback;
