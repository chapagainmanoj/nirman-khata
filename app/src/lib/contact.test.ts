import { describe, expect, it } from 'vitest'
import { callLink, callNumber, mailLink, SUPPORT_EMAIL, whatsAppLink, whatsAppNumber } from './contact'

describe('contact', () => {
  it('opens WhatsApp with the country code and the message typed in', () => {
    expect(whatsAppLink("Hi, I'd like a demo")).toBe('https://wa.me/9779714509893?text=Hi%2C%20I\'d%20like%20a%20demo')
    expect(whatsAppNumber).toBe('+977 9714509893')
  })

  it('dials the call number with +977', () => {
    expect(callLink).toBe('tel:+9779860802349')
    expect(callNumber).toBe('+977 9860802349')
  })

  it('writes an email with the subject filled in', () => {
    expect(mailLink(SUPPORT_EMAIL, 'NirmanKhata demo')).toBe('mailto:support@nirman-khata.com?subject=NirmanKhata%20demo')
  })
})
