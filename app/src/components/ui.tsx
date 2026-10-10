// Small UI kit: large touch targets and plain styling for low-end phones (req §21).
import type { ComponentProps, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { createContext, forwardRef, useContext, useEffect, useId, useRef, useState } from 'react'
import { Link, type LinkProps } from 'react-router'
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon, InfoIcon } from './icons'

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

function buttonClass(variant: Variant, className?: string) {
  return cx(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors disabled:pointer-events-none',
    variant === 'ghost' ? 'px-2' : 'px-4',
    // Filled buttons go grey when disabled; a faded oxblood reads as pink, not as unavailable.
    variant === 'primary' && 'bg-brand text-white hover:bg-brand-dark active:bg-brand-dark disabled:bg-line disabled:text-subtle',
    variant === 'secondary' && 'border border-field bg-surface text-ink hover:bg-muted active:bg-line disabled:opacity-50',
    variant === 'danger' && 'bg-danger text-white hover:bg-danger-ink active:bg-danger-ink disabled:bg-line disabled:text-subtle',
    // Row and secondary actions stay neutral; brand colour is kept for the one main action.
    variant === 'ghost' && 'text-ink underline decoration-line underline-offset-4 hover:bg-muted hover:decoration-subtle active:bg-line disabled:opacity-50',
    className,
  )
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: Variant
  busy?: boolean
}

