import { describe, expect, it } from 'vitest'
import { activeSection, homeFor, phoneBarFor, recordActionsFor, recordHref, sectionsFor, type NavRole } from './nav'

const base: NavRole = {
  roles: [], isAdmin: false, seesAllProjects: false, canSeeFinance: false, canRecordPayments: false, canApproveSlips: false,
  labourEnabled: true,
}
const viewer: NavRole = { ...base, roles: ['viewer'] }
const site: NavRole = { ...base, roles: ['site_staff'] }
const pmFinance: NavRole = { ...base, roles: ['project_manager'], canSeeFinance: true, canApproveSlips: true }
const accounts: NavRole = { ...base, roles: ['accounts'], seesAllProjects: true, canSeeFinance: true, canRecordPayments: true }
const admin: NavRole = { ...base, roles: ['admin'], isAdmin: true, seesAllProjects: true, canSeeFinance: true, canRecordPayments: true }

const keys = (r: NavRole) => sectionsFor(r).flatMap((g) => g.items.map((i) => i.key))

describe('sectionsFor', () => {
  it('hides money sections from people who cannot see them', () => {
    expect(keys(viewer)).toEqual(['projects', 'calendar', 'slips', 'deliveries', 'reports', 'parties', 'catalog', 'settings'])
    expect(keys(site)).toEqual(['projects', 'calendar', 'slips', 'deliveries', 'reports', 'bills', 'parties', 'catalog', 'settings'])
  })
  it('shows payments with finance access, and staff only to admins', () => {
    expect(keys(pmFinance)).toContain('payments')
    expect(keys(pmFinance)).not.toContain('staff')
    expect(keys(admin)).toContain('staff')
    expect(keys(pmFinance)).toContain('dashboard')
    expect(keys(site)).not.toContain('dashboard')
  })
  it('groups by job', () => {
    expect(sectionsFor(admin).map((g) => g.key)).toEqual(['site', 'money', 'setup'])
  })
})

describe('activeSection', () => {
  it.each([
    ['/bills/abc', 'bills'],
    ['/bills/new', 'bills'],
    ['/payments/abc', 'payments'],
    ['/work/abc', 'parties'],
    ['/suppliers/abc', 'parties'],
    ['/crews/abc', 'parties'],
    ['/deliveries/new', 'deliveries'],
    ['/labour/new', 'projects'],
    ['/projects/abc', 'projects'],
    ['/slips/abc/edit', 'slips'],
    ['/calendar', 'calendar'],
    ['/daily/new', 'projects'],
    ['/daily/abc', 'projects'],
    ['/reports/payments', 'reports'],
    ['/dashboard', 'dashboard'],
  ])('%s belongs to %s', (path, key) => {
    expect(activeSection(path)).toBe(key)
  })
  it('does not match a prefix inside a word', () => {
    expect(activeSection('/billsx')).toBeNull()
    expect(activeSection('/notifications')).toBeNull()
  })
})

describe('phoneBarFor', () => {
  it('follows what each role does most', () => {
    expect(phoneBarFor(site)).toEqual(['projects', 'slips', 'deliveries'])
    expect(phoneBarFor(accounts)).toEqual(['dashboard', 'bills', 'payments'])
    expect(phoneBarFor(admin)).toEqual(['dashboard', 'projects', 'slips'])
  })
})

describe('recordActionsFor', () => {
  it('gives viewers nothing to record', () => {
    expect(recordActionsFor(viewer)).toEqual([])
  })
  it('puts the daily report first for site staff, with a bill photo and no payments in or out', () => {
    const a = recordActionsFor(site)
    expect(a.map((x) => x.key)).toEqual(['report', 'delivery', 'bill', 'slip', 'labour', 'expense'])
    expect(a.find((x) => x.key === 'bill')?.label).toBe('record.billPhoto')
  })
  it('puts bills and payments first for Accounts, who type the bill', () => {
    const a = recordActionsFor(accounts)
    expect(a.slice(0, 3).map((x) => x.key)).toEqual(['bill', 'payment', 'receipt'])
    expect(a[0].label).toBe('record.bill')
  })
  it('hides labour when the company does not track own labour', () => {
    expect(recordActionsFor({ ...site, labourEnabled: false }).map((x) => x.key)).not.toContain('labour')
  })
  it('opens the attendance roster when labour is marked by attendance', () => {
    const labour = recordActionsFor({ ...site, labourByAttendance: true }).find((x) => x.key === 'labour')!
    expect(labour.path).toBe('/labour/attendance')
    expect(labour.label).toBe('record.attendance')
    expect(recordActionsFor(site).find((x) => x.key === 'labour')!.path).toBe('/labour/new')
  })
  it('starts new records on the current project', () => {
    const [report] = recordActionsFor(site)
    expect(recordHref(report, null)).toBe('/daily/new')
    expect(recordHref(report, 'p1')).toBe('/daily/new?project=p1')
  })
})

describe('homeFor', () => {
  it('lands people who see money on the dashboard, others on projects', () => {
    expect(homeFor(admin)).toBe('/dashboard')
    expect(homeFor(site)).toBe('/projects')
  })
})
