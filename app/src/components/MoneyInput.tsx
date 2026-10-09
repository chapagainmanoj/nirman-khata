import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { formatNPRShort, parseNPR } from '../lib/money'
import { Input } from './ui'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'type'> & { value: string }

/** Rupee amount as typed text; shows lakh/crore under it so big numbers are easy to check. */
export const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput({ value, ...rest }, ref) {
  const paisa = parseNPR(value ?? '')
  const readbackId = useId()
  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-subtle">Rs.</span>
        <Input ref={ref} {...rest} value={value} inputMode="decimal" autoComplete="off" className="pl-10"
          aria-describedby={value ? readbackId : undefined} />
      </div>
      {value && (
        <div id={readbackId} className="mt-1 text-xs text-subtle">
          {paisa === null ? 'Enter an amount like 12,34,567 or 1234.50' : formatNPRShort(paisa)}
        </div>
      )}
    </div>
  )
})
