#!/usr/bin/env bash
# Attachment files through the real `files` Edge Function and S3 endpoint (design §3.7, S1/S2).
# Locally the bucket is Supabase Storage's S3 endpoint; in production it is Cloudflare R2.
# Usage: bash supabase/tests/files.sh   (local Supabase must be running)
set -euo pipefail

eval "$(pnpm exec supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|DB_URL|FUNCTIONS_URL)=')"
q() { psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 "$@"; }

WORK=$(mktemp -d)
USERS=()
COMPANIES=()
failures=0

cleanup() {
  rm -rf "$WORK"
  [ ${#USERS[@]} -eq 0 ] && return
  local companies users  # Postgres array literals: {id,id}
  companies="{$(IFS=,; echo "${COMPANIES[*]}")}"; users="{$(IFS=,; echo "${USERS[*]}")}"
  q <<SQL >/dev/null
set session_replication_role = replica;
do \$\$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'company_id' and x.table_type = 'BASE TABLE' loop
    execute format('delete from public.%I where company_id = any(%L::uuid[])', t, '$companies');
  end loop;
end \$\$;
delete from storage.objects where bucket_id = 'attachments' and split_part(name, '/', 1) = any('$companies'::text[]);
delete from public.companies where id = any('$companies'::uuid[]);
delete from public.profiles where id = any('$users'::uuid[]);
delete from auth.users where id = any('$users'::uuid[]);
SQL
}
trap cleanup EXIT

check() { # name, expected, actual
  if [ "$2" = "$3" ]; then echo "ok - $1"; else echo "not ok - $1 (expected $2, got $3)"; failures=$((failures + 1)); fi
}
jget() { python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1], {}, {"d": d}))' "$1"; }

new_user() { # name -> "id jwt"
  local email id jwt
  email="files-$1-$(uuidgen | tr 'A-Z' 'a-z')@test.local"
  id=$(curl -sf -X POST "$API_URL/auth/v1/admin/users" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"files-pass-1\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"$1\"}}" | jget 'd["id"]')
  jwt=$(curl -sf -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"files-pass-1\"}" | jget 'd["access_token"]')
  echo "$id $jwt"
}
as_user() { # user id, sql
  printf "set role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"%s\",\"role\":\"authenticated\"}', true); %s" "$1" "$2"
}
files() { # jwt, json body -> writes body to $WORK/out, prints the HTTP status
  curl -s -o "$WORK/out" -w '%{http_code}' -X POST "$FUNCTIONS_URL/files" -H "Authorization: Bearer $1" \
    -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' -d "$2"
  [ -z "${DEBUG:-}" ] || { echo >&2; echo "  $2 -> $(cat "$WORK/out")" >&2; }
}
act() { printf '{"action":"%s","attachment_id":"%s"}' "$1" "$2"; }
reads() { printf '{"action":"read","attachment_ids":["%s"]}' "$1"; }
put() { # url, file, content type -> HTTP status
  curl -s -o /dev/null -w '%{http_code}' -X PUT "$1" -H "Content-Type: $3" --data-binary @"$2"
}

# --- Fixture: owner and site staff in one company, an owner in another, a draft bill ----------
read -r OWNER OWNER_JWT <<<"$(new_user owner)"; USERS+=("$OWNER")
read -r STAFF STAFF_JWT <<<"$(new_user staff)"; USERS+=("$STAFF")
read -r MALLORY MALLORY_JWT <<<"$(new_user mallory)"; USERS+=("$MALLORY")
CO=$(q -c "$(as_user "$OWNER" "select public.create_company('Files Nirman $OWNER', 'Owner');")" | tail -1); COMPANIES+=("$CO")
CO_M=$(q -c "$(as_user "$MALLORY" "select public.create_company('Other Nirman $MALLORY', 'Mallory');")" | tail -1); COMPANIES+=("$CO_M")
PROJECT=$(q -c "$(as_user "$OWNER" "select public.create_project('$CO', 'F1', 'Files project', 100000000);")" | tail -1)
q -c "insert into public.memberships (company_id, user_id, roles) values ('$CO', '$STAFF', array['site_staff']::public.app_role[]);
      insert into public.project_assignments (company_id, project_id, user_id) values ('$CO', '$PROJECT', '$STAFF');" >/dev/null
