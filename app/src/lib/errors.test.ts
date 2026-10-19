import { describe, expect, it, vi } from 'vitest'
import { friendlyError, serverAnswered } from './errors'
import { TooManyRows } from './allPages'
import { FunctionError } from './functions'

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

  it('shows our own database messages, written for people', () => {
    expect(friendlyError({ code: 'P0001', message: 'Only an admin can revise the budget' })).toBe('Only an admin can revise the budget')
    expect(friendlyError({ code: '22023', message: 'A reason is required' })).toBe('A reason is required')
  })

  it('never shows an internal database or PostgREST error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(friendlyError({ code: '42703', message: 'column "x" does not exist' })).toBe('Something went wrong.')
    expect(friendlyError({ code: '22P02', message: 'invalid input syntax for type uuid: "abc"' })).toBe('Something went wrong.')
    expect(friendlyError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe('Something went wrong.')
  })

  it('says so when the session ran out', () => {
    expect(friendlyError({ code: 'PGRST301', message: 'JWT expired' })).toBe('You were signed out. Sign in again to continue.')
  })

  it('keeps the words of an error the app throws itself', () => {
    expect(friendlyError(new Error('The current password is not right.'))).toBe('The current password is not right.')
  })

  it('shows an Edge Function refusal in our own words by its code', () => {
    expect(friendlyError(new FunctionError('This phone or email is already registered', 'login_taken', 409)))
      .toBe('This mobile number or email already has a login.')
    expect(friendlyError(new FunctionError('', 'offline', 0))).toBe('No connection. Check your network and try again.')
    expect(friendlyError(new FunctionError('You cannot do this with this file', 'file_forbidden', 403)))
      .toBe('You cannot change this file. Ask an admin if it needs changing.')
  })

  it('an Edge Function refusal without a known code keeps its message', () => {
    expect(friendlyError(new FunctionError('Attachment not found or already uploaded', undefined, 409))).toBe('Attachment not found or already uploaded')
  })
})

describe('too many rows', () => {
  it('asks to narrow the filters instead of showing part of the result', () => {
    expect(friendlyError(new TooManyRows(50000))).toBe('More than 50,000 rows. Choose a shorter period or one project.')
  })
})

describe('serverAnswered', () => {
  it('a database or PostgREST code means the server refused: nothing was saved', () => {
    expect(serverAnswered({ code: 'P0001' })).toBe(true)
    expect(serverAnswered({ code: 'PGRST301' })).toBe(true)
  })
  it('no code (offline, timeout) may have been saved', () => {
    expect(serverAnswered({ message: 'TypeError: Failed to fetch' })).toBe(false)
    expect(serverAnswered(null)).toBe(false)
  })
})
