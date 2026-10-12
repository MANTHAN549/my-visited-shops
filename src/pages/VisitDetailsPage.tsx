import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  MessageSquareText,
  Pencil,
  Store,
  Trash2,
  Wallet,
} from 'lucide-react'
import { DataState, EmptyState, PageHeader, ShopAvatar } from '@/components/common'
import { MapView } from '@/components/maps/MapView'
import { VisitDialog } from '@/components/shops/VisitDialog'
import { useConfirm, useToast } from '@/app/providers'
import { useSettings, useShop, useVisits } from '@/hooks'
import { bumpRevision } from '@/hooks'
import { deleteVisit, updateVisit } from '@/services/visitService'
import { formatDateTime, formatRelativeDay } from '@/utils/format'
import { formatPhoneDisplay } from '@/utils/phone'

/** Individual visit details: the complete saved record for one visit. */
export default function VisitDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { success, info } = useToast()
  const confirm = useConfirm()
  const { settings } = useSettings()

  const { data: visits, loading, error, locked, reload } = useVisits()
  const [dialogOpen, setDialogOpen] = useState(false)

  const visit = useMemo(() => (visits ?? []).find((item) => item.id === id) ?? null, [visits, id])
  const { data: shop } = useShop(visit?.shopId)

  // Sibling visits of the same shop, for the "other visits" list.
  const siblings = useMemo(
    () =>
      visit
        ? (visits ?? [])
            .filter((item) => item.shopId === visit.shopId && item.id !== visit.id)
            .slice(0, 6)
        : [],
    [visits, visit],
  )

  async function handleSave(values: {
    visitedAt: string
    note: string
    purpose: string
    amountSpent: string
  }) {
    if (!visit) return
    await updateVisit(visit.id, values)
    bumpRevision()
    success('Visit note updated')
    setDialogOpen(false)
  }

  async function handleDelete() {
    if (!visit) return
    const answer = await confirm({
      title: 'Delete this visit record?',
      message:
        'This note will be permanently removed. The shop and its other visit records are not affected.',
      confirmLabel: 'Delete visit record',
      tone: 'danger',
    })
    if (!answer.confirmed) return

    await deleteVisit(visit.id)
    bumpRevision()
    info('Visit record deleted')
    navigate(shop ? `/shops/${shop.id}` : '/visits')
  }

  return (
    <>
      <PageHeader
        title="Visit details"
        description="The complete saved record of one visit."
        icon={<MessageSquareText className="h-5 w-5 text-brand-700" />}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            {visit && (
              <>
                <button type="button" className="btn-secondary" onClick={() => setDialogOpen(true)}>
                  <Pencil className="h-4 w-4" />
                  Edit Note
                </button>
                <button type="button" className="btn-danger" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" />
                  Delete Visit Record
                </button>
              </>
            )}
          </>
        }
      />

      <DataState loading={loading} error={error} locked={locked} onRetry={reload}>
        {!visit ? (
          <EmptyState
            title="Visit record not found"
            description="This visit may have been deleted. Its shop and other visits are unaffected."
            action={
              <Link to="/visits" className="btn-primary btn-sm">
                Back to visit history
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-4">
              <section className="card p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <ShopAvatar
                    name={shop?.name ?? 'Shop'}
                    imageDataUrl={shop?.imageDataUrl}
                    size={56}
                    className="h-14 w-14"
                  />

                  <div className="min-w-0 flex-1">
                    {shop ? (
                      <Link
                        to={`/shops/${shop.id}`}
                        className="text-base font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                      >
                        {shop.name}
                      </Link>
                    ) : (
                      <p className="text-base font-semibold text-ink-500">Deleted shop</p>
                    )}
                    {shop?.address && <p className="text-sm text-ink-500">{shop.address}</p>}
                    {shop?.primaryOwnerName && (
                      <p className="mt-0.5 text-xs text-ink-500">
                        {shop.primaryOwnerName}
                        {shop.primaryOwnerPhone ? ` · ${formatPhoneDisplay(shop.primaryOwnerPhone)}` : ''}
                      </p>
                    )}
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-ink-200 pt-3 sm:grid-cols-3">
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs text-ink-500">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Visited
                    </dt>
                    <dd className="text-sm font-medium text-ink-800">
                      {formatDateTime(visit.visitedAt)}
                    </dd>
                    <dd className="text-xs text-ink-400">{formatRelativeDay(visit.visitedAt)}</dd>
                  </div>

                  <div>
                    <dt className="text-xs text-ink-500">Purpose</dt>
                    <dd className="text-sm font-medium text-ink-800">{visit.purpose || '—'}</dd>
                  </div>

                  <div>
                    <dt className="flex items-center gap-1.5 text-xs text-ink-500">
                      <Wallet className="h-3.5 w-3.5" />
                      Amount spent
                    </dt>
                    <dd className="text-sm font-medium text-ink-800">{visit.amountSpent || '—'}</dd>
                  </div>
                </dl>
              </section>

              <section className="card p-4">
                <h2 className="section-title">Visit note</h2>
                <p className="mt-2 text-sm whitespace-pre-line text-ink-700">
                  {visit.note || 'No note was written for this visit.'}
                </p>
              </section>

              <section className="card p-4">
                <h2 className="section-title">
                  <Clock className="h-4 w-4 text-brand-700" />
                  Record information
                </h2>
                <dl className="mt-2 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-ink-500">Record created</dt>
                    <dd className="font-medium text-ink-800">{formatDateTime(visit.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Last updated</dt>
                    <dd className="font-medium text-ink-800">{formatDateTime(visit.updatedAt)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-ink-500">Record id</dt>
                    <dd className="font-mono text-[0.6875rem] break-all text-ink-600">{visit.id}</dd>
                  </div>
                </dl>
                <p className="hint mt-3">
                  Visit records are stored separately from the shop, so this note keeps its original
                  text even after the shop is edited.
                </p>
              </section>

              {siblings.length > 0 && (
                <section className="card p-4">
                  <h2 className="section-title">
                    <Store className="h-4 w-4 text-brand-700" />
                    Other visits to this shop
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {siblings.map((item) => (
                      <li key={item.id}>
                        <Link
                          to={`/visits/${item.id}`}
                          className="flex items-start gap-2 rounded-lg border border-ink-200 p-3 hover:border-brand-300 hover:bg-ink-50"
                        >
                          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-ink-700">
                              {formatRelativeDay(item.visitedAt)}
                            </span>
                            <span className="block truncate text-xs text-ink-500">{item.note}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <div className="space-y-4">
              {shop && (
                <div className="card overflow-hidden">
                  <MapView
                    className="h-56 w-full"
                    shops={[shop]}
                    center={[shop.latitude, shop.longitude]}
                    zoom={16}
                    mapLayer={settings.mapLayer}
                    fitToShops
                  />
                  <div className="border-t border-ink-200 p-3">
                    <p className="text-xs text-ink-500">Shop location at the time of this record</p>
                    <p className="font-mono text-xs text-ink-700">
                      {shop.latitude.toFixed(5)}, {shop.longitude.toFixed(5)}
                    </p>
                    <Link to={`/shops/${shop.id}`} className="btn-secondary btn-sm mt-2 w-full">
                      <Store className="h-3.5 w-3.5" />
                      Open shop details
                    </Link>
                  </div>
                </div>
              )}

              <div className="card p-4">
                <h2 className="section-title">Quick actions</h2>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    onClick={() => setDialogOpen(true)}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit this note
                  </button>
                  {shop && (
                    <Link to={`/shops/${shop.id}`} className="btn-secondary w-full">
                      <Store className="h-4 w-4" />
                      View shop
                    </Link>
                  )}
                  <Link to="/visits" className="btn-ghost w-full">
                    <Clock className="h-4 w-4" />
                    All visit messages
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </DataState>

      <VisitDialog
        open={dialogOpen}
        shop={shop}
        visit={visit}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />
    </>
  )
}
