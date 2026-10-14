// The app's icons: Lucide, under our own names so pages never import the library directly and
// the set stays one family (24px grid, 1.75 stroke, round joins, drawn in currentColor).
// Decorative by default (aria-hidden): the text next to an icon names the action.
import {
  ArrowRight, Banknote, Bell, Building2, CalendarDays, Camera, ChartColumn, Check, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardList, Ellipsis, HandCoins, Handshake, HardHat, Info, LayoutDashboard, Lock, NotebookPen, Package, Plus, Receipt, Share2,
  SlidersHorizontal, Trash2, TriangleAlert, Truck, Users, Wallet, type LucideIcon, type LucideProps,
} from 'lucide-react'

export type IconProps = Omit<LucideProps, 'ref'>

function icon(Glyph: LucideIcon, name: string) {
  const Icon = ({ size = 24, ...rest }: IconProps) => (
    <Glyph size={size} strokeWidth={1.75} aria-hidden focusable="false" {...rest} />
  )
  Icon.displayName = name
  return Icon
}

// Sections (nav)
export const DashboardIcon = icon(LayoutDashboard, 'DashboardIcon')
export const ProjectsIcon = icon(Building2, 'ProjectsIcon')
export const CalendarIcon = icon(CalendarDays, 'CalendarIcon')
export const SlipIcon = icon(ClipboardList, 'SlipIcon')
export const DeliveryIcon = icon(Truck, 'DeliveryIcon')
export const ReportIcon = icon(ChartColumn, 'ReportIcon')
export const BillIcon = icon(Receipt, 'BillIcon')
export const PaymentIcon = icon(Banknote, 'PaymentIcon')
export const ReceiptInIcon = icon(HandCoins, 'ReceiptInIcon')
/** Suppliers, subcontractors, crews and payees: the people the company deals with. */
export const PartiesIcon = icon(Handshake, 'PartiesIcon')
export const StaffIcon = icon(Users, 'StaffIcon')
export const CatalogIcon = icon(Package, 'CatalogIcon')
export const SettingsIcon = icon(SlidersHorizontal, 'SettingsIcon')
export const BellIcon = icon(Bell, 'BellIcon')
export const MoreIcon = icon(Ellipsis, 'MoreIcon')

// Records ("+ Record")
export const DailyReportIcon = icon(NotebookPen, 'DailyReportIcon')
export const LabourIcon = icon(HardHat, 'LabourIcon')
export const ExpenseIcon = icon(Wallet, 'ExpenseIcon')

// Actions and marks
export const PlusIcon = icon(Plus, 'PlusIcon')
export const ChevronDownIcon = icon(ChevronDown, 'ChevronDownIcon')
export const ChevronLeftIcon = icon(ChevronLeft, 'ChevronLeftIcon')
export const ChevronRightIcon = icon(ChevronRight, 'ChevronRightIcon')
export const CheckIcon = icon(Check, 'CheckIcon')
export const LockIcon = icon(Lock, 'LockIcon')
export const ArrowRightIcon = icon(ArrowRight, 'ArrowRightIcon')
export const CameraIcon = icon(Camera, 'CameraIcon')
export const ShareIcon = icon(Share2, 'ShareIcon')
export const TrashIcon = icon(Trash2, 'TrashIcon')
export const AlertIcon = icon(TriangleAlert, 'AlertIcon')
export const InfoIcon = icon(Info, 'InfoIcon')

/** The app mark (same drawing as public/favicon.svg): a house on a Lal Bahi tile. Decorative. */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden focusable="false" className={className}>
      <rect width="64" height="64" rx="14" className="fill-bahi" />
      <path d="M14 46V22l18-10 18 10v24M24 46V32h16v14" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
    </svg>
  )
}
