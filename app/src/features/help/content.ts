// "How to use" text: what each person can do, by section, in the words contractors say out loud
// (Roman Nepali first, English in brackets). Local words come from GLOSSARY.md or the UI only.
// One long text to translate, so it lives here and not in i18n.ts; a Nepali version can be a
// second file later.
import type { NavRole } from '../../components/nav'
import type { IsoDate } from '../../lib/dates'

/** Change this whenever the text below changes. */
export const HELP_UPDATED: IsoDate = '2026-10-17'

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
      'Summary: Thekka Rakam, Lagat Anuman, kharcha, client bata payeko, baki; kunai miti samma ko rakam herne.',
      'Where the money went ra Cost by heading: kun heading ma kati kharcha bhayo.',
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
      'Hajiri (attendance, Settings ma on gare): Labour crews > Workers ma kaamdar ek patak thapne, din wa ghanta ko rate sanga.',
      'Project ko crew ma kaamdar thapne. Hajiri crew ko page ma matra: baya kaamdar, daya mahina ko calendar.',
      'Calendar ko din thichne: Full day, Half day, Not here, ghanta; arko project sanga split. "Everyone in" le sabai lai ek patak.',
      'Close days: Hajiri lai Jyala ma badalne. Pay: pratyek kaamdar lai chhuttai tirne.',
    ],
  },
  {
    key: 'slips',
    title: 'Maag Slip (Order Slip)',
    show: canEnter,
    items: [
      'Ek supplier lai Maag Slip banaune: line pichhe project, kahile chahinchha, site contact, nirdeshan.',
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
      'Discount, dhuwani (transport), VAT, tirne miti, bill photo; delivery link garne.',
      'Draft save garne, Accounts lai pathaune, wa save and post garne.',
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
      'Project anusar split garne; kei baki nabhaye Peski bhanera mark garne.',
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
    items: ['Party le firta gareko paisa (Refund wa Peski Returned) record garne; galat bhaye reverse garne.'],
  },
  {
    key: 'parties',
    title: 'Party haru (Supplier, Subcontractor, Crew)',
    items: [
      'Party thapne wa edit garne: naam, contact, phone, thegana, PAN/VAT, bhuktani sart, kaam ko kisim.',
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
      'Claim (bill) thapne photo sanga; approve garne (cost banchha), reject garne, approved kaam reverse garne.',
      'Agreed value, approved, tireko, baki herne; Peski wa bill tirne.',
    ],
  },
  {
    key: 'reports',
    title: 'Reports',
    items: [
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
      'Saman thapne: naam, local name, short code, specification, default unit, default heading.',
      'Unit thapne.',
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
