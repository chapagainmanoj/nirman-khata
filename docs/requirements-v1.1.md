# NirmanKhata
## Construction Project Monitoring Platform: Requirements Document

| Item | Detail |
|---|---|
| Product name | NirmanKhata |
| Version | 1.1 (v1.0 draft + product owner decisions, 2026-10-09) |
| Date | 2026-10-09 |
| Target users | Construction companies (Nirman Company / Thekedar) in Nepal |
| Platforms | Web (office) + mobile (field staff) |
| Tenancy | Multi-tenant SaaS |
| Status | Decisions confirmed by the product owner. Section 25 lists them; section 27 records the answers |

**Core v1 loop:** Project → Order slip → Delivery → Bill → Payment → Ledger, plus daily labour, subcontract costs, site reports, progress and calendar. Anything outside this loop is lower priority.

---

## 1. Product Objective

The platform helps a construction company answer, for each project and for the company as a whole:

- What is happening at each site?
- How much has the project cost up to a selected date?
- How does that cost compare with the contract amount and the spending budget?
- How much has been paid, and how much is still payable (baki)?
- What materials were ordered, delivered, billed, or are still pending?
- How much physical work is complete?
- What happened on a particular day?

Each company's data is private and fully separated from other companies.

---

## 2. Scope of Version 1

1. Company, staff, roles and project assignments.
2. Projects with contract amount and spending budget (with revisions).
3. Cost headings and material catalog.
4. Suppliers and supplier ledgers (khata).
5. Material order slips (maag slip).
6. Material deliveries (challan).
7. Supplier bills, payments, advances and balances.
8. Subcontractor work packages, charges, advances and payments.
9. Own labour cost (optional per company).
10. Other project expenses.
11. Daily site reports and progress updates.
12. Activity calendar.
13. Dashboards and reports.
14. Attachments, permissions, audit history and corrections.

**Delivery approach (proposed):**
- **Phase 1:** Responsive web app, installable on Android as a PWA. Office users on desktop, field staff on phone.
- **Phase 2:** Native Android app (iOS after), with offline entry and sync.

Suppliers and subcontractors do not get logins in v1. Company staff record their transactions.

---

## 3. Terminology and Nepal Localization

### 3.1 Terms

English labels with familiar Nepali words. Companies can rename terms, materials and headings.

| System term | Local / common term | Meaning |
|---|---|---|
| Company / Organization | Nirman Company / Thekedar | The business using the platform (tenant) |
| Project / Site | Site / Kaam | A construction job |
| Contract Amount | Thekka Rakam | Amount the client agreed to pay |
| Spending Budget | Lagat Anuman | Company's planned cost to complete the project |
| Cost Heading | Kharcha Shirshak | Category such as materials, labour, subcontract |
| Staff | Karmachari, Engineer, Overseer, Supervisor | Company employees using the app |
| Supplier | Supplier / Pasal / Dealer | Sells materials |
| Subcontractor | Petty Contractor / Sub-thekedar | Does part of the work (plaster, electrical etc.) |
| Own Labour | Jyami / Dakarmi / Jyala | Company's daily-wage crew |
| Material Order Slip | Maag Slip / Demand Slip | Request to one supplier for materials |
| Delivery Record | Challan | Materials actually received at site |
| Supplier Bill | Bill / Invoice | Supplier's charge |
| Ledger | Khata | History of bills, payments, credits and balance |
| Outstanding | Baki / Tirna Baki | Amount still payable |
| Advance | Peski | Money paid before an equivalent bill or work charge |
| Payment | Bhuktani | Money paid out |
| Daily Site Report | Dainik Bibaran | Dated record of site work, issues and photos |

### 3.2 Materials and units (seed data, editable)

| Material | Typical units |
|---|---|
| Cement | Bora (bag) |
| Rod / Chhad (TMT rebar) | Kg, Quintal, Tonne, Piece, Bundle |
| Baluwa (sand) | Cft, Trip, Load |
| Gitti (aggregate) | Cft, Trip, Load |
| Dhunga (stone) | Cft, Trip, Load |
| Eeta (brick) | Piece, Thousand |
| Metal / hardware | Kg, Piece |
| Electrical items | Piece, Meter, Coil |
| Plumbing items | Piece, Meter |

A quantity must always have a unit. "Trip" and "load" must keep a description (e.g. "tipper", "tractor") because size varies. No automatic unit conversion unless a conversion rule is defined.

### 3.3 Localization

- **Currency:** NPR, displayed as `Rs. 12,34,567` (lakh/crore grouping), with "lakh"/"crore" shorthand in summaries.
- **Dates:** Bikram Sambat (BS) shown by default, AD toggle. All dates stored in AD internally. Date pickers support BS input.
- **Fiscal year:** Nepali fiscal year (Shrawan 1 to Ashadh end) for reports and document numbering.
- **Timezone:** Asia/Kathmandu (UTC+05:45).
- **Text:** Unicode everywhere, so names and notes can be in Nepali.
- **Phone:** Nepal format (+977).
- **Payment methods:** Cash, Cheque, Bank transfer, eSewa, Khalti, FonePay/ConnectIPS, Other.
- **Language:** English UI in v1. Nepali UI in a later phase (keep all labels translatable).

