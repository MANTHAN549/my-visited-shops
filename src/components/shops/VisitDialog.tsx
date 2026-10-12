import { useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, IndianRupee, MessageSquareText } from 'lucide-react'
import type { Shop, Visit } from '@/types'
import { Field, Modal, Spinner } from '@/components/common'
import { fieldErrors, visitFormSchema } from '@/utils/validation'
import { formatRelativeDay, nowIso } from '@/utils/format'

export interface VisitDialogProps {
  open: boolean
  shop: Shop | null
  /** Present when editing an existing visit note instead of adding one. */
  visit?: Visit | null
  onClose: () => void
  onSave: (values: { visitedAt: string; note: string; purpose: string; amountSpent: string }) => Promise<void>
}

/** Convert an ISO timestamp into the value format an <input type="datetime-local"> expects. */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The value from <input type="datetime-local"> is local time - convert to ISO. */
function fromLocalInputValue(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? nowIso() : date.toISOString()
}

const QUICK_NOTES = [
  'Purchased electrical items.',
  'Discussed the new order with the owner.',
  'Need to visit again next week.',
  'Owner said the required product will arrive tomorrow.',
]

/**
 * "Mark visit as done" dialog. The shop name and the current date/time are filled
 * automatically; the user only has to describe what happened.
 */
export function VisitDialog({ open, shop, visit, onClose, onSave }: VisitDialogProps) {
  const [visitedAt, setVisitedAt] = useState(() => toLocalInputValue(nowIso()))
  const [note, setNote] = useState('')
  const [purpose, setPurpose] = useState('')
  const [amountSpent, setAmountSpent] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (visit) {
      setVisitedAt(toLocalInputValue(visit.visitedAt))
      setNote(visit.note)
      setPurpose(visit.purpose)
      setAmountSpent(visit.amountSpent)
    } else {
      setVisitedAt(toLocalInputValue(nowIso()))
      setNote('')
      setPurpose('')
      setAmountSpent('')
    }
    setErrors({})
  }, [open, visit])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setErrors({})

    const parsed = visitFormSchema.safeParse({ visitedAt, note, purpose, amountSpent })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }

    setSaving(true)
    try {
      await onSave({
        visitedAt: fromLocalInputValue(parsed.data.visitedAt),
        note: parsed.data.note,
        purpose: parsed.data.purpose ?? '',
        amountSpent: parsed.data.amountSpent ?? '',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={visit ? 'Edit visit note' : 'Mark visit as done'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="visit-form" className="btn-primary" disabled={saving}>
            {saving ? <Spinner className="text-white" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? 'Saving…' : visit ? 'Update visit' : 'Save Visit'}
          </button>
        </>
      }
    >
      <form id="visit-form" onSubmit={handleSave} className="space-y-4" noValidate>
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
          <p className="text-xs font-medium text-brand-800">Shop</p>
          <p className="text-sm font-semibold text-ink-900">{shop?.name ?? '—'}</p>
          {shop?.address && <p className="mt-0.5 text-xs text-ink-600">{shop.address}</p>}
        </div>

        <Field
          label="Visit date and time"
          htmlFor="visit-datetime"
          required
          error={errors.visitedAt}
          hint={visitedAt ? `Will be saved as ${formatRelativeDay(fromLocalInputValue(visitedAt))}` : undefined}
        >
          <div className="relative">
            <CalendarClock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              id="visit-datetime"
              type="datetime-local"
              className={`input pl-9 ${errors.visitedAt ? 'input-error' : ''}`}
              value={visitedAt}
              onChange={(event) => setVisitedAt(event.target.value)}
            />
          </div>
        </Field>

        <Field
          label="Visit note / message"
          htmlFor="visit-note"
          required
          error={errors.note}
          hint="Plain text, multiple lines are fine."
        >
          <textarea
            id="visit-note"
            className={`input min-h-28 ${errors.note ? 'input-error' : ''}`}
            value={note}
            placeholder="What happened at this shop?"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        <div className="flex flex-wrap gap-1.5">
          {QUICK_NOTES.map((quick) => (
            <button
              key={quick}
              type="button"
              className="chip"
              onClick={() => setNote((current) => (current ? `${current}\n${quick}` : quick))}
            >
              <MessageSquareText className="h-3 w-3" />
              {quick.length > 34 ? `${quick.slice(0, 32)}…` : quick}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Purpose of visit (optional)" htmlFor="visit-purpose">
            <input
              id="visit-purpose"
              className="input"
              value={purpose}
              placeholder="e.g. Purchase, Enquiry, Payment"
              onChange={(event) => setPurpose(event.target.value)}
            />
          </Field>

          <Field
            label="Amount spent (optional)"
            htmlFor="visit-amount"
            error={errors.amountSpent}
            hint="Numbers only, e.g. 1250 or 1250.50"
          >
            <div className="relative">
              <IndianRupee className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                id="visit-amount"
                className={`input pl-9 ${errors.amountSpent ? 'input-error' : ''}`}
                value={amountSpent}
                inputMode="decimal"
                placeholder="1250"
                onChange={(event) => setAmountSpent(event.target.value)}
              />
            </div>
          </Field>
        </div>

        <p className="text-xs text-ink-400">
          Visit records are stored separately from the shop, so saving a new visit never overwrites
          earlier messages.
        </p>
      </form>
    </Modal>
  )
}
