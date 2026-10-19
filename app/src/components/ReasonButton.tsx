// An action that needs a written reason (reject, cancel, close short, reverse).
// The first tap opens a small inline form; nothing happens until the reason is confirmed.
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { DateInput } from './DateInput'
import { Button, ErrorBanner, Field, Input } from './ui'
import type { DateDisplay } from '../lib/dates'
import { t } from '../lib/i18n'

export function ReasonButton({
  children, title, confirmLabel, hint, onConfirm, busy, error, variant = 'secondary', withDate, open: openProp, onOpenChange,
}: {
  children: ReactNode
  title: string
  confirmLabel: string
  hint?: string
  onConfirm: (reason: string, date: string) => void
  busy?: boolean
  error?: string | null
  variant?: 'secondary' | 'danger' | 'ghost'
  /** Ask for a business date too (reversals), defaulting to this value. */
  withDate?: { value: string; display: DateDisplay; label: string }
  /** Controlled: a page that allows one open form at a time owns this. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const id = useId()
  const [ownOpen, setOwnOpen] = useState(false)
  const open = openProp ?? ownOpen
  const setOpen = (o: boolean) => { setOwnOpen(o); onOpenChange?.(o) }
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(withDate?.value ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (reason.trim()) onConfirm(reason.trim(), date)
  }

  if (!open) {
    // The first tap only opens the form, so it stays quiet; the confirm button carries the red.
    return <Button type="button" variant={variant === 'danger' ? 'secondary' : variant} onClick={() => setOpen(true)}>{children}</Button>
  }
  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3 rounded-lg bg-muted p-3">
      <div className="font-semibold text-ink">{title}</div>
      <Field label={t('reasonButton.reason')} htmlFor={`${id}-reason`} hint={hint}>
        <Input id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
      {withDate && (
        <Field label={withDate.label} htmlFor={`${id}-date`}>
          <DateInput id={`${id}-date`} value={date} onChange={setDate} display={withDate.display} />
        </Field>
      )}
      <ErrorBanner>{error}</ErrorBanner>
      <div className="flex gap-2">
        <Button type="submit" variant={variant === 'danger' ? 'danger' : 'primary'} busy={busy} disabled={!reason.trim()}>
          {confirmLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t('reasonButton.keep')}</Button>
      </div>
    </form>
  )
}