---

## 4. Company Structure and Data Ownership

```
Platform
 └── Company (tenant)
      ├── Staff memberships (roles)
      ├── Cost headings, material catalog, settings
      ├── Suppliers        (shared across projects)
      ├── Subcontractors   (shared across projects)
      └── Projects
           ├── Contract amount + revisions
           ├── Spending budget + revisions (optionally by heading)
           ├── Assigned staff
           ├── Order slip lines, deliveries, bill lines
           ├── Subcontract work packages
           ├── Labour costs, other expenses
           ├── Daily site reports, progress updates
           └── Attachments
```

### 4.1 Company
- Name, address, contact, optional logo, PAN/VAT number.
- Settings: BS/AD default, approval on/off, tax fields on/off, labour module on/off, document number formats.

### 4.2 Projects
- Name and unique company-level code.
- Site location (district, municipality, ward, free text).
- Optional client name and contact.
- Project manager and assigned staff.
- Planned and actual start/completion dates.
- Original and revised contract amount; original and revised spending budget.
- Status: **Planned, Active, On Hold, Completed, Closed, Cancelled.**
  - Completed = construction work done.
  - Closed = financial reconciliation done too.

### 4.3 Shared parties
- One supplier or subcontractor can work on several projects of the same company.
- Show both the company-level balance and per-project transactions/balances.
- Party records are private per company, even if two companies deal with the same business.
- In v1, one login belongs to one company. A person working for two companies needs two logins (each with its own phone or email).

---

## 5. Users and Permissions

| Role | Main permissions |
|---|---|
| Owner / Administrator | Everything: settings, staff, projects, permissions, all records |
| Project Manager / Engineer | Assigned projects: approve slips, record deliveries, update progress |
| Site Staff / Supervisor / Storekeeper | Create order slips, record receipts, submit daily reports, upload photos |
| Accounts Staff | Post bills, expenses, payments, credits and corrections |
| Viewer | Read permitted dashboards and reports |
| Platform Super Admin | Manage tenants and support (outside company data) |

- One person may hold several roles (common in small companies).
- Project access follows assignment. Admin and Accounts see all projects.
- Viewing financial figures and recording payments are separate permissions.
- Deactivating staff keeps their historical records.
- Admins can see who created, approved or changed any record.
- All permission checks are enforced on the server.

---

## 6. Contract Amount and Spending Budget

- **Contract amount:** what the client pays for the job.
- **Spending budget:** what the company plans to spend to deliver it.

Example: contract NPR 50,00,000, spending budget NPR 40,00,000.

**Requirements**
- Record original contract amount and total spending budget.
- Optionally split the spending budget by cost heading.
- Record revisions (variation / change) with effective date, amount, reason, author and attachment. Keep full history.
- When a project is created, the spending budget is **pre-filled with the contract amount**. The user can keep it or change it. The value is always visible and editable.
- Recorded cost is compared with the **current spending budget only**. The contract amount is shown for reference.
- **Planned margin** = current contract amount - current spending budget (0 when they are equal).
- **Final result** (profit or loss) = current contract amount - recorded cost, shown **only for Completed or Closed projects**.
- Compare each heading's cost with its heading budget where given.
- Warn when heading budgets do not add up to the total spending budget.
- If the spending budget is cleared or zero, show budget comparisons as "Not available". Never use the contract amount as the budget without the user seeing it.

---

## 7. Cost Headings

Default headings (editable):

- Materials (subheadings: Cement, Rod/Steel, Baluwa/Gitti/Dhunga, Bricks, Hardware, Electrical, Plumbing)
- Own Labour (Jyala)
- Subcontract Work (subheadings by work type: Plaster, Masonry, Electrical, Plumbing, Painting, Tiling, Shuttering)
- Equipment / Machinery Hire (JCB, mixer etc.)
- Transport and Delivery
- Site Expenses (fuel, khaja, small purchases)
- Other

**Rules**
- Companies can add, rename and deactivate headings. Used headings stay visible in historical reports.
- Every posted cost line belongs to exactly one project and one heading.
- One bill can contain lines for different projects and headings.
- Material type and cost heading are separate (a material has a default heading that can be overridden per line).
- Reports group by heading, subheading, project, party and date.

---

## 8. Material Catalog and Suppliers

### 8.1 Materials
- Name, optional local name, specification (grade, rod diameter, brand, aggregate size), default unit, default heading, active flag.
- Staff can type a new material on a slip; admin can later add it to the catalog or merge duplicates.

### 8.2 Suppliers
- Business name, contact person, phone, address, optional PAN/VAT.
- Material categories supplied (e.g. Cement + Rod; Baluwa + Dhunga; Metal; Electrical).
- Optional payment terms.
- Opening balance with cutover date and note.
- Active flag.

