#!/usr/bin/env bash
# Full company export (design §11.3, §10: E1, E2) through the real Edge Function.
# E1: manifest row counts match the database and every listed file is in the zip with its checksum.
# E2: bills written while the export runs never appear partly (each bill with all of its lines).
# Usage: bash supabase/tests/export.sh   (local Supabase must be running)
set -euo pipefail

eval "$(pnpm exec supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|DB_URL|FUNCTIONS_URL)=')"
q() { psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 "$@"; }

USER_ID=""
COMPANY=""
WORK=$(mktemp -d)
failures=0

as_user() {
  printf "set role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"%s\",\"role\":\"authenticated\"}', true); %s" \
    "$USER_ID" "$1"
}

cleanup() {
  rm -rf "$WORK"
  [ -z "$USER_ID" ] && return
  q <<SQL >/dev/null
set session_replication_role = replica;
do \$\$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'company_id' and x.table_type = 'BASE TABLE' loop
    execute format('delete from public.%I where company_id = %L', t, '$COMPANY');
  end loop;
end \$\$;
delete from storage.objects where bucket_id = 'attachments' and name like '$COMPANY/%';
delete from public.companies where id = '$COMPANY';
delete from public.profiles where id = '$USER_ID';
delete from auth.users where id = '$USER_ID';
SQL
}
trap cleanup EXIT

check() { # name, expected, actual
  if [ "$2" = "$3" ]; then echo "ok - $1"; else echo "not ok - $1 (expected $2, got $3)"; failures=$((failures + 1)); fi
}

# --- Fixture: company, project, supplier, draft bills, one uploaded photo ------------------
# A real login, so the function sees a signed-in session.
EMAIL="export-$(uuidgen | tr 'A-Z' 'a-z')@test.local"
USER_ID=$(curl -sf -X POST "$API_URL/auth/v1/admin/users" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"export-pass-1\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"Export Owner\"}}" \
  | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["id"])')
