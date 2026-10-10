import { describe, expect, it } from 'vitest'
import { activeSection, phoneBarFor, recordActionsFor, recordHref, sectionsFor, type NavRole } from './nav'

const base: NavRole = {
  roles: [], isAdmin: false, seesAllProjects: false, canSeeFinance: false, canRecordPayments: false, canApproveSlips: false,
}
const viewer: NavRole = { ...base, roles: ['viewer'] }
const site: NavRole = { ...base, roles: ['site_staff'] }
const pmFinance: NavRole = { ...base, roles: ['project_manager'], canSeeFinance: true, canApproveSlips: true }
const accounts: NavRole = { ...base, roles: ['accounts'], seesAllProjects: true, canSeeFinance: true, canRecordPayments: true }
const admin: NavRole = { ...base, roles: ['admin'], isAdmin: true, seesAllProjects: true, canSeeFinance: true, canRecordPayments: true }

const keys = (r: NavRole) => sectionsFor(r).flatMap((g) => g.items.map((i) => i.key))

describe('sectionsFor', () => {
  it('hides money sections from people who cannot see them', () => {
    expect(keys(viewer)).toEqual(['projects', 'slips', 'deliveries', 'parties', 'catalog', 'settings'])
    expect(keys(site)).toEqual(['projects', 'slips', 'deliveries', 'bills', 'parties', 'catalog', 'settings'])
  })
  it('shows payments with finance access, and staff only to admins', () => {
    expect(keys(pmFinance)).toContain('payments')
    expect(keys(pmFinance)).not.toContain('staff')
    expect(keys(admin)).toContain('staff')
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
    expect(phoneBarFor(accounts)).toEqual(['bills', 'payments', 'parties'])
    expect(phoneBarFor(admin)).toEqual(['projects', 'bills', 'slips'])
  })
})

describe('recordActionsFor', () => {
  it('gives viewers nothing to record', () => {
    expect(recordActionsFor(viewer)).toEqual([])
  })
  it('puts deliveries first for site staff, with a bill photo and no payment', () => {
    const a = recordActionsFor(site)
    expect(a.map((x) => x.key)).toEqual(['delivery', 'bill', 'slip', 'labour', 'expense'])
    expect(a.find((x) => x.key === 'bill')?.label).toBe('record.billPhoto')
  })
  it('puts bills and payments first for Accounts, who type the bill', () => {
    const a = recordActionsFor(accounts)
    expect(a.slice(0, 2).map((x) => x.key)).toEqual(['bill', 'payment'])
    expect(a[0].label).toBe('record.bill')
  })
  it('starts new records on the current project', () => {
    const [delivery] = recordActionsFor(site)
    expect(recordHref(delivery, null)).toBe('/deliveries/new')
    expect(recordHref(delivery, 'p1')).toBe('/deliveries/new?project=p1')
  })
})