A material can come from many suppliers; a supplier can supply many materials.

---

## 9. Material Order Slips (Maag Slip)

### 9.1 Structure
**Confirmed:** one slip is addressed to **one supplier**.
**Proposed:** one slip can contain lines for **multiple projects**. Each line must name its destination project.

Example: 5 lines for Project 1 and 2 lines for Project 2, one supplier, one slip.

**Slip header:** slip number (auto, unique per company, simple sequence e.g. `OS-0012`; fiscal-year formats later), supplier, request date, required date, requesting staff, delivery instructions and site contact, notes, approval and sending history.

**Slip line:** project, material, specification, quantity, unit, optional estimated rate, note.

### 9.2 Workflow
1. Staff picks a supplier (on mobile).
2. Adds material lines, each with a project. Recent and frequent materials shown first.
3. Saves draft or submits.
4. If approval is enabled, an authorized person approves or rejects.
5. Staff shares the slip with the supplier (WhatsApp, Viber, SMS, PDF, print) using the phone's share sheet.
6. Deliveries are recorded as material arrives.
7. Slip shows received vs remaining quantity per line.
8. Slip ends as fully received or closed short with a reason.

### 9.3 States (kept separate)
- **Approval:** Draft, Pending Approval, Approved, Rejected, Cancelled.
- **Sending:** Not Sent, Marked Sent (does not mean the supplier acknowledged).
- **Fulfilment:** Not Received, Partially Received, Fully Received, Closed Short.

Approval is configurable per company. If off, a submitted slip is treated as approved.

**An order slip never creates a cost or a supplier payable.**

---

## 10. Material Deliveries (Challan)

Records what actually arrived, independent of what was ordered or billed.

- Link to supplier and, where available, order slip lines.
- Receipt date, receiving staff, destination project, challan number.
- Actual quantity and unit per line.
- Multiple deliveries per slip.
- Record shortage, damage, rejected quantity or spec difference.
- Attach challan/site photo.
- Flag received quantity above ordered quantity for review.
- Allow delivery without a slip, with a reason.

A delivery does not create a payable. The dashboard shows **received but not yet billed** materials so cost totals are not mistaken as complete.

---

## 11. Supplier Bills and Project Costs

### 11.1 Bill details
Supplier, bill number, bill date, cost date, optional due date, linked deliveries/slips, lines (material or charge, project, heading, qty, unit, rate, amount), discount, VAT (optional, 13% default rate), transport charge, total, attachment, status.

### 11.2 Workflow
1. Staff or accounts enter the bill (photo capture on mobile).
2. Match with deliveries where available.
3. Review quantity and rate differences. The last billed rate for the same supplier and material is shown as a hint.
4. Authorized user **posts** the bill.
5. Posted lines increase project cost under their headings.
6. Posted bill increases the supplier payable.

**Statuses:** Draft, Under Review, Posted, Reversed.

### 11.3 Rules
- Only posted bills count in cost totals.
- Every line has a project and heading. Shared charges (e.g. transport for two sites) must be split explicitly.
- Partial billing and multi-delivery / multi-project bills are supported.
- Warn on duplicate bill number for the same supplier.
- Bills with no matching receipt are flagged; posting needs authorization and a reason.
- Ordered vs received vs billed differences are visible.
- Drafts can be edited/deleted. Posted bills change only through reversal or credit, with history.
- Tax fields are configurable. Statutory tax reporting is out of scope for v1.

### 11.4 Header charges and project allocation

Discount, transport and VAT are entered on the bill header, but project cost comes from lines. Rule:

- On posting, every header charge is **allocated to lines** (and therefore to projects and headings).
- **Default:** pro-rata by line amount. User can override with explicit amounts per project (e.g. transport only for Project A).
- Transport may optionally be posted as its own line under the Transport heading instead.
- **VAT treatment** is a company setting:
  - *VAT as cost* (default, for companies not claiming input VAT): VAT is allocated to lines like other charges.
  - *VAT recoverable*: VAT is excluded from project cost and tracked separately.
- **Invariant:** sum of allocated project amounts = bill total (VAT as cost) or bill total minus VAT (VAT recoverable). The supplier payable always increases by the full bill total.
- Posting is blocked if allocation does not balance.

---

## 12. Supplier Payments and Balances

Payments may come before bills, after bills, in instalments, or as a lump sum for several bills. Everything settles by the end.

### 12.1 Payment record
Supplier, payment date, amount, method, reference (cheque no., transaction id), optional project allocation, optional bill allocation, notes, proof attachment, recorded/approved by.

### 12.2 Balance rules

```
Supplier net balance = opening payable
                     + posted bills
                     - posted credits
                     - payments made
                     + refunds received
```

