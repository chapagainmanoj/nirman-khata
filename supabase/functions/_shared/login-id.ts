// Staff log in with a phone number and password, without SMS (design §8).
// A phone is stored as an internal email on a reserved domain.
// Keep in sync with app/src/lib/login-id.ts.

export const PHONE_LOGIN_DOMAIN = 'phone.nirmankhata.invalid'

export type LoginId =
  | { kind: 'phone'; phone: string; email: string }
  | { kind: 'email'; email: string }

// Accepts 98XXXXXXXX, +977 98XXXXXXXX, 977-98..., or an email address.
export function parseLoginId(input: string): LoginId | null {
  const value = input.trim()
  if (value.includes('@')) {
    const email = value.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@' + PHONE_LOGIN_DOMAIN)) return null
    return { kind: 'email', email }
  }
  let digits = value.replace(/[\s\-()]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (digits.startsWith('977') && digits.length === 13) digits = digits.slice(3)
  if (!/^9\d{9}$/.test(digits)) return null
  return { kind: 'phone', phone: '+977' + digits, email: `977${digits}@${PHONE_LOGIN_DOMAIN}` }
}
