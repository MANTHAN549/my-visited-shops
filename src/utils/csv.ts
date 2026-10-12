/**
 * CSV helpers.
 *
 * A CSV export is deliberately a *separate, optional* feature: it is readable by
 * design, so it is NOT encrypted. The UI warns the user about this before download.
 */

/** Escape one CSV cell (RFC 4180) and neutralise spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)

  // Prevent CSV formula injection when the file is opened in Excel / Sheets.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`
  }

  if (/[",\n\r;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/** Build a CSV document from rows of values. */
export function buildCsv(header: string[], rows: Array<Array<unknown>>): string {
  const lines = [header.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))]
  // A BOM keeps Excel happy with non-ASCII shop names and notes.
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/** Minimal CSV parser used by the import path (handles quotes and escaped quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const src = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\r') {
      // handled by \n
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Trigger a browser download for a text blob. */
export function downloadTextFile(filename: string, content: string, mime = 'text/csv'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Give the browser a moment before revoking, otherwise Safari cancels the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