- Positive = company owes the supplier (baki).
- Negative = company has an advance/credit with the supplier (peski).
- Payments do not need to match a bill. Bill allocation can be added later without a new payment.
- Payments with no project allocation stay visibly **unallocated** until assigned. Project-level balances show unallocated amounts alongside.
- Bill settlement status is separate from net balance (a supplier can have unpaid bills and an unused advance at the same time).

**Example:** bills NPR 1,20,000, payments NPR 80,000, payable NPR 40,000. Another NPR 50,000 paid gives an advance of NPR 10,000. **Payments never add to project cost.**

### 12.3 Payment allocation rules

A payment can be split across projects and, later, matched to bills. Allocation has two levels:

1. **Project allocation:** how much of the payment belongs to each project.
2. **Bill allocation:** which bills (within that project) it settles.

**Rules**
- Sum of project allocations ≤ payment amount. The remainder is **unallocated** and shown once, at company level.
- Sum of bill allocations for a project ≤ that project's allocation from the same payment.
- A bill allocation must match the bill line's project. A bill spanning two projects is settled per project.
- Bill allocation total for a bill ≤ bill total (excess stays as advance).
- **Settlement uses the payable amount, not the cost amount.** Each bill line carries both `cost_amount` (what hits the project) and `payable_amount` (its share of the full bill including VAT). With recoverable VAT these differ. Project balances and bill settlement use `payable_amount`; project cost uses `cost_amount`.
- Matching to bills **refines** the existing project allocation. It never adds to project cash paid again.
- Changing or removing an allocation is logged and does not change the payment amount or the supplier net balance.
- **Unallocated ledger:** every supplier has a company-level "unallocated" bucket holding the signed effect of anything not tied to a project: opening balance, unallocated payments (negative), unallocated credits (negative) and refunds (positive).
- Reconciliation invariant: **company-level supplier balance = sum of project-level balances + signed unallocated balance.**
  Example: Project A bills 1,00,000, unallocated payment 20,000. Project A balance +1,00,000, unallocated -20,000, company balance 80,000 payable.

**Example:** pay Supplier X NPR 1,00,000, allocate 60,000 to Project A and 40,000 to Project B. Later 60,000 is matched to two Project A bills. Project A cash paid stays 60,000; only bill settlement status changes.

The same rules apply to subcontractor and labour payments.

---

## 13. Subcontractor Work and Payments

Examples: plaster, masonry, plumbing, electrical, painting, tiling.

- Subcontractor record: name, phone, optional PAN, work types.
- **Work package** per project: subcontractor, scope, heading, agreed value (lump sum or rate x quantity, e.g. per sq.ft), planned dates, status, progress.
- Record claims/bills from the subcontractor.
- Record **approved work charge** separately from payments. Approved charge = cost.
- Advances, partial payments and final settlement.
- TDS is out of scope for v1 (its effect on paid vs payable needs its own spec).
- Attach agreement, measurements, bills, payment proof.
- Show per package: agreed value, approved cost, paid, payable, advance balance, remaining value.

**Example:** NPR 50,000 plaster advance is cash paid, not cost. When NPR 80,000 of work is approved, cost = NPR 80,000 (created by the approval). Applying the advance settles 50,000 of it, leaving payable NPR 30,000.

Measurement books, retention and deductions are future scope.

---

## 14. Own Labour Cost (optional module)

- No individual worker profiles.
- **Crew** is a lightweight record (e.g. "Ram's crew", "Local jyami") acting as the payee for labour costs and payments. One default crew per project is created automatically.
- **Labour cost is recorded per project per work date** (confirmed: day-wise). Fields: crew/work description (Dakarmi, Jyami, Mixed), total cost, optional headcount, person-days and rate.
- **Weekly/range entry** is a convenience form only: it generates one daily record per date (same amount each day, or edited per day). The calendar always shows cost on the actual work date.
- Cost incurred is separate from labour payment. One payment can cover several days.
- **Pay now (default):** saving with "pay now" creates a linked payment for the same amount without double counting.
- Paid / partly paid / unpaid status is **derived** from linked payments, not stored as a flag.
- Show unpaid labour cost and labour advances.
- Confirm before saving a near-duplicate entry for the same project and day.

---

## 15. Other Project Expenses

Equipment hire, transport, fuel, khaja, permits, small site purchases.

- Fields: project, heading, date, amount, description, payee, attachment.
- **Payee** is a lightweight record (name, phone optional, type e.g. JCB owner, transporter, shop). Pick an existing payee or type a new one. Payees are company-level and reusable. A payee can be promoted to a supplier later.
- Can be unpaid or paid immediately. Immediate payment creates a linked payment without duplicating cost. Settlement status is derived from linked payments.

---

## 16. Daily Activities and Progress

### 16.1 Daily site report (Dainik Bibaran)
Project, work date, work done, stage/area, optional quantities and units, optional labour summary, materials received, equipment used, issues/delays/safety notes, weather, photos, author, submit time.

Several staff can add entries for the same project and day. Entries are shown together, never overwritten.

