import { describe, expect, it } from 'vitest'
import type { NavRole } from '../../components/nav'
import { HELP_SECTIONS, HELP_UPDATED, helpFor } from './content'

const base: NavRole = {
  roles: [], isAdmin: false, seesAllProjects: false, canSeeFinance: false, canRecordPayments: false, canApproveSlips: false,
  labourEnabled: true,
}
const viewer: NavRole = { ...base, roles: ['viewer'] }
const site: NavRole = { ...base, roles: ['site_staff'] }
const admin: NavRole = { ...base, roles: ['admin'], isAdmin: true, seesAllProjects: true, canSeeFinance: true, canRecordPayments: true }

const keys = (r: NavRole) => helpFor(r).map((s) => s.key)

describe('helpFor', () => {
  it('gives an admin every section', () => {
    expect(keys(admin)).toEqual(HELP_SECTIONS.map((s) => s.key))
  })
  it('keeps money and setup sections from site staff', () => {
    for (const k of ['dashboard', 'bills', 'payments', 'khata', 'staff', 'settings-admin']) expect(keys(site)).not.toContain(k)
    for (const k of ['daily', 'labour', 'slips', 'deliveries', 'expenses']) expect(keys(site)).toContain(k)
  })
  it('shows a viewer nothing to enter', () => {
    for (const k of ['daily', 'slips', 'deliveries', 'expenses', 'labour']) expect(keys(viewer)).not.toContain(k)
    expect(keys(viewer)).toContain('reports')
  })
  it('drops labour when own labour is off', () => {
    expect(keys({ ...site, labourEnabled: false })).not.toContain('labour')
  })
})

describe('HELP_SECTIONS', () => {
  it('has unique keys, and every section says something', () => {
    expect(new Set(HELP_SECTIONS.map((s) => s.key)).size).toBe(HELP_SECTIONS.length)
    for (const s of HELP_SECTIONS) expect(s.items.length).toBeGreaterThan(0)
  })
  it('has a real AD date', () => {
    expect(HELP_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
