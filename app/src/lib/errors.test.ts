import { describe, expect, it } from 'vitest'
import { friendlyError } from './errors'

describe('friendlyError', () => {
  it('names the duplicate by its unique constraint', () => {
    const dup = (constraint: string) => ({ code: '23505', message: `duplicate key value violates unique constraint "${constraint}"` })
    expect(friendlyError(dup('suppliers_unique_name'))).toBe('A supplier with this name already exists.')
    expect(friendlyError(dup('projects_company_id_code_key'))).toBe('This project code is already used.')
    expect(friendlyError(dup('units_company_id_code_key'))).toBe('This already exists. Use a different value.')
  })

  it('reports a dropped connection as a network problem', () => {
    expect(friendlyError({ message: 'TypeError: Failed to fetch' })).toBe('No connection. Check your network and try again.')
  })

  it('reports a request that got no answer in time as a slow connection', () => {
    expect(friendlyError({ message: 'AbortError: request_timeout' })).toMatch(/^The server did not answer in time/)
  })

  it('explains a reused request key instead of showing it raw', () => {
    const reused = { code: 'P0001', message: 'op_key_reused: this request key was already used for a different request' }
    expect(friendlyError(reused)).toMatch(/^This may already be saved/)
  })
})
