// Everything the site says, in one place, so a Nepali page can reuse the layout later.
// Rules (PRODUCT.md, decided 2026-10-24): plain English with the trade's own words; no prices,
// testimonials or usage numbers (none exist yet). Contact details also live in app/src/lib/contact.ts.

const WHATSAPP = '9779714509893' // WhatsApp only: takes no calls
const CALL = '9860802349'

export const contact = {
  whatsAppNumber: `+977 ${WHATSAPP.slice(3)}`,
  whatsAppLink: `https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Hi, I'd like a demo of NirmanKhata.")}`,
  callNumber: `+977 ${CALL}`,
  callLink: `tel:+977${CALL}`,
  email: 'hello@nirman-khata.com',
  emailLink: `mailto:hello@nirman-khata.com?subject=${encodeURIComponent('NirmanKhata demo')}`,
}

/** The app is on the same domain in production; in dev it runs on its own port. */
export const appUrl = (path: string) => `${import.meta.env.PUBLIC_APP_URL ?? ''}${path}`

export const meta = {
  title: 'NirmanKhata – Construction site and cost register for Nepal',
  description:
    'Site staff record order slips, deliveries and labour on their phone; the office enters bills and payments. See what each project has cost, what is paid and what is still baki.',
  ogTitle: 'NirmanKhata – Site and office in one khata',
  ogDescription:
    'Construction site and cost register for contractors in Nepal: maag slips, deliveries, bills, payments and baki for every project.',
}

export const hero = {
  tagline: 'निर्माण व्यवसायीको हिसाब किताब',
  title: 'Site and office in one khata',
  lead: 'Site staff record order slips, deliveries and labour on their phone. The office enters bills and payments. You see what each project has cost, what is paid and what is still baki.',
  note: 'Registration is by invitation: we set up your company with you.',
}

export const problem = {
  title: 'Challans in a file, bills in a drawer, baki in someone’s head.',
  text: 'Most contractors run sites on paper khata, WhatsApp photos and an Excel sheet kept by the office. By the time the numbers meet, the money is already spent. NirmanKhata puts every slip, delivery, bill and payment against its project the day it happens.',
}

export const loop = ['Maag slip', 'Delivery', 'Bill', 'Payment', 'Baki']

/** The owner's dashboard, shown in the hero. */
export const dashboard = {
  screen: '/screens/dashboard.webp',
  alt: 'The owner dashboard: spent so far, left to spend against the budget, what is to pay and where the money went.',
}

export const steps = [
  {
    name: 'Maag slip',
    title: 'Order from the site, approve from anywhere',
    text: 'Site staff ask for cement, rod or gitti on a maag slip, for one project or several. You approve it, share it with the supplier on WhatsApp, and see what has come and what is still due.',
    screen: '/screens/slip.webp',
    facts: ['For one project or several', 'Approve, then share it on WhatsApp', 'See what came and what is still due'],
    callout: { icon: 'PackageCheck', label: 'Cement, OPC 43', value: '250 received · 150 due' },
    loop: [0], // the loop chips this step covers
    alt: 'An order slip for cement and rod, approved and sent, with 250 of 400 bags received and 150 pending.',
  },
  {
    name: 'Delivery',
    title: 'Record what arrives, with the challan photo',
    text: 'When the truck comes, the site picks the open slip, enters what was received and takes a photo of the challan. Trips and loads carry their vehicle note. Nothing waits for someone to visit the office.',
    screen: '/screens/delivery.webp',
    facts: ['Pick the open slip; its items fill in', 'Challan photo on the spot', 'Trips and loads keep the vehicle note'],
    callout: { icon: 'Camera', label: 'Challan 4512', value: 'Photo taken at the site' },
    loop: [1],
    alt: 'The record delivery screen: choose an open order slip, then take a photo of the challan.',
  },
  {
    name: 'Bill, payment and baki',
    title: 'Every party’s khata, always added up',
    text: 'The office enters the supplier’s bill against what was delivered and records payments by cash, cheque, bank, eSewa or Khalti. Tirnu parne, tireko and baki for each supplier, crew and subcontractor, by project.',
    screen: '/screens/khata.webp',
    facts: ['Bills checked against deliveries', 'Cash, cheque, bank, eSewa or Khalti', 'Tirnu parne · Tireko · Baki, by project'],
    callout: { icon: 'Wallet', label: 'Baki, Narayani Cement', value: 'Rs. 3,58,795' },
    loop: [2, 3, 4],
    alt: 'A cement supplier’s khata: bills, payments and what is still to pay, split by project.',
  },
] as const

export const roles = [
  { icon: 'HardHat', name: 'Site staff', text: 'Order slips, deliveries, hajiri and the daily report, from a phone at the site.' },
  { icon: 'Building2', name: 'Project manager', text: 'Approves order slips and follows the work on each project.' },
  { icon: 'ChartColumn', name: 'Accounts', text: 'Bills, payments and each party’s khata, with Excel exports.' },
  { icon: 'LayoutDashboard', name: 'Owner', text: 'Cost against budget, paid and baki, for each project and the whole company.' },
] as const

export const nepal = [
  { icon: 'CalendarDays', title: 'BS dates', text: 'Bikram Sambat everywhere, with AD always at hand.' },
  { icon: 'IndianRupee', title: 'Lakh and crore', text: 'Amounts as Rs. 12,34,567, the way you write them.' },
  { icon: 'Languages', title: 'Your words', text: 'Maag slip, hajiri, peski, baki, hisab milan.' },
  { icon: 'Ruler', title: 'Units of the trade', text: 'Bora, trip, load, cft, quintal; trips carry the vehicle note.' },
  { icon: 'Smartphone', title: 'Any Android phone', text: 'Works on low-end phones and weak networks; install it from the browser.' },
  { icon: 'ShieldCheck', title: 'Right people, right numbers', text: 'Each person sees only what their role allows, money included.' },
] as const

export const closing = {
  title: 'See it with your own project',
  text: 'Message us on WhatsApp. We show you NirmanKhata, then set up your company and your staff with you.',
}