### 16.2 Progress
- Stages per project (e.g. Excavation, Foundation, Structure/Slab, Masonry, Plaster, Electrical, Plumbing, Finishing). Templates for quick setup.
- Manual progress 0 to 100% per stage and for the overall project. Overall is entered manually, never a plain average of stages.
- Weighted overall progress (stage weights) is Phase 2.
- Each update: effective date, author, notes, photos. History kept.
- Reason required when progress is reduced.
- Flag overdue stages.
- Physical progress % and budget used % are shown side by side, never merged.

---

## 17. Activity Calendar

Company-level and project-level month views (BS default, AD toggle).

Selecting a day shows:
- Daily site reports and progress updates
- Order slips and deliveries
- Posted bills and expenses
- Supplier payments
- Subcontractor advances, charges and payments
- Labour costs and payments
- Corrections and reversals

Example day:
- Rs. 2,00,000 paid to Supplier A (Cement/Rod), bank transfer
- Rs. 50,000 advance to Ram Bahadur (Plaster), Project 1
- Bill from Supplier B: 3 trips baluwa, Rs. 45,000
- Labour: 12 workers, Rs. 14,400
- Order slip OS-0012 marked sent to Supplier C

**Requirements**
- Filter by project, activity type, supplier, subcontractor, staff.
- Tap an event to open the record.
- Show amounts; visually distinguish cost, payment and advance.
- Day totals: cost recorded, cash paid.
- Events use the **business date**. Entry timestamp is kept separately (a bill dated 8 Oct but entered 10 Oct shows on 8 Oct).

---

## 18. Dashboards and Reports

### 18.1 Company dashboard
- Active projects with status, progress % and budget used %
- Recorded cost and cash paid out (period and to date), with completeness banner per project
- Supplier and subcontractor payables; advances given
- Slips awaiting approval; pending deliveries
- Received materials awaiting bills
- Unallocated payments
- Projects over budget (overall or by heading)

### 18.2 Project dashboard
- Original and current contract amount; original and current spending budget
- Recorded cost to date; budget remaining; budget used %; planned margin; final result (Completed/Closed projects only)
- Cost by heading vs heading budget (table + bar chart, over-budget highlighted)
- Cost by source: materials, subcontract, labour, other
- Cash paid, outstanding payable, advances
- Physical progress vs budget used
- Pending orders/deliveries, unbilled receipts
- Recent activity, latest report date
- **Data completeness banner** next to recorded cost: count and estimated value of unbilled deliveries, unposted draft bills, and days since the last daily report. Cost figures are labelled "recorded cost" (on the project page, "Spent", with paid and due under it and "Left" of the spending budget beside it), never "total cost".

### 18.3 Reports
1. Project cost summary
2. Cost by heading
3. Budget vs recorded cost
4. Supplier ledger (khata) statement
5. Subcontractor ledger
6. Payment register
7. Material purchase report (qty and amount per material per project)
8. Pending order and delivery report
9. Daily activity report
10. Progress history
11. Labour cost report (if enabled)

All reports: date filters, project/party filters, export to Excel and PDF/print, BS/AD dates. Totals drill down to source records.

### 18.4 Notifications (v1, in-app only)
- Slip submitted (to approver); slip approved/rejected (to creator)
- Over-budget is shown on dashboards in v1. Threshold alerts (80%/100%) and push/SMS are Phase 2.

---

## 19. Financial Calculation Rules

| Metric | Definition |
|---|---|
| Recorded project cost | Posted bill lines + approved subcontract charges + labour costs + other expenses, less credits and reversals |
| Cash paid | Posted payments attributed to the project, less refunds received |
| Budget remaining | Current spending budget - recorded cost |
| Budget used % | Recorded cost / current spending budget x 100 |
| Planned margin | Current contract amount - current spending budget |
| Final result | Current contract amount - recorded cost, for Completed/Closed projects only |
| Outstanding payable | Amount owed after payments and credits |
| Advance | Payment or credit remaining against future charges |
| Received from client | Client receipts dated on or before the as-of date, less those reversed by then. Never part of recorded cost or cash paid |
| To collect | Current contract amount - received from client |

**Controls**
- Never add a bill and its payment together as cost.
- Orders are never cost.
- **Cost is created only by a posted bill, approved work charge, labour cost or expense**, regardless of payment. An advance is cash paid, never cost. Applying an advance settles an existing charge; it does not create cost.
- Show unbilled deliveries and other incomplete items next to cost totals.
- Do not label "contract - cost" or "budget remaining" as profit while a project is active. Only the final result of a Completed/Closed project is labelled profit or loss.
- Missing or zero denominator shows "Not available".
- Money stored as exact values (integer paisa or fixed decimal); one consistent rounding rule.
- Distinguish "transactions in a date range" from "balance as of a date".

### 19.1 Dates and "as of" reporting

Every financial record has:
- **Business date:** when it happened (bill date, payment date, work date). Used by calendar, cost and date-range reports.
- **Posted at:** when it was posted in the system. Used by audit.
- **Entered at:** when it was first created.

