# NirmanKhata: Technical Design

| Item | Detail |
|---|---|
| Version | 0.4 (product owner decisions recorded) |
| Date | 2026-10-09 |
| Based on | [requirements-v1.1.md](requirements-v1.1.md) (cited below as "req §N") |
| Goal | Get a pilot version to a few real companies quickly, on free or very low-cost hosting |

**Changes from v0.2:**
- Retries are checked for permission before any stored result is returned, and the server computes the request hash.
- Ledger uniqueness is now per event and component, so one event can write several rows.
- A bill reversal also reverses its credits in the same step.
- Physical returns are separate from supplier credits.
- Own-entry permission exceptions are defined narrowly, and slip sharing needs current project access.
- The v0.1 financial controls are back as named invariants, with explicit dates for allocation moves and reversals.
- Backups: independent freshness monitoring and retries; separate role, schema and data dumps; a combined DB + file manifest; corrected PITR claims.
- Uploaded files can't be overwritten.
- The full export is a consistent snapshot and includes staff names.
- Decision status corrected: only confirmed items are marked confirmed.
- New tests added.

---

## 1. Hosting and stack

### 1.1 Constraints
- Free or very low cost during the pilot. No custom domain.
- The plan's terms must allow use by a business.
- Easy to move to paid or different hosting later without a rewrite.

### 1.2 Choice

| Need | Choice | Limits | How we handle them |
|---|---|---|---|
| Frontend (web + PWA) | React + Vite + TypeScript, static build on **Cloudflare Pages** → `nirmankhata.pages.dev` | Free plan allows commercial use | Static files only, so the app can move host without code changes. |
| Database, auth, files, RPC | **Supabase** | Free: 500 MB DB, 1 GB files, **the project may pause after a period of low activity** | **Accepted pilot limitation.** Upgrade trigger: Supabase Pro (about USD 25/month) once a pilot company relies on it daily. Pro adds daily managed DB backups. PITR is a separate paid add-on (about USD 100+/month) and covers only the database, not files. Not planned for the pilot. |
| Admin tasks needing the secret key | Supabase Edge Functions | Free invocation quota | Staff accounts, password resets, full export. |
| Backups | GitHub Actions → **Cloudflare R2** (10 GB free) + **Healthchecks.io** (free) for freshness alerts | See 11.2 | Encrypted. Separate dumps. Independent monitoring. |

**Rejected for the pilot:**
- Vercel Hobby: non-commercial use only.
- Render free: sleeps after idle; free DB expires.
- Railway and Fly.io: no lasting free tier.
- Cloudflare Workers + D1: no row-level security.

Re-check all terms at signup.

### 1.3 Why a single-page app
Security and money rules live in Postgres, so an app server would add little. A static build is the most portable option, and server rendering isn't needed for a logged-in tool.

### 1.4 Frontend libraries
| Concern | Library |
|---|---|
| Routing / server data | React Router, TanStack Query over `supabase-js` |
| Forms | react-hook-form + zod |
| UI | Tailwind CSS + shadcn/ui |
| PWA | vite-plugin-pwa (manifest + install only; no core logic in the service worker) |
| Device features | `app/src/platform/` adapter: camera, share, device storage, download. Web implementation now; Capacitor implementation later |
| Drafts on device | IndexedDB (`idb-keyval`), stored separately per user and company |
| BS ↔ AD | A maintained BS package behind our own `dates.ts`, tested against an official table |
| Export | SheetJS/ExcelJS for Excel, print stylesheet for PDF |
| Charts | Recharts |
| Photos | `browser-image-compression` |

---

## 2. Repository layout

```
nirman-khata/
├── docs/
├── app/                        React + Vite PWA
│   └── src/{lib, platform, features/<module>, routes}
├── supabase/
│   ├── migrations/             schema, RLS, storage policies, functions (source of truth)
│   ├── seed.sql
│   ├── functions/              Edge Functions
│   └── tests/                  pgTAP + concurrency tests
└── .github/workflows/          CI, backups, restore drill
```

---

## 3. Tenancy, permissions and security

### 3.1 Identity
- `auth.users` is the global identity. `profiles` holds name and phone, with no `company_id`.
- `memberships (company_id, user_id, roles text[], can_view_finance, can_record_payments, can_approve_slips, active)`.
- **One company per login in v1:** a partial unique index `unique (user_id) where active` allows only one active membership per user. The membership table is kept, so allowing several companies later is a constraint change, not a redesign. The app has no company switcher.

### 3.2 Same-company references
- Every tenant table has `company_id` and `unique (company_id, id)`. All references are composite FKs on `(company_id, x_id)`.
- Where a record points at one of several kinds of target, it uses separate nullable FK columns plus a check that exactly one is set.

### 3.3 Access helper functions
`security definer`, `stable`, `search_path` pinned. All of them check that the membership is **active right now**.
- `my_company_ids()`
- `has_role(company, role)`
- `can_see_project(company, project)`: admin, accounts, or currently assigned.
- `can_see_finance(company)`: admin, accounts, or the `can_view_finance` flag.
- `can_see_all_projects_of(document)`: true when the user can currently see every project that has a line on the document.

### 3.4 How money stays hidden: by table design, not by views
Row-level security filters rows, not columns, and views by privileged owners skip RLS. So:

1. **Financial values live only in financial tables.** These are protected by RLS that requires `can_see_finance` and project access (plus the exceptions in 3.5):
   - contract/budget revisions and lines;
   - `order_slip_line_prices`;
   - supplier bills and lines;
   - `work_package_terms` (agreed value and rate, moved out of `work_packages`);
   - subcontract charges, labour costs, expenses;
   - payments and their allocation and settlement events;
   - credits, reversals, refunds;
   - `party_opening_balances` (moved out of the party tables);
   - `ledger_entries`.

   Non-financial tables (quantities, reports, progress, catalog, party contact details) allow direct `select` under RLS.
