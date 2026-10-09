# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Responsive web app with a light PWA layer, installable on Android. Office users on desktop, field staff on phone. A Capacitor Android wrapper (Phase 2, with offline sync) reuses the same web UI; it does not change the design language.

## Users

Construction companies (Nirman Company / Thekedar) in Nepal. One person often holds several roles in small companies.

- **Site Staff / Supervisor / Storekeeper (primary).** On a phone at the site, often on weak network and low-end Android, frequently outdoors. Creates order slips, records deliveries with challan photos, photographs bills, enters labour, submits daily reports. **When needs conflict, this user's experience wins:** prompt field entry is the product's biggest risk.
- **Project Manager / Engineer.** Assigned projects: approves slips, records deliveries, updates progress.
- **Accounts Staff.** Usually desktop. Posts bills, expenses, payments, credits and corrections in volume.
- **Owner / Administrator.** Settings, staff, projects, permissions. Needs instant answers on cost, budget and what is still payable.
- **Viewer.** Reads permitted dashboards and reports.

Suppliers and subcontractors have no login in v1.

## Product Purpose

Help a construction company answer, per project and company-wide:

- What is happening at each site?
- How much has the project cost up to a selected date, against the contract amount and the spending budget?
- How much has been paid, and how much is still payable (baki)?
- What materials were ordered, delivered, billed, or are still pending?
- How much physical work is complete, and what happened on a given day?

Core v1 loop: Project → Order slip → Delivery → Bill → Payment → Ledger, plus daily labour, subcontract costs, other expenses, site reports, progress and calendar. Anything outside this loop is lower priority.

Success: staff actually enter deliveries, bills, payments and daily work promptly, so the numbers the owner sees are complete.

## Positioning

Today these companies run on paper khata and challan files, Excel / Google Sheets kept by an office accountant, and accounting software that has books but nothing project- or site-level. NirmanKhata connects the site and the office in one record: a delivery entered once on site flows into the daily report, calendar and bill matching, and every cost lands against a project and cost heading with an "as of" date. It speaks the trade's own terms (Thekka Rakam, Lagat Anuman, Maag Slip, Challan, Khata, Baki, Peski), BS dates and lakh/crore money.

## Operating Context

- Field: phones at construction sites, weak connectivity, outdoor light, gloves and dust; shared slips to suppliers; challans and bills photographed on arrival.
- Office: desktop entry of bills and payments; supplier ledgers; reports and exports (Excel/CSV).
- Documents in the world: maag slip (order slip, one supplier, lines may span projects), challan (delivery), supplier bill, payment voucher, daily site report (Dainik Bibaran).
- Materials and units are trade-specific (Bora, Chhad, Baluwa, Gitti, Dhunga, Eeta; Cft, Trip, Load, Quintal). Trip/Load always carry a vehicle description.
- Payment methods: Cash, Cheque, Bank transfer, eSewa, Khalti, FonePay/ConnectIPS, Other.

## Capabilities and Constraints

- Source of truth: `docs/requirements-v1.1.md` (product decisions, all confirmed 2026-10-09) and `docs/technical-design.md`.
- Multi-tenant; each company's data is fully isolated. One company per login in v1.
- Roles and project assignment gate what each person sees; viewing money and recording payments are separate permissions. Money visibility is enforced server-side, so UI must handle "amounts hidden" states gracefully.
- Contract amount and spending budget are both kept, with dated revisions. Cost is compared with the budget only; planned margin is shown; final profit/loss only for Completed/Closed projects.
- Nothing is deleted: entries are deactivated or corrected, with full history of who created, approved or changed what.
- Localization: NPR as `Rs. 12,34,567` with lakh/crore shorthand; BS dates by default with AD always available (both on key screens and exports), stored as AD; Nepali fiscal year (Shrawan–Ashadh); Asia/Kathmandu; Unicode so names and notes can be Nepali; +977 phone format.
- Language: English UI in v1, with every label translatable (`t()`); Nepali UI is Phase 2.
- Connectivity (v1): online, with on-device draft saving, upload retry and duplicate-safe submission. Full offline is Phase 2.
- Mobile design rules from requirements §21: large touch targets, minimal typing, recent/frequent materials, BS date picker, works on low-end Android, compressed photo uploads, no repeat entry.
- Hosting: free, always-on tier; React + Vite PWA on Supabase.
- Notifications in v1: in-app slip approval only.

## Brand Commitments

- Name: **NirmanKhata**. Descriptor in use: "Construction site and cost register".
- Voice in existing copy: plain, direct, task-first English, using familiar Nepali trade terms alongside the English ones.
- No logo or brand guide beyond the shipped app icon and theme colour; visual identity is owned by the codebase, not this file.

## Evidence on Hand

- A pilot company is lined up to test one real project with a site engineer and an accounts person, using their actual challans, bills and payments.
- No testimonials, customer names, usage numbers or pricing exist yet (tenant pricing is decided after the pilot). Do not invent any.

## Product Principles

1. **Field entry first.** If a choice makes site entry slower or harder, it loses, even when the office would prefer it.
2. **Enter once.** Data recorded in one place flows everywhere it belongs; never ask staff to re-enter.
3. **Numbers you can trust, as of a date.** Show what the figures cover and when they are incomplete; never imply completeness the records don't support.
4. **Speak the trade.** Use the terms, units, dates and money formats Nepali contractors already use.
5. **History is kept, not erased.** Corrections and deactivations leave a visible trail.

## Accessibility & Inclusion

No product-specific standard beyond WCAG AA has been set. Known needs from the operating context: readable in outdoor light, 44px touch targets, 16px input text, usable on low-end Android over weak networks, Devanagari text rendering for names and notes.
