import type { Database } from './database.types'
import { type MessageKey, t, translated } from './i18n'
import type { AppRole, ProjectStatus } from './supabase'

export const ROLE_LABELS: Record<AppRole, string> = translated({
  admin: 'label.role.admin',
  project_manager: 'label.role.project_manager',
  site_staff: 'label.role.site_staff',
  accounts: 'label.role.accounts',
  viewer: 'label.role.viewer',
})

// Planned is retired (new projects start Active); its label stays for old audit rows.
export const STATUS_LABELS: Record<ProjectStatus, string> = translated({
  planned: 'label.status.planned',
  active: 'label.status.active',
  on_hold: 'label.status.on_hold',
  completed: 'label.status.completed',
  closed: 'label.status.closed',
  cancelled: 'label.status.cancelled',
})

/**
 * The statuses a person picks (GLOSSARY: Project status). Books closed and Cancelled are set by
 * the "Close books" and "Cancel project" actions on the project page, never from the list.
 */
export const PICK_STATUSES = ['active', 'on_hold', 'completed'] as const satisfies readonly ProjectStatus[]

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
type ClientReceiptKind = Database['public']['Enums']['client_receipt_kind']

/** Like translated(), for [label, tone] pairs: the label is read through t() each time. */
function withTone<K extends string>(pairs: Record<K, [MessageKey, Tone]>): Record<K, [string, Tone]> {
  const out = {} as Record<K, [string, Tone]>
  for (const k of Object.keys(pairs) as K[]) {
    Object.defineProperty(out, k, { get: () => [t(pairs[k][0]), pairs[k][1]], enumerable: true })
  }
  return out
}

export const SLIP_STATUS: Record<SlipStatus, [string, Tone]> = withTone({
  draft: ['label.slip.draft', 'neutral'],
  pending: ['label.slip.pending', 'warn'],
  approved: ['label.slip.approved', 'good'],
  rejected: ['label.slip.rejected', 'bad'],
  cancelled: ['label.slip.cancelled', 'neutral'],
})

export const FULFILMENT: Record<string, [string, Tone]> = withTone({
  not_received: ['label.fulfilment.not_received', 'neutral'],
  partially_received: ['label.fulfilment.partially_received', 'warn'],
  fully_received: ['label.fulfilment.fully_received', 'good'],
  closed_short: ['label.fulfilment.closed_short', 'neutral'],
})

/** A bill photographed but not typed yet has no number. */
export const billTitle = (billNo: string | null | undefined) => (billNo ? t('label.billNo', { billNo }) : t('label.billNotTyped'))

export const BILL_STATUS: Record<BillStatus, [string, Tone]> = withTone({
  draft: ['label.bill.draft', 'neutral'],
  under_review: ['label.bill.under_review', 'warn'],
  posted: ['label.bill.posted', 'good'],
  reversed: ['label.bill.reversed', 'bad'],
})

export const PAYMENT_METHODS: Record<PaymentMethod, string> = translated({
  cash: 'label.method.cash',
  bank_transfer: 'label.method.bank_transfer',
  cheque: 'label.method.cheque',
  wallet: 'label.method.wallet',
  other: 'label.method.other',
})

/** What a client payment was for. Kept short: no running-bill documents yet, just the reason. */
export const CLIENT_RECEIPT_KINDS: Record<ClientReceiptKind, string> = translated({
  advance: 'label.receiptKind.advance',
  running_bill: 'label.receiptKind.running_bill',
  final: 'label.receiptKind.final',
  other: 'label.receiptKind.other',
})

export const DELIVERY_ISSUES: Record<DeliveryIssue, string> = translated({
  shortage: 'label.issue.shortage',
  damage: 'label.issue.damage',
  rejected: 'label.issue.rejected',
  spec_difference: 'label.issue.spec_difference',
  other: 'label.issue.other',
})

/** Settlement state of a posted bill (derived, req §12.2). */
export function settlementLabel(outstanding: number, settled: number): [string, Tone] {
  if (outstanding <= 0) return [t('label.settle.paid'), 'good']
  if (settled > 0) return [t('label.settle.partPaid'), 'warn']
  return [t('label.settle.unpaid'), 'bad']
}

export const PACKAGE_STATUS: Record<PackageStatus, [string, Tone]> = withTone({
  active: ['label.package.active', 'info'],
  completed: ['label.package.completed', 'good'],
  cancelled: ['label.package.cancelled', 'neutral'],
})

export const CHARGE_STATUS: Record<ChargeStatus, [string, Tone]> = withTone({
  draft: ['label.charge.draft', 'warn'],
  approved: ['label.charge.approved', 'good'],
  rejected: ['label.charge.rejected', 'neutral'],
  reversed: ['label.charge.reversed', 'bad'],
})

/** Common crew work types (req §14); free text is allowed too. */
export const WORK_TYPES = ['Dakarmi', 'Jyami', 'Mixed']
