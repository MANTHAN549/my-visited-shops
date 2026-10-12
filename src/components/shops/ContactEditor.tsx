import { Plus, Trash2 } from 'lucide-react'
import type { ContactRole, ShopContact } from '@/types'
import { CONTACT_ROLES } from '@/types'
import { createId } from '@/utils/format'
import { isPhoneUsable } from '@/utils/phone'
import { Field } from '@/components/common'

export interface ContactEditorProps {
  contacts: ShopContact[]
  onChange: (contacts: ShopContact[]) => void
  /** Maximum number of additional contacts (keeps the record small). */
  max?: number
}

/** Add / edit / remove additional owner, manager or staff contacts. */
export function ContactEditor({ contacts, onChange, max = 20 }: ContactEditorProps) {
  function update(id: string, patch: Partial<ShopContact>) {
    onChange(contacts.map((contact) => (contact.id === id ? { ...contact, ...patch } : contact)))
  }

  function add() {
    if (contacts.length >= max) return
    onChange([
      ...contacts,
      { id: createId('contact'), name: '', phone: '', role: 'Manager', notes: '' },
    ])
  }

  function remove(id: string) {
    onChange(contacts.filter((contact) => contact.id !== id))
  }

  return (
    <div className="space-y-3">
      {contacts.length === 0 && (
        <p className="rounded-lg border border-dashed border-ink-300 bg-ink-50 p-3 text-xs text-ink-500">
          No additional contacts yet. Add the manager, staff or a second owner so you always have a
          number to reach.
        </p>
      )}

      {contacts.map((contact, index) => {
        const phoneInvalid = Boolean(contact.phone) && !isPhoneUsable(contact.phone)

        return (
          <fieldset key={contact.id} className="rounded-lg border border-ink-200 bg-white p-3">
            <legend className="px-1 text-xs font-semibold text-ink-500">
              Contact {index + 1}
            </legend>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Contact name" htmlFor={`contact-name-${contact.id}`}>
                <input
                  id={`contact-name-${contact.id}`}
                  className="input"
                  value={contact.name}
                  placeholder="e.g. Ramesh Kumar"
                  onChange={(event) => update(contact.id, { name: event.target.value })}
                />
              </Field>

              <Field label="Role" htmlFor={`contact-role-${contact.id}`}>
                <select
                  id={`contact-role-${contact.id}`}
                  className="input"
                  value={contact.role ?? 'Owner'}
                  onChange={(event) =>
                    update(contact.id, { role: event.target.value as ContactRole })
                  }
                >
                  {CONTACT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Phone number"
                htmlFor={`contact-phone-${contact.id}`}
                error={phoneInvalid ? 'This does not look like a usable phone number' : undefined}
                hint="Include the country code so Call and WhatsApp work, e.g. +91 98765 43210"
              >
                <input
                  id={`contact-phone-${contact.id}`}
                  className={`input ${phoneInvalid ? 'input-error' : ''}`}
                  value={contact.phone}
                  inputMode="tel"
                  placeholder="+91 98765 43210"
                  onChange={(event) => update(contact.id, { phone: event.target.value })}
                />
              </Field>

              <Field label="Notes" htmlFor={`contact-notes-${contact.id}`}>
                <input
                  id={`contact-notes-${contact.id}`}
                  className="input"
                  value={contact.notes ?? ''}
                  placeholder="e.g. speaks Hindi, available after 10 am"
                  onChange={(event) => update(contact.id, { notes: event.target.value })}
                />
              </Field>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="btn-ghost btn-sm text-red-600 hover:bg-red-50"
                onClick={() => remove(contact.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove contact
              </button>
            </div>
          </fieldset>
        )
      })}

      <button
        type="button"
        className="btn-secondary w-full"
        onClick={add}
        disabled={contacts.length >= max}
      >
        <Plus className="h-4 w-4" />
        Add another contact
      </button>

      {contacts.length >= max && (
        <p className="hint">You have reached the maximum of {max} additional contacts.</p>
      )}
    </div>
  )
}
