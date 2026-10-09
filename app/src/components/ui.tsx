// Small UI kit: large touch targets and plain styling for low-end phones (req §21).
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { forwardRef } from 'react'

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  busy?: boolean
}

export function Button({ variant = 'primary', busy, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-50',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand-dark',
        variant === 'secondary' && 'border border-line bg-surface text-ink hover:bg-muted',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90',
        variant === 'ghost' && 'text-brand hover:bg-muted',
        className,
      )}
    >
      {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
}

export function Field({
  label, error, hint, children, htmlFor,
}: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && !error && <div className="text-xs text-subtle">{hint}</div>}
      {error && <div className="text-xs font-medium text-danger">{error}</div>}
    </div>
  )
}

const inputClass =
  'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-muted'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest }, ref,
) {
  return <input ref={ref} {...rest} className={cx(inputClass, className)} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }>(function Select(
  { className, compact, ...rest }, ref,
) {
  // compact: tighter padding for several selects in one row (BS date picker).
  const base = compact ? inputClass.replace('px-3', 'px-1.5') : inputClass
  return <select ref={ref} {...rest} className={cx(base, className)} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest }, ref,
) {
  return <textarea ref={ref} rows={3} {...rest} className={cx(inputClass, 'py-2', className)} />
})

export function Checkbox({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" {...rest} className="mt-1 size-5 accent-brand" />
      <span>
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-subtle">{hint}</span>}
      </span>
    </label>
  )
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-line bg-surface p-4', className)}>
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

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        {subtitle && <div className="text-sm text-subtle">{subtitle}</div>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-muted text-subtle',
        tone === 'good' && 'bg-good/15 text-good',
        tone === 'warn' && 'bg-warn/15 text-warn',
        tone === 'bad' && 'bg-danger/15 text-danger',
        tone === 'info' && 'bg-brand/15 text-brand',
      )}
    >
      {children}
    </span>
  )
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  if (!children) return null
  return <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{children}</div>
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-ink">{children}</div>
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-subtle">
      <span className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
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
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
      <span className="text-subtle">{label}</span>
      <span className="text-right font-medium text-ink">{children || '—'}</span>
    </div>
  )
}
