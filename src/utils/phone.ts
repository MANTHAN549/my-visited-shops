import type { ShopContact } from '@/types'

/**
 * Phone number helpers.
 *
 * The application never claims to have placed a call or sent a message: it only
 * builds correctly encoded `tel:` and `https://wa.me/` links that hand control to
 * the dialler / WhatsApp client installed on the device.
 */

/** Keep digits, and remember whether the number was explicitly international. */
export interface ParsedPhone {
  /** Digits only, no `+`. Empty when the input had no usable digits. */
  digits: string
  /** True when the original input started with `+` or `00`. */
  international: boolean
  /** E.164-ish representation, e.g. `+919876543210`. Empty when no digits. */
  e164: string
  /** Whether the number looks usable for a `tel:` link. */
  valid: boolean
}

const MIN_MSISDN_DIGITS = 6
const MAX_E164_DIGITS = 15

/**
 * Normalise a free-form phone number.
 *
 * Accepts `+91 98765 43210`, `0091-98765-43210`, `(987) 654-3210`, `98765 43210`.
 * Letters are stripped (common when numbers are typed with `ext` or labels).
 */
export function parsePhone(raw: string | undefined | null): ParsedPhone {
  const input = (raw ?? '').trim()
  if (!input) {
    return { digits: '', international: false, e164: '', valid: false }
  }

  // `tel:`/`wa.me` links must not contain anything but digits (and a leading +).
  const cleaned = input.replace(/[^\d+]/g, '')

  let international = false
  let digits = cleaned

  if (digits.startsWith('+')) {
    international = true
    digits = digits.slice(1)
  } else if (digits.startsWith('00')) {
    international = true
    digits = digits.slice(2)
  }

  digits = digits.replace(/\D/g, '')

  // Strip a national trunk prefix only when we know the number is international
  // and it is long enough that the trunk digit cannot be part of the prefix.
  if (international && digits.startsWith('0') && digits.length > 11) {
    digits = digits.replace(/^0+/, '')
  }

  digits = digits.slice(0, MAX_E164_DIGITS)

  const valid = digits.length >= MIN_MSISDN_DIGITS

  return {
    digits,
    international,
    e164: digits ? `+${digits}` : '',
    valid,
  }
}

/** Build a `tel:` href. Returns an empty string when the number is unusable. */
export function toTelHref(raw: string | undefined | null): string {
  const parsed = parsePhone(raw)
  if (!parsed.valid) return ''
  return `tel:${parsed.e164}`
}

/**
 * Build a WhatsApp click-to-chat link.
 *
 * `https://wa.me/<number>` requires a full international number without `+`,
 * spaces, dashes or brackets.
 */
export function toWhatsAppHref(
  raw: string | undefined | null,
  message?: string,
): string {
  const parsed = parsePhone(raw)
  if (!parsed.valid) return ''
  const base = `https://wa.me/${parsed.digits}`
  const text = (message ?? '').trim()
  if (!text) return base
  return `${base}?text=${encodeURIComponent(text)}`
}

/** A friendly display form, e.g. `+91 98765 43210`. */
export function formatPhoneDisplay(raw: string | undefined | null): string {
  const parsed = parsePhone(raw)
  if (!parsed.digits) return (raw ?? '').trim()
  if (!parsed.international && parsed.digits.length <= 10) return parsed.digits
  const groups = parsed.digits.replace(/(\d{1,3})(?=(\d{3})+(?!\d))/g, '$1 ')
  return `+${groups}`.trim()
}

/** Validation helper used by the form layer (zod refinement also calls this). */
export function isPhoneUsable(raw: string | undefined | null): boolean {
  return parsePhone(raw).valid
}

/** Contacts that have at least one usable phone number, primary owner first. */
export function contactChoices(
  primaryName: string,
  primaryPhone: string,
  contacts: ShopContact[],
): ShopContact[] {
  const list: ShopContact[] = []
  if (isPhoneUsable(primaryPhone)) {
    list.push({ id: 'primary', name: primaryName || 'Primary owner', phone: primaryPhone, role: 'Owner' })
  }
  for (const contact of contacts ?? []) {
    if (isPhoneUsable(contact.phone)) list.push(contact)
  }
  return list
}