JWT=$(curl -sf -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"export-pass-1\"}" | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
COMPANY=$(q -c "$(as_user "select public.create_company('Export Nirman $USER_ID', 'Export Owner');")" | tail -1)
PROJECT=$(q -c "$(as_user "select public.create_project('$COMPANY', 'E1', 'Export project', 100000000);")" | tail -1)
SUPPLIER=$(q -c "$(as_user "insert into public.suppliers (company_id, name) values ('$COMPANY', 'Export \"Supplier\", Ltd') returning id;")" | tail -1)

new_bill() {
  local id; id=$(uuidgen | tr 'A-Z' 'a-z')
  q -c "$(as_user "select public.save_bill_draft(jsonb_build_object('id', '$id', 'supplier_id', '$SUPPLIER', 'bill_no', '$id',
    'bill_date', '2026-05-01', 'lines', jsonb_build_array(
      jsonb_build_object('project_id', '$PROJECT', 'heading_id', (select id from public.cost_headings where company_id = '$COMPANY' and name = 'Cement'),
        'description', 'Cement', 'qty', 1, 'unit_id', (select id from public.units where company_id = '$COMPANY' and code = 'bag'),
        'amount_paisa', 10000000, 'unmatched_reason', 'export'),
      jsonb_build_object('project_id', '$PROJECT', 'heading_id', (select id from public.cost_headings where company_id = '$COMPANY' and name = 'Cement'),
        'description', 'Sand', 'qty', 2, 'unit_id', (select id from public.units where company_id = '$COMPANY' and code = 'bag'),
        'amount_paisa', 500000, 'unmatched_reason', 'export'))));")" >/dev/null
  echo "$id"
}
BILL=$(new_bill); new_bill >/dev/null

ATTACHMENT=$(uuidgen | tr 'A-Z' 'a-z')
printf 'not really a photo' >"$WORK/photo.jpg"
q -c "$(as_user "insert into public.attachments (id, company_id, bill_id, kind, file_name, content_type, size_bytes)
  values ('$ATTACHMENT', '$COMPANY', '$BILL', 'photo', 'bill photo.jpg', 'image/jpeg', 18);")" >/dev/null
# Uploaded the way the app does it: an upload link from the files function, then confirm.
files() { curl -sf -X POST "$FUNCTIONS_URL/files" -H "Authorization: Bearer $JWT" -H "apikey: $ANON_KEY" \
  -H 'Content-Type: application/json' -d "$(printf '{"action":"%s","attachment_id":"%s"}' "$1" "$ATTACHMENT")"; }
UPLOAD_URL=$(files upload | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["url"])')
curl -sf -X PUT "$UPLOAD_URL" -H 'Content-Type: image/jpeg' --data-binary @"$WORK/photo.jpg" >/dev/null
files confirm >/dev/null

export_zip() { # dest dir; prints the HTTP status
  curl -s -o "$1.zip" -w '%{http_code}' -X POST "$FUNCTIONS_URL/company-export" -H "Authorization: Bearer $JWT" \
    -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' -d "{\"company_id\":\"$COMPANY\"}"
}

# --- E1: a quiet export matches the database ----------------------------------------------
check "E1: the export answers with a zip" 200 "$(export_zip "$WORK/e1")"
mkdir -p "$WORK/e1" && unzip -qo "$WORK/e1.zip" -d "$WORK/e1"
COUNTS=$(q -c "select string_agg(t || '=' || n, ' ' order by t) from (
  select c.table_name as t, (xpath('/row/n/text()', query_to_xml(format(
    'select count(*) as n from public.%I where %I = %L', c.table_name,
    case when c.table_name = 'companies' then 'id' else 'company_id' end, '$COMPANY'), false, true, '')))[1]::text as n
  from information_schema.tables c
  where c.table_schema = 'public' and c.table_type = 'BASE TABLE'
    and (c.table_name = 'companies' or exists (select 1 from information_schema.columns k
      where k.table_schema = 'public' and k.table_name = c.table_name and k.column_name = 'company_id'))) x")
RESULT=$(python3 -I - "$WORK/e1" "$COUNTS" <<'PY'
import csv, hashlib, json, os, sys
root, counts = sys.argv[1], dict(p.split('=') for p in sys.argv[2].split())
m = json.load(open(os.path.join(root, 'manifest.json')))
bad = []
for f in m['files']:
    path = os.path.join(root, f['path'])
    if not os.path.exists(path): bad.append('missing ' + f['path']); continue
    data = open(path, 'rb').read()
    if hashlib.sha256(data).hexdigest() != f['sha256']: bad.append('checksum ' + f['path'])
    if f['path'].endswith('.csv'):
        rows = sum(1 for _ in csv.reader(open(path, encoding='utf-8-sig', newline=''))) - 1
        if rows != f['rows']: bad.append(f"rows in {f['path']}")
        table = f['path'][:-4]
        if table in counts and int(counts[table]) != f['rows']: bad.append(f"count {table} {counts[table]} != {f['rows']}")
missing_tables = set(counts) - {f['path'][:-4] for f in m['files']}
if missing_tables: bad.append('tables not exported: ' + ','.join(sorted(missing_tables)))
print('ok' if not bad else '; '.join(bad))
PY
)
check "E1: manifest counts match the database, files and checksums match" ok "$RESULT"
check "E1: the photo is in the zip" 1 "$(ls "$WORK/e1/attachments" | grep -c "^$ATTACHMENT-")"
check "E1: staff.csv lists only this company's member" 1 "$(python3 -I -c "import csv,sys; print(sum(1 for _ in csv.DictReader(open(sys.argv[1], encoding='utf-8-sig'))))" "$WORK/e1/staff.csv")"

# --- E2: bills written during the export are all-or-nothing --------------------------------
( for _ in $(seq 1 25); do new_bill >/dev/null; done ) &
WRITER=$!
sleep 0.5
check "E2: the export answers with a zip while bills are written" 200 "$(export_zip "$WORK/e2")"
wait $WRITER
mkdir -p "$WORK/e2" && unzip -qo "$WORK/e2.zip" -d "$WORK/e2"
RESULT=$(python3 -I - "$WORK/e2" <<'PY'
import collections, csv, json, os, sys
root = sys.argv[1]
read = lambda name: list(csv.DictReader(open(os.path.join(root, name), encoding='utf-8-sig', newline='')))
bills, lines = read('supplier_bills.csv'), read('bill_lines.csv')
per_bill = collections.Counter(l['bill_id'] for l in lines)
bad = [b['id'] for b in bills if per_bill[b['id']] != 2]
orphans = set(per_bill) - {b['id'] for b in bills}
m = {f['path']: f.get('rows') for f in json.load(open(os.path.join(root, 'manifest.json')))['files']}
print('ok' if not bad and not orphans and m['supplier_bills.csv'] == len(bills) else f'partial={len(bad)} orphans={len(orphans)}')
PY
)
check "E2: every exported bill has both its lines, no line without its bill" ok "$RESULT"

# --- Only an admin may export ---------------------------------------------------------------
EMAIL2="export-$(uuidgen | tr 'A-Z' 'a-z')@test.local"
USER2=$(curl -sf -X POST "$API_URL/auth/v1/admin/users" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL2\",\"password\":\"export-pass-1\",\"email_confirm\":true}" \
  | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["id"])')
q -c "insert into public.memberships (company_id, user_id, roles, can_view_finance) values ('$COMPANY', '$USER2', array['accounts']::public.app_role[], true)" >/dev/null
JWT=$(curl -sf -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL2\",\"password\":\"export-pass-1\"}" | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
check "Accounts staff (not admin) are refused" 403 "$(export_zip "$WORK/refused")"
q -c "delete from public.memberships where user_id = '$USER2'; delete from auth.users where id = '$USER2'" >/dev/null

if [ "$failures" -gt 0 ]; then echo "$failures export test(s) failed"; exit 1; fi
echo "All export tests passed"