"As of date D" reports use:
- Records with business date ≤ D that are posted **(current view, default)**. An optional "as known on D" view also requires posted at ≤ D, so past reports can be reproduced.
- The **contract and budget revision effective on D** (latest effective date ≤ D), not today's.
- The **latest progress update with effective date ≤ D**.
- **Reversals:** a reversal is a separate record with its own business date. The original posting stays in every report dated before the reversal. Status "Reversed" is a display label only; calculations never filter out the original. Reports as of any date between posting and reversal still include the original amount.

Reports state which view and which budget revision they use.

### 19.2 Material costing

**Material costing (v1):** purchased material is charged to the project on its bill line when the bill is posted. Site stock, consumption and transfers between projects are future scope.

---

## 20. Corrections and History

- Drafts can be edited or deleted by authorized users.
- Posted financial records are never silently edited or deleted. Corrections use a reversal or credit that keeps the original, author, time, reason and effect.
- Material returns track quantity separately from the supplier credit. Cost and payable reduce only when the credit is posted.
- Opening balances need a cutover date and explanation, and do not become project cost.
- Completed projects can still receive authorized final bills and payments.
- Closed projects must be reopened by an authorized user before new financial postings.
- Audit log: who, when, entity, action, before and after values.

---

## 21. Mobile Experience

Field staff on mobile can:
- Create an order slip and share it to the supplier
- Record a delivery with challan photo
- Photograph and enter a bill
- Record labour cost
- Submit a daily report with photos
- Update progress
- View assigned project status and calendar (by permission)

**Avoid repeat entry**
- A delivery recorded once appears automatically in the daily report, calendar and bill matching. Staff never re-enter it.
- Bill entry pre-fills lines from linked deliveries; only rates are added.
- Daily report has a short mode (one note + photos); other fields are optional.
- Labour entered in the daily report creates the labour cost record (one entry, not two).

**Design rules:** large touch targets, minimal typing, recent/frequent materials, BS date picker, works on low-end Android, compressed photo uploads.

**Connectivity (v1):** online with reliable draft saving (stored on device), upload retry, and duplicate-safe submission. Must be tested on the actual phones and site connections of pilot users. Full offline entry and sync in Phase 2 (sites often have weak network).

---

## 22. Security and Operations

- Company isolation on every record, report, attachment, search and export (`company_id` on every tenant-owned row, enforced in the data layer, e.g. Postgres row-level security; global user identities follow section 23).
- Role and project permissions enforced server-side.
- v1 login: phone (or email) + password. Admin creates staff accounts and resets forgotten passwords. Staff with email can also self-reset by email. Phone OTP via SMS is later. Secure sessions.
- Attachments accessible only to authorized users (signed URLs).
- **Idempotent submissions:** retries never create duplicate payments or bills.
- Daily backups with tested restore.
- Pagination for large lists.
- Company can export all its data (Excel/CSV).
- Performance, storage and recovery targets agreed before launch.

---

## 23. Data Model (key entities and fields)

Illustrative; to be reviewed during technical design.

**Ownership rules**
- `User` is a **global identity** (no `company_id`). Company access comes only from `Membership`.
- Every **tenant-owned** business record carries `company_id`, `created_by`, `created_at`, `updated_at`. Financial records also carry `business_date`, `posted_at`, `status`.
- Every foreign key between tenant records must point to a record of the **same company** (enforced by composite keys `(company_id, id)` or DB checks, plus row-level security).
- Polymorphic references (`party_type` + `party_id`, `owner_type` + `owner_id`) are avoided where possible; where used, the same-company check is enforced in the data layer.
- No stored `paid` flags. Settlement status is derived from allocations.
- `received_qty` on slip lines is derived (accepted delivery qty minus returns), or a cached value reconciled by the system, never hand-edited.

