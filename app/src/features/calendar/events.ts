// How a calendar event is shown and where it opens, shared by the calendar and the project's
// recent activity so both read the same.
import type { CalendarEvent } from '../site/api'

export const MONEY_TONE: Record<string, ['warn' | 'good' | 'info', string]> = {
  cost: ['warn', 'Cost'], payment: ['good', 'Payment'], peski: ['info', 'Peski'], refund: ['info', 'Refund'],
  received: ['good', 'Received'],
}

/** Where an event opens. Records without a page of their own open on their project. */
export function eventHref(e: CalendarEvent): string | null {
  const project = e.project_id ? `/projects/${e.project_id}` : null
  switch (e.link_kind) {
    case 'bill': return `/bills/${e.link_id}`
    case 'payment': return `/payments/${e.link_id}`
    case 'refund': return `/refunds/${e.link_id}`
    case 'client_receipt': return `/receipts/${e.link_id}`
    case 'slip': return `/slips/${e.link_id}`
    case 'report': return `/daily/${e.link_id}`
    case 'progress': return project && `${project}?tab=site`
    case 'delivery': return project && `${project}?tab=deliveries`
    case 'labour': case 'expense': return project && `${project}?tab=labour`
    case 'charge': return project && `${project}?tab=subcontract`
    default: return project
  }
}
