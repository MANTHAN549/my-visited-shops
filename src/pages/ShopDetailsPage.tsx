import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  Tag,
  Trash2,
  User,
} from 'lucide-react'
import {
  DataState,
  EmptyState,
  PageHeader,
  ShopAvatar,
} from '@/components/common'
import { MapView } from '@/components/maps/MapView'
import { ContactActions } from '@/components/shops/ContactActions'
import { VisitDialog } from '@/components/shops/VisitDialog'
import { VisitCard } from '@/components/visits/VisitCard'
import { useConfirm, useToast } from '@/app/providers'
import { useSettings, useShop, useVisits } from '@/hooks'
import { bumpRevision } from '@/hooks'
import { deleteShop } from '@/services/shopService'
import { createVisit, deleteVisit, updateVisit } from '@/services/visitService'
import type { Visit, VisitWithShop } from '@/types'
import { formatCoords, formatDate, formatDateTime } from '@/utils/format'
import { formatPhoneDisplay, toWhatsAppHref } from '@/utils/phone'

/** Shop details: everything stored about one shop, plus its visit history. */
export default function ShopDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { success, info } = useToast()
  const confirm = useConfirm()
  const { settings } = useSettings()

  const { data: shop, loading, error, locked, reload } = useShop(id)
  const { data: allVisits, loading: visitsLoading } = useVisits()

  const [visitDialogOpen, setVisitDialogOpen] = useState(false)
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null)

  const shopVisits = useMemo(
    () => (allVisits ?? []).filter((visit) => visit.shopId === id),
    [allVisits, id],
  )

  async function handleSaveVisit(values: {
    visitedAt: string
    note: string
    purpose: string
    amountSpent: string
  }) {
    if (!id) return

    if (editingVisit) {
      await updateVisit(editingVisit.id, values)
      bumpRevision()
      success('Visit note updated')
      setEditingVisit(null)
      setVisitDialogOpen(false)
      return
    }

    await createVisit({ shopId: id, ...values })
    bumpRevision()
    success(
      'Visit saved',
      'The visit was recorded with its date, time and note. Earlier visit messages were not changed.',
    )
    setVisitDialogOpen(false)
  }

  async function handleDeleteVisit(visit: VisitWithShop) {
    const answer = await confirm({
      title: 'Delete this visit record?',
      message:
        'Only this visit note will be deleted. The shop itself and its other visit records are not affected.',
      confirmLabel: 'Delete visit record',
      tone: 'danger',
    })
    if (!answer.confirmed) return

    await deleteVisit(visit.id)
    bumpRevision()
    info('Visit record deleted')
  }

  async function handleDeleteShop() {
    if (!shop) return

    const answer = await confirm({
      title: `Delete ${shop.name}?`,
      message:
        `This removes the shop, its coordinates and its contacts from the local database file.\n\n` +
        `This shop currently has ${shop.visitCount ?? 0} visit record${(shop.visitCount ?? 0) === 1 ? '' : 's'}.\n\n` +
        'Choose below whether those visit records should be deleted as well. You will be asked to confirm once more.',
      confirmLabel: 'Continue',
      tone: 'danger',
      checkbox: {
        label: 'Also delete this shopâ€™s visit history',
        defaultChecked: true,
        hint: 'If you leave this unchecked, the visit notes are kept but will no longer be linked to a shop.',
      },
    })
    if (!answer.confirmed) return

    const finalCheck = await confirm({
      title: 'This cannot be undone',
      message: answer.checked
        ? `â€œ${shop.name}â€ and all ${shop.visitCount ?? 0} of its visit records will be permanently removed from the local database file.`
        : `â€œ${shop.name}â€ will be permanently removed. Its ${shop.visitCount ?? 0} visit record(s) will be kept but unlinked.`,
      confirmLabel: 'Delete permanently',
      tone: 'danger',
    })
    if (!finalCheck.confirmed) return

    await deleteShop(shop.id, answer.checked)
    bumpRevision()
    info('Shop deleted', answer.checked ? 'Its visit records were deleted too.' : 'Visit records were kept.')
    navigate('/shops')
  }

  async function handleCopyCoords() {
    if (!shop) return
    const text = formatCoords(shop.latitude, shop.longitude)
    try {
      await navigator.clipboard.writeText(text)
      success('Coordinates copied', text)
    } catch {
      info('Copy not available', `Coordinates: ${text}`)
    }
  }

  return (
    <>
      <PageHeader
        title={shop?.name ?? 'Shop details'}
        description={shop?.category || undefined}
        icon={<MapPin className="h-5 w-5 text-brand-700" />}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            {shop && (
              <>
                <Link to={`/shops/${shop.id}/edit`} className="btn-secondary">
                  <Pencil className="h-4 w-4" />
                  Edit Shop
                </Link>
                <button type="button" className="btn-danger" onClick={handleDeleteShop}>
                  <Trash2 className="h-4 w-4" />
                  Delete Shop
                </button>
              </>
            )}
          </>
        }
      />

      <DataState loading={loading} error={error} locked={locked} onRetry={reload}>
        {!shop ? (
          <EmptyState
            title="Shop not found"
            description="This shop may have been deleted, or the link is out of date."
            action={
              <Link to="/shops" className="btn-primary btn-sm">
                Back to all shops
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            {/* ------------------------------- Main column ------------------------------- */}
            <div className="space-y-4">
              <section className="card p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <ShopAvatar
                    name={shop.name}
                    imageDataUrl={shop.imageDataUrl}
                    size={96}
                    className="h-24 w-24"
                  />

                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-ink-900">{shop.name}</h2>

                    {shop.category && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-brand-700">
                        <Tag className="h-3.5 w-3.5" />
                        {shop.category}
                      </p>
                    )}

                    <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-600">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                      <span>{shop.address || 'No address saved'}</span>
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2 py-1 font-mono hover:bg-ink-200"
                        onClick={handleCopyCoords}
                        title="Copy coordinates"
                      >
                        <Copy className="h-3 w-3" />
                        {formatCoords(shop.latitude, shop.longitude)}
                      </button>
                    </div>

                    {(shop.tags ?? []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {shop.tags.map((tag) => (
                          <span key={tag} className="badge-brand">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-200 pt-3 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-ink-500">Date added</p>
                    <p className="text-sm font-medium text-ink-800">{formatDate(shop.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">Last visit</p>
                    <p className="text-sm font-medium text-ink-800">
                      {shop.lastVisitedAt ? formatDateTime(shop.lastVisitedAt) : 'Never'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">Total visits</p>
                    <p className="text-sm font-medium text-ink-800">{shop.visitCount ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">Last updated</p>
                    <p className="text-sm font-medium text-ink-800">{formatDate(shop.updatedAt)}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-200 pt-3">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setEditingVisit(null)
                      setVisitDialogOpen(true)
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark Visit as Done
                  </button>

                  <Link to={`/directions/${shop.id}`} className="btn-secondary">
                    <Navigation className="h-4 w-4" />
                    Get Directions
                  </Link>

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}&travelmode=driving`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="btn-secondary"
                  >
                    Start Navigation
                  </a>

                  <a
                    href={`geo:${shop.latitude},${shop.longitude}?q=${shop.latitude},${shop.longitude}(${encodeURIComponent(shop.name)})`}
                    className="btn-ghost"
                    title="Open in your phone's map application"
                  >
                    Open in map app
                  </a>
                </div>
              </section>

              {/* --------------------------------- Contacts --------------------------------- */}
              <section className="card p-4">
                <h2 className="section-title">
                  <Phone className="h-4 w-4 text-brand-700" />
                  Contacts
                </h2>

                <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900">
                        {shop.primaryOwnerName || 'Primary owner'}
                      </p>
                      <p className="text-xs text-ink-500">
                        {shop.primaryOwnerPhone
                          ? formatPhoneDisplay(shop.primaryOwnerPhone)
                          : 'No phone number saved'}
                      </p>
                    </div>
                    <span className="badge-brand">Primary</span>
                  </div>

                  <ContactActions
                    className="mt-3"
                    primaryName={shop.primaryOwnerName}
                    primaryPhone={shop.primaryOwnerPhone}
                    contacts={shop.contacts}
                    whatsappMessage={`Hello${shop.primaryOwnerName ? ` ${shop.primaryOwnerName}` : ''}, regarding ${shop.name}`}
                  />
                </div>

                {(shop.contacts ?? []).length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {shop.contacts.map((contact) => (
                      <li key={contact.id} className="rounded-lg border border-ink-200 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                              <User className="h-3.5 w-3.5 text-ink-400" />
                              {contact.name || 'Unnamed contact'}
                            </p>
                            <p className="text-xs text-ink-500">
                              {contact.role ?? 'Contact'}
                              {contact.phone ? ` Â· ${formatPhoneDisplay(contact.phone)}` : ''}
                            </p>
                            {contact.notes && (
                              <p className="mt-0.5 text-xs text-ink-400">{contact.notes}</p>
                            )}
                          </div>

                          <div className="flex gap-1.5">
                            {contact.phone && (
                              <>
                                <a
                                  href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
                                  className="btn-secondary btn-sm"
                                >
                                  <Phone className="h-3.5 w-3.5" />
                                  Call
                                </a>
                                <a
                                  href={toWhatsAppHref(contact.phone) || '#'}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="btn-whatsapp btn-sm"
                                >
                                  WhatsApp
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="hint mt-3">
                  Call and WhatsApp open the dialler and the WhatsApp app with the number filled in.
                  Nothing is dialled or sent by this app.
                </p>
              </section>

              {/* ---------------------------------- Notes ---------------------------------- */}
              {shop.notes && (
                <section className="card p-4">
                  <h2 className="section-title">Notes</h2>
                  <p className="mt-2 text-sm whitespace-pre-line text-ink-700">{shop.notes}</p>
                </section>
              )}

              {/* ------------------------------ Visit history ------------------------------ */}
              <section className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="section-title">
                    <Clock className="h-4 w-4 text-brand-700" />
                    Visit history ({shopVisits.length})
                  </h2>

                  {shopVisits.length > 0 && (
                    <Link to={`/visits?shop=${shop.id}`} className="link text-xs">
                      Open in Shop Messages
                    </Link>
                  )}
                </div>

                <DataState
                  loading={visitsLoading}
                  error={null}
                  empty={shopVisits.length === 0}
                  emptyState={
                    <EmptyState
                      icon={<CalendarPlus className="h-6 w-6" />}
                      title="No visits recorded for this shop"
                      description="Use â€œMark Visit as Doneâ€ to keep a dated note of what you bought or discussed."
                      action={
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => {
                            setEditingVisit(null)
                            setVisitDialogOpen(true)
                          }}
                        >
                          Mark Visit as Done
                        </button>
                      }
                      className="mt-3"
                    />
                  }
                >
                  <div className="mt-3 space-y-3">
                    {shopVisits.map((visit) => (
                      <VisitCard
                        key={visit.id}
                        visit={visit}
                        showShop={false}
                        onEdit={(target) => {
                          setEditingVisit(target)
                          setVisitDialogOpen(true)
                        }}
                        onDelete={handleDeleteVisit}
                      />
                    ))}
                  </div>
                </DataState>
              </section>
            </div>

            {/* ------------------------------- Side column ------------------------------- */}
            <div className="space-y-4">
              <div className="card overflow-hidden">
                <MapView
                  className="h-64 w-full"
                  shops={[shop]}
                  center={[shop.latitude, shop.longitude]}
                  zoom={16}
                  mapLayer={settings.mapLayer}
                  fitToShops
                />
                <div className="border-t border-ink-200 p-3">
                  <p className="font-mono text-xs text-ink-600">
                    {formatCoords(shop.latitude, shop.longitude)}
                  </p>
                  <Link to={`/directions/${shop.id}`} className="btn-primary btn-sm mt-2 w-full">
                    <Navigation className="h-3.5 w-3.5" />
                    Open full-screen directions
                  </Link>
                </div>
              </div>

              <div className="card p-4">
                <h2 className="section-title">
                  <Edit3 className="h-4 w-4 text-brand-700" />
                  Quick actions
                </h2>
                <div className="mt-3 flex flex-col gap-2">
                  <Link to={`/shops/${shop.id}/edit`} className="btn-secondary w-full">
                    <Pencil className="h-4 w-4" />
                    Edit shop details
                  </Link>
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    onClick={() => {
                      setEditingVisit(null)
                      setVisitDialogOpen(true)
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark visit as done
                  </button>
                  <Link to={`/visits?shop=${shop.id}`} className="btn-secondary w-full">
                    <Clock className="h-4 w-4" />
                    View all visit messages
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </DataState>

      <VisitDialog
        open={visitDialogOpen}
        shop={shop}
        visit={editingVisit}
        onClose={() => {
          setVisitDialogOpen(false)
          setEditingVisit(null)
        }}
        onSave={handleSaveVisit}
      />
    </>
  )
}

