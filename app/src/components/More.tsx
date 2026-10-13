// Simple forms (company setting): the less-used fields of a form sit under a "More" heading,
// closed until tapped. In Detailed companies the fields show as they always did. A section
// opens by itself when a field in it already has a value (editing) or is marked invalid, so
// folding never hides something the user entered or must fix.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useSimpleForms } from '../auth/useSimpleForms'
import { ChevronRightIcon } from './icons'

const FILLED = (el: Element) => {
  // A field showing a default the form fills in itself (e.g. the cost heading) is not "filled".
  if (el.getAttribute('data-default') === 'true') return false
  if (el.getAttribute('data-has-value') === 'true') return true
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked
    if (el.type === 'file' || el.type === 'hidden') return false
    // An amount of 0 (saved for an empty charge) is not a value someone entered.
    return el.value.trim() !== '' && !/^0+(\.0*)?$/.test(el.value.trim())
  }
  return (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && el.value.trim() !== ''
}

export function More({ label = 'More details', summary, className, children }: {
  label?: string
  /** Shown next to the heading while closed, e.g. "VAT Rs 5,200". */
  summary?: ReactNode
  className?: string
  children: ReactNode
}) {
  const simple = useSimpleForms()
  if (!simple) return <>{children}</>
  return <Fold label={label} summary={summary} className={className}>{children}</Fold>
}

function Fold({ label, summary, className, children }: { label: string; summary?: ReactNode; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)

  // Open when the fields inside become filled: on mount (an edited record) and later (a draft
  // restored or a form reset after mount). Only the change to "filled" opens it, so a user can
  // still close a fold they filled in. Also open whenever a field inside is marked invalid.
  const wasFilled = useRef(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const filled = Array.from(el.querySelectorAll('input, select, textarea, [data-has-value]')).some(FILLED)
    if ((filled && !wasFilled.current) || el.querySelector('[aria-invalid="true"]')) el.open = true
    wasFilled.current = filled
  })

  // Looks like MoreDetails (ui.tsx), the fold the forms already use for optional extras.
  return (
    <details ref={ref} onToggle={(e) => setOpen(e.currentTarget.open)} className={`group min-w-0 ${className ?? ''}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon size={16} className="shrink-0 text-subtle transition-transform group-open:rotate-90" />
        <span className="min-w-0">{label}{!open && summary && <span className="font-normal text-subtle"> ({summary})</span>}</span>
      </summary>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </details>
  )
}