| Entity | Key fields |
|---|---|
| Company | name, pan_vat, address, logo, settings |
| User | name, phone, email |
| Membership | user_id, company_id, roles, active |
| Project | code, name, client, location, planned/actual dates, status, manager_id |
| ProjectAssignment | project_id, user_id |
| ContractRevision | project_id, effective_date, amount, reason, attachment |
| BudgetRevision | project_id, effective_date, total, reason, attachment |
| BudgetLine | budget_revision_id, heading_id, amount |
| CostHeading | name, parent_id, type, active |
| Material | name, local_name, spec, default_unit, default_heading_id, active |
| Supplier | name, contact, phone, address, pan_vat, categories, terms, opening_balance, cutover_date |
| OrderSlip | number, supplier_id, request_date, required_date, approval_status, sending_status, fulfilment_status |
| OrderSlipLine | slip_id, project_id, material_id or text, spec, qty, unit, est_rate, received_qty (derived) |
| Delivery | supplier_id, project_id, challan_no, receipt_date, received_by |
| DeliveryLine | delivery_id, slip_line_id, material_id, qty, unit, accepted_qty, rejected_qty, note |
| SupplierBill | supplier_id, bill_no, bill_date, due_date, subtotal, discount, vat, transport, total, vat_treatment, status |
| BillLine | bill_id, project_id, heading_id, material_id, qty, unit, rate, line_amount, allocated_charges, cost_amount, payable_amount |
| BillLineDeliveryLine | bill_line_id, delivery_line_id, billed_qty |
| Payment | supplier_id / subcontractor_id / crew_id / payee_id (exactly one set), date, amount, method, reference, status, idempotency_key |
| PaymentProjectAllocation | payment_id, project_id, amount |
| PaymentDocumentAllocation | project_allocation_id, bill_id / charge_id / labour_cost_id / expense_id, amount |
| SupplierReturn | supplier_id, project_id, date, lines (material, qty) |
| CreditOrReversal | bill_id / charge_id / payment_id / labour_cost_id / expense_id, business_date, amount, reason (separate record; original never modified) |
| Subcontractor | name, phone, pan, work_types |
| WorkPackage | project_id, subcontractor_id, scope, heading_id, agreed_value, rate_basis, dates, status, progress |
| SubcontractCharge | work_package_id, date, claimed_amount, approved_amount, status |
| Crew | name, project_id (optional), phone, active |
| Payee | name, phone, type, active |
| LabourCost | project_id, work_date, crew_id, headcount, person_days, rate, amount |
| Expense | project_id, heading_id, date, amount, payee_id |
| Stage | project_id, name, planned dates |
| ProgressUpdate | project_id, stage_id (nullable = overall), date, pct, note |
| DailyReport | project_id, work_date, author_id, content fields |
| Attachment | owner_type, owner_id, file_url, type |
| AuditLog | user_id, entity, entity_id, action, before, after, at |

---

## 24. Acceptance Criteria

1. **Isolation:** a Company A user cannot access Company B records or files, even by changing an ID in the URL/API.
2. **Shared supplier:** one supplier on two projects; each project shows its own transactions; company ledger shows combined balance.
3. **Multi-project slip:** 5 lines for Project 1 and 2 for Project 2 on one slip to one supplier; every line keeps its project.
4. **Partial delivery:** order 100 bags cement, receive 60: shows 60 received, 40 pending. Receiving 40 more marks it fully received.
5. **Bill and payment:** posted bill NPR 1,00,000 and payment NPR 60,000 give cost 1,00,000, cash paid 60,000, payable 40,000.
6. **Supplier advance:** payment before any bill shows as advance; a later bill consumes it without a new payment.
7. **Subcontract advance:** advance does not increase cost until an approved charge is recorded.
8. **Labour:** crew cost entered without workers; paying it does not count it again.
9. **Budget:** budget NPR 10,00,000 and cost NPR 7,00,000 show 3,00,000 remaining and 70% used.
10. **Progress vs cost:** 40% progress and 65% budget used are shown independently.
11. **Calendar:** a day shows reports, deliveries, costs and payments by business date, in BS and AD.
12. **Correction:** reversing a posted bill updates totals and balances, history preserved.
13. **Retry:** resubmitting the same payment does not duplicate it.
14. **Reconciliation:** dashboard, ledgers and exports agree for the same filters and date basis.
15. **Localization:** amounts show lakh/crore grouping; BS dates convert correctly to AD and back.
16. **Split payment:** NPR 1,00,000 allocated 60,000/40,000 to Projects A and B, later matched to Project A bills; project cash paid stays 60,000/40,000 and company balance reconciles.
17. **Multi-project bill:** a bill with lines for two projects plus transport and VAT allocates header charges so project amounts total the bill (per VAT setting).
18. **Weekly labour entry:** a 7-day entry of NPR 70,000 creates 7 daily records of NPR 10,000 each on their work dates.
19. **As-of report:** a report as of last month uses the budget revision effective then, not the current one.
20. **Unallocated sign:** Project A bills 1,00,000 and an unallocated payment of 20,000 give company payable 80,000.
21. **Recoverable VAT settlement:** bill 1,00,000 + 13,000 VAT, VAT recoverable: project cost 1,00,000, supplier payable 1,13,000, a 1,13,000 payment fully settles the bill.
22. **Reversal history:** a bill posted on day 1 and reversed on day 10 appears in a report as of day 5 and not in one as of day 11.
23. **No repeat entry:** a delivery recorded once shows in the daily report and calendar without re-entry.

---

## 25. Decisions

All decisions below were confirmed by the product owner on 2026-10-09.

