// Nav menus: "+ Record", the current-project switcher and the account menu.
// Desktop uses a small disclosure panel; the phone "+" opens a bottom sheet (<dialog>, which
// traps focus and closes on Escape by itself).
import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useCompany } from '../auth/AuthProvider'
import { useCurrentProject } from '../features/projects/current'
import { t } from '../lib/i18n'
import { ROLE_LABELS } from '../lib/labels'
import {
  BillIcon, ChevronDownIcon, DailyReportIcon, DeliveryIcon, ExpenseIcon, LabourIcon, PaymentIcon, PlusIcon, SlipIcon,
} from './icons'
import { recordActionsFor, recordHref, sectionsFor, type NavRole, type RecordKey } from './nav'

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')

/**
 * A button that opens a panel below it. Closes on Escape, outside click or navigation, and
 * gives focus back to the button.
 */
function Disclosure({ label, buttonClass, panelClass, children, ariaLabel }: {
  label: ReactNode
  buttonClass: string
  panelClass?: string
  ariaLabel?: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const { pathname, search } = useLocation()

  // Navigating away (a link in the panel) closes it. The ref keeps this from firing on mount.
  const where = useRef(pathname + search)
  useEffect(() => {
    if (where.current !== pathname + search) setOpen(false)
    where.current = pathname + search
  }, [pathname, search])

  useEffect(() => {
    if (!open) return
    const panel = document.getElementById(id)
    panel?.querySelector<HTMLElement>('a, button')?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); button.current?.focus() }
    }
    function onDown(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [open, id])

  const close = () => { setOpen(false); button.current?.focus() }
  return (
    <div ref={root} className="relative">
      <button ref={button} type="button" aria-expanded={open} aria-controls={id} aria-label={ariaLabel}
        onClick={() => setOpen(!open)} className={buttonClass}>
        {label}
      </button>
      {open && (
        <div id={id} className={cx('absolute z-30 mt-1 min-w-64 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg', panelClass)}>
          {children(close)}
        </div>
      )}
    </div>
  )
}

const rowClass = 'flex min-h-11 w-full flex-col justify-center px-4 py-2 text-left hover:bg-muted active:bg-line'

// Same pictures as the sections the records land in, so the sheet scans like the nav.
const RECORD_ICONS: Record<RecordKey, ComponentType<{ size?: number; className?: string }>> = {
  report: DailyReportIcon, delivery: DeliveryIcon, bill: BillIcon, slip: SlipIcon, labour: LabourIcon, expense: ExpenseIcon, payment: PaymentIcon,
}