2. **Every view uses `security_invoker = true`.** A catalog test enforces it.
3. **Reports, dashboards and exports are RPC functions** that check permissions and return only visible projects. Totals are computed over visible projects only.
4. **Header amounts that belong to no single project are restricted:**
   - A supplier bill total, or a payment amount, is visible only to finance users who can see **every** project on the document.
   - A payment with any **unallocated** part, opening balances, and company-level party balances are visible to **Admin and Accounts only**.

### 3.5 Narrow exceptions for own entries
Site staff must be able to enter money without having broad finance access (req §5, §21). These are the only exceptions. Each one requires an active membership and **current** access to every project on the record.

| ID | Exception | Ends when |
|---|---|---|
| X1 | The creator of a **draft** supplier bill can read and edit it, including amounts and its photo | The bill leaves draft (submitted for review or posted). After that, normal rules apply |
| X2 | The creator of a labour cost or expense can read **that entry's** amount and attachment. For a Company Expense (no project) "works for the company" stands in for "can see the project"; Admin and Accounts always see it | 7 days after creation, or once it has been settled or reversed |
| X3 | A user may record "pay now" on their own X2 entry only with `can_record_payments` | Not applicable |

These exceptions never show other people's entries, totals, ledger rows, or party balances.

### 3.6 Permission matrix
"Assigned" means a current assignment to the project. "Fin" means `can_see_finance`. Admin can do everything.

| Data / action | Site staff | Project manager | Accounts | Viewer |
|---|---|---|---|---|
| Project details (no amounts) | assigned | assigned | all | assigned |
| Contract / budget / work-package values | Fin + assigned | Fin + assigned | all | Fin + assigned |
| Slip header | if any line is on an assigned project | same | all | same |
| Slip lines | assigned projects' lines | same | all | same |
| Slip estimated rates | Fin | Fin | all | Fin |
| Create / edit draft slip | lines on assigned projects only | same | all | no |
| Approve / reject slip | no | `can_approve_slips` + all projects on slip | same rule | no |
| Share / print whole slip | **current access to all projects on the slip** (no creator exception) | same | all | no |
| Deliveries, returns, challan photos | assigned | assigned | all | assigned |
| Bill draft from photo | create; read own draft (X1) | same | all | no |
| Bill lines + per-project subtotal | Fin + assigned | Fin + assigned | all | Fin + assigned |
| Bill header total + bill photo | Fin + all projects on bill (or X1) | same | all | same |
| Post bill / credit / reversal | no | no | yes | no |
| Record payment | no | `can_record_payments` | yes | no |
| Payment view (fully project-allocated) | Fin + all its projects | same | all | same |
| Payment with unallocated part, opening balances, company-level party balance | no | no | yes | no |
| Labour cost / expense entry | assigned; own entries via X2 | assigned | all | no |
| Daily reports, progress | assigned | assigned | all | assigned |
| Reports / report exports | row rules above | same | all | same |
| Audit log | admin only (before/after JSON contains amounts) | | | |
| Full company export, staff, roles, settings | admin only | | | |

### 3.7 Attachments and files
- `attachments`: `company_id`, one owner FK (exactly one), `kind`, `content_type`, `size_bytes`, `uploaded_at`, `removed_at`.
- **Files live in Cloudflare R2** (bucket `nirman-khata-files`), key `{company_id}/{attachment_id}`. Company logos stay in the public Supabase Storage `logos` bucket.
- The browser never holds bucket keys. The **`files` Edge Function** hands out **5-minute presigned URLs** after the database says yes, asked **as the signed-in user**:
  - **upload:** `attachment_upload_target()` allows only the user who created the row, while it is not uploaded, when the owning record's upload rule from 3.6 holds. Photos and PDFs only, at most 10 MB. The link signs the declared `content-type` and `content-length`, so it accepts only that file. It writes to `staging/{company_id}/{attachment_id}`, never to the final key.
  - **confirm:** the function checks the staged object, copies it to the final key only if it is still the same object (`x-amz-copy-source-if-match` with its ETag), deletes the staged copy, and calls `mark_attachment_uploaded()` with its size, which only the service role may run. Confirming again an upload the same user already finished answers `{ ok, already: true }`, so a retry after a lost answer is not an error.
  - **read:** links are made only for rows that row security returns to the user (`can_access_attachment(id, 'read')`, including the X1/X2 exceptions).
  - **remove:** `remove_attachment()` decides. On a draft owner the row and the object are deleted; otherwise the row gets `removed_at` and the file is kept.
- **Files are immutable:** an uploaded row never gets another upload link. Replacing a photo creates a new attachment. An upload link reused within its 5 minutes reaches only staging, never the confirmed file (presigned PUTs on R2 and local Storage ignore `If-None-Match`, so staging is the guard).
- R2 lifecycle rule (set in the Cloudflare dashboard): delete objects under `staging/` after 1 day.
- Locally and in CI the same code runs against Supabase Storage's S3 endpoint (`[edge_runtime.secrets]` in `supabase/config.toml`). Production settings are set by CI with `supabase secrets set`.
- R2 CORS (`cloudflare/r2-cors.json`) allows `PUT` from the app's origins.
- Attachment rows whose upload never finished are cleaned up nightly.
- **Photos taken in a form wait on the device** (`uploadPending` in `Attachments.tsx`, stored next to the drafts and cleared with them at sign-out) until each one is confirmed. Each keeps its attachment id, so a retry finishes the same attachment and never adds a copy. The record's photo section lists what is waiting, with "Upload again" and "Discard".
- **Bill photos after sending:** because a waiting photo can arrive late, a photo may be added to a bill that is sent to Accounts or posted, by its creator (while they still work on all its projects) or by Accounts or Admin (`can_add_bill_photo`). Removing one still needs a draft.

### 3.8 Audit
A trigger on every tenant table writes `audit_log`. Only admins can read it, through an RPC.

---

## 4. Data model

