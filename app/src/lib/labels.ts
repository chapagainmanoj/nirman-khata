import type { Database } from './database.types'
import type { AppRole, ProjectStatus } from './supabase'

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Owner / Admin',
  project_manager: 'Project Manager / Engineer',
  site_staff: 'Site Staff / Supervisor',
  accounts: 'Accounts',
  viewer: 'Viewer',
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export const STATUS_TONE: Record<ProjectStatus, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  planned: 'info',
  active: 'good',
  on_hold: 'warn',
  completed: 'neutral',
  closed: 'neutral',
  cancelled: 'bad',
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info'
type SlipStatus = Database['public']['Enums']['slip_status']
type BillStatus = Database['public']['Enums']['bill_status']
type PaymentMethod = Database['public']['Enums']['payment_method']
type DeliveryIssue = Database['public']['Enums']['delivery_issue']
type PackageStatus = Database['public']['Enums']['package_status']
type ChargeStatus = Database['public']['Enums']['charge_status']

export const SLIP_STATUS: Record<SlipStatus, [string, Tone]> = {
  draft: ['Draft', 'neutral'],
  pending: ['Pending approval', 'warn'],
  approved: ['Approved', 'good'],
  rejected: ['Rejected', 'bad'],
  cancelled: ['Cancelled', 'neutral'],
}

export const FULFILMENT: Record<string, [string, Tone]> = {
  not_received: ['Not received', 'neutral'],
  partially_received: ['Partly received', 'warn'],
  fully_received: ['Fully received', 'good'],
  closed_short: ['Closed short', 'neutral'],
}

export const BILL_STATUS: Record<BillStatus, [string, Tone]> = {
  draft: ['Draft', 'neutral'],
  under_review: ['Under review', 'warn'],
  posted: ['Posted', 'good'],
  reversed: ['Reversed', 'bad'],
}

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  wallet: 'eSewa / Khalti / wallet',
  other: 'Other',
}

export const DELIVERY_ISSUES: Record<DeliveryIssue, string> = {
  shortage: 'Shortage',
  damage: 'Damaged',
  rejected: 'Rejected at site',
  spec_difference: 'Different spec',
  other: 'Other',
}

/** Settlement state of a posted bill (derived, req §12.2). */
export function settlementLabel(outstanding: number, settled: number): [string, Tone] {
  if (outstanding <= 0) return ['Paid', 'good']
  if (settled > 0) return ['Part paid', 'warn']
  return ['Unpaid', 'bad']
}

export const PACKAGE_STATUS: Record<PackageStatus, [string, Tone]> = {
  planned: ['Planned', 'info'],
  in_progress: ['In progress', 'warn'],
  completed: ['Completed', 'good'],
  cancelled: ['Cancelled', 'neutral'],
}

export const CHARGE_STATUS: Record<ChargeStatus, [string, Tone]> = {
  draft: ['Waiting for approval', 'warn'],
  approved: ['Approved', 'good'],
  rejected: ['Rejected', 'neutral'],
  reversed: ['Reversed', 'bad'],
}

/** Common crew work types (req §14); free text is allowed too. */
export const WORK_TYPES = ['Dakarmi', 'Jyami', 'Mixed']
