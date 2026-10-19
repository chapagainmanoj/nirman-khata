# Glossary

Shared language for NirmanKhata. Terms are the ones we use in conversation, docs, code and UI.
Trade terms and their English labels start from `docs/requirements-v1.1.md` §3.1; this file sharpens them.

## All projects
What a person sees when no project is chosen in Working on: lists show every project they may see, and new records start with "Choose project". Also the list toggle that shows every project while one is chosen.

- **Not:** a permission. Nobody sees more than their assigned projects either way.
- **In code:** `nav.project.all`; Working on's "none" (`setProjectId(null)`); the list toggle in `lists/ProjectFilter.tsx`.
- **Aliases to avoid:** "No project chosen", "No project (see everything)".

## Attendance (Hajiri)
One Worker's time on one project on one work date: in, out and minutes worked, or Absent (kept as a mark with no time, so it is told apart from a day not marked yet). Used only when the company setting "Labour by" is Attendance; the default, Day total, records one amount per crew per day instead.

- **Not:** a labour cost. A day becomes labour cost only when it is Verified.
- **States:** not marked → **Draft** (worked or Absent; no cost, no money anywhere) → **Verified** (a worked day is labour cost, priced at the worker's rate then and owed to them; an Absent day is just confirmed). A verified day can still be changed: its cost is reversed and posted again at the same rate in one step, paid or not, and the worker's balance takes the difference. Cleared goes back to not marked. Site staff work up to 7 days back; Accounts and Admin any day.
- **Relations:** belongs to one Worker, one project and the Crew it was marked on (usually the worker's crew on that project).
- **In code:** `attendance` (`worker_id`, `verified_at` for an Absent day; a worked day is verified when its `labour_cost_id` is posted, `private.attendance_verified`); drafts written by `set_attendance` (`absent: true` keeps an Absent mark; minutes 0 without it unsets) and `set_attendance_many` ("Mark everyone in" and the crew's day list, one call); `verify_attendance` (one worker's day or the crew's day); `change_attendance` (a verified day; `labour_cost_changes` links the new cost to the one it replaced, and `party_khata` shows the day once); `private.can_mark_day` (the 7-day limit); `open_labour` (drafts); `project_workers`, `crew_month`, `worker_month`. Marked in one place: the Crew's page (`CrewBoard.tsx`), with "The crew on <day>" (each worker Full, Half or Absent; "Mark everyone in" for those not marked); the old day roster address `/labour/attendance` redirects there.
- **Notes:** A worker can work one day on two projects by times that do not overlap, never more than 24 h in total: each part is marked on that project's crew, and the day's editor shows the other part ("Also that day"); Half day takes the afternoon when the morning is taken. (2026-10-18: the Split button was removed for this; `split_attendance` stays in the database, unused by the app.) (2026-10-17: one flow. The day roster and the worker's time card were removed: days are entered and seen only on the Crew's page; a Worker's page links to their crews.)

## Cash payee
The one built-in Payee per company that an Other Expense on a project is filed under when it is paid now and nobody is named: khaja, fuel, small cash on site. Named "Cash (not named)".

- **Not:** a real party. Its khata always nets to zero, since every expense filed there is paid when entered.
- **In code:** `payees.is_cash` (one per company), made on first use by `private.cash_payee`; hidden from the "Paid to" suggestions.
- **Notes:** An unpaid Other Expense must still name who is owed it. Someone without payment rights cannot mark it paid, so always names a payee.

## Close day
Retired (2026-10-18): days are now Verified one day at a time (see Attendance). Kept here because the code still uses the word: closing turns Attendance into labour costs, one per Worker per work date, on the project worked, owed to that Worker.

- **Not:** Closed (project).
- **Aliases to avoid:** "Close days" and "Add to labour cost" in the UI. The app says **Verified**.
- **In code:** `verify_attendance` calls `private.close_crew_days` for one date (the older `close_labour_day` and `close_worker_days` remain, unused by the app). `close_crew_days` which prices each row (daily rate × minutes ÷ the standard day, or hourly rate × hours) and posts through the same labour writer as day totals.
- **Notes:** The rate is copied onto each row when verified, so a later rate change does not alter past days, and a change to a verified day keeps that rate. Days closed before workers became parties (2026-10-17) stay owed to their crew.

## Closed (project)
A project whose books are final: work is done (see Completed) and its money has been reconciled. No new financial entries are allowed until an authorized user reopens it.

- **Not:** Completed (work done, bills may still arrive). Not Hisab Milan (with a Party); a project can close while its parties' accounts stay open.
- **States:** see Project status. Reached only by "Close books" on a Completed project; "Reopen books" takes it back to Completed.
- **In code:** project status `closed`, labelled "Books closed"; rules in `docs/requirements-v1.1.md` §4.2, §20. The action and its warning are in `ProjectDetailPage.tsx`, `StatusActions`.
- **Aliases to avoid:** "Closed" as a status to pick from the list; say "close books".
- **Notes:** Closing warns, but does not block, if the project still has Draft bills or Peski/Overpayment allocated to it. The owner decides when the books are final enough; anything left can still be Reallocated after reopening.

## Company Expense
An Other Expense for the company as a whole, on no project: sabal, a measuring tape, office costs. A record only: already paid when entered, owed to no one, and not part of any project cost, report or khata.

- **Not:** a project cost or overhead accounting. Company-wide costs in project figures (staff salaries, equipment ownership) are out of v1 (`docs/requirements-v1.1.md` §26–27).
- **Relations:** one Cost Heading; no project, no Payee, no payment; says how it was paid (cash, bank, wallet).
- **In code:** an `expenses` row with no `project_id` and no `payee_id`, with `paid_method`; saved by `save_expense` with `company_id`, reversed by `reverse_company_expense` (`company_expense_reversals`); the "Company" tab on `/expenses`.
- **Notes:** Chosen explicitly on the form ("For: Company"), never because no project was picked, so a site cost cannot drop out of project cost by mistake. Seen by its creator for 7 days (like X2) and by Admin and Accounts.

## Completed (project)
A project whose construction work is done. Final bills, payments and Reallocations can still be recorded. Final profit/loss is shown from this point.

- **Not:** Closed (books final).
- **In code:** project status `completed`.

## Contract balance
What is left of a project's contract after everything the client has paid: contract amount less client receipts. Shown on the project page, not on the company dashboard.

- **Not:** money the client owes. Part of it is for work not yet done or billed; telling those apart needs client bills, which do not exist yet.
- **In code:** `to_collect_paisa` (`company_dashboard`); "Contract balance" on the project's Client tab and the Contract and budget card.
- **Aliases to avoid:** "To collect" (read as money due now; renamed by the product owner, 2026-10-17).
- **Notes:** Client receipts include any TDS or retention the client kept back, so this is less than the cash still to come.

## Crew
The group of the company's own labour on one project ("Site crew", "Ram's crew"). With Day total, the crew is the Party owed and paid for labour. With Attendance, the crew's page is where its Workers' days are marked; each Worker is owed and paid on their own, and the crew only groups them.

- **Relations:** tied to one project. With Attendance a new crew must choose one, since its page is that project's calendar; with Day total it may be "Any project" (a gang hired on several sites, entered per project). Older crews without a project keep working. Every project gets a "Site crew"; has many Crew Members; labour costs keep their crew for reports.
- **In code:** `crews`; with attendance the crew page is `labour/CrewBoard.tsx` (`crew_month`).
- **Notes:** Changed 2026-10-17 (product owner): workers are paid per worker, so the crew stopped being the one paid when the company works by attendance.

## Crew Member
A Worker's place on a Crew: which workers are on a project's crew, and whether they still are.

- **Not:** the Worker. The person, their rate and their khata belong to the Worker; a crew member is only the link.
- **Relations:** one Worker on one Crew; a worker can be on the crews of several projects. A worker brought in for a day on a crew they are not on is marked there without becoming a member.
- **In code:** `crew_members` (`crew_id`, `worker_id`, `active`; no delete; set inactive to take them off the crew). Added with `add_crew_worker`.

## Expense (Kharcha)
Everyday word for any spending on a project: materials, labour, subcontract work and everything else. Not a record type in the app.

- **Not:** Other Expense, the specific record. When someone asks "how much kharcha so far", answer with total project cost, not Other Expenses.

## Farchhyaut
Deducting Peski from what a party is owed: their bill, work charge or wages. The Peski is used up by that amount and only the rest is paid in cash.

- **Not:** Settle (matching an ordinary payment to a bill) or Hisab Milan (closing out the whole account with a party).
- **In code:** done by the same matching as Settle (`settlement_events`). For a Worker it is automatic (`private.use_held`): when their days are added to labour cost, money they already hold, Peski or paid ahead, pays the new days first, oldest first. It comes first from the day's own project, then from other projects the user sees, then (Accounts or Admin only) from money not given a project; money from elsewhere is moved to the day's project (`private.move_allocation`, an `allocation_move` event) before it is matched. The worker payment form shows the same amount as "Less advance" (`worker_advance`, not netted against what is owed on other projects) and saves with `pay_worker`. A Subcontractor's approved work is paid the same way (`pay_subcontractor`; package Peski first). An opening balance the party holds counts as money they hold (`private.use_held_docs`, design §5.3). Supplier bills are matched by hand as before.
- **Notes (2026-10-18):** a worker asking for money before payday is the common case; the screens call money beyond what is owed "paid ahead" or "advance" for workers (Overpayment elsewhere). A worker is never given Peski as such: money beyond the ticked days is simply paid ahead.
- **Notes:** From the government term *peski farchhyaut*, the clearing of an advance.

## Hisab Milan
The final settlement with a Party: all bills, payments, Peski and Overpayment are agreed, and any remainder is paid or collected (a Refund if the party owes the company). It covers the party's whole account with the company, never one project.

- **Not:** closing a project. Closing a project is an internal company decision and the party does not take part. Leftover Overpayment or Peski on a closed project just carries on in the party's account.
- **Not:** Settle (matching one payment to one bill).
- **In code:** nothing yet.

## Khata
The running account between the company and one Party: every bill, work charge, payment, Credit, Peski and Refund, with the balance (see Tirnu parne / Tireko / Baki). Positive balance is Baki (company owes the party); negative means the party holds the company's money (Peski, Overpayment or both).

- **Relations:** exactly one per Party, company-wide; projects are an internal split of it.
- **In code:** `ledger_entries`; "Ledger" in UI and `docs/requirements-v1.1.md` §3.1.
- **Notes:** Regular suppliers simply run on the Khata: they bill, the company pays, and any difference carries forward. Peski belongs to new deals, not to this running account.

## Material catalog
The company's list of materials it buys, each with a usual unit and cost heading, so a slip or bill line picks one instead of typing it. A new company starts with the owner's full list (2026-10-19): rod, cement, sand (masino: river sand; crusher: machine-made), aggregate (gitti), brick, block, stone (small, large, cladding), tile, granite, GI pipe (galvanised, water lines), MS pipe (mild steel, railings and frames), UPVC / aluminium / wooden window or door, color (putty; primer / paint), electrical and plumbing items, and metal / hardware.

- **Not:** a price list. The unit is only the usual one; a line can use any unit.
- **In code:** `materials`, `units`, `cost_headings`; `private.seed_company_defaults` and `private.add_catalog_items`, which adds what a company lacks and never renames or duplicates (an older company's "Sand" and "Stone" count as Sand (masino) and Stone (small)).

## Order Slip (Maag Slip)
A request to one Supplier for materials, numbered per company (`OS-0012`). Each line names its own project, so one Order Slip can order for several projects. It is shared with the supplier and tracks what has arrived against it.

- **Not:** a Bill or a cost. An Order Slip never creates project cost or anything owed to the supplier; only a posted Bill does.
- **Not:** a challan (the supplier's delivery note, recorded as a Delivery).
- **States:** approval: draft → pending approval → approved or rejected (cancelled from any open state); approval off means submit goes straight to approved. Delivery: not received → partly received → fully received, or closed short with a reason.
- **Relations:** one Supplier; many lines, each for one project; many Deliveries. A Delivery may also come without an Order Slip, with a reason.
- **In code:** `order_slips`, `order_slip_lines`, enum `slip_status`; routes `/slips`; "Material Order Slip" in `docs/requirements-v1.1.md` §9.
- **Aliases to avoid:** "Slip" on its own in UI and docs, "Demand Slip", "Order" (on its own), "PO".
- **Notes:** "Order Slip" is the full domain word (product owner, 2026-10-17); a bare "slip" could be any slip on site. Short code names (`slip`, `slipId`, `/slips`) are fine. The phone bottom bar alone says "Slips" for space (`nav.slips.short`).

## Other Expense
Spending recorded directly, without a supplier bill: equipment hire, transport, fuel, khaja, permits, small purchases. Usually on a project: then it has one project, one Cost Heading, a date, an amount, a description and a Payee, counts as project cost when entered, and may be unpaid or paid on the spot. Without a project it is a Company Expense (record only).

- **Not:** a supplier Bill (goes through Order Slip, Delivery and posting) or Labour Cost (wages for own crew).
- **Not:** the "Site Expenses" cost heading. An Other Expense can be filed under any heading (e.g. JCB hire under Equipment), and a Bill line can be filed under Site Expenses.
- **Relations:** on a project: one project and one heading; owed to one Payee (the Cash payee when paid now with no name); settled by that payee's payments.
- **In code:** `expenses` table; `ExpenseNewPage.tsx`; "Enter other expense" in the menu and form; the list at `/expenses` ("Other expenses" under Money). Requirements: `docs/requirements-v1.1.md` §15.
- **Aliases to avoid:** "Expense" on its own for this record; that word means all spending.
- **Notes:** One of the four things that create project cost, with posted bills, approved work charges and labour costs (`docs/requirements-v1.1.md:525`). Corrected only by reversal. Guideline, not a hard rule: a regular, billed source (weekly sand transporter, monthly JCB owner) is usually a Supplier with Bills; one-off or casual spending is an Other Expense.

## Overpayment
Money paid to a party beyond what is due, without being agreed as Peski. The party owes it back to the company. It arises from a mistake (Rs. 1,05,000 paid against a Rs. 1,00,000 bill), when a paid bill or cost is reversed (a paid Rs. 50,000 cement bill is reversed, so the Rs. 50,000 becomes Overpayment), or when a regular supplier is paid ahead on the Khata (Rs. 50,000 paid against a Rs. 40,000 bill leaves Rs. 10,000 Overpayment).

- **States:** open → deducted from the party's later bills, on any project → any remainder returned as a Refund at Hisab Milan.
- **Relations:** belongs to one Party, company-wide. Which project it came from is internal bookkeeping only.
- **Not:** Peski. Both leave money with the party, but Peski was agreed in advance for goods or work to come; Overpayment is money the party should return.
- **In code:** derived, never stored: money a party holds beyond its Peski (`private.held_split`); `overpaid_paisa` on the dashboards, "Overpaid" on the payment form. Payments are not Peski unless marked, so paying ahead or beyond a bill is Overpayment.
- **Notes:** Kept apart from Peski so reports of "peski given" show only agreed advances. Deducting it from later bills is normal practice while work continues. Only what is left at Hisab Milan must come back. Example: Rs. 15,000 Overpayment from finished Project A is deducted from Shree Hardware's next Project B bill.

## Party
A supplier, subcontractor, crew, worker or payee the company pays. A party deals with the company as a whole: one account and one balance, never one per project.

- **Relations:** has many bills, work charges, labour costs, payments, Peski and Overpayment across any number of projects.
- **In code:** "party" in SQL comments and functions; separate tables `suppliers`, `subcontractors`, `crews`, `payees`, `workers`; exactly one of their ids on each payment, ledger row and event (`party_id`).
- **Notes:** Splitting by project is how the company tracks its own costs. Parties never need to see it.

## Payee
A lightweight Party paid through Other Expenses: name, optional phone and a type of service such as JCB owner, tanker or transporter. Company-wide and reusable; can be promoted to a Supplier later. People see it as **Other service**.

- **Not:** a Supplier, which has Order Slips, deliveries and bills.
- **In code:** `payees` table (`promoted_supplier_id` for promotion), routes `/payees`. One is the Cash payee (`is_cash`). UI label "Other service(s)" (`PARTY.payee`, `nav.payees`).
- **Aliases to avoid:** "Payee" in the UI; "Other payees".
- **Notes:** Not in the nav (product owner, 2026-10-17): reached from a link at the foot of the Suppliers page, and its pages light up Suppliers. Kept apart from Supplier for now; merging the two (one person, one khata) is a possible later change.

## Peski (Advance)
A partial amount paid upfront to a supplier, subcontractor or worker when booking a service, ordering goods or agreeing a contract, before any bill, charge or wages for it exist. It stays with that party until Farchhyaut deducts it from what they are next owed, before any further cash is paid.

- **Not:** a payment made while the party has unpaid bills. That is an ordinary payment and Settles those bills first, even if it was meant for future goods.
- **Not:** Overpayment (unintended excess), and not a negative balance in general; a negative balance can come from Peski, Overpayment or both.
- **States:** given → partly deducted → fully deducted.
- **Relations:** belongs to one Party, company-wide; may be allocated internally to projects; used up by Farchhyaut against that party's later bills, work charges or wages.
- **In code:** `payments.is_peski` (`supabase/migrations/20261022000100_peski.sql`). "This is peski" on the payment form, offered only when nothing is unpaid; `record_payment` refuses it otherwise (`peski_with_unpaid`). Peski held = `private.held_split`; `peski_paisa` on the dashboards; calendar tag `peski`. A reversed bill makes the money Peski again (product owner, 2026-10-13). Payments recorded before this are not Peski.
- **Aliases to avoid:** "credit with supplier" (Credit is a separate document), "unused payment", "Baina" (earnest money to lock in a purchase, mostly of land or a house; not used for site supplies or work).
- **Notes:** Peski is a commitment to the party, not just timing. It typically comes with a first deal or a new contract (e.g. a new subcontract work package), not with a regular supplier already on the Khata. Example: Rs. 500/day wage, Rs. 2,000 Peski, 20 days worked → Rs. 10,000 earned, Rs. 8,000 paid.

## Peski Returned
Unused Peski that a party gives back, for example when the work or order it was given for is cancelled.

- **Not:** Refund. A Refund returns Overpayment; Peski Returned closes out an agreed advance.
- **In code:** `refunds` row with `kind = 'peski_returned'`, capped at the Peski held (`peski_returned_exceeds_peski`).
- **Notes:** Example: Rs. 50,000 Peski to Ram Bahadur for plaster, work cancelled before starting, he returns Rs. 50,000.

## Project status
Where a project stands. A person picks one of three: **Active** (the default for a new project), **On hold** or **Completed**. Two more are set only by their own actions on the project page: **Books closed** ("Close books" on a Completed project; see Closed) and **Cancelled** ("Cancel project", for one that never went ahead; it leaves the dashboard and reports).

- **States:** Active ⇄ On hold → Completed ⇄ Books closed. Cancelled from Active or On hold; "Restore project" takes it back to Active.
- **Relations:** forms for site work (order slip, daily report, delivery, attendance, work package) list Active and On hold projects; forms for money (bill, labour, other expense, payment, client receipt) also list Completed. The server refuses money on Books closed and Cancelled projects.
- **In code:** enum `project_status`; the picker uses `PICK_STATUSES` (`lib/labels.ts`). `planned` is retired: kept in the enum, barred by `projects_status_not_planned`, and `create_project` turns it into `active`.
- **Aliases to avoid:** "Planned" (retired; a project not yet started is simply Active), "Closed" as a pick.
- **Notes:** Decided 2026-10-17: six statuses in one list were confusing for a small contractor. Completed and Books closed stay apart because final bills and retention arrive after the work ends; locking at Completed would mean reopening for every late bill.

## Reallocation
Moving a Party's money from one project to another inside the company, e.g. Rs. 15,000 Overpayment on finished Project A is moved to Project B so it can be deducted from Project B's bills. The party's balance does not change; only the company's project split does.

- **Not:** a Payment or Refund; no money moves between the company and the party.
- **Relations:** one Party; from one project (or unallocated) to another.
- **In code:** `allocate_payment`; "Change split → Move money" on the payment page moves A → B in one call (`PaymentDetailPage.tsx`, `AllocationForm`). One payment at a time.
- **Notes:** Accounts staff describe it as "received on Project A, paid on Project B". It is how the company tidies a project before Closing it.

## Refund
Money a party pays back to the company to clear an Overpayment, in cash or another agreed way. Normally happens only at Hisab Milan. Before that, Overpayment is just deducted from later bills.

- **Not:** Peski Returned (giving back an agreed advance).
- **Relations:** clears an Overpayment with one party.
- **In code:** `refunds` row with `kind = 'refund'`, capped at the Overpayment held, company-wide and in the bucket (`refund_exceeds_overpayment`).

## Settle
To match a payment (or Credit) to a specific bill or work charge, so that bill shows as paid. Routine Accounts work; says nothing about the party's whole account.

- **Not:** Farchhyaut (using up Peski) or Hisab Milan (final settlement with a party).
- **In code:** `settlement_events`; "bill settlement status" in `docs/requirements-v1.1.md` §12.
- **Aliases to avoid:** "settled" for a party or project; say Hisab Milan done or project closed.

## Tirnu parne / Tireko / Baki
The three figures in a Party's Khata. **Tirnu parne** (to be paid) is everything that raised what the company owes the party: bills, approved work charges, labour costs, expenses and the opening balance, less Credits and reversals. **Tireko** (paid) is the money paid to them. **Baki** (remaining) is Tirnu parne minus Tireko.

- **Not:** a single bill's outstanding amount. That is shown by Settle, per bill. These are totals for the whole Khata, or for one project's part of it.
- **Relations:** one set per Khata; a project filter shows the same three figures for that project only.
- **In code:** `charged_paisa`, `paid_paisa`, `balance_paisa` (`party_balances`); the Khata report columns `charged`, `paid`, `balance`. UI labels are the Nepali words: the balance card ("Tirnu parne (bills)", "Tireko") and the Khata report columns.
- **Aliases to avoid:** "Charged" (reads as if the company charged the party), "Bought" (does not fit crews, payees, an opening balance or a reversal), "Jamma/Naam" (the formal bookkeeping words; *jamma* reads as "deposit" in everyday use).
- **Notes:** Chosen 2026-10-14 because it is how contractors say it out loud ("kati tirnu parne, kati tireko, kati baki"), it never reads backwards, and it matches "Baki / Tirna Baki" in `docs/requirements-v1.1.md` §3.1.

## Work charge
A subcontractor's bill (or running measurement) for work done on one work package. Approved, it is project cost and raises what the company owes them; a draft or rejected one is neither.

- **In code:** `subcontract_charges` (`claimed_paisa`, `approved_paisa`); "claim" in SQL and older code.
- **In UI:** "Work done (bills)" on the work package page; one bill is "Bill RA-1". Accounts and Admin add and approve a bill in one step (optionally going on to pay it); others save a draft that waits for approval.
- **Aliases to avoid:** "Claim" in the UI (contractors say bill).

## Worker
One person in the company's own labour, added once for the company with the kind of work and a rate by the day or by the hour. When the company works by Attendance, a worker is a Party: the days they work are owed to them, they are paid one by one, and they can be given Peski.

- **Not:** a Crew (the group on a project) or a Crew Member (the worker's place on a crew). Not a subcontractor (paid for agreed work, not by the day).
- **Relations:** on the Crews of one or more projects; has many Attendance rows, labour costs and payments; one Khata across projects.
- **In code:** `workers` (same ids as the crew members they replaced); `PARTY.worker`, `/workers/:id`; `worker_id` on payments, ledger and labour costs.
- **Aliases to avoid:** "member", "labourer" in the UI.
- **Notes:** Product owner, 2026-10-17: a worker is added from Labour crews, put on a project's crew, and "payment is done per worker basis".

## Working on
The project a person is working on right now, chosen once in the sidebar or top bar. New records start on it when their link names no project, lists open filtered to it, and Calendar and Reports start on it. Choosing nothing means All projects.

- **Not:** a permission or a server setting. It is remembered on the device only, per person and company.
- **Relations:** one of the site-work projects (Active or On hold; see Project status). With exactly one such project it is chosen automatically.
- **In code:** `features/projects/current.tsx` (`useCurrentProject`, `useWorkingOnDefault`); forms read their list from `projectChoices(projects, 'site' | 'money')`.
- **Notes:** A new form takes its project from, in order: the link (`?project=`), the record it comes from (an order slip, a delivery, the record being edited), Working on, else "Choose project". Payment is the exception: it never takes Working on, because a payment with no project is normal and a guess could put it on the wrong one.

---

## Open questions
- Other Expenses may be unpaid (`docs/requirements-v1.1.md` §15). Are unpaid Other Expenses common, or are they normally paid on the spot? Owner unsure; check with the pilot company. — raised 2026-10-13