### 4.1 Conventions
- `uuid` primary keys.
- **Money is `bigint` paisa.** Half-up rounding. Splits use the largest-remainder method.
- Quantities: `numeric(14,3)` with a required unit. Trip and load units need a note.
- Business dates are `date`. `posted_at` and `entered_at` are `timestamptz`. Display uses Asia/Kathmandu.
- Every tenant row has `company_id, created_by, created_at, updated_at`. Financial rows also have `business_date, posted_at, status`.

### 4.2 Tables by module

| Module | Tables |
|---|---|
| Foundation | companies, profiles, memberships, projects, project_assignments, contract_revisions, budget_revisions, budget_lines, cost_headings, materials, units, unit_conversions (empty in v1) |
| Parties | suppliers, subcontractors, crews, payees, party_opening_balances |
| Order → delivery | order_slips, order_slip_lines, order_slip_line_prices, deliveries, delivery_lines, supplier_returns, supplier_return_lines |
| Bills | supplier_bills, bill_lines, bill_charge_overrides, bill_line_delivery_lines |
| Subcontract | work_packages, work_package_terms, subcontract_charges |
| Labour / expenses | labour_costs, labour_batches, expenses |
| Payments | payments, payment_allocation_events, settlement_events, refunds |
| Client money in | client_receipts, client_receipt_reversals (outside the ledger) |
| Corrections | credits, credit_lines (with optional `supplier_return_line_id` + `credited_qty`), reversals |
| Money core | **posting_events**, **ledger_entries**, **operations** |
| Site | stages, progress_updates, daily_reports |
| Platform | attachments, audit_log, notifications, doc_sequences, `company_usage` view (projects, active users, storage per company, for pricing after the pilot) |

### 4.3 Posting events and the ledger

```
posting_events
  company_id, id
  event_type     text   -- bill_post, payment_post, allocation_move, credit_post,
                        -- refund, charge_approve, labour_save, expense_save,
                        -- opening_balance, reversal
  source FK (exactly one): bill | payment | allocation_event | credit | refund |
                           subcontract_charge | labour_cost | expense |
                           party_opening_balance | reversal
  business_date, posted_at, op_key
  unique (company_id, event_type, <source>)    -- each source is posted at most once per type

ledger_entries
  company_id, id
  event_id       FK → posting_events
  component_key  text   -- e.g. 'line:<bill_line_id>', 'project:<project_id>', 'unallocated'
  business_date, posted_at          -- copied from the event
  project_id (null = unallocated), heading_id
  supplier_id | subcontractor_id | crew_id | payee_id   -- exactly one
  cost_paisa, balance_paisa, cash_paisa
  unique (event_id, component_key)              -- no duplicate rows inside one event
```

- The event-level `unique` stops double posting. The `(event_id, component_key)` key lets one event write several rows: a payment split across projects, or an allocation move with two sides.
- Both tables are insert only. `update`/`delete` are revoked and blocked by a trigger.
- Totals are sums:
  - recorded cost = Σ `cost_paisa`;
  - cash paid = Σ `cash_paisa`;
  - party balance = Σ `balance_paisa` (positive = baki, negative = money the party holds: Peski and/or Overpayment, split as in §4.5);
  - unallocated = rows with `project_id` null.
- "As of D" uses `business_date <= D`. "As known on D" also uses `posted_at <= D`.

| Event | cost | balance | cash | project_id | business_date |
|---|---|---|---|---|---|
| Opening balance | 0 | +opening | 0 | null | cutover date |
| Bill post (one row per line) | +cost_amount | +payable_amount | 0 | line's project | bill's cost date |
| Charge approve / labour / expense | +amount | +amount | 0 | project | approval / work / expense date |
| Payment post | 0 | −part | +part | each project part, and null for the unallocated part | payment date |
| Allocation move | 0 | ±x | ±x | null ↔ project | **the payment's date** (see 5.6 I-9) |
| Credit post | −cost share | −payable share | 0 | project | credit date |
| Refund | 0 | +amount | −amount | project or null | refund date |
| Reversal | negation of every ledger row of the target event **and** of its later dependent events | | | same | **reversal date** |

A **Company Expense** (an expense with no project, GLOSSARY) writes no event and no ledger row: it is a
record only, so cost always stays on a project. It is reversed by `reverse_company_expense`, which
only marks it reversed (`company_expense_reversals`). An expense on a project paid now with no name
posts to the company's Cash payee (`payees.is_cash`) like any other expense.
"Paid now" writes two records, the cost and the payment; the lists link them so they never read as
the same money twice: `payment_summaries.paid_for` (what a payment settled) and
`expense_summaries.paid_by` (the payments that paid an expense). Both follow `settlement_events`
RLS, so only finance users see the link.

### 4.4 Derived, never stored
- Settlement status (from `settlement_events`).
- Slip line `received_qty`.
- Delivery line quantities (5.5).
- Fulfilment status.

All are `security_invoker` views or RPC functions.


### 4.5 Peski and Overpayment (`20261022000100_peski.sql`)
- `payments.is_peski`: set when recording, only while the party has nothing unpaid; a Peski payment
  cannot settle bills when recorded. Existing payments are not Peski.