export function Button({ variant = 'primary', busy, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button {...rest} disabled={disabled || busy} aria-busy={busy || undefined} className={buttonClass(variant, className)}>
      {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
}

/** A link that looks like a button, so navigation never nests a button inside a link. */
export function ButtonLink({ variant = 'primary', className, ...rest }: LinkProps & { variant?: Variant }) {
  return <Link {...rest} className={buttonClass(variant, className)} />
}

/**
 * Two-tap button for actions that cut someone off or remove something.
 * The first tap asks inline instead of opening a modal; a stray thumb on site does nothing.
 */
export function ConfirmButton({
  children, confirmLabel, onConfirm, disabled, label,
}: { children: ReactNode; confirmLabel: string; onConfirm: () => void; disabled?: boolean; label?: string }) {
  const [asking, setAsking] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const wasAsking = useRef(false)

  // Put focus back on the original button when the question is dismissed.
  useEffect(() => {
    if (!asking && wasAsking.current) trigger.current?.focus()
    wasAsking.current = asking
  }, [asking])

  if (!asking) {
    return (
      <Button ref={trigger} variant="ghost" aria-label={label} disabled={disabled} onClick={() => setAsking(true)}>
        {children}
      </Button>
    )
  }
  return (
    <span className="flex gap-1">
      <Button variant="danger" autoFocus onClick={() => { wasAsking.current = false; setAsking(false); onConfirm() }}>
        {confirmLabel}
      </Button>
      <Button variant="secondary" onClick={() => setAsking(false)}>Keep</Button>
    </span>
  )
}

// Lets the control inside a <Field> point at that field's hint and error for screen readers.
const FieldContext = createContext<{ describedBy?: string; invalid: boolean }>({ invalid: false })

function useFieldAria(own?: string) {
  const field = useContext(FieldContext)
  return {
    'aria-describedby': cx(field.describedBy, own) || undefined,
    'aria-invalid': field.invalid || undefined,
  }
}

export function Field({
  label, error, hint, children, htmlFor,
}: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  const id = useId()
  const hintId = hint && !error ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = cx(hintId, errorId) || undefined
  const notes = (
    <>
      {hintId && <div id={hintId} className="text-xs text-subtle">{hint}</div>}
      {errorId && <div id={errorId} className="text-xs font-medium text-danger">{error}</div>}
    </>
  )

  // A group of controls (checkboxes) has no single input to label, so it is a fieldset.
  if (!htmlFor) {
    return (
      <fieldset className="flex min-w-0 flex-col gap-1" aria-describedby={describedBy}>
        <legend className="mb-1 text-sm font-medium text-ink">{label}</legend>
        {children}
        {notes}
      </fieldset>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{label}</label>
      <FieldContext.Provider value={{ describedBy, invalid: !!error }}>{children}</FieldContext.Provider>
      {notes}
    </div>
  )
}

const inputClass =
  'min-h-11 w-full rounded-lg border border-field bg-surface px-3 text-base text-ink placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:border-line disabled:bg-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest }, ref,
) {
  const aria = useFieldAria(rest['aria-describedby'])
  return <input ref={ref} {...rest} {...aria} className={cx(inputClass, className)} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }>(function Select(
  { className, compact, ...rest }, ref,
) {
  const aria = useFieldAria(rest['aria-describedby'])
  // compact: tighter padding for several selects in one row (BS date picker).
  const base = compact ? inputClass.replace('px-3', 'px-1.5') : inputClass
  return <select ref={ref} {...rest} {...aria} className={cx(base, className)} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest }, ref,
) {
  const aria = useFieldAria(rest['aria-describedby'])
  return <textarea ref={ref} rows={3} {...rest} {...aria} className={cx(inputClass, 'py-2', className)} />
})

export function Checkbox({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" {...rest} className="mt-1 size-5 shrink-0 accent-brand" />
      <span className="min-w-0 break-words">
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-subtle">{hint}</span>}
      </span>
    </label>
  )
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('min-w-0 rounded-xl border border-line bg-surface p-4', className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export type Crumb = { to: string; label: string }

/** Where this page sits. Phones show only the nearest parent, as a back link. */
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  if (!trail.length) return null
  const parent = trail[trail.length - 1]
  return (
    <nav aria-label="Breadcrumb" className="mb-1 text-sm">
      <Link to={parent.to} className="-ml-1 inline-flex min-h-11 items-center gap-0.5 rounded-lg px-1 text-subtle hover:text-ink sm:hidden">
        <ChevronLeftIcon size={16} />{parent.label}
      </Link>
      <ol className="hidden flex-wrap items-center gap-1 text-subtle sm:flex">
        {trail.map((c, i) => (
          <li key={c.to} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRightIcon size={14} className="shrink-0" />}
            <Link to={c.to} className="truncate rounded px-0.5 hover:text-ink hover:underline">{c.label}</Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function PageHeader({ title, subtitle, actions, crumbs, after }: {
  title: string; subtitle?: ReactNode; actions?: ReactNode; crumbs?: Crumb[]
  /** A line in body colour under the subtitle: the one fact this page turns on. */
  after?: ReactNode
}) {
  return (
    <div className="mb-4">
      {crumbs && <Breadcrumbs trail={crumbs} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-bold text-ink">{title}</h1>
          {subtitle && <div className="text-sm text-subtle">{subtitle}</div>}
          {after}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-muted text-subtle',
        tone === 'good' && 'bg-good-soft text-good-ink',
        tone === 'warn' && 'bg-warn-soft text-warn-ink',
        tone === 'bad' && 'bg-danger-soft text-danger-ink',
        tone === 'info' && 'bg-info-soft text-info-ink',
      )}
    >
      {children}
    </span>
  )
}

/** Error message; pass onRetry when the failed thing was a load the user can simply try again. */
export function ErrorBanner({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  if (!children) return null
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-x-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-ink">
      <span className="flex min-w-0 items-start gap-2 break-words"><AlertIcon size={18} className="mt-px shrink-0" />{children}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="min-h-11 shrink-0 font-semibold underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-ink">
      <InfoIcon size={18} className="mt-px shrink-0 text-warn-ink" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Always-mounted live region, so a message that appears inside it ("Saved.") is read out. */
export function Status({ children, className }: { children: ReactNode; className?: string }) {
  return <div role="status" className={cx('empty:hidden', className)}>{children}</div>
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-8 text-sm text-subtle">
      <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      {label}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
      <div className="font-medium text-ink">{title}</div>
      {children && <div className="mt-1 text-sm text-subtle">{children}</div>}
    </div>
  )
}

/** Label/value rows for detail screens. */
/**
 * Save/Cancel row of a form. On phones it sticks above the bottom bar so the main action
 * is always one tap away on long forms; on wider screens it sits at the end of the form.
 */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[5] -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-page/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
      {children}
    </div>
  )
}

/** Optional fields, folded away so the required path stays short. Opens itself when it holds a value. */
export function MoreDetails({ summary, open, children }: { summary: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="group mt-3" open={open || undefined}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon size={16} className="shrink-0 text-subtle transition-transform group-open:rotate-90" />
        <span>More details <span className="font-normal text-subtle">({summary.toLowerCase()})</span></span>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}

/** A label/value row. Rows with no value are left out instead of showing a dash. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === false || children === '') return null
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
      <span className="shrink-0 text-subtle">{label}</span>
      <span className="min-w-0 break-words text-right font-medium text-ink tabular-nums">{children}</span>
    </div>
  )
}
