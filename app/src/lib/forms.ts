import type { FieldErrors, FieldValues } from 'react-hook-form'

/**
 * Focus the first invalid field in on-screen order.
 * react-hook-form focuses in registration order, which follows render order: a parent form
 * registers its own fields before a child component (ProjectDetailsFields) registers the
 * ones above them, so the default jumps past the first error. Use with shouldFocusError: false.
 */
export function focusFirstError<T extends FieldValues>(errors: FieldErrors<T>, form: HTMLFormElement | null) {
  if (!form) return
  const first = Array.from(form.elements).find(
    (el): el is HTMLElement & { name: string } => 'name' in el && typeof el.name === 'string' && el.name in errors,
  )
  first?.focus()
  first?.scrollIntoView({ block: 'center' })
}
