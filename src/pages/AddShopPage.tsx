import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { PageHeader } from '@/components/common'
import { ShopForm } from '@/components/shops/ShopForm'
import { createShop, type ShopInput } from '@/services/shopService'
import { useToast } from '@/app/providers'
import { bumpRevision } from '@/hooks'

/** Add Shop page: wraps the shared shop form in "create" mode. */
export default function AddShopPage() {
  const navigate = useNavigate()
  const { success } = useToast()

  async function handleSubmit(input: ShopInput) {
    const shop = await createShop(input)
    bumpRevision()
    success(
      'Shop saved',
      `${shop.name} was saved in the local database file with its coordinates and ${shop.contacts.length} extra contact${
        shop.contacts.length === 1 ? '' : 's'
      }.`,
    )
    navigate(`/shops/${shop.id}`)
  }

  return (
    <>
      <PageHeader
        title="Add Shop"
        description="Save the coordinates, contacts and details of a shop you visited so you can find it again later."
        icon={<Plus className="h-5 w-5 text-brand-700" />}
        actions={
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        }
      />

      <ShopForm
        submitLabel="Save Shop"
        onSubmit={handleSubmit}
        onCancel={() => navigate('/')}
      />
    </>
  )
}

