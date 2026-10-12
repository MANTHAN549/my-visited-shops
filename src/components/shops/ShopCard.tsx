import { Link } from 'react-router-dom'
import { Clock, Eye, MapPin, Navigation, Pencil, Tag, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import type { Shop } from '@/types'
import { ShopAvatar } from '@/components/common'
import { formatDate, formatDistance, truncate } from '@/utils/format'
import { formatPhoneDisplay } from '@/utils/phone'
import { ContactActions } from './ContactActions'

export interface ShopCardProps {
  shop: Shop
  variant?: 'grid' | 'list'
  /** Distance from the user's current position, when it is known. */
  distanceMeters?: number | null
  onDirections?: (shopId: string) => void
  onDelete?: (shopId: string) => void
  className?: string
}

/** One shop card. Used on the dashboard sections and the All Shops page. */
export function ShopCard({
  shop,
  variant = 'grid',
  distanceMeters = null,
  onDirections,
  onDelete,
  className,
}: ShopCardProps) {
  const visited = (shop.visitCount ?? 0) > 0 || Boolean(shop.lastVisitedAt)

  return (
    <article
      className={clsx(
        'card card-hover flex gap-3 p-3',
        variant === 'grid' ? 'flex-col' : 'items-start',
        className,
      )}
    >
      <Link
        to={`/shops/${shop.id}`}
        className={clsx(
          'flex min-w-0 flex-1 gap-3',
          variant === 'grid' ? 'items-start' : 'items-center',
        )}
        aria-label={`Open details for ${shop.name}`}
      >
        <ShopAvatar
          name={shop.name}
          imageDataUrl={shop.imageDataUrl}
          size={variant === 'grid' ? 56 : 64}
          className={variant === 'grid' ? 'h-14 w-14' : 'h-16 w-16'}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-ink-900">{shop.name}</h3>
            {visited ? (
              <span className="badge-brand shrink-0">Visited</span>
            ) : (
              <span className="badge-neutral shrink-0">New</span>
            )}
          </div>

          {shop.category && (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-brand-700">
              <Tag className="h-3 w-3" />
              {shop.category}
            </p>
          )}

          <p className="mt-1 flex items-start gap-1 text-xs text-ink-500">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-2-safe">
              {shop.address || `${shop.latitude.toFixed(4)}, ${shop.longitude.toFixed(4)}`}
            </span>
          </p>

          {shop.primaryOwnerName && (
            <p className="mt-1 truncate text-xs text-ink-600">
              {shop.primaryOwnerName}
              {shop.primaryOwnerPhone ? ` · ${formatPhoneDisplay(shop.primaryOwnerPhone)}` : ''}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-ink-400">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {visited ? `Last: ${formatDate(shop.lastVisitedAt)}` : 'Not visited yet'}
            </span>
            <span>
              {shop.visitCount ?? 0} visit{(shop.visitCount ?? 0) === 1 ? '' : 's'}
            </span>
            {distanceMeters !== null && Number.isFinite(distanceMeters) && (
              <span className="font-medium text-ink-500">{formatDistance(distanceMeters)} away</span>
            )}
          </div>

          {shop.notes && variant === 'list' && (
            <p className="mt-1.5 text-xs text-ink-400">{truncate(shop.notes, 140)}</p>
          )}
        </div>
      </Link>

      <div
        className={clsx(
          'flex flex-wrap items-center gap-1.5',
          variant === 'grid' ? 'border-t border-ink-100 pt-2.5' : 'shrink-0 flex-col items-stretch',
        )}
      >
        <ContactActions
          primaryName={shop.primaryOwnerName}
          primaryPhone={shop.primaryOwnerPhone}
          contacts={shop.contacts}
          size="sm"
        />

        {onDirections && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => onDirections(shop.id)}
            title="Get directions to this shop"
          >
            <Navigation className="h-3.5 w-3.5" />
            Directions
          </button>
        )}

        <Link to={`/shops/${shop.id}`} className="btn-secondary btn-sm">
          <Eye className="h-3.5 w-3.5" />
          View Details
        </Link>

        <Link to={`/shops/${shop.id}/edit`} className="btn-ghost btn-sm" title="Edit this shop">
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Link>

        {onDelete && (
          <button
            type="button"
            className="btn-ghost btn-sm text-red-600 hover:bg-red-50"
            onClick={() => onDelete(shop.id)}
            title="Delete this shop"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        )}
      </div>
    </article>
  )
}
