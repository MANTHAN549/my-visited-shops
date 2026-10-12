import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Crosshair,
  Image as ImageIcon,
  LocateFixed,
  Loader2,
  MapPin,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import type { Shop, ShopContact } from '@/types'
import { SHOP_CATEGORIES } from '@/types'
import { Field, Spinner } from '@/components/common'
import { MapView } from '@/components/maps/MapView'
import { ContactEditor } from './ContactEditor'
import {
  LocationError,
  describeAccuracy,
  getCurrentPosition,
  reverseGeocode,
} from '@/services/locationService'
import { compressImageFile, formatBytes, approximateBytes } from '@/utils/image'
import { parseTags, createId } from '@/utils/format'
import { fieldErrors, shopFormSchema } from '@/utils/validation'
import { useConfirm, useToast } from '@/app/providers'
import { useSettings, useShops } from '@/hooks'
import { findPossibleDuplicates } from '@/services/shopService'
import type { ShopInput } from '@/services/shopService'

interface FormState {
  name: string
  category: string
  address: string
  latitude: string
  longitude: string
  primaryOwnerName: string
  primaryOwnerPhone: string
  contacts: ShopContact[]
  notes: string
  tags: string
  imageDataUrl: string | null
}

function toFormState(shop?: Shop | null): FormState {
  return {
    name: shop?.name ?? '',
    category: shop?.category ?? '',
    address: shop?.address ?? '',
    latitude: shop ? String(shop.latitude) : '',
    longitude: shop ? String(shop.longitude) : '',
    primaryOwnerName: shop?.primaryOwnerName ?? '',
    primaryOwnerPhone: shop?.primaryOwnerPhone ?? '',
    contacts: shop?.contacts ?? [],
    notes: shop?.notes ?? '',
    tags: (shop?.tags ?? []).join(', '),
    imageDataUrl: shop?.imageDataUrl ?? null,
  }
}

export interface ShopFormProps {
  /** Present when editing an existing shop. */
  shop?: Shop | null
  submitLabel: string
  onSubmit: (input: ShopInput) => Promise<void>
  onCancel: () => void
}

/**
 * The single Add / Edit shop form.
 *
 * Location handling is explicit: the GPS accuracy is always shown, the marker can
 * always be dragged, and manual coordinates are always available as a fallback.
 * An approximate position is never silently substituted for a precise one.
 */
