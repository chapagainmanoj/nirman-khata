import { callLink, callNumber, mailLink, whatsAppLink, whatsAppNumber } from '../lib/contact'
import { t } from '../lib/i18n'
import { ChatIcon, MailIcon, PhoneIcon } from './icons'

const row = 'flex min-h-11 items-center gap-3 font-medium text-brand underline-offset-4 hover:underline'

/** WhatsApp, call and email, one per line: wherever the app says "Contact us". */
export function ContactLinks({ email, message, subject }: { email: string; message: string; subject: string }) {
  return (
    <ul className="flex flex-col text-sm">
      <li>
        <a href={whatsAppLink(message)} target="_blank" rel="noreferrer" className={row}>
          <ChatIcon size={20} />{t('contact.whatsapp', { number: whatsAppNumber })}
        </a>
      </li>
      <li><a href={callLink} className={row}><PhoneIcon size={20} />{t('contact.call', { number: callNumber })}</a></li>
      <li><a href={mailLink(email, subject)} className={row}><MailIcon size={20} />{email}</a></li>
    </ul>
  )
}