- `refunds.kind`: `refund` (clears Overpayment) or `peski_returned` (gives back Peski).
- Peski held in a bucket = Σ Peski payments' (allocated − settled) − peski returned, capped at the
  money held there (−balance). Overpaid = held − Peski. Ledger rows are unchanged; the split is derived
  (`private.held_split`, `party_held`, `refund_rooms`, dashboards' `peski_paisa` / `overpaid_paisa`).
- A reversed bill unsettles its payments: money from a Peski payment is Peski again.


### 4.6 Attendance (`20261025000100_attendance.sql`)
- `companies.labour_mode` (`day_total` | `attendance`), `standard_day_minutes` (default 480),
  `day_start` / `day_end`. Company-wide.
- `crew_members`: per crew, `rate_kind` daily | hourly, `rate_paisa`. Never a party; no delete.
  Editable by party managers or anyone who works on the crew's project; readable by them and finance.
- `attendance`: one row per (member, project, work_date) with times and minutes; `crew_id` is the
  crew owed for that project, not necessarily the member's crew. Written only by `set_attendance`
  (checks future dates, the crew fits the project, no overlapping times across projects, ≤ 24 h).
  Readable by anyone who works on the project or sees its money. Rates and day amounts are shown on
  the roster to those who mark it; the posted `labour_costs` keep the X2 rule (3.5).
- `close_labour_day(op_key, {project_id, crew_id, from_date, to_date, pay_now, confirm_duplicate})`:
  locks the crew, prices open rows (rate snapshot), and calls `private.post_labour` with one day per
  work date, so ledger, pay now and near-duplicate checks are shared with day totals. Rows store
  `labour_cost_id`; a trigger refuses edits while that cost is posted (`day_closed:`), so reversing
  the cost reopens the day.

### 4.7 Time card (`20261026000100_timecard.sql`)
- `worker_month(member, from, to)` (≤ 32 days): the member and their rows on every project. Rows on a
  project the user cannot see keep only date, times and minutes, so the card shows the time taken.
  Open to anyone who enters labour on some project, or finance (as `project_workers`).
- `close_worker_days(op_key, {member_id, from_date, to_date, pay_now, confirm_duplicate})`: for each
  (crew, project) where the member has open rows on a project the user enters labour on, in crew
  order, closes each of those dates for the whole crew via `private.close_crew_days` (shared with
  `close_labour_day`), then one pay-now payment per crew and project. Other open days of the crew
  stay open.
- The client chooses the crew owed when marking: the crew already on that day, else the member's own
  crew if it may work on the project, else the project's default crew.

---

## 5. Posting contract, concurrency and corrections

### 5.1 Posting contract (every money-changing function)
1. **Authenticate and authorize first.** Check the active membership, role, and current project access (3.3–3.6) against the **current** request. Nothing is returned before this passes, cached results included.
2. **Check the operation key.**
   - The server builds the canonical request (the function name plus its parameters as sorted `jsonb`) and computes `request_hash` itself. The client never sends a hash.
   - Insert `operations (company_id, op_key, kind, request_hash, user_id, status)`.
   - If the key exists with the same hash **and the same user**, return the stored result. The user has already been re-authorized in step 1.
   - A different hash or a different user raises `op_key_reused`.
   - A concurrent call with the same key waits on the unique index, then follows the same rule.
3. **Lock** the rows in the global lock order (5.2).
4. **Check state** after locking. For example, a bill must be a draft or under review. If it is already posted by this same op_key, return the stored result. If another op_key posted it, raise `already_posted`.
5. **Write** documents, posting events, ledger rows and settlement events.
6. **Check invariants** (5.6) inside the transaction. Any failure rolls back everything.
7. **Store the result** in `operations` and commit.

The client creates `op_key` on Submit/Post and keeps it with the draft until it sees success.

### 5.2 Lock order
Rows are locked in this order, sorted by id within each step:
1. party
2. payments
3. documents (bills, charges, labour costs, expenses)
4. credits
5. delivery and return lines

Locking the party first serializes all settlement and correction work for that party. Two concurrent settlements against the same bill can't over-settle it.

### 5.3 Settlement
- `settlement_events (payment_id, project_id, document FK, amount ±, business_date, posted_at, op_key)` is append only. Settlement as of D = Σ where `business_date <= D`.
- `settle` checks, under lock:
  - same party;
  - the document is posted and not reversed;
  - the project matches;
  - amount ≤ the payment's remaining project allocation;
  - amount ≤ the document's remaining **settleable amount** for that project.
- Settleable amount = Σ line `payable_amount` in the project − active posted credits for that project.
- `unsettle` writes a negative event. The money stays in the project allocation, unmatched (Peski again for a Peski payment, otherwise overpaid).

### 5.4 Corrections

| Case | Rule |
|---|---|
| Credit on a bill (or a charge, labour cost, expense) | Up to the remaining settleable amount per project. If the credit pushes settleable below what is settled, `unsettle` the excess (newest settlement first) in the same transaction. |
| **Reverse a document that has credits** | **The credits are reversed in the same transaction, before the document.** The confirmation screen lists them. Order: unsettle all settlements → reverse each active credit (negate its rows) → reverse the document (negate its rows). Result: cost and payable from that document net to exactly zero. Applies to bills, subcontract charges, labour costs and expenses. |
| Reverse a credit only | Allowed if the document is still active. Settleable goes back up. Nothing else changes. |
| Reverse a payment | Unsettle all its settlements. Then negate **every ledger row of the payment event and of all its allocation-move events**, so each project nets to zero whatever reallocations happened. Business date = reversal date. Reports before that date are unchanged. |
| Remove or reduce a project allocation | Allowed only down to the amount already settled in that project. Writes an allocation move back to unallocated. |
| Repeat reversal | `unique` on reversals per target. A reversal itself can't be reversed; enter a new document instead. |

### 5.5 Deliveries, returns and bill matching

Quantities per delivery line, all derived:

```
net_received    = accepted_qty − returned_qty
billed_qty      = Σ billed_qty of matches on active (non-reversed) bills
billable_qty    = max(0, net_received − billed_qty)               -- can still be billed
awaiting_credit = max(0, billed_qty − net_received) − credited_qty  -- returned after billing
```

- **Physical return** (`record_return`) is allowed up to `accepted_qty − returned_qty`. It changes quantities only, never cost or payable (req §20). If the returned goods were already billed, the quantity shows as **awaiting credit**.
- **Supplier credit for a return:** `credit_lines.supplier_return_line_id` + `credited_qty` lower `awaiting_credit`. Cost and payable fall only when this credit is posted.
- **No replacement billing against returned goods:** a new match may use at most `billable_qty`. Replacement goods must come in as a new delivery.
- Historical bill matches are never altered by a return.

Matching rules for each **material line** (trigger + `post_bill`):
- same supplier, project and material; same unit (no conversions in v1);
- `billed_qty` ≤ the delivery line's `billable_qty` at posting time.

| Line state | Posting rule |
|---|---|
| Fully matched | Normal |
| Partly matched or unmatched material line | Accounts/Admin role **and a reason on that line**. Flagged in reports. Checked per line |
| Rate more than the company tolerance (default 5%) away from the slip's estimated rate | Warning, with reason recorded |
| Any material line | The last billed rate for the same supplier and material is shown as a hint (rate lists are Phase 2) |
| Charge line (transport, loading, other) | No delivery matching. Must have a project and heading |

### 5.6 Named financial invariants

Each invariant is checked inside the posting function, as a DB constraint where possible, and covered by a test.

| ID | Invariant | Req | Enforced in |
|---|---|---|---|
| I-1 | Orders and deliveries never create cost or payable | §9.3, §10 | No posting events exist for them |
| I-2 | **Header charges balance:** Σ allocated charges over lines = discount + transport + VAT (VAT only when "VAT as cost"). Overrides per project must add up to the charge | §11.4 | `post_bill` |
| I-3 | **Cost and payable kept separate:** for each line, `payable_amount` = line amount + its share of every header charge **including VAT**, and `cost_amount` = the same **excluding VAT when "VAT recoverable"**. Σ payable = bill total. Σ cost = bill total, or bill total − VAT | §11.4, §12.3 | `post_bill`; the bill's VAT treatment is copied from the company setting when the draft is created |
| I-4 | **Project allocation:** Σ project allocations of a payment ≤ payment amount, at all times | §12.3 | `record_payment`, `allocate_payment` under the payment lock |
| I-5 | Σ settlements from a payment's project allocation ≤ that allocation; Σ settlements on a document per project ≤ its settleable amount | §12.3 | `settle`, `post_credit`, allocation reduction |
| I-6 | Payments, refunds and allocation moves write `cost_paisa = 0` | §19 | Check constraint per event type |
| I-7 | **Closed project:** no posting event may reference a project with status `closed`. Completed projects accept postings by authorized users | §20 | Every posting function + trigger on `ledger_entries` |
| I-8 | **Pay now is atomic:** `save_labour_cost` / `save_expense` with `pay_now` write the cost event, the payment event, the project allocation and the full settlement in one transaction under one op_key. Cost is counted once; paid status is derived | §14, §15 | Those functions |
| I-9 | **Dates of moves:** an allocation move uses the **payment's business date** (the current view always shows a payment against its project from the day it was paid) and its own `posted_at` (the as-known view reproduces what was known before the reallocation). A reversal uses the **reversal date**. Results for earlier dates never change | §19.1 | Posting functions |
| I-10 | Company party balance = Σ project balances + unallocated | §12.3 | Holds by construction; property test H3 |
| I-11 | Posted rows are never updated or deleted | §20 | Revoked grants + triggers |
| I-12 | Each source is posted once per event type; each ledger component is written once per event | §22 | Unique constraints (4.3) |

---

## 6. Retries and unreliable networks

| Situation | Handling |
|---|---|
| Draft creation | Client-generated uuid; `insert … on conflict (id) do nothing` |
| Posting | Contract 5.1 covers a lost response, a double tap, two devices posting the same draft, a reused key, and revoked access |
| Weekly labour | `save_labour_batch(op_key, days[])` creates one batch with a row per day. `unique (batch_id, work_date)`. A near-duplicate across batches needs confirmation |
| Daily report with labour | One function, one op_key. `labour_costs.daily_report_id` is unique, so a report creates at most one labour cost |

**Drafts on the device:**
- IndexedDB is keyed by `user_id + company_id` (one company per login in v1, but keeping the company in the key costs nothing).
- On logout, the app warns about unsent drafts, then deletes this user's drafts after confirmation, since phones may be shared.
- A draft keeps its op_key after Submit until the app sees success.

---

## 7. Localization
- **Money:** `Intl.NumberFormat('en-IN')` gives lakh/crore grouping. All maths is in paisa.
- **Dates (confirmed: BS and AD both available):**
  - Stored in AD (`date`). BS is only for display and input.
  - Company setting picks the default display (BS by default). Each user can override it.
  - Key screens (documents, calendar day, report headers) show both, in the format `YYYY-MM-DD BS · D Mon YYYY`. Lists show the user's chosen calendar only, to save space.
  - The date picker has a BS/AD switch. Either input is saved as the same AD date.
  - Excel exports include both a BS column and an AD column.
  - `dates.ts` is tested across fiscal-year and month boundaries.
- **Fiscal year:** Shrawan 1 to Ashadh end.
- **Timezone:** "today" is computed in Asia/Kathmandu.
- **Text:** all labels go through `t()`.
- **Document numbers:** `doc_sequences` with a row lock.

---

## 8. Decisions

All product decisions are confirmed by the product owner (2026-10-09) and listed in req §25. These are the ones that shape this design:

| Item | Decision | Where in this design |
|---|---|---|
| Hosting | Cloudflare Pages + Supabase free; upgrade to Supabase Pro when a pilot company relies on the app daily | 1.2 |
| Mobile | Web app + light PWA; `platform/` adapter so Capacitor can be added later | 1.4 |
| Dates | BS default, AD always available, AD stored | 7 |
| Companies per login | One in v1 (unique active membership) | 3.1 |
| Login / recovery | Password; admin creates staff and resets passwords; email self-reset where available; no SMS | 3.1, Edge Functions |
| Phone login without SMS | Verified in milestone 1: Supabase refuses phone + password unless the phone provider (normally needing SMS) is on. So a phone number is stored as an internal login email `977XXXXXXXXXX@phone.nirmankhata.invalid`; users only ever type their phone. Public sign-up is disabled; accounts are created only by the `register` and `admin-users` Edge Functions | 3.1 |
| Own-entry access | X1–X3 | 3.5 |
| Slip approval | Configurable, on by default. Approver: PM with `can_approve_slips` + access to all projects on the slip, or Admin | 3.6 |
| Slip notifications | In-app only. "Submitted" → eligible approvers; "approved/rejected" → creator | 4.2 `notifications` |
| VAT | Company setting, default "VAT as cost"; copied onto each bill when the draft is created | 5.6 I-3 |
| Header charges | Pro-rata, override per project allowed | 5.6 I-2 |
| Payment allocation | Optional at payment; unallocated bucket; bill matching later | 4.3, 5.3 |
| Contract vs budget | Budget pre-filled from contract (editable); cost compared with budget only; planned margin; final result only for Completed/Closed | Reports (milestone 5) |
| Cost timing | Bill post / charge approval / labour & expense entry; never payments | 5.6 I-1, I-6 |
| Weekly labour | Generates daily records | 6 |
| Progress | Manual % per stage and overall | Milestone 4 |
| Slip numbering | Simple per-company sequence | 7 |
| Out of v1 | Client receipts, salaries, TDS, rate lists (last billed rate hint only), supplier logins, offline sync, push/SMS | — |
| Pricing | Decide after pilot; `company_usage` view tracks usage | 4.2 |

Nothing open blocks milestone 1 or 2.

---

## 9. Milestones

| # | Milestone | Main work | Tests |
|---|---|---|---|
| 0 | Pilot screens | Clickable prototype with real challans and bills | Pilot feedback |
| 1 | Foundation | Supabase, RLS helpers, permission matrix + exceptions, immutable attachments, auth + admin-created staff + admin password reset, device drafts, projects, headings, materials, revisions, BS dates, money, PWA shell, CI, backups + first restore drill | Acceptance #1, #9, #15; S1–S5, B1 |
| 2 | Supplier loop | Suppliers + opening balances, slips, deliveries, returns, bills + matching + charge allocation, payments + allocation + settlement, credits/reversals, khata | Acceptance #2–#6, #12, #13, #16, #17, #20–#22; C1–C8, M1–M4, R1–R3 |
| 3 | Other costs | Subcontract, crews, labour (batches, pay now), payees, expenses | Acceptance #7, #8, #18; L1–L3 |
| 4 | Site | Daily reports, progress, calendar | Acceptance #10, #11, #23; L2 |
| 5 | Dashboards, reports, exports | Dashboards, 11 reports, report exports, full export | Acceptance #14, #19; H1–H3, E1–E2 |

Milestone 2's invariant and concurrency tests are written before its screens.

**Status (2026-10-10):** milestone 1 built. Milestone 2 built: migrations `20261010000100`–`300`,
pgTAP files `008`–`011` (acceptance #2–#6, #12, #13, #16, #17, #20–#22; C3, C4, C6–C8; M1–M4; R1–R3;
S2 for X1, S4, S5), `supabase/tests/concurrency.sh` (C1, C2, C5 and same-key retries on two
connections), and `app/e2e/supplier-loop.spec.ts`. Not in milestone 2 yet: supplier refunds
(added in milestone 6), the full H3 property test, and
as-known reports (the `p_as_known` switch exists in `project_cost_summary`; reports are milestone 5).

Milestone 3 built: migrations `20261012000100`–`200` (subcontractors, work packages, charges,
crews, labour batches, payees, expenses; payments, posting events, ledger, settlements, reversals
and opening balances widened to any party and document), pgTAP files `013`–`014` (acceptance #7,
#8, #18; L1, L3; L2 needs daily reports and moves to milestone 4), the L1 two-connection batch race and a concurrent charge
approval race in `concurrency.sh`, and `app/e2e/other-costs.spec.ts`. Decisions made while
building it:
- X2: staff without finance access see their own labour and expense entries for 7 days or until
  reversed. "Until settled" was dropped, because pay now settles an entry the moment it is saved.
- Charges, labour and expenses are corrected by reversal only. Credits stay supplier-only in v1.
- A payment made against a work package goes wholly to that package's project and settles only
  that package's charges. Its project split cannot be changed.
- Every project gets a default "Site crew" when it is created.

UX pass (2026-10-10), migration `20261013000100` and pgTAP `015`: paper-first bills. A draft
bill may be saved with only its supplier, and sent to Accounts with just an uploaded photo; the
bill number and lines are required before posting (`bill_checks` errors `no_bill_no`, `no_lines`;
constraint `supplier_bills_number_before_posting`). Accounts may record the paper bill total
(`supplier_bill_charges.paper_total_paisa`); posting is blocked while the lines and charges do
not add up to it (`paper_total_mismatch`). Payments are now entered from the bills they pay;
the project split follows from the ticked bills, with a free split only when nothing is unpaid (then the payment can be marked Peski).

Navigation (2026-10-10): sections, the phone bottom bar and the "+ Record" actions are chosen by
role in `app/src/components/nav.ts` (groups Site work / Money / Setup). New records start on the
"current project" (`features/projects/current.tsx`), and the bar shows counts of work waiting.
"Track own labour" now hides the labour record action and the project's labour list. The
`/labour/new` route stays, so existing records still open.

Milestone 4 built: migration `20261014000100` (stages, progress updates, daily reports and
lines, `labour_costs.daily_report_id`, site attachments, `submit_daily_report`, `progress_as_of`,
`report_day`, `calendar_events`), pgTAP `016` (acceptance #10, #11, #23; L2; H2 for progress), the
L2 same-key race in `concurrency.sh`, and `app/e2e/site.spec.ts`. Decisions made while building it:
- Daily reports have no server-side drafts. Unsent work stays in the device draft, and a report
  cannot be changed once sent (the `no_change` trigger), like progress updates.
- A report's labour part creates the labour cost through `private.post_labour`, with near-duplicate
  confirmation and pay now. It is ignored when the company does not track own labour.
- Stages come from a built-in list or are copied from another project; only Admin or the project
  manager sets them up. Overall progress is its own entry, not an average of stages.
- Progress is corrected only by a newer update. A lower figure needs a reason.
- The calendar runs as security invoker, so ledger visibility decides who sees amounts. A
  Peski payment shows as "peski" (migration `20261022000100`).
- A device-draft autosave that was still pending when a form was sent no longer brings the
  draft back (`lib/drafts.ts`).

Milestone 5 built: migration `20261016000100` (`project_dashboard`, `company_dashboard`, the
`report_*` functions and `export_company_data`), pgTAP `017` (acceptance #14, #19; H1; H3 as a
seeded 60-step random sequence; permissions), `supabase/tests/export.sh` (E1, E2), the
`company-export` Edge Function, and `app/e2e/reports.spec.ts`. Decisions made while building it:
- Dashboards and reports run as security invoker, like the calendar: RLS decides the rows, and
  amounts are null for people without finance access. Money reports are not listed for them.
- Recorded cost always comes with what it does not include yet: received items not billed (with
  an estimate from the last billed rate), bills not posted, and days since the last daily report.
- Report Excel files are real `.xlsx` from `write-excel-file`, loaded only when someone exports.
  Money is written as rupees so Excel can add it up. Dates are written as the text shown on screen,
  because Excel has no BS calendar. PDF is the browser's print, using a print layout.
- The full export does not use a separate DB connection: the Edge Function runtime cannot reach the
  database host directly. It calls `export_company_data`, a STABLE function, which reads every table
  from one snapshot. The zip is returned in the response instead of being stored, because storage
  caps an upload at 50 MB. The function refuses above 150 MB of attachments.
- Finance users land on `/dashboard` after sign-in; everyone else lands on `/projects`. Daily
  report pages moved from `/reports/...` to `/daily/...`, so `/reports` is the report list.
- Not done: demo data in `seed.sql`.

Milestone 6 (requirement gaps found by the 2026-10-10 audit) built: migrations `20261018000100`
(refunds) and `20261018000200` (list paging), pgTAP `019` and refunds in the H3 sequence, a refund
race in `concurrency.sh`, and `app/e2e/gaps.spec.ts`. Decisions made while building it:
- Refunds from any party (§12.2, §12.3): ledger row cost 0, balance +amount, cash -amount, on a
  project or unallocated. A refund may not exceed the Overpayment held with the party (Peski Returned: the Peski), company-wide
  **and** in the chosen bucket, so it never turns money held into money owed (product owner).
  The party lock makes two refunds for the same money take turns. Reversal only by Accounts/Admin.
  The payment register lists refunds as negative rows, so its total is cash paid net of refunds.
- Password reset by email (§22): `/forgot` and `/reset`, shown only when the build sets
  `VITE_EMAIL_RESET=true`. Production needs an SMTP sender first, since Supabase's built-in mailer
  only reaches the project team; the sender is still to be chosen (product owner). Phone logins
  are told to ask their admin. The page answers the same whether or not an email has a login.
- The bill form shows the supplier's last billed rate for the material, with "Use" (§11.2).
- Lists load 50 rows with "Show more" (`lib/paging.ts`): bills, slips, deliveries, payments,
  labour, expenses, daily reports and a party's payments. Tabs and the project filter run on the
  server (`slip_summaries` view), tab counts are count queries, and the Bills "still owed" figure
  is `bills_owed`, so none of them depend on how many rows are loaded. Pages use offset ranges
  with a unique last sort column. The khata is not paged yet: it is a running-balance statement.
- The dev server ignores `app/e2e/` (Playwright traces made Vite reload pages mid-test).
- Still open from the audit: backups and restore drill, change-history screen, typed-material
  cleanup, revision attachments, logo, renaming terms, super admin, agreed launch targets.

Client receipts (requirements open question #1, asked for by the pilot) built: migration
`20261021000100`, pgTAP `021`, and `app/e2e/client.spec.ts`. Decisions made while building it:
- Money the client pays is kept **out of the ledger**. Every ledger row belongs to one party the
  company pays, and its cash column means money out, so client money fits none of it. Receipts
  never change cost, cash paid, party balances or the khata.
- One amount per receipt: what the client settled, including any TDS or retention they kept back.
  A split into deductions is left for companies with an accountant (product owner).
- `record_client_receipt` (anyone with payment rights on the project; numbered CR-0001) and
  `reverse_client_receipt` (Accounts/Admin, reason, own date, once). A posted receipt may change
  only its status, so the reversal is its own row in `client_receipt_reversals`.
- `client_received_as_of` runs with the caller's rights, so the "As of" card and the Client tab
  follow the receipt read rule: everything for Admin/Accounts, otherwise finance on the project.
- `calendar_events` gained a `received_paisa` column, so the calendar's Paid total is unchanged.
- Shown in the Contract and budget card (Received, To collect) and a Client tab; not in the
  top summary, which stays about spending (product owner).

Simple forms (product owner: two ways of using the app, same data) built: migration
`20261023000100` (`companies.simple_forms`, default off; admins change it through the existing
update policy), pgTAP `022`, `app/e2e/simple.spec.ts`. `components/More.tsx` wraps a form's
less-used fields: in Detailed it renders them as before; in Simple it is a closed `<details>` in
the style of `MoreDetails`, kept mounted so react-hook-form still registers the fields. It opens
when a field inside holds a value (inputs, selects, or `data-has-value` on the date field;
`data-default` marks values the form filled in itself; an amount of 0 is empty). It re-checks on
every render and opens on the change to filled, so a draft restored after mount opens it too.
Form errors about a folded field call `revealField` (`lib/forms.ts`) to open the fold and focus
it. The bill's paper-total check stays outside the fold; the expense cost heading folds only when
the site heading exists to fill it in. Payment and client
receipt forms are not folded: their only optional field (reference) already shows just for
non-cash methods.

---

## 10. Tests

### 10.1 Beyond the 23 acceptance criteria

| ID | Test |
|---|---|
| S1 | A user assigned to Project A only can't read Project B rows, totals or files via the table API, RPC, storage or signed URLs |
| S2 | A user without Fin can't read amounts anywhere **except** exactly the X1/X2 cases. Each exception is tested positively and negatively: another person's draft, after submit, after 7 days, after losing project access |
| S3 | Every view uses `security_invoker`, and every tenant table has RLS enabled |
| S4 | Sharing a slip fails after the creator loses access to one of its projects |
| S5 | Work-package values, opening balances, unallocated payment amounts and company-level party balances are hidden from non-Accounts users |
| C1 | Concurrent settlements of 60,000 + 60,000 against a 1,00,000 bill: only one succeeds in full |
| C2 | Concurrent `post_bill` on one draft: posted once |
| C3 | Commit succeeds, response lost: the retry returns the original result. The same key with different input is rejected. A key reused by a different user is rejected |
| C4 | **Retry after permission revoked:** the user loses project access or is deactivated, then retries a completed op_key. The call is rejected and no result is returned |
| C5 | Concurrent reversals: reversed once |
| C6 | **Multi-row ledger events:** a payment split across 3 projects plus an unallocated part writes 4 rows under one event. A replay writes none |
| C7 | **Credited-bill reversal:** bill 1,00,000, credit 20,000, reverse the bill. The credit is reversed in the same step, and cost and payable from the bill net to 0 (not −20,000). Same for a charge, labour cost and expense |
| C8 | **Payment reversal after reallocation:** a payment allocated 60/40, later moved to 30/70, then reversed. Every project and the unallocated bucket net to 0. Reports dated before the reversal are unchanged |
| M1 | Partial match: 60 of 100 bags billed, 40 remain billable |
| M2 | A match to a different supplier, project, material or unit is rejected |
| M3 | One unmatched material line blocks posting without Accounts role + a reason for that line |
| M4 | A billed quantity can't exceed `billable_qty` |
| R1 | **Return before credit:** a billed delivery is partly returned. Quantity shows as awaiting credit; cost and payable are unchanged |
| R2 | A later credit linked to the return clears awaiting credit and lowers cost and payable |
| R3 | A returned quantity can't be matched to a new bill |
| L1 | A weekly labour batch retried after timeout creates 7 rows, not 14 |
| L2 | A daily report with labour, submitted twice, creates one labour cost |
| L3 | Pay-now labour: cost counted once, entry shows as paid, cash paid equals the amount |
| H1 | A settlement report dated before a reversal shows the original settlement |
| H2 | Budget and progress as of a past date use the revisions and updates effective then |
| H3 | Property test: I-10 holds after random sequences of postings, allocations, credits and reversals |
| E1 | Full export manifest row counts match the snapshot. Every listed file is present |
| E2 | Rows written during an export don't appear partially (consistent snapshot) |
| B1 | Restore drill passes the checklist in 11.2 |

### 10.2 Tooling
- pgTAP via `supabase test db`.
- Concurrency tests run as a Node script with two DB connections.
- Vitest for client utilities.
- Playwright on a phone-size screen.
- Real pilot devices and site networks.

---

## 11. Operations

### 11.1 Deploy
- Push to `main` → CI → `supabase db push` → Cloudflare Pages build.
- The frontend has only the anon key and URL. The service-role key lives only in Edge Function and CI secrets.

### 11.2 Backups and recovery

**Targets (pilot):** RPO 24 hours for DB and files, RTO 4 hours. These are **targets** until the restore drills show them being met. Supabase Pro improves DB backups only; nightly file copies still mean up to 24 hours of files can be lost.

| Item | Design |
|---|---|
| Database | Nightly, three separate dumps, as in Supabase's restore procedure: `supabase db dump --role-only`, schema-only, and `--data-only` (including the `auth` schema so logins survive) |
| Config | Storage bucket settings, RLS and functions are in `supabase/migrations/`, the R2 CORS policy in `cloudflare/` (git). Edge Function secrets are listed (names only) in an ops checklist kept with the owner |
| Files | After the DB dump, copy new R2 objects (and logos). Objects are immutable (3.7), so copying is incremental |
| Manifest | Each run writes `manifest.json`: dump start time, DB row counts, and the list of files copied with checksums. Restore uses the manifest to report attachment rows with no file (uploads after the dump), which are caught on the next run |
| Encryption | `age` before upload to R2. The private key is kept offline in two places (owner + developer) and recorded in the handover checklist |
| Retention | 30 daily, 12 monthly DB dumps. Files kept while the company exists; removed files (`removed_at`) kept 1 year |
| Reliability | GitHub scheduled runs can be delayed or skipped. The job runs **twice a day** (the second run exits early if a backup newer than 20 hours exists) and retries each step 3 times |
| Monitoring | Each successful run pings **Healthchecks.io** (period 24 h, grace 6 h), which emails the developer and owner if no ping arrives. This check is independent of GitHub |
| Restore drill | Before the pilot, then monthly: restore roles → schema → data → files into a fresh local Supabase. Pass = (1) a staff member logs in, (2) a bill photo opens through a signed URL, (3) the I-10 reconciliation query returns no differences, (4) row counts match the manifest. Record the time taken; that is the measured RTO |

### 11.3 Full company export (req §22)
- Admin only. An Edge Function calls the STABLE `export_company_data` function, which reads every table from **one** snapshot.
- Output, one zip returned directly to the admin's browser (not stored):
  - one CSV per tenant table, including drafts, assignments, revisions, progress, catalog, posting events, ledger and settlement events;
  - `staff.csv` with name, phone, roles and active flag, **for this company's members only**, taken from the global profiles without other companies' data;
  - `manifest.json` with schema version, snapshot time, row counts and file checksums;
  - `attachments/` with the files listed in the snapshot (files are immutable, so the snapshot's list is exact).
- Report exports (Excel/PDF) are separate and follow the user's permissions.

---

## 12. Risks

| Risk | Plan |
|---|---|
| Supabase free project pauses | Accepted for early pilot; upgrade trigger |
| Phone + password login without SMS | Spike in milestone 1; fallback to admin-created accounts with a phone-based login ID |
| SQL function complexity | Small functions, pgTAP, clear error codes |
| Per-party serialization | Fine at pilot volume |
| BS library accuracy | Pinned version and tested; replaceable behind `dates.ts` |
| Storage fills | Compression, usage monitoring, upgrade or move to R2 |
| Staff don't enter data promptly | Milestone 0 prototype with real data |
