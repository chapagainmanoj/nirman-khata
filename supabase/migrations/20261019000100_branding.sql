-- Company branding (req §3.1 "optional logo"): an uploaded logo and a choice of accent colour.
-- The accent is one of a short list checked for contrast (app/src/lib/accents.ts); red, yellow
-- and green are not offered because they mean error, pending and paid. Logos are not secret, so
-- they live in a public bucket; only the company's admins can add or remove them.

alter table public.companies
  add column accent text not null default 'teal'
    check (accent in ('teal', 'ocean', 'indigo', 'plum', 'pine', 'charcoal')),
  -- A company can only point at a file in its own folder of the logos bucket.
  add constraint companies_logo_path_own_folder
    check (logo_path is null or logo_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- "{company_id}/{file_id}.{ext}" -> company id, or null when the name is anything else.
create function private.logo_company(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  if p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$' then
    return null;
  end if;
  return split_part(p_name, '/', 1)::uuid;
end $$;

-- Reading is public through the bucket URL; the select policy is what lets members list and
-- admins delete through the API.
create policy logo_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'logos' and private.is_member(private.logo_company(name)));
create policy logo_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and private.is_admin(private.logo_company(name)));
create policy logo_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and private.is_admin(private.logo_company(name)));
-- No update policy: a new logo is a new file (which also refreshes caches).