SUPPLIER=$(q -c "$(as_user "$OWNER" "insert into public.suppliers (company_id, name) values ('$CO', 'Files Supplier') returning id;")" | tail -1)
BILL=$(uuidgen | tr 'A-Z' 'a-z')
q -c "$(as_user "$OWNER" "select public.save_bill_draft(jsonb_build_object('id', '$BILL', 'supplier_id', '$SUPPLIER', 'bill_no', 'F-1',
  'bill_date', '2026-05-01', 'lines', jsonb_build_array(jsonb_build_object('project_id', '$PROJECT',
    'heading_id', (select id from public.cost_headings where company_id = '$CO' and name = 'Cement'), 'description', 'Cement',
    'qty', 1, 'unit_id', (select id from public.units where company_id = '$CO' and code = 'bag'),
    'amount_paisa', 10000000, 'unmatched_reason', 'files'))));")" >/dev/null

new_attachment() { # user, size, content type -> id
  local id; id=$(uuidgen | tr 'A-Z' 'a-z')
  q -c "$(as_user "$1" "insert into public.attachments (id, company_id, bill_id, kind, file_name, content_type, size_bytes)
    values ('$id', '$CO', '$BILL', 'photo', 'bill.jpg', '$3', $2);")" >/dev/null
  echo "$id"
}
uploaded() { q -c "select uploaded_at is not null from public.attachments where id = '$1'"; }

printf 'a bill photo, honestly' >"$WORK/photo.jpg"   # 22 bytes
printf 'a much bigger file than was declared' >"$WORK/big.jpg"

# --- Upload ---------------------------------------------------------------------------------
A=$(new_attachment "$OWNER" 22 image/jpeg)
check "confirm before the file arrives is refused" 409 "$(files "$OWNER_JWT" "$(act confirm "$A")")"
check "another company cannot get an upload link" 403 "$(files "$MALLORY_JWT" "$(act upload "$A")")"
check "the owner gets an upload link" 200 "$(files "$OWNER_JWT" "$(act upload "$A")")"
UP=$(jget 'd["url"]' <"$WORK/out")
check "a file bigger than declared is rejected by the link" true "$([ "$(put "$UP" "$WORK/big.jpg" image/jpeg)" -ge 400 ] && echo true || echo false)"
check "a different content type is rejected by the link" true "$([ "$(put "$UP" "$WORK/photo.jpg" text/html)" -ge 400 ] && echo true || echo false)"
check "the declared file uploads" 200 "$(put "$UP" "$WORK/photo.jpg" image/jpeg)"
check "someone else cannot confirm the owner's upload" 409 "$(files "$STAFF_JWT" "$(act confirm "$A")")"
check "the owner confirms" 200 "$(files "$OWNER_JWT" "$(act confirm "$A")")"
check "the row is marked uploaded" t "$(uploaded "$A")"
check "an uploaded file cannot get another upload link" 403 "$(files "$OWNER_JWT" "$(act upload "$A")")"
check "users cannot mark uploads themselves" 42501 "$(curl -s -X POST "$API_URL/rest/v1/rpc/mark_attachment_uploaded" \
  -H "Authorization: Bearer $OWNER_JWT" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "$(printf '{"p_attachment":"%s","p_user":"%s","p_size":22}' "$A" "$OWNER")" | jget 'd.get("code")')"

B=$(new_attachment "$OWNER" 20000000 image/jpeg)
check "a file over 10 MB gets no upload link" 400 "$(files "$OWNER_JWT" "$(act upload "$B")")"
C=$(new_attachment "$OWNER" 22 text/html)
check "only photos and PDFs get an upload link" 400 "$(files "$OWNER_JWT" "$(act upload "$C")")"

# --- Read follows the owning record --------------------------------------------------------
files "$OWNER_JWT" "$(reads "$A")" >/dev/null
GET=$(jget "d['urls'].get('$A', '')" <"$WORK/out")
check "the owner gets a read link" true "$([ -n "$GET" ] && echo true || echo false)"
check "the read link returns the file" "a bill photo, honestly" "$(curl -sf "$GET")"
files "$STAFF_JWT" "$(reads "$A")" >/dev/null
check "site staff who cannot see bill amounts get no link" 0 "$(jget 'len(d["urls"])' <"$WORK/out")"
files "$MALLORY_JWT" "$(reads "$A")" >/dev/null
check "another company gets no link" 0 "$(jget 'len(d["urls"])' <"$WORK/out")"
check "no session, no links" 401 "$(files "$ANON_KEY" "$(reads "$A")")"

# --- Remove ---------------------------------------------------------------------------------
check "another company cannot remove the file" 403 "$(files "$MALLORY_JWT" "$(act remove "$A")")"
check "the owner removes a photo from a draft bill" 200 "$(files "$OWNER_JWT" "$(act remove "$A")")"
check "the row is gone" 0 "$(q -c "select count(*) from public.attachments where id = '$A'")"
check "and so is the file" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$GET")"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "All file checks passed"
