import { useMemo, useState } from 'react'
import { MessageCircle, Phone } from 'lucide-react'
import { clsx } from 'clsx'
import type { ShopContact } from '@/types'
import { contactChoices, formatPhoneDisplay, toTelHref, toWhatsAppHref } from '@/utils/phone'

export interface ContactActionsProps {
  primaryName: string
  primaryPhone: string
  contacts: ShopContact[]
  /** Optional prefilled WhatsApp message (never sent automatically). */
  whatsappMessage?: string
  size?: 'sm' | 'md'
  className?: string
  /** Called instead of using a tel: link (used by tests / custom flows). */
  onCall?: (phone: string) => void
}

/**
 * Call + WhatsApp shortcuts for a shop's contacts.
 *
 * When a shop has several numbers the user picks one from a select. Links are
 * plain anchors with correctly encoded `tel:` / `https://wa.me/` hrefs so the
 * device hands off to the dialler or WhatsApp. The app never reports that a call
 * was placed or a message sent - it only opens the intent.
 */
export function ContactActions({
  primaryName,
  primaryPhone,
  contacts,
  whatsappMessage,
  size = 'md',
  className,
  onCall,
}: ContactActionsProps) {
  const choices = useMemo(
    () => contactChoices(primaryName, primaryPhone, contacts),
    [primaryName, primaryPhone, contacts],
  )

  const [selectedId, setSelectedId] = useState<string>(() => choices[0]?.id ?? '')

  const selected = choices.find((c) => c.id === selectedId) ?? choices[0] ?? null

  if (!selected) {
    return (
      <p className={clsx('text-xs text-ink-400', className)}>
        No phone number saved for this shop yet.
      </p>
    )
  }

  const telHref = toTelHref(selected.phone)
  const waHref = toWhatsAppHref(selected.phone, whatsappMessage)
  const btnClass = size === 'sm' ? 'btn btn-sm' : 'btn'

  return (
    <div className={clsx('flex flex-wrap items-center gap-2', className)}>
      {choices.length > 1 && (
        <label className="sr-only" htmlFor={`contact-select-${selected.id}`}>
          Choose a contact
        </label>
      )}

      {choices.length > 1 && (
        <select
          id={`contact-select-${selected.id}`}
          className="input h-10 min-h-0 w-auto max-w-[11rem] py-0 text-xs"
          value={selected.id}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {choices.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name || 'Contact'} — {formatPhoneDisplay(contact.phone)}
            </option>
          ))}
        </select>
      )}

      {telHref ? (
        <a
          href={telHref}
          className={clsx(btnClass, 'bg-brand-700 text-white hover:bg-brand-800')}
          onClick={() => onCall?.(selected.phone)}
          title={`Call ${selected.name || 'this contact'} on ${formatPhoneDisplay(selected.phone)}`}
        >
          <Phone className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          Call
        </a>
      ) : (
        <span className={clsx(btnClass, 'cursor-not-allowed bg-ink-100 text-ink-400')} title="No usable phone number">
          <Phone className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          Call
        </span>
      )}

      {waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noreferrer noopener"
          className={clsx(btnClass, 'btn-whatsapp')}
          title={`Open WhatsApp chat with ${selected.name || 'this contact'}`}
        >
          <MessageCircle className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          WhatsApp
        </a>
      ) : (
        <span className={clsx(btnClass, 'cursor-not-allowed bg-ink-100 text-ink-400')}>
          <MessageCircle className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          WhatsApp
        </span>
      )}

      {choices.length === 1 && choices[0].name && (
        <span className="text-xs text-ink-500">
          {choices[0].name} · {formatPhoneDisplay(choices[0].phone)}
        </span>
      )}
    </div>
  )
}
