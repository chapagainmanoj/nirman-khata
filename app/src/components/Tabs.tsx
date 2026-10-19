import { useId, type KeyboardEvent, type ReactNode } from 'react'

/** Tabs with arrow-key movement (WAI-ARIA tabs pattern), as on the catalog page. */
export function Tabs<T extends string>({ tabs, value, onChange, label, soft, children }: {
  tabs: Array<[T, string]>
  value: T
  onChange: (t: T) => void
  label: string
  /** The lighter track, for a wide row of page sections rather than a filter. */
  soft?: boolean
  children: ReactNode
}) {
  const ids = useId()
  const tabId = (key: T) => `${ids}-tab-${key}`
  function onKeyDown(e: KeyboardEvent) {
    const i = tabs.findIndex(([key]) => key === value)
    const step: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }
    if (!(e.key in step)) return
    e.preventDefault()
    const [next] = tabs[(step[e.key] + tabs.length) % tabs.length]
    onChange(next)
    document.getElementById(tabId(next))?.focus()
  }
  return (
    <>
      {/* Scrolls sideways on narrow phones instead of squeezing the labels. */}
      <div className={`mt-6 mb-3 flex gap-1 overflow-x-auto rounded-lg p-1 sm:w-fit ${soft ? 'bg-track-soft' : 'bg-track'}`} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map(([key, text]) => (
          <button key={key} id={tabId(key)} type="button" role="tab" aria-selected={value === key} aria-controls={`${ids}-panel`}
            tabIndex={value === key ? 0 : -1} onClick={() => onChange(key)}
            className={`min-h-11 flex-1 shrink-0 whitespace-nowrap rounded-md px-3 sm:flex-none sm:px-4 text-sm font-medium ${value === key ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
            {text}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={tabId(value)}>{children}</div>
    </>
  )
}
