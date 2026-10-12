import { Link } from 'react-router-dom'
import { CalendarClock, Eye, Pencil, Store, Trash2, Wallet } from 'lucide-react'
import type { VisitWithShop } from '@/types'
import { ShopAvatar } from '@/components/common'
import { formatDateTime, formatRelativeDay, truncate } from '@/utils/format'

export interface VisitCardProps {
  visit: VisitWithShop
  onEdit: (visit: VisitWithShop) => void
  onDelete: (visit: VisitWithShop) => void
  /** Hide the shop header when the list is already grouped by shop. */
  showShop?: boolean
}

/** One visit record ("shop message"). */
export function VisitCard({ visit, onEdit, onDelete, showShop = true }: VisitCardProps) {
  const shopName = visit.shop?.name ?? 'Deleted shop'

  return (
    <article className="card p-3">
      {showShop && (
        <div className="flex items-start gap-3">
          <ShopAvatar
            name={shopName}
            imageDataUrl={visit.shop?.imageDataUrl}
            size={40}
            className="h-10 w-10"
          />

          <div className="min-w-0 flex-1">
            {visit.shop ? (
              <Link
                to={`/shops/${visit.shop.id}`}
                className="text-sm font-semibold text-ink-900 hover:text-brand-700 hover:underline"
              >
                {shopName}
              </Link>
            ) : (
              <span className="text-sm font-semibold text-ink-500">{shopName}</span>
            )}

            {visit.shop?.address && (
              <p className="truncate text-xs text-ink-500">{visit.shop.address}</p>
            )}
          </div>

          <Link
            to={`/visits/${visit.id}`}
            className="icon-btn h-9 w-9 shrink-0"
            title="Open this visit record"
            aria-label="Open this visit record"
          >
            <Eye className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className={showShop ? 'mt-2.5 border-t border-ink-100 pt-2.5' : ''}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1 font-medium text-ink-700">
            <CalendarClock className="h-3.5 w-3.5" />
            {formatRelativeDay(visit.visitedAt)}
          </span>

          {visit.purpose && <span className="badge-neutral">{visit.purpose}</span>}

          {visit.amountSpent && (
            <span className="inline-flex items-center gap-1 badge-brand">
              <Wallet className="h-3 w-3" />
              {visit.amountSpent}
            </span>
          )}
        </div>

        <p className="mt-2 text-sm whitespace-pre-line text-ink-700">
          {truncate(visit.note, 400)}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {visit.shop && (
            <Link to={`/shops/${visit.shop.id}`} className="btn-secondary btn-sm">
              <Store className="h-3.5 w-3.5" />
              View Shop
            </Link>
          )}

          <button type="button" className="btn-secondary btn-sm" onClick={() => onEdit(visit)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit Note
          </button>

          <button
            type="button"
            className="btn-ghost btn-sm text-red-600 hover:bg-red-50"
            onClick={() => onDelete(visit)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Visit Record
          </button>

          <span className="ml-auto text-[0.6875rem] text-ink-400">
            {formatDateTime(visit.visitedAt)}
          </span>
        </div>
      </div>
    </article>
  )
}
