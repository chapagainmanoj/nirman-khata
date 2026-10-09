import { describe, expect, it } from 'vitest'
import { parseLoginId } from './login-id'

describe('parseLoginId', () => {
  it.each(['9800000001', '+977 980-0000001', '977 9800000001', '(980) 000 0001'])('accepts phone %s', (input) => {
    expect(parseLoginId(input)).toEqual({
      kind: 'phone',
      phone: '+9779800000001',
      email: '9779800000001@phone.nirmankhata.invalid',
    })
  })

  it('accepts and lowercases email', () => {
    expect(parseLoginId(' Owner@Example.com ')).toEqual({ kind: 'email', email: 'owner@example.com' })
  })

  it.each(['12345', '8800000001', '980000000', 'not-an-email@', '9779800000001@phone.nirmankhata.invalid'])(
    'rejects %s',
    (input) => {
      expect(parseLoginId(input)).toBeNull()
    },
  )
})
