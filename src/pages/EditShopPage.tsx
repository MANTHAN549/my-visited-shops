import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'
import { DataState, EmptyState, PageHeader } from '@/components/common'
import { ShopForm } from '@/components/shops/ShopForm'
import { updateShop, type ShopInput } from '@/services/shopService'
import { useShop } from '@/hooks'
import { bumpRevision } from '@/hooks'
import { useToast } from '@/app/providers'
import { Link } from 'react-router-dom'

/**
 * Edit Shop page.
 *
 * Editing rewrites only the shop record; visit records are stored separately and
 * are never touched, so history survives every edit.
 */
export default function EditShopPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { success } = useToast()
  const { data: shop, loading, error, locked, reload } = useShop(id)

  async function handleSubmit(input: ShopInput) {
    if (!id) return
    const updated = await updateShop(id, input)
    bumpRevision()
    success('Changes saved', `${updated.name} was updated. Its visit history is unchanged.`)
    navigate(`/shops/${id}`)
  }

  return (
    <>
      <PageHeader
        title="Edit Shop"
        description="Update the details, coordinates, image or contacts. Visit history is never affected by an edit."
        icon={<Pencil className="h-5 w-5 text-brand-700" />}
        actions={
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        }
      />

      <DataState loading={loading} error={error} locked={locked} onRetry={reload}>
        {!shop ? (
          <EmptyState
            title="Shop not found"
            description="This shop may have been deleted. Nothing can be edited."
            action={
              <Link to="/shops" className="btn-primary btn-sm">
                Back to all shops
              </Link>
            }
          />
        ) : (
          <ShopForm
            shop={shop}
            submitLabel="Save Changes"
            onSubmit={handleSubmit}
            onCancel={() => navigate(`/shops/${shop.id}`)}
          />
        )}
      </DataState>
    </>
  )
}
