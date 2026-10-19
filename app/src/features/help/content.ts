// "How to use" text: what each person can do, by section, in the words contractors say out loud
// (Roman Nepali first, English in brackets). Local words come from GLOSSARY.md or the UI only.
// One long text to translate, so it lives here and not in i18n.ts; a Nepali version can be a
// second file later.
import type { NavRole } from '../../components/nav'
import type { IsoDate } from '../../lib/dates'

/** Change this whenever the text below changes. */
export const HELP_UPDATED: IsoDate = '2026-10-19'

type Rule = (r: NavRole) => boolean

export type HelpSection = {
  key: string
  title: string
  /** Who sees this section. Omitted: everyone. The server still decides what each person can do. */
  show?: Rule
  items: string[]
}

// The same reach as the screens (components/nav.ts sectionsFor, design §3.4–3.5).
const canEnter: Rule = (r) => r.roles.some((x) => x !== 'viewer')
const finance: Rule = (r) => r.canSeeFinance
const admin: Rule = (r) => r.isAdmin

export const HELP_ROLES =
  'Admin/Owner: sabai. Accounts: sabai project ra rakam. Site Staff: aafno project matra; rakam ' +
  'dekhinna, aafno draft bahek. Viewer: herna matra.'

export const HELP_SECTIONS: HelpSection[] = [
  {
    key: 'start',
    title: 'Suru garna (Getting in)',
    items: [
      'Mobile number ra password le sign in garne.',
      'Password birsiyo bhane company admin lai reset garna bhanne.',
      'Aafno password Settings → My account ma badalne.',
      'Kunai pani screen bata "+ Record" thichera naya entry suru garne.',
    ],
  },
  {
    key: 'dashboard',
    title: 'Dashboard',
    show: finance,
    items: [
      'Right now: kati tirnu parne, Peski (advance) kati baki, chaliraheka projects.',
      'Needs attention: tapaai le garna baki kaam.',
      'Chaliraheka project ma Lagat Anuman (budget) kati kharcha bhayo ra kaam kati bhayo; progress set garne.',
      'Detailed reports ma jane.',
    ],
  },
  {
    key: 'projects',
    title: 'Projects',
    items: [
      'Aafu assign bhayeko projects herne.',
      'Naya project banaune (Admin): Thekka Rakam (contract amount) ra Lagat Anuman (spending budget).',
      'Project details: client, thau (district, municipality, ward), manager, planned ra actual dates.',
      'Summary: Thekka Rakam, Lagat Anuman, Cost so far (ahile samma ko kharcha), client bata payeko, baki; kunai miti samma ko rakam herne.',
      'Not counted yet: bill naaeko delivery, post nagareko draft bill ra verify nagareko Hajiri; yo Cost so far ma gandaina.',
      'Paid, Due ra They hold: Due ma tapaai le tirnu baki matra; party sanga rahela paisa (peski wa badhi tireko) They hold ma chhuttai.',
      'Where the money went: saamaan, thekka, jyala ra anya kharcha ma kati gayo; heading anusar herna tala ko Cost by heading report.',
      'Activity: garna baki kaam (bill haalne, bill post garne, daily report pathaune, miti milaune).',
      'Thekka Rakam wa Lagat Anuman revise garne: karan, lagu hune miti, heading anusar split.',
      'Staff assign garne; status Active, On hold, Completed; Books close garne ra feri kholne.',
    ],
  },
  {
    key: 'daily',
    title: 'Progress ra daily report',
    show: canEnter,
    items: [
      'Kaam ko stages thapne, wa arko project ko stages copy garne.',
      'Progress % update garne, note ra photo sanga.',
      'Daily report pathaune: aaja ke kaam bhayo, area/floor, stage, mausam, site ma kati manche, equipment, samasya wa dhilai, site photo.',
      'Purano daily report herne ra photo thapne.',
    ],
  },
  {
    key: 'labour',
    title: 'Jyala ra Hajiri (Labour and Attendance)',
    show: (r) => r.labourEnabled && canEnter(r),
    items: [
      'Crew ko Jyala haalne: ek din wa dherai din, din ma kati manche, rate, jamma; aahile tirne wa pachhi.',
      'Kaamdar (worker) haru chahiye bhane Admin le Settings → How you work → Labour by: Attendance chhanne. Tyaspachhi Labour crews ma Crews | Workers dekhinchha.',
      'Workers ma kaamdar ek patak thapne, din wa ghanta ko rate sanga. Crew pahile wa pachhi, jun pani: crew project ko hunchha, kaamdar company ko.',
      'Project ko crew ma kaamdar thapne. Hajiri crew ko page ma matra: baya kaamdar, daya mahina ko calendar.',
      'Mathi "The crew on Today" ma sabai kaamdar: Full, Half wa Absent ek thichai ma; "Mark everyone in" le baaki sabai lai.',
      'Calendar ko din thichne: Full day, Half day, Absent, ghanta. Ek din dui project ma bhaye, arko project ko crew ma pani thapera tyahan mark garne (samaya na-julne gari).',
      'Mark gareko din Draft hunchha: kharcha ma gandaina. Verified thichepachhi Jyala (labour cost) hunchha, kaamdar lai tirnu parne. "Verify the crew\'s day" le sabai ek patak.',
      'Verified din pani badalna milchha: tirisakeko bhaye pani hisab aafai milchha. Site staff le 7 din samma ko matra.',
      'Pay: pratyek kaamdar lai chhuttai tirne; peski/agadi diyeko paisa aafai katchha.',
    ],
  },
  {
    key: 'slips',
    title: 'Maag Slip (Order Slip)',
    show: canEnter,
    items: [
      'Ek supplier lai Maag Slip banaune: line pichhe project, kahile chahinchha, site contact, nirdeshan.',
      'Saman chhanda heading anusar group ma dekhinchha (Rod, Cement, Sand...); haalai chaleko heading mathi.',
      'Approve wa reject garne (anumati bhaye), cancel wa close short garne.',
      'WhatsApp ma supplier lai share garne.',
      'Kati saman aayo (progress) ra deliveries herne.',
    ],
  },
  {
    key: 'deliveries',
    title: 'Delivery (saman aayo)',
    show: canEnter,
    items: [
      'Delivery record garne: Maag Slip sanga wa bina (karan sahit), Challan number ra photo.',
      'Trip wa Load ma gaadi ko note lekhne.',
      'Rejected saman ra samasya lekhne; saman firta (return) record garne.',
      'Galat delivery hataune (karan sahit).',
      'Bill ko photo khichera Accounts lai pathaune.',
      'Deliveries ma "Enter bill for this": tyo delivery ko bill khulchha, supplier, project ra saman aafai bharinchha; rate matra haalne.',
    ],
  },
  {
    key: 'calendar',
    title: 'Calendar',
    items: ['Miti anusar sabai entry herne; project, party wa kasle haalyo bhanera filter garne.'],
  },
  {
    key: 'bills',
    title: 'Bill',
    show: finance,
    items: [
      'Supplier ko bill haalne: saman, parimaan, unit, rate, heading, project.',
      'Ek bill ek project ko matra: project mathi ek patak chhanne, sabai line tyahi project ma. Ek supplier le dui project ma saman pathaye, project pichhe chhuttai bill.',
      'Supplier chhane pachhi bill nabhayeko delivery dekhinchha: project chhanera "Add them as lines".',
      'Discount, dhuwani (transport), VAT, tirne miti, bill photo; delivery link garne.',
      'Draft save garne, Accounts lai pathaune, wa save and post garne.',
      'Bills list table ma: miti, bill, supplier, project, jamma, status (Unpaid, Part paid ra kati due, Paid).',
      'Bills kholda post garna wa draft baki bhaye To post / Drafts tab aafai khulchha; natra All.',
      'Bill ma kati tireko, kati baki herne; Pay this bill.',
      'Credit note (saman firta wa chhut) haalne; credit wa bill reverse garne.',
    ],
  },
  {
    key: 'payments',
    title: 'Bhuktani (Payments)',
    show: finance,
    items: [
      'Kunai party lai tireko paisa record garne: rakam, kasari (cash, bank, wallet), reference, praman photo.',
      'Bill tirda: "Which bills does it pay?" ma bill tick garnai parchha. Tick nagare paisa kunai bill ma gandaina.',
      'Bill ko kehi matra (partial) tirna: bill tick garne, ani tyas bill ko "Paying now" ma tirne rakam haalne. Amount paid aafai milchha. (Jastai: 1,200 ko bill ma 1,100 matra.)',
      'Tick gareko bill bhanda badi tire, baki bill (purano pahile) tirna "Pay … with it" thichne. Sabai bill tiresi pani bachyo bhane matra overpaid: arko bill bata katchha.',
      'Kunai bill tick nagari tireko paisa: khata ko baki ghatchha tara bill Unpaid nai dekhinchha. Pachhi Match payments to bills ma milaune.',
      'Bill nabhayeko party lai: project anusar split garne; kei baki nabhaye Peski bhanera mark garne.',
      'Subcontractor lai tirda "Which work package is it for?" chhanne; work package chhaina bhane tyahi "Add work package".',
      'Payment ma What it paid herne; project split badalne; bill bata unmatch garne; reverse garne.',
    ],
  },
  {
    key: 'expenses',
    title: 'Arko Kharcha (Other expenses)',
    show: canEnter,
    items: [
      'Bill binako kharcha haalne: JCB, dhuwani, fuel, Khaja, sano kharid.',
      'Kaslai tiryo, ke ko lagi, heading, project, receipt photo; aahile tireko wa pachhi.',
      'Project binako kharcha Company Expense ho: record matra, project cost hoina.',
      'Kehi matra tireko kharcha ra Jyala ma kati due baki chha list mai dekhinchha.',
    ],
  },
  {
    key: 'client',
    title: 'Client bata paisa',
    show: finance,
    items: [
      'Project ko Client tab ma client le tireko paisa record garne (cheque wa voucher photo).',
      'Galat bhaye reverse garne.',
    ],
  },
  {
    key: 'refunds',
    title: 'Refund ra Peski firta',
    show: finance,
    items: [
      'Party le firta gareko paisa (Refund wa Peski Returned) record garne; galat bhaye reverse garne.',
      'Subcontractor sanga peski baki ra kunai kaam nachalda matra unko page ma "Did they give it back?" sodhchha.',
    ],
  },
  {
    key: 'parties',
    title: 'Party haru (Supplier, Subcontractor, Crew)',
    items: [
      'Party thapne wa edit garne: naam, contact, phone, thegana, PAN/VAT, bhuktani sart, kaam ko kisim.',
      'Subcontractor ma "How do you pay them?": Directly for work done (default, bill chahindaina) wa Against their bills (bill, approve, ani tirne).',
      'List ra party ko page ma chaliraheko project ko party matra: supplier Maag Slip, delivery wa bill bata, subcontractor work package bata. Sabai herna "Show all projects".',
      'On the way and not billed: saman aayo tara bill aayena.',
      'Their rates: supplier ko rate herne.',
      'Maag Slip banaune, WhatsApp garne.',
    ],
  },
  {
    key: 'khata',
    title: 'Khata ra hisab',
    show: finance,
    items: [
      'Party ko Khata: Tirnu parne, Tireko, Baki.',
      'Unpaid bills herne; payment record garne; bill haalne.',
      'Match payments to bills (Settle): payment lai bill sanga milaune. Peski bata katnu Farchhyaut ho.',
      'Opening balance rakhne wa sudhane: pahile dekhi ko baki, cutover date.',
    ],
  },
  {
    key: 'work',
    title: 'Subcontract work packages (theka kaam)',
    show: canEnter,
    items: [
      'Naya work package: Thekka Rakam wa rate, anumaanit parimaan, heading, planned dates, progress.',
      'Directly for work done bhayeko subcontractor: payment record garda tyo nai Work done hunchha (approved ra tireko, ek patak); bill haalnu pardaina. Unsanga peski bhaye pahile katchha.',
      'Kaam suru hunu agadi diyeko paisa: payment ma "This is an advance (work not done yet)" tick garne; tyo Peski ho.',
      'Status: Active (suru ma), Completed, wa Cancelled.',
      'Work done (bills): bill thapne photo sanga. Accounts/Admin le "Save and pay" (approve ra tirne ek patak) wa "Save, pay later"; arule save garchhan, approve pachhi.',
      'Bill tirda subcontractor sanga rahela paisa (peski, agadi tireko, opening balance) aafai pahile katchha; baki matra cash. Sabai katiye cash tirnu pardaina.',
      'Subcontractor ko page ma Contract: kati agreed, kati tiriyo, contract ma kati baki, kaam kati bhayo, aahile kati due wa unle kati rakhechhan.',
      'Reject garne, approved kaam reverse garne.',
    ],
  },
  {
    key: 'reports',
    title: 'Reports',
    items: [
      'Cost by heading ma Quantity pani: saman kati (unit anusar, firta ghatayera), Jyala kati ghanta ra person-days.',
      'Project cost summary, Cost by heading, Budget vs recorded cost, Supplier ledger (khata), Subcontractor ledger.',
      'Payment register, Material purchases, Pending orders and deliveries, Daily activity, Progress history, Labour cost.',
      'Miti, project, party anusar filter; Excel ma export; print wa PDF.',
    ],
  },
  {
    key: 'staff',
    title: 'Staff',
    show: admin,
    items: [
      'Staff thapne: role ra project.',
      'Anumati dine: Maag Slip approve, payment record, rakam herne.',
      'Staff ko password reset garne.',
    ],
  },
  {
    key: 'catalog',
    title: 'Catalog (saman ko suchi)',
    items: [
      'Saman ko puro suchi pahile dekhi thapiyeko chha: rod, cement, sand (masino, crusher), gitti, eenta, block, dhunga, tile, granite, GI ra MS pipe, jhyal-dhoka, putty ra paint, electrical, plumbing.',
      'Saman thapne: naam, local name, short code, specification, default unit, default heading.',
      'Unit thapne (Sq.ft, Litre, Running ft samet); nachahine saman Deactivate garne.',
    ],
  },
  {
    key: 'settings',
    title: 'Settings',
    items: [
      'My account: aafno naam, password, miti BS wa AD ma.',
      'Company: naam, thegana, phone, PAN/VAT herne (Admin le badalna sakchha, logo ra rang samet).',
    ],
  },
  {
    key: 'settings-admin',
    title: 'Company settings (Admin)',
    show: admin,
    items: [
      'How you work: form kasto dekhine, Maag Slip approval, aafnai Jyala track garne, Jyala kasari (din ko jamma wa Hajiri), paid hours, din suru ra antya.',
      'Bills and VAT: bill ma VAT, rate pharak warning.',
      'Your data: company ko sabai data export garne.',
    ],
  },
]

/** The sections this person can use. */
export function helpFor(r: NavRole): HelpSection[] {
  return HELP_SECTIONS.filter((s) => !s.show || s.show(r))
}
