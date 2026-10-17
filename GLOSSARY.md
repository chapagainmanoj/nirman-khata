# Glossary

Shared language for NirmanKhata. Terms are the ones we use in conversation, docs, code and UI.
Trade terms and their English labels start from `docs/requirements-v1.1.md` §3.1; this file sharpens them.

## Attendance (Hajiri)
One Crew Member's time on one project on one work date: in, out and minutes worked. Used only when the company setting "Labour by" is Attendance; the default, Day total, records one amount per crew per day instead.

- **Not:** a labour cost. Attendance is priced and turned into a labour cost only when the day is closed (see Close day).
- **States:** open (can be set, changed or unset) → closed (locked, priced) → open again if that labour cost is reversed.
- **Relations:** belongs to one Crew Member, one project and the Crew owed for that project (which may not be the member's own crew).
- **In code:** `attendance`; written only by `set_attendance` (minutes 0 unsets); `attendance_day`, `project_workers`.
- **Notes:** A worker can split a day between projects by times that do not overlap, never more than 24 h in total.

## Close day
Turning a crew's open Attendance for a project and a date (or range of dates) into labour costs: one labour cost per work date, owed to that Crew, optionally paid now.

- **Not:** Closed (project).
- **In code:** `close_labour_day` (the day roster: one crew, one project) and `close_worker_days` (the Time Card: each open crew-day the worker is on, for the crew owed there), both through `private.close_crew_days`, which prices each row (daily rate × minutes ÷ the standard day, or hourly rate × hours) and posts through the same labour writer as day totals.
- **Notes:** The rate is copied onto each row at close, so a later rate change does not alter past days. Reverse the labour cost to reopen the day. A day always closes for the whole crew, since the labour cost is the crew's: closing one worker's month also closes their crew-mates on those days.

## Closed (project)
A project whose books are final: work is done (see Completed) and its money has been reconciled. No new financial entries are allowed until an authorized user reopens it.

- **Not:** Completed (work done, bills may still arrive). Not Hisab Milan (with a Party); a project can close while its parties' accounts stay open.
- **States:** Planned → Active ⇄ On Hold → Completed → Closed (Cancelled from any open state).
- **In code:** project status `closed`; rules in `docs/requirements-v1.1.md` §4.2, §20. The project details form warns before closing (`ProjectDetailPage.tsx`, `DetailsCard`).
- **Notes:** Closing warns, but does not block, if the project still has Draft bills or Peski/Overpayment allocated to it. The owner decides when the books are final enough; anything left can still be Reallocated after reopening.

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
A lightweight Party for the company's own labour ("Ram's crew", "Site crew"). The crew, never a single worker, is the one owed and paid for labour.

- **Relations:** usually tied to one project; has many labour costs and payments; with attendance, has many Crew Members.
- **In code:** `crews`.

## Crew Member
A worker listed under a Crew so their Attendance can be marked: a name, the kind of work, and a rate by the day or by the hour.

- **Not:** a Party. Members are never paid directly; their days are owed to a Crew.
- **Relations:** belongs to one Crew at a time. A worker who works a day on another project is owed through that project's crew; a worker who moves for good is moved to the other crew, and earlier days stay with the old one.
- **In code:** `crew_members` (no delete; set inactive to remove from the crew).

## Expense (Kharcha)
Everyday word for any spending on a project: materials, labour, subcontract work and everything else. Not a record type in the app.

- **Not:** Other Expense, the specific record. When someone asks "how much kharcha so far", answer with total project cost, not Other Expenses.

## Farchhyaut
Deducting Peski from what a party is owed: their bill, work charge or wages. The Peski is used up by that amount and only the rest is paid in cash.

- **Not:** Settle (matching an ordinary payment to a bill) or Hisab Milan (closing out the whole account with a party).
- **In code:** no separate step; done by the same bill-matching as Settle (`settlement_events`).
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
A project cost recorded directly, without a supplier bill: equipment hire, transport, fuel, khaja, permits, small site purchases. It has one project, one Cost Heading, a date, an amount, a description and a Payee. It counts as project cost when entered, and may be unpaid or paid on the spot.

- **Not:** a supplier Bill (goes through Order Slip, Delivery and posting) or Labour Cost (wages for own crew).
- **Not:** the "Site Expenses" cost heading. An Other Expense can be filed under any heading (e.g. JCB hire under Equipment), and a Bill line can be filed under Site Expenses.
- **Relations:** belongs to one project and one heading; owed to one Payee; settled by that payee's payments.
- **In code:** `expenses` table; `ExpenseNewPage.tsx`; "Enter other expense" in the menu and form. Requirements call it "Other Project Expense" (`docs/requirements-v1.1.md` §15).
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
A supplier, subcontractor, crew or worker the company pays. A party deals with the company as a whole: one account and one balance, never one per project.

- **Relations:** has many bills, work charges, payments, Peski and Overpayment across any number of projects.
- **In code:** "party" in SQL comments and functions; separate tables `suppliers`, `subcontractors`, `crews`, `payees`.
- **Notes:** Splitting by project is how the company tracks its own costs. Parties never need to see it.

## Payee
A lightweight Party paid through Other Expenses: name, optional phone and a kind such as JCB owner, transporter or shop. Company-wide and reusable; can be promoted to a Supplier later.

- **Not:** a Supplier, which has Order Slips, deliveries and bills.
- **In code:** `payees` table (`promoted_supplier_id` for promotion).

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

## Time Card
One Crew Member's Attendance for a whole month (BS or AD, as the company shows dates), across every project: a line per day with in, out, hours and a tick.

- **Not:** the day roster, which is one project's crew on one day. Both edit the same Attendance.
- **Relations:** shows one Crew Member; a day may hold several projects (a split day). Days on projects the user cannot see show only as time taken.
- **In code:** `TimeCardPage.tsx` at `/labour/worker/:id`; `worker_month`, `split_attendance`, `close_worker_days`.
- **Notes:** The tick marks a full day on the worker's usual project, the one their Crew belongs to.
  Splitting a day gives the other project the second half of its hours, inside the same in and out; both projects are saved together or not at all.

## Tirnu parne / Tireko / Baki
The three figures in a Party's Khata. **Tirnu parne** (to be paid) is everything that raised what the company owes the party: bills, approved work charges, labour costs, expenses and the opening balance, less Credits and reversals. **Tireko** (paid) is the money paid to them. **Baki** (remaining) is Tirnu parne minus Tireko.

- **Not:** a single bill's outstanding amount. That is shown by Settle, per bill. These are totals for the whole Khata, or for one project's part of it.
- **Relations:** one set per Khata; a project filter shows the same three figures for that project only.
- **In code:** `charged_paisa`, `paid_paisa`, `balance_paisa` (`party_balances`); the Khata report columns `charged`, `paid`, `balance`. UI labels are the Nepali words: the balance card ("Tirnu parne (bills)", "Tireko") and the Khata report columns.
- **Aliases to avoid:** "Charged" (reads as if the company charged the party), "Bought" (does not fit crews, payees, an opening balance or a reversal), "Jamma/Naam" (the formal bookkeeping words; *jamma* reads as "deposit" in everyday use).
- **Notes:** Chosen 2026-10-14 because it is how contractors say it out loud ("kati tirnu parne, kati tireko, kati baki"), it never reads backwards, and it matches "Baki / Tirna Baki" in `docs/requirements-v1.1.md` §3.1.

---

## Open questions
- Other Expenses may be unpaid (`docs/requirements-v1.1.md` §15). Are unpaid Other Expenses common, or are they normally paid on the spot? Owner unsure; check with the pilot company. — raised 2026-10-13