| Decision | Choice | Status |
|---|---|---|
| Multi-tenant (company → projects, staff, optional labour) | As described | Confirmed |
| Web and mobile access | Required | Confirmed |
| Staff create order slips on mobile | Required | Confirmed |
| One supplier per order slip | Required | Confirmed |
| Supplier payments in any order, settled by end | Required | Confirmed |
| Labour optional, day-wise total cost, no individual count | Required | Confirmed |
| Cost vs budget per heading, calendar view | Required | Confirmed |
| Mobile delivery in v1 | Responsive web + light PWA layer, built so a Capacitor Android app can be added later; Capacitor with Phase 2 offline sync, or earlier if needed | Confirmed |
| Multiple projects on one order slip | Allowed, project per line | Confirmed |
| Order approval | Configurable per company, **on by default** | Confirmed |
| Default slip approver | Project Manager (with approval permission and access to all projects on the slip) **or** Admin | Confirmed |
| Supplier/subcontractor login | None in v1 | Confirmed |
| Contract amount and spending budget | Both kept. Budget pre-filled from contract amount, editable. Cost compared with budget only. Planned margin shown; final result only for Completed/Closed projects (section 6) | Confirmed |
| Payment allocation | Project-level optional (unallocated shown clearly), bill matching later (12.3) | Confirmed |
| Bill header charges | Pro-rata to lines, override allowed (11.4) | Confirmed |
| VAT treatment | Company setting, default "VAT as cost", changeable in settings | Confirmed |
| TDS | Out of v1 | Confirmed |
| Cost timing | Materials on posted bill line; subcontract on approved charge; labour and expenses when entered. Payments and advances never cost | Confirmed |
| Weekly labour entry | Generates daily records | Confirmed |
| Progress | Manual % per stage and overall; weights Phase 2 | Confirmed |
| Dates | BS default, AD always available (toggle, both on key screens and exports), AD stored | Confirmed |
| Slip numbering | Simple per-company sequence; fiscal-year format Phase 2 | Confirmed |
| User in multiple companies | **No: one company per login in v1** | Confirmed |
| Offline | Phase 2; v1 has draft saving and safe retries | Confirmed |
| Notifications | In-app slip approval only in v1 | Confirmed |
| Login and recovery | Password; admin creates staff and resets passwords; email self-reset where available; no SMS in v1 | Confirmed |
| Site staff entering money without finance permission | Narrow own-entry access: own draft bill until submitted; own labour/expense entries for 7 days | Confirmed |
| Client-receipt register | Yes: a receipt register (one amount per receipt); client billing stays Phase 3 | Confirmed (pilot asked) |
| Staff salaries | Out of v1 (Phase 3) | Confirmed |
| Supplier rate lists | Phase 2; v1 shows last billed rate as a hint | Confirmed |
| Tenant pricing | Decide after the pilot; track usage per company | Confirmed |
| Supabase Pro upgrade | When a pilot company relies on the app daily | Confirmed |

---

## 26. Phasing

**Pilot before build (step 0):** test one real project with a site engineer and an accounts person using clickable screens and their actual challans, bills and payments. Goal: confirm staff will enter deliveries, bills, payments and daily work promptly. This is the biggest risk.

**Phase 1 milestones**
1. Foundation: tenancy, auth, staff, projects, headings, budgets, BS dates.
2. Supplier loop: suppliers, order slips, deliveries, bills, payments, allocation, supplier ledger. Verify all financial invariants here first.
3. Labour, subcontract work, other expenses, crews/payees.
4. Daily reports, progress, calendar.
5. Dashboards (with completeness banner), reports, exports.

**Phase 1 (MVP) scope**
The core loop: Project → Order slip → Delivery → Bill → Payment → Ledger, plus daily labour, subcontract costs, other expenses, daily reports, manual progress, calendar, dashboards, core reports, BS dates, PWA mobile flows.

**Phase 2**
- Native Android app with offline sync
- Weighted progress, budget threshold alerts, push/SMS notifications
- Fiscal-year document numbering
- TDS handling
- Supplier portal (view slips, confirm, view ledger)
- Nepali language UI
- Supplier rate lists to auto-fill bills
- Automated SMS/WhatsApp messaging

**Phase 3 / future**
- Client billing, running bills (IPC), collections, mobilization advance recovery
- Retention and deductions
- BOQ and detailed estimates; change orders
- Site stock, consumption and inter-project transfers
- Measurement books
- Individual labour attendance and payroll; staff salaries
- Equipment ownership and maintenance
- Accounting integrations, statutory tax reports
- Tenant subscription billing

---

## 27. Open Questions

No open questions. The original questions and their answers:

1. Client-receipt register in v1? **Yes, added for the pilot** as a receipt register: one amount per receipt (what the client settled, including any TDS or retention they kept), shown as Received and To collect on the project. Detailed client billing (IPC, TDS and retention split) stays Phase 3.
2. Staff salaries: project cost or overhead? **Out of v1** (Phase 3).
3. Default slip approver? **Project Manager or Admin.**
4. PWA or native Android from day one? **Web app + light PWA, Capacitor later.**
5. Supplier rate lists in v1? **No, Phase 2.** v1 shows the last billed rate as a hint.
6. Do target companies claim input VAT? **Default "VAT as cost"**, changeable per company.
7. Tenant pricing model? **Decide after the pilot**; usage is tracked per company.
8. BS dates from day one? **Yes**, with AD always available.
