import { ExternalLink, Navigation, Phone, Store } from 'lucide-react'
import type { Shop } from '@/types'
import { formatDate } from '@/utils/format'
import { formatPhoneDisplay, toTelHref } from '@/utils/phone'

/**
 * Preview card rendered inside a Leaflet marker popup.
 *
 * It is mounted in its own React root, so it must NOT use router hooks
 * (`useNavigate`, `Link`); navigation is delegated to callbacks supplied by the
 * page that owns the map.
 */
export function ShopPopupCard({
  shop,
  onOpenDetails,
  onDirections,
}: {
  shop: Shop
  onOpenDetails: (shopId: string) => void
  onDirections: (shopId: string) => void
}) {
  const telHref = toTelHref(shop.primaryOwnerPhone)

  return (
    <div className="w-[17rem] overflow-hidden bg-white">
      {shop.imageDataUrl ? (
        <img src={shop.imageDataUrl} alt={shop.name} className="h-24 w-full object-cover" />
      ) : (
        <div className="flex h-16 w-full items-center justify-center bg-brand-50 text-brand-700">
          <Store className="h-6 w-6" />
        </div>
      )}

      <div className="p-3">
        <p className="text-sm font-semibold text-ink-900">{shop.name}</p>
        {shop.category && <p className="mt-0.5 text-xs text-brand-700">{shop.category}</p>}
        {shop.address && <p className="mt-1 text-xs text-ink-500">{shop.address}</p>}

        {shop.primaryOwnerName && (
          <p className="mt-1.5 text-xs text-ink-600">
            Owner: <span className="font-medium">{shop.primaryOwnerName}</span>
          </p>
        )}
        {shop.primaryOwnerPhone && (
          <p className="text-xs text-ink-500">{formatPhoneDisplay(shop.primaryOwnerPhone)}</p>
        )}

        <p className="mt-1.5 text-[0.6875rem] text-ink-400">
          Last visit: {formatDate(shop.lastVisitedAt)} · {shop.visitCount ?? 0} visit
          {(shop.visitCount ?? 0) === 1 ? '' : 's'}
        </p>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => onOpenDetails(shop.id)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Details
          </button>

          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => onDirections(shop.id)}
          >
            <Navigation className="h-3.5 w-3.5" />
            Directions
          </button>

          {telHref && (
            <a href={telHref} className="btn-secondary btn-sm" title="Call the owner">
              <Phone className="h-3.5 w-3.5" />
              Call
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
