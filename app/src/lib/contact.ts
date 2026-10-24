// How people reach the NirmanKhata team, for sign-in and registration. The marketing site (site/) has the
// same details in site/src/content.ts: change both together.
// Registration is by invitation (register Edge Function), so "Contact us" must always say how.

/** WhatsApp only; this number takes no calls. */
const WHATSAPP = '9779714509893'
const CALL = '9860802349'
export const SUPPORT_EMAIL = 'support@nirman-khata.com'

/** A chat with the team, with the first message already typed. */
export function whatsAppLink(text: string): string {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`
}

export const callLink = `tel:+977${CALL}`
/** As people write it: +977 98XXXXXXXX. */
export const callNumber = `+977 ${CALL}`
export const whatsAppNumber = `+977 ${WHATSAPP.slice(3)}`

export function mailLink(to: string, subject: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}`
}