export function ShopForm({ shop, submitLabel, onSubmit, onCancel }: ShopFormProps) {
  const { settings } = useSettings()
  const { shops } = useShops()
  const { success, warning, error: toastError, info } = useToast()
  const confirm = useConfirm()

  const [values, setValues] = useState<FormState>(() => toFormState(shop))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [locating, setLocating] = useState(false)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setValues(toFormState(shop))
    setDirty(false)
  }, [shop])

  const lat = Number(values.latitude)
  const lng = Number(values.longitude)
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && values.latitude !== '' && values.longitude !== ''

  function patch(next: Partial<FormState>) {
    setValues((current) => ({ ...current, ...next }))
    setDirty(true)
  }

  /* ---------------------------- location ---------------------------- */

  async function useCurrentLocation() {
    setLocating(true)
    try {
      const position = await getCurrentPosition({ highAccuracy: true, timeout: 20_000 })
      patch({
        latitude: position.latitude.toFixed(6),
        longitude: position.longitude.toFixed(6),
      })
      setAccuracy(position.accuracy)

      const described = describeAccuracy(position.accuracy)
      if (described.tone === 'poor') {
        warning(
          'Location captured with low accuracy',
          `${described.label}. Drag the map marker to the exact spot, or tap Use Current Location again.`,
        )
      } else {
        success('Location captured', described.label)
      }

      if (settings.reverseGeocodingEnabled && !values.address) {
        void lookupAddress(position.latitude, position.longitude)
      }
    } catch (err) {
      const locationError = err as LocationError
      toastError('Could not read your location', locationError.message)
    } finally {
      setLocating(false)
    }
  }

  async function lookupAddress(latitude: number, longitude: number) {
    setGeocoding(true)
    try {
      const address = await reverseGeocode(latitude, longitude, settings.geocodingBaseUrl)
      if (address) {
        patch({ address })
        info('Address found', 'Check that it matches the shop and edit it if needed.')
      } else {
        warning('No address found', 'Please type the address manually.')
      }
    } catch (err) {
      toastError('Address lookup failed', (err as Error).message)
    } finally {
      setGeocoding(false)
    }
  }

  async function handleLookupClick() {
    if (!hasCoords) {
      warning('Set the location first', 'Use current location or enter coordinates, then look up the address.')
      return
    }

    if (!settings.reverseGeocodingEnabled) {
      const answer = await confirm({
        title: 'Send coordinates to an address provider?',
        message:
          'Looking up an address sends this shop\'s latitude and longitude to the configured geocoding service ' +
          `(${new URL(settings.geocodingBaseUrl).host}).\n\nYou can always type the address yourself instead — ` +
          'no address provider is required to save a shop.',
        confirmLabel: 'Look up address',
        cancelLabel: 'Type it myself',
      })
      if (!answer.confirmed) return
    }

    await lookupAddress(lat, lng)
  }

  /* ------------------------------ image ------------------------------ */

  async function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setImageBusy(true)
    try {
      const compressed = await compressImageFile(file)
      patch({ imageDataUrl: compressed.dataUrl })
      success('Image attached', `Resized to ${compressed.width}×${compressed.height} (${formatBytes(compressed.bytes)}).`)
    } catch (err) {
      toastError('Could not use that image', (err as Error).message)
    } finally {
      setImageBusy(false)
    }
  }

  /* ------------------------------- save ------------------------------ */

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setErrors({})

    const parsed = shopFormSchema.safeParse({
      ...values,
      tags: parseTags(values.tags),
    })

    if (!parsed.success) {
      const flat = fieldErrors(parsed.error)
      setErrors(flat)
      toastError('Please fix the highlighted fields', Object.values(flat)[0])
      return
    }

    const data = parsed.data

    // Duplicate warning - never merged automatically.
    const duplicates = findPossibleDuplicates(shops, {
      name: data.name,
      primaryOwnerPhone: data.primaryOwnerPhone,
      latitude: data.latitude,
      longitude: data.longitude,
    }, { excludeId: shop?.id })

    if (duplicates.length) {
      const answer = await confirm({
        title: 'Possible duplicate shop',
        message: `This looks like it may already be saved:\n\n${duplicates
          .map((d) => `• ${d.shop.name} — ${d.reason}`)
          .join('\n')}\n\nSave anyway? Nothing is merged automatically.`,
        confirmLabel: 'Save anyway',
        cancelLabel: 'Go back and review',
      })
      if (!answer.confirmed) return
    }

    setSaving(true)
    try {
      await onSubmit({
        name: data.name,
        category: data.category ?? '',
        address: data.address ?? '',
        latitude: data.latitude,
        longitude: data.longitude,
        primaryOwnerName: data.primaryOwnerName ?? '',
        primaryOwnerPhone: data.primaryOwnerPhone ?? '',
        contacts: data.contacts as ShopContact[],
        notes: data.notes ?? '',
        tags: parseTags(values.tags),
        imageDataUrl: values.imageDataUrl,
      })
      setDirty(false)
    } catch (err) {
      toastError('Could not save the shop', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    const answer = await confirm({
      title: 'Clear the form?',
      message: 'Everything you have typed in this form will be cleared. Nothing already saved is affected.',
      confirmLabel: 'Clear form',
      tone: 'danger',
    })
    if (!answer.confirmed) return
    setValues(toFormState(shop))
    setErrors({})
    setAccuracy(null)
    setDirty(false)
  }

  async function handleCancel() {
    if (dirty) {
      const answer = await confirm({
        title: 'Discard your changes?',
        message: 'You have unsaved changes in this form. Leave without saving?',
        confirmLabel: 'Discard changes',
        tone: 'danger',
      })
      if (!answer.confirmed) return
    }
    onCancel()
  }

  const accuracyInfo = accuracy !== null ? describeAccuracy(accuracy) : null
  const imageBytes = values.imageDataUrl ? approximateBytes(values.imageDataUrl) : 0

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(SHOP_CATEGORIES as readonly string[])
    for (const s of shops) if (s.category) set.add(s.category)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [shops])

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* -------------------------- Location -------------------------- */}
      <section className="card p-4">
        <h2 className="section-title">
          <MapPin className="h-4 w-4 text-brand-700" />
          Shop location
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          The coordinates are what makes a shop findable again. Use your current GPS position, then
          drag the marker if the reading is not exact.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={useCurrentLocation}
            disabled={locating}
          >
            {locating ? <Spinner className="text-white" /> : <LocateFixed className="h-4 w-4" />}
            {locating ? 'Reading GPS…' : 'Use Current Location'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleLookupClick}
            disabled={geocoding || !hasCoords}
            title={
              settings.reverseGeocodingEnabled
                ? 'Look up the address from the coordinates'
                : 'Asks for permission before sending coordinates'
            }
          >
            {geocoding ? <Spinner /> : <Crosshair className="h-4 w-4" />}
            Look up address
          </button>
        </div>

        {accuracyInfo && (
          <p
            className={`mt-2 text-xs ${
              accuracyInfo.tone === 'poor'
                ? 'text-amber-700'
                : accuracyInfo.tone === 'ok'
                  ? 'text-ink-600'
                  : 'text-emerald-700'
            }`}
          >
            GPS accuracy: {accuracyInfo.label}
          </p>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Latitude"
            htmlFor="shop-latitude"
            required
            error={errors.latitude}
            hint="Between -90 and 90"
          >
            <input
              id="shop-latitude"
              className={`input ${errors.latitude ? 'input-error' : ''}`}
              value={values.latitude}
              inputMode="decimal"
              placeholder="e.g. 19.076090"
              onChange={(event) => patch({ latitude: event.target.value })}
            />
          </Field>

          <Field
            label="Longitude"
            htmlFor="shop-longitude"
            required
            error={errors.longitude}
            hint="Between -180 and 180"
          >
            <input
              id="shop-longitude"
              className={`input ${errors.longitude ? 'input-error' : ''}`}
              value={values.longitude}
              inputMode="decimal"
              placeholder="e.g. 72.877426"
              onChange={(event) => patch({ longitude: event.target.value })}
            />
          </Field>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-ink-200">
          <MapView
            className="h-64 w-full"
            pickerPosition={hasCoords ? { latitude: lat, longitude: lng } : null}
            center={hasCoords ? [lat, lng] : [20.5937, 78.9629]}
            zoom={hasCoords ? 16 : 4}
            onPickerMove={({ latitude, longitude }) => {
              patch({ latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) })
              setAccuracy(null)
            }}
            onMapClick={({ latitude, longitude }) => {
              patch({ latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) })
              setAccuracy(null)
            }}
            mapLayer={settings.mapLayer}
          />
        </div>
        <p className="hint">
          Tap the map or drag the pin to fine-tune. Tap and drag the map to move around.
        </p>
      </section>

      {/* ------------------------ Shop information ------------------------ */}
      <section className="card p-4">
        <h2 className="section-title">Shop information</h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Shop name" htmlFor="shop-name" required error={errors.name}>
            <input
              id="shop-name"
              className={`input ${errors.name ? 'input-error' : ''}`}
              value={values.name}
              placeholder="e.g. Sharma Electricals"
              onChange={(event) => patch({ name: event.target.value })}
            />
          </Field>

          <Field label="Category" htmlFor="shop-category">
            <input
              id="shop-category"
              className="input"
              list="shop-category-options"
              value={values.category}
              placeholder="e.g. Electronics"
              onChange={(event) => patch({ category: event.target.value })}
            />
            <datalist id="shop-category-options">
              {categoryOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </Field>
        </div>

        <Field label="Address" htmlFor="shop-address" className="mt-3" error={errors.address}>
          <textarea
            id="shop-address"
            className={`input min-h-20 ${errors.address ? 'input-error' : ''}`}
            value={values.address}
            placeholder="Shop number, street, area, city, PIN code"
            onChange={(event) => patch({ address: event.target.value })}
          />
        </Field>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Primary owner name" htmlFor="shop-owner-name">
            <input
              id="shop-owner-name"
              className="input"
              value={values.primaryOwnerName}
              placeholder="e.g. Ramesh Kumar"
              onChange={(event) => patch({ primaryOwnerName: event.target.value })}
            />
          </Field>

          <Field
            label="Primary owner phone"
            htmlFor="shop-owner-phone"
            hint="Used for the Call and WhatsApp buttons"
          >
            <input
              id="shop-owner-phone"
              className="input"
              value={values.primaryOwnerPhone}
              inputMode="tel"
              placeholder="+91 98765 43210"
              onChange={(event) => patch({ primaryOwnerPhone: event.target.value })}
            />
          </Field>
        </div>

        <Field label="Tags" htmlFor="shop-tags" className="mt-3" hint="Comma separated, e.g. wholesale, hardware, regular">
          <input
            id="shop-tags"
            className="input"
            value={values.tags}
            placeholder="wholesale, hardware"
            onChange={(event) => patch({ tags: event.target.value })}
          />
        </Field>

        <Field label="Notes" htmlFor="shop-notes" className="mt-3">
          <textarea
            id="shop-notes"
            className="input min-h-24"
            value={values.notes}
            placeholder="Anything worth remembering about this shop"
            onChange={(event) => patch({ notes: event.target.value })}
          />
        </Field>
      </section>

      {/* ------------------------------ Image ------------------------------ */}
      <section className="card p-4">
        <h2 className="section-title">
          <ImageIcon className="h-4 w-4 text-brand-700" />
          Shop image or logo
        </h2>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {values.imageDataUrl ? (
            <img
              src={values.imageDataUrl}
              alt="Selected shop"
              className="h-20 w-20 rounded-lg border border-ink-200 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-ink-300 bg-ink-50 text-ink-400">
              <ImageIcon className="h-7 w-7" />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={imageBusy}
            >
              {imageBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              {values.imageDataUrl ? 'Replace image' : 'Choose image'}
            </button>

            {values.imageDataUrl && (
              <button
                type="button"
                className="btn-ghost text-red-600 hover:bg-red-50"
                onClick={() => patch({ imageDataUrl: null })}
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>

        <p className="hint">
          Stored on this device only. Images are resized to a maximum of 1024 px before saving
          {imageBytes > 0 ? ` (current: ${formatBytes(imageBytes)})` : ''}.
        </p>
      </section>

      {/* ---------------------------- Contacts ---------------------------- */}
      <section className="card p-4">
        <h2 className="section-title">Additional owners &amp; contacts</h2>
        <p className="mt-1 text-xs text-ink-500">
          Add as many contacts as you need. Each one gets its own Call and WhatsApp shortcut.
        </p>
        <div className="mt-3">
          <ContactEditor contacts={values.contacts} onChange={(contacts) => patch({ contacts })} />
        </div>
      </section>

      {/* ----------------------------- Actions ----------------------------- */}
      <div className="sticky bottom-[4.25rem] z-10 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-white/95 p-3 shadow-[var(--shadow-card)] backdrop-blur md:bottom-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Spinner className="text-white" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : submitLabel}
        </button>

        <button type="button" className="btn-secondary" onClick={handleReset} disabled={saving}>
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>

        <button type="button" className="btn-ghost" onClick={handleCancel} disabled={saving}>
          <X className="h-4 w-4" />
          Cancel
        </button>

        {dirty && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Unsaved changes
          </span>
        )}
      </div>
    </form>
  )
}

/** Helper so pages can build an empty form state for a brand new shop. */
export function emptyShopFormState() {
  return toFormState(null)
}

export { createId }
