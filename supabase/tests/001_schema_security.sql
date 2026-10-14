-- Catalog-level security checks (design §3.4, test S3).
begin;
\ir helpers/helpers.psql
select plan(9);

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
     -- registration_allowlist is platform-wide (platform admins only), not tenant data.
     and c.relname not in ('companies', 'profiles', 'registration_allowlist')
     and not exists (
       select 1 from pg_attribute a
       where a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped)),
  null,
  'every tenant table has company_id (only companies, profiles and the allow list are exempt)'
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

select is(
  (select array_agg(p.oid::regprocedure::text order by 1)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
  null,
  'no public function is callable by anonymous users'
);

select ok(
  not has_function_privilege('authenticated', 'private.add_ledger(uuid, text, uuid, uuid, bigint, bigint, bigint)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.begin_op(uuid, uuid, text, jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.settle_one(uuid, uuid, uuid, bigint, date, uuid, text)', 'EXECUTE'),
  'ledger and settlement writers cannot be called directly'
);

-- Every function that writes money rows, by name, so a new overload cannot slip through.
select is(
  (select array_agg(p.oid::regprocedure::text order by 1)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in ('begin_op', 'finish_op', 'new_event', 'add_ledger', 'negate_events', 'lock_supplier', 'lock_party',
                       'lock_docs', 'settle_one', 'unsettle_where', 'reverse_with_event', 'post_payment', 'pay_now',
                       'post_labour', 'notify')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  null,
  'no internal writer (milestones 2 and 3) is callable by signed-in users'
);

select * from finish();
rollback;
