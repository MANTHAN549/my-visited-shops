import { describe, expect, it } from 'vitest'
import {
  contactChoices,
  formatPhoneDisplay,
  isPhoneUsable,
  parsePhone,
  toTelHref,
  toWhatsAppHref,
} from '@/utils/phone'

describe('phone parsing and link building', () => {
  it('parses an international number with spaces and brackets', () => {
    const parsed = parsePhone('+91 98765 43210')
    expect(parsed.digits).toBe('919876543210')
    expect(parsed.international).toBe(true)
    expect(parsed.e164).toBe('+919876543210')
    expect(parsed.valid).toBe(true)
  })

  it('parses a 00 prefixed international number', () => {
    const parsed = parsePhone('0091-98765-43210')
    expect(parsed.digits).toBe('919876543210')
    expect(parsed.international).toBe(true)
  })

  it('parses a local number and keeps it usable', () => {
    const parsed = parsePhone('(987) 654-3210')
    expect(parsed.digits).toBe('9876543210')
    expect(parsed.valid).toBe(true)
  })

  it('rejects an empty or letter-only value', () => {
    expect(parsePhone('').valid).toBe(false)
    expect(parsePhone('no number').valid).toBe(false)
    expect(isPhoneUsable('call the shop')).toBe(false)
  })

  it('caps the digit count at the E.164 maximum of 15', () => {
    const parsed = parsePhone('+1 234 567 890 123 456 789')
    expect(parsed.digits.length).toBeLessThanOrEqual(15)
  })

  it('builds a tel: link with the + prefix', () => {
    expect(toTelHref('+91 98765 43210')).toBe('tel:+919876543210')
  })

  it('returns an empty tel: link for an unusable number', () => {
    expect(toTelHref('12345')).toBe('')
    expect(toTelHref(null)).toBe('')
  })

  it('builds a wa.me link without punctuation', () => {
    expect(toWhatsAppHref('+91 98765 43210')).toBe('https://wa.me/919876543210')
  })

  it('url-encodes a prefilled WhatsApp message', () => {
    const href = toWhatsAppHref('+91 98765 43210', 'Hello, I am on my way')
    expect(href).toBe('https://wa.me/919876543210?text=Hello%2C%20I%20am%20on%20my%20way')
  })

  it('returns an empty wa.me link for an unusable number', () => {
    expect(toWhatsAppHref('n/a')).toBe('')
  })

  it('formats a number for display', () => {
    expect(formatPhoneDisplay('+919876543210')).toBe('+919 876 543 210')
  })

  it('builds contact choices with the primary owner first', () => {
    const choices = contactChoices('Ramesh', '+919876543210', [
      { id: 'c1', name: 'Suresh', phone: '+919812345678' },
      { id: 'c2', name: 'No phone', phone: '' },
    ])
    expect(choices).toHaveLength(2)
    expect(choices[0].id).toBe('primary')
    expect(choices[1].name).toBe('Suresh')
  })
})
