#!/usr/bin/env bash
# Staff logins and registration through the real Edge Functions (admin-users, register): bodies are
# checked at run time, a refused staff member leaves nothing behind, and errors carry a code.
# Usage: bash supabase/tests/staff.sh   (local Supabase must be running)
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
delete from storage.objects where bucket_id = 'attachments' and (split_part(name, '/', 1) = any('$companies'::text[])
  or (split_part(name, '/', 1) = 'staging' and split_part(name, '/', 2) = any('$companies'::text[])));
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
  email="staff-$1-$(uuidgen | tr 'A-Z' 'a-z')@test.local"
  id=$(curl -sf -X POST "$API_URL/auth/v1/admin/users" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"staff-pass-1\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"$1\"}}" | jget 'd["id"]')
  jwt=$(curl -sf -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"staff-pass-1\"}" | jget 'd["access_token"]')
  echo "$id $jwt"
}
as_user() { # user id, sql
  printf "set role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"%s\",\"role\":\"authenticated\"}', true); %s" "$1" "$2"
}
call() { # function, jwt, json body -> writes body to $WORK/out, prints the HTTP status
  curl -s -o "$WORK/out" -w '%{http_code}' -X POST "$FUNCTIONS_URL/$1" -H "Authorization: Bearer $2" \
    -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' -d "$3"
}
code() { jget 'd.get("code", "")' <"$WORK/out"; }
logins() { q -c "select count(*) from auth.users where email = '$1'"; }

read -r OWNER OWNER_JWT <<<"$(new_user owner)"; USERS+=("$OWNER")
read -r PM PM_JWT <<<"$(new_user pm)"; USERS+=("$PM")
read -r OTHER OTHER_JWT <<<"$(new_user other)"; USERS+=("$OTHER")
CO=$(q -c "$(as_user "$OWNER" "select public.create_company('Staff Nirman $OWNER', 'Owner');")" | tail -1); COMPANIES+=("$CO")
CO_O=$(q -c "$(as_user "$OTHER" "select public.create_company('Other Nirman $OTHER', 'Other');")" | tail -1); COMPANIES+=("$CO_O")
P1=$(q -c "$(as_user "$OWNER" "select public.create_project('$CO', 'S1', 'Staff project', 100000000);")" | tail -1)
X1=$(q -c "$(as_user "$OTHER" "select public.create_project('$CO_O', 'X1', 'Their project', 100000000);")" | tail -1)
q -c "insert into public.memberships (company_id, user_id, roles) values ('$CO', '$PM', '{project_manager}')" >/dev/null

staff() { # login, extra json fields -> body for create_staff
  printf '{"action":"create_staff","company_id":"%s","full_name":"New Person","login":"%s","password":"staff-pass-1","roles":["site_staff"]%s}' "$CO" "$1" "$2"
}
NEW="staff-new-$(uuidgen | tr 'A-Z' 'a-z')@test.local"

# --- Who may call, and what a body must be ---------------------------------------------------
check "a project manager cannot add staff" 403 "$(call admin-users "$PM_JWT" "$(staff "$NEW" '')")"
check "  and says why by code" forbidden "$(code)"
check "a company id that is not an id is refused" 400 "$(call admin-users "$OWNER_JWT" '{"action":"create_staff","company_id":42}')"
check "  as an invalid request" invalid_request "$(code)"
check "a body that is not an object is refused" 400 "$(call admin-users "$OWNER_JWT" '["create_staff"]')"
check "a role that does not exist is refused" 400 "$(call admin-users "$OWNER_JWT" "$(staff "$NEW" '' | sed 's/"site_staff"/"boss"/')")"
check "  as no role chosen" roles_required "$(code)"
check "project ids that are not ids are refused" 400 "$(call admin-users "$OWNER_JWT" "$(staff "$NEW" ',"project_ids":["x"]')")"
check "  before any login is made" 0 "$(logins "$NEW")"

# --- All or nothing --------------------------------------------------------------------------
check "a project of another company is refused" 400 "$(call admin-users "$OWNER_JWT" "$(staff "$NEW" ",\"project_ids\":[\"$P1\",\"$X1\"]")")"
check "  and the login made for it is removed again" 0 "$(logins "$NEW")"

# --- Saved, with rights read strictly ---------------------------------------------------------
check "an admin adds staff with a project" 200 "$(call admin-users "$OWNER_JWT" "$(staff "$NEW" ",\"can_view_finance\":\"true\",\"can_record_payments\":true,\"project_ids\":[\"$P1\"]")")"
NEW_ID=$(jget 'd["user_id"]' <"$WORK/out"); USERS+=("$NEW_ID")
check "  the string \"true\" does not give finance" f "$(q -c "select can_view_finance from public.memberships where user_id = '$NEW_ID'")"
check "  true does give payments" t "$(q -c "select can_record_payments from public.memberships where user_id = '$NEW_ID'")"
check "  the project is assigned" 1 "$(q -c "select count(*) from public.project_assignments where user_id = '$NEW_ID'")"
check "  who added them is kept" "$OWNER" "$(q -c "select created_by from public.memberships where user_id = '$NEW_ID'")"
check "the same login again is refused" 409 "$(call admin-users "$OWNER_JWT" "$(staff "$NEW" '')")"
check "  as taken" login_taken "$(code)"
check "a password reset needs a real staff id" 400 "$(call admin-users "$OWNER_JWT" "{\"action\":\"reset_password\",\"company_id\":\"$CO\",\"user_id\":\"nope\",\"password\":\"staff-pass-2\"}")"

# --- Register --------------------------------------------------------------------------------
check "register: a company name that is not text is refused, not a crash" 400 \
  "$(call register "$ANON_KEY" '{"company_name":123,"full_name":"X","login":"9800000099","password":"staff-pass-1"}')"
check "  as the company name missing" company_name_required "$(code)"
check "register: a short password says so by code" password_short \
  "$(call register "$ANON_KEY" '{"company_name":"Y","full_name":"X","login":"9800000099","password":"short"}' >/dev/null; code)"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "All staff checks passed"