function RecordList({ role, onPick }: { role: NavRole; onPick?: () => void }) {
  const current = useCurrentProject()
  // Every record belongs to a project: with none open, point at the one step that unblocks it.
  if (current.ready && !current.choices.length) {
    return (
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-ink">{t('record.noProject')}</p>
        {role.isAdmin ? (
          <Link to="/projects/new" onClick={onPick} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-slate underline underline-offset-4">
            {t('projects.new')}
          </Link>
        ) : (
          <p className="mt-1 text-xs text-subtle">{t('record.noProject.ask')}</p>
        )}
      </div>
    )
  }
  return (
    <ul>
      {recordActionsFor(role).map((a) => {
        const Icon = RECORD_ICONS[a.key]
        return (
          <li key={a.key}>
            <Link to={recordHref(a, current.projectId)} onClick={onPick}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted active:bg-line">
              <Icon size={22} className="shrink-0 text-subtle" />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold text-ink">{t(a.label)}</span>
                <span className="text-xs text-subtle">{t(a.hint)}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Desktop and tablet: "+ Record ▾". */
export function RecordMenu({ role, className, alignRight }: { role: NavRole; className?: string; alignRight?: boolean }) {
  if (!recordActionsFor(role).length) return null
  return (
    <Disclosure panelClass={alignRight ? 'right-0' : undefined}
      buttonClass={cx('inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark', className)}
      label={<><PlusIcon />{t('nav.record')}</>}>
      {() => <RecordList role={role} />}
    </Disclosure>
  )
}

/** Phone: the centre "+" of the bottom bar opens a sheet of large buttons. */
export function RecordSheetButton({ role }: { role: NavRole }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { pathname, search } = useLocation()
  useEffect(() => { dialog.current?.close() }, [pathname, search])
  if (!recordActionsFor(role).length) return null
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} aria-label={t('record.title')}
        className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-brand active:bg-muted">
        <span className="flex size-9 items-center justify-center rounded-full bg-brand text-white"><PlusIcon /></span>
      </button>
      <dialog ref={dialog} aria-label={t('record.title')}
        onClick={(e) => { if (e.target === dialog.current) dialog.current.close() }}
        className="mt-auto mb-0 w-full max-w-none rounded-t-2xl bg-surface p-0 pb-[env(safe-area-inset-bottom)] text-ink backdrop:bg-ink/40">
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <h2 className="text-base font-semibold">{t('record.title')}</h2>
          <button type="button" onClick={() => dialog.current?.close()} className="min-h-11 rounded-lg px-3 text-sm font-medium text-subtle">
            {t('common.cancel')}
          </button>
        </div>
        <RecordList role={role} onPick={() => dialog.current?.close()} />
      </dialog>
    </>
  )
}

/** "P-1 Ward 5 ▾": which project new records start on and lists open filtered to. */
export function ProjectSwitcher({ className, caption = 'always' }: { className?: string; caption?: 'always' | 'md' }) {
  const current = useCurrentProject()
  // Nothing to switch between: one project, or none to work on.
  if (current.choices.length < 2) return null
  const label = current.project ? `${current.project.code} · ${current.project.name}` : t('nav.project.none')
  return (
    <div>
      {/* A visible caption so this reads as your context, not a filter; the button keeps its own sr-only name. */}
      <div aria-hidden className={cx('px-1 pb-1 text-xs font-medium text-subtle', caption === 'md' && 'hidden md:block')}>{t('nav.project.choose')}</div>
      <Disclosure
        buttonClass={cx('inline-flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-line px-3 text-left text-sm text-ink hover:bg-muted', className)}
        label={<><span className="min-w-0 flex-1 truncate"><span className="sr-only">{t('nav.project.choose')}: </span>{label}</span><ChevronDownIcon /></>}>
        {(close) => (
          <ul className="max-h-80 overflow-y-auto">
            {[{ id: null, text: t('nav.project.noneOption') }, ...current.choices.map((p) => ({ id: p.id, text: `${p.code} · ${p.name}` }))].map((o) => (
              <li key={o.id ?? 'all'}>
                <button type="button" aria-current={o.id === current.projectId || undefined}
                  onClick={() => { current.setProjectId(o.id); close() }}
                  className={cx(rowClass, 'text-sm', o.id === current.projectId ? 'font-semibold text-brand-dark' : 'text-ink')}>
                  {o.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Disclosure>
    </div>
  )
}

/**
 * Company and name; opens to roles and Sign out. `up` (sidebar foot) opens above the button and
 * leads with the person, since the brand above already names the company.
 */
export function AccountMenu({ className, alignRight, up }: { className?: string; alignRight?: boolean; up?: boolean }) {
  const auth = useCompany()
  const navigate = useNavigate()
  const roles = auth.membership?.roles.map((r) => ROLE_LABELS[r]).join(', ')
  return (
    <Disclosure ariaLabel={`${t('nav.account')}: ${auth.company.name}`}
      panelClass={cx(alignRight && 'right-0', up && 'bottom-full mb-1')}
      buttonClass={cx('flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left hover:bg-muted', className)}
      label={
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-ink">{up ? auth.profile?.full_name : auth.company.name}</span>
            <span className="block truncate text-xs text-subtle">{up ? roles : auth.profile?.full_name}</span>
          </span>
          <ChevronDownIcon className={up ? 'rotate-180' : undefined} />
        </>
      }>
      {() => (
        <>
          <div className="border-b border-line px-4 py-2 text-xs text-subtle">{roles}</div>
          <Link to="/settings" className={cx(rowClass, 'text-sm font-medium text-ink')}>{t('nav.myAccount')}</Link>
          <button type="button" className={cx(rowClass, 'text-sm font-medium text-ink')}
            onClick={async () => { if (await auth.signOut()) navigate('/login') }}>
            {t('nav.signOut')}
          </button>
        </>
      )}
    </Disclosure>
  )
}

/** Tablet top bar: Staff, Catalog and Settings behind one gear button. */
export function SetupMenu({ role, icon }: { role: NavRole; icon: ReactNode }) {
  const setup = sectionsFor(role).find((g) => g.key === 'setup')
  if (!setup) return null
  return (
    <Disclosure ariaLabel={t('nav.group.setup')} panelClass="right-0"
      buttonClass="inline-flex size-11 items-center justify-center rounded-lg text-subtle hover:bg-muted hover:text-ink"
      label={icon}>
      {() => (
        <ul>
          {setup.items.map((i) => (
            <li key={i.key}><Link to={i.to} className={cx(rowClass, 'text-sm font-medium text-ink')}>{t(i.label)}</Link></li>
          ))}
        </ul>
      )}
    </Disclosure>
  )
}
