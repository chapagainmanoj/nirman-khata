-- Attachment files move to Cloudflare R2 (design §3.7). The browser no longer talks to a storage
-- API with its own policies: the `files` Edge Function asks these functions, as the signed-in
-- user, whether an action is allowed, and only then hands out a 5-minute presigned URL.
-- Object key stays "{company_id}/{attachment_id}". Logos stay in Supabase Storage (public, tiny).

-- Supabase Storage is no longer used for attachments; nobody may write there directly.
drop policy attachment_objects_select on storage.objects;
drop policy attachment_objects_insert on storage.objects;
drop policy attachment_objects_delete on storage.objects;
drop function private.can_access_attachment_path(text, text);
drop function private.attachment_id_from_path(text);

-- What may be uploaded, and how big. The presigned PUT signs this type and size, so the upload
-- must match what the row says.
create function private.attachment_type_ok(p_type text) returns boolean
language sql immutable set search_path = '' as $$
  select p_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf')
$$;

-- Called by the files function as the user: may this user upload the file for this row now?
-- Only the user who created the row, while it is not uploaded, and the owner's upload rule holds.
create function public.attachment_upload_target(p_attachment uuid)
returns table (company_id uuid, content_type text, size_bytes bigint)
language plpgsql stable security definer set search_path = '' as $$
declare a public.attachments;
begin
  select * into a from public.attachments where id = p_attachment;
  if not found or a.created_by is distinct from auth.uid()
     or not private.can_access_attachment(p_attachment, 'upload') then
    raise exception 'You cannot upload this file' using errcode = '42501';
  end if;
  if not private.attachment_type_ok(a.content_type) then
    raise exception 'Only photos and PDFs can be attached' using errcode = '22023';
  end if;
  if a.size_bytes is null or a.size_bytes < 1 or a.size_bytes > 10485760 then
    raise exception 'A file can be at most 10 MB' using errcode = '22023';
  end if;
  return query select a.company_id, a.content_type, a.size_bytes;
end $$;

-- Called by the files function with the service key, after it has seen the object in R2 with
-- the expected size. Users cannot call it: a row is marked uploaded only when the file exists.
drop function public.mark_attachment_uploaded(uuid);
create function public.mark_attachment_uploaded(p_attachment uuid, p_user uuid, p_size bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.attachments;
begin
  select * into a from public.attachments where id = p_attachment for update;
  if not found or a.created_by is distinct from p_user or a.uploaded_at is not null then
    raise exception 'Attachment not found or already uploaded' using errcode = 'P0002';
  end if;
  if p_size is distinct from a.size_bytes then
    raise exception 'The uploaded file is not the expected size' using errcode = 'P0001';
  end if;
  update public.attachments set uploaded_at = now() where id = p_attachment;
end $$;

-- Remove a photo: deleted on drafts, hidden otherwise. Returns true when the row was deleted
-- and its file should be deleted too (the files function does that with the service key).
drop function public.remove_attachment(uuid);
create function public.remove_attachment(p_attachment uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare a public.attachments;
begin
  select * into a from public.attachments where id = p_attachment for update;
  if not found then
    raise exception 'Attachment not found' using errcode = 'P0002';
  end if;
  if private.can_access_attachment(p_attachment, 'delete') then
    delete from public.attachments where id = p_attachment;
    return a.uploaded_at is not null;
  elsif a.uploaded_at is null and a.created_by = auth.uid() then
    delete from public.attachments where id = p_attachment; -- upload never finished
    return true; -- a file may have arrived without being confirmed
  elsif private.is_admin(a.company_id) and private.can_access_attachment(p_attachment, 'read') then
    update public.attachments set removed_at = now() where id = p_attachment;
    return false;
  end if;
  raise exception 'You cannot remove this file' using errcode = '42501';
end $$;

revoke execute on function private.attachment_type_ok(text) from public, anon;
revoke execute on function public.attachment_upload_target(uuid) from public, anon;
revoke execute on function public.remove_attachment(uuid) from public, anon;
revoke execute on function public.mark_attachment_uploaded(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.mark_attachment_uploaded(uuid, uuid, bigint) to service_role;
