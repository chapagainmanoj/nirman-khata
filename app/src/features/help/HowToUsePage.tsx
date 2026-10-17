// "How to use": what this person can do, by section (content.ts). Text only, no data.
// Phone: the section titles wrap as chips above the text. Desktop: they stay in a column on the
// left while the text scrolls on the right, with the section in view marked.
import { useEffect, useState } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { Card, PageHeader } from '../../components/ui'
import { useNavRole } from '../../components/useNavRole'
import { t } from '../../lib/i18n'
import { HELP_ROLES, HELP_UPDATED, helpFor } from './content'

export function HowToUsePage() {
  const auth = useCompany()
  const sections = helpFor(useNavRole())
  const current = useSectionInView(sections.map((s) => `help-${s.key}`))
  return (
    <>
      <PageHeader title={t('help.title')} subtitle={HELP_ROLES} />
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <nav aria-label={t('help.sections')}
          className="mb-4 flex flex-wrap gap-2 lg:sticky lg:top-4 lg:mb-0 lg:max-h-[calc(100dvh-2rem)] lg:flex-col lg:flex-nowrap lg:gap-0.5 lg:overflow-y-auto">
          {sections.map((s) => {
            const on = current === `help-${s.key}`
            return (
              <a key={s.key} href={`#help-${s.key}`} aria-current={on ? 'location' : undefined}
                className={`flex min-h-11 items-center rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink active:bg-muted
                  lg:min-h-9 lg:rounded-lg lg:border-0 lg:py-1.5 ${on ? 'lg:bg-brand-soft lg:text-brand-dark' : 'lg:bg-transparent lg:text-subtle lg:hover:bg-muted lg:hover:text-ink'}`}>
                {s.title}
              </a>
            )
          })}
        </nav>
        <div className="flex min-w-0 flex-col gap-3">
          {sections.map((s) => (
            <div key={s.key} id={`help-${s.key}`} className="scroll-mt-4">
              <Card title={s.title}>
                <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink">
                  {s.items.map((i) => <li key={i}>{i}</li>)}
                </ul>
              </Card>
            </div>
          ))}
          <p className="mt-3 mb-2 text-center text-xs text-subtle">
            {t('help.updated')} <DateText value={HELP_UPDATED} display={auth.dateDisplay} dual />
          </p>
        </div>
      </div>
    </>
  )
}

/**
 * The section being read: the last one whose top has reached the top of the screen (a sliver of
 * the one above does not count). At the very bottom, the last section, even if it is short.
 */
function useSectionInView(ids: string[]): string | null {
  const [current, setCurrent] = useState<string | null>(null)
  const key = ids.join(',')
  useEffect(() => {
    const els = key.split(',').map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el)
    if (!els.length) return
    let frame = 0
    const update = () => {
      frame = 0
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      const passed = els.filter((el) => el.getBoundingClientRect().top <= 80)
      setCurrent((atEnd ? els.at(-1) : passed.at(-1) ?? els[0])!.id)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [key])
  return current
}
