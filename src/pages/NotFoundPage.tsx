import { Link } from 'react-router-dom'
import { Compass, Home } from 'lucide-react'
import { EmptyState } from '@/components/common'

/** Shown for any unknown route. */
export default function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass className="h-6 w-6" />}
      title="Page not found"
      description="This address does not match any page in My Visited Shops. The link may be out of date."
      action={
        <Link to="/" className="btn-primary btn-sm">
          <Home className="h-3.5 w-3.5" />
          Back to dashboard
        </Link>
      }
    />
  )
}
