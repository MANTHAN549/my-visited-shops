import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Spinner } from '@/components/common'
import DashboardPage from '@/pages/DashboardPage'

/**
 * Routing table.
 *
 * `HashRouter` is used (see main.tsx) so the production build works on static
 * hosts without server rewrite rules. Routes below map
 * one-to-one onto the pages required by the specification.
 */

const AddShopPage = lazy(() => import('@/pages/AddShopPage'))
const ShopDetailsPage = lazy(() => import('@/pages/ShopDetailsPage'))
const EditShopPage = lazy(() => import('@/pages/EditShopPage'))
const AllShopsPage = lazy(() => import('@/pages/AllShopsPage'))
const DirectionsPage = lazy(() => import('@/pages/DirectionsPage'))
const VisitHistoryPage = lazy(() => import('@/pages/VisitHistoryPage'))
const VisitDetailsPage = lazy(() => import('@/pages/VisitDetailsPage'))
const BackupRestorePage = lazy(() => import('@/pages/BackupRestorePage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const MigrationPage = lazy(() => import('@/migration/MigrationPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

function RouteFallback() {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-sm text-ink-500">
      <Spinner />
      Loading…
    </div>
  )
}

/** Full-screen pages render outside the standard layout. */
const FULL_SCREEN_PREFIXES = ['/directions']

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Directions is full screen: no header, no bottom navigation. */}
        <Route path="/directions/:id" element={<DirectionsPage />} />

        <Route
          path="*"
          element={
            <AppLayout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/add" element={<AddShopPage />} />
                <Route path="/shops" element={<AllShopsPage />} />
                <Route path="/shops/:id" element={<ShopDetailsPage />} />
                <Route path="/shops/:id/edit" element={<EditShopPage />} />
                <Route path="/visits" element={<VisitHistoryPage />} />
                <Route path="/visits/:id" element={<VisitDetailsPage />} />
                <Route path="/backup" element={<BackupRestorePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/migrate" element={<MigrationPage />} />
                <Route path="/dashboard" element={<Navigate to="/" replace />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </AppLayout>
          }
        />
      </Routes>
    </Suspense>
  )
}

export { FULL_SCREEN_PREFIXES }
