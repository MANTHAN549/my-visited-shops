import { describe, expect, it } from 'vitest'
import { buildCsv, csvCell, parseCsv } from '@/utils/csv'
import {
  daysBetween,
  formatDistance,
  formatDuration,
  haversineMeters,
  initials,
  parseTags,
  pluralize,
  toDateKey,
} from '@/utils/format'
import { formatPhoneDisplay } from '@/utils/phone'
import { fieldErrors, shopFormSchema, visitFormSchema } from '@/utils/validation'

describe('CSV export', () => {
  it('quotes cells containing commas, quotes and newlines', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('has, comma')).toBe('"has, comma"')
    expect(csvCell('has "quotes"')).toBe('"has ""quotes"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
  })

  it('neutralises spreadsheet formula injection', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)")
    expect(csvCell('+1234')).toBe("'+1234")
    expect(csvCell('-1234')).toBe("'-1234")
    expect(csvCell('@import')).toBe("'@import")
  })

  it('builds a document with a BOM, a header and CRLF rows', () => {
    const csv = buildCsv(['Shop', 'Note'], [['Sharma', 'Bought wire']])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('Shop,Note')
    expect(csv).toContain('Sharma,Bought wire')
    expect(csv).toContain('\r\n')
  })

  it('round-trips through the parser, including quoted values', () => {
    const csv = buildCsv(['A', 'B'], [['has, comma', 'has "quotes"']])
    const rows = parseCsv(csv)
    expect(rows[0]).toEqual(['A', 'B'])
    expect(rows[1]).toEqual(['has, comma', 'has "quotes"'])
  })
})

describe('formatting helpers', () => {
  it('formats distances and durations', () => {
    expect(formatDistance(320)).toBe('320 m')
    expect(formatDistance(2400)).toBe('2.40 km')
    expect(formatDistance(24600)).toBe('24.6 km')
    expect(formatDuration(480)).toBe('8 min')
    expect(formatDuration(3900)).toBe('1 h 05 min')
  })

  it('pluralises correctly', () => {
    expect(pluralize(1, 'shop')).toBe('1 shop')
    expect(pluralize(3, 'shop')).toBe('3 shops')
    expect(pluralize(1, 'visit record')).toBe('1 visit record')
  })

  it('derives initials and tag lists', () => {
    expect(initials('Sharma Electricals')).toBe('SE')
    expect(initials('')).toBe('?')
    expect(parseTags('hardware, wholesale , hardware')).toEqual(['hardware', 'wholesale'])
  })

  it('computes a local date key', () => {
    expect(toDateKey('2026-10-11T09:30:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('counts days between two dates', () => {
    expect(daysBetween('2026-01-01T00:00:00.000Z', '2026-01-11T00:00:00.000Z')).toBe(10)
  })

  it('measures a known distance accurately', () => {
    // Pune to Mumbai is roughly 120 km as the crow flies.
    const meters = haversineMeters(
      { latitude: 18.5204, longitude: 73.8567 },
      { latitude: 19.076, longitude: 72.8777 },
    )
    expect(meters / 1000).toBeGreaterThan(110)
    expect(meters / 1000).toBeLessThan(130)
  })

  it('reports zero distance for identical coordinates', () => {
    expect(
      haversineMeters({ latitude: 1, longitude: 1 }, { latitude: 1, longitude: 1 }),
    ).toBe(0)
  })

  it('delegates phone display formatting', () => {
    expect(formatPhoneDisplay('+919876543210')).toBe('+919 876 543 210')
  })
})

describe('shop form validation', () => {
  const valid = {
    name: 'Sharma Electricals',
    category: 'Electronics',
    address: '12 MG Road',
    latitude: 18.5204,
    longitude: 73.8567,
    primaryOwnerName: 'Ramesh',
    primaryOwnerPhone: '+91 98765 43210',
    contacts: [],
    notes: '',
    tags: [],
  }

  it('accepts a valid shop', () => {
    expect(shopFormSchema.safeParse(valid).success).toBe(true)
  })

  it('requires a shop name', () => {
    const result = shopFormSchema.safeParse({ ...valid, name: '   ' })
    expect(result.success).toBe(false)
    if (!result.success) expect(fieldErrors(result.error).name).toMatch(/required/i)
  })

  it('rejects an out-of-range latitude', () => {
    const result = shopFormSchema.safeParse({ ...valid, latitude: 91 })
    expect(result.success).toBe(false)
    if (!result.success) expect(fieldErrors(result.error).latitude).toMatch(/-90 and 90/)
  })

  it('rejects an out-of-range longitude', () => {
    const result = shopFormSchema.safeParse({ ...valid, longitude: -181 })
    expect(result.success).toBe(false)
    if (!result.success) expect(fieldErrors(result.error).longitude).toMatch(/-180 and 180/)
  })

  it('rejects a non-numeric coordinate', () => {
    const result = shopFormSchema.safeParse({ ...valid, latitude: 'not a number' })
    expect(result.success).toBe(false)
  })

  it('coerces numeric strings from the form inputs', () => {
    const result = shopFormSchema.safeParse({ ...valid, latitude: '18.5204', longitude: '73.8567' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.latitude).toBeCloseTo(18.5204)
  })

  it('accepts coordinates at the exact boundary values', () => {
    expect(shopFormSchema.safeParse({ ...valid, latitude: 90, longitude: 180 }).success).toBe(true)
    expect(shopFormSchema.safeParse({ ...valid, latitude: -90, longitude: -180 }).success).toBe(true)
  })

  it('rejects a name longer than 120 characters', () => {
    const result = shopFormSchema.safeParse({ ...valid, name: 'a'.repeat(121) })
    expect(result.success).toBe(false)
  })
})

describe('visit form validation', () => {
  const valid = { visitedAt: '2026-10-11T10:00', note: 'Bought wire', purpose: '', amountSpent: '' }

  it('accepts a valid visit', () => {
    expect(visitFormSchema.safeParse(valid).success).toBe(true)
  })

  it('requires a note', () => {
    const result = visitFormSchema.safeParse({ ...valid, note: '  ' })
    expect(result.success).toBe(false)
    if (!result.success) expect(fieldErrors(result.error).note).toMatch(/note/i)
  })

  it('accepts a multi-line note', () => {
    expect(
      visitFormSchema.safeParse({ ...valid, note: 'Line one\nLine two\nLine three' }).success,
    ).toBe(true)
  })

  it('accepts an empty or numeric amount', () => {
    expect(visitFormSchema.safeParse({ ...valid, amountSpent: '' }).success).toBe(true)
    expect(visitFormSchema.safeParse({ ...valid, amountSpent: '1250' }).success).toBe(true)
    expect(visitFormSchema.safeParse({ ...valid, amountSpent: '1250.50' }).success).toBe(true)
  })

  it('rejects a non-numeric amount', () => {
    expect(visitFormSchema.safeParse({ ...valid, amountSpent: 'about 500' }).success).toBe(false)
  })
})
