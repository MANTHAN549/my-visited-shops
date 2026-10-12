import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  Bookmark,
  Clock,
  LayoutDashboard,
  Lock,
  MapPin,
  Menu,
  Plus,
  Search,
  Settings,
  Store,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useSession } from '@/app/providers'
import { useOnlineStatus } from '@/hooks'
import { ToastHost } from './ToastHost'
import { PwaController } from './PwaController'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/shops', label: 'All Shops', icon: Store },
  { to: '/add', label: 'Add Shop', icon: Plus },
  { to: '/visits', label: 'Shop Messages', icon: Clock },
  { to: '/settings', label: 'Settings', icon: Settings },
]

/** Primary navigation shown in the header on md+ screens. */
function DesktopNav() {
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-50 text-brand-800'
                : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Compact bottom navigation for phones. */
function BottomNav() {
  const items = [
    { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
    { to: '/shops', label: 'Shops', icon: Store },
    { to: '/add', label: 'Add', icon: Plus, primary: true },
    { to: '/visits', label: 'Messages', icon: Clock },
    { to: '/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <ul className="grid grid-cols-5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-0.5 py-2 text-[0.6875rem] font-medium',
                  isActive ? 'text-brand-700' : 'text-ink-500',
                )
              }
            >
              <span
                className={clsx(
                  'flex h-9 w-9 items-center justify-center rounded-full',
                  item.primary && 'bg-brand-700 text-white',
                )}
              >
                <item.icon className="h-5 w-5" />
              </span>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Header search: submits to the All Shops page with the query applied. */
function HeaderSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const q = query.trim()
    navigate(q ? `/shops?q=${encodeURIComponent(q)}` : '/shops')
    setQuery('')
  }

  return (
    <form onSubmit={submit} className="relative hidden sm:block" role="search">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search shops…"
        aria-label="Search shops"
        className="input h-10 w-40 min-h-0 pl-9 lg:w-64"
      />
    </form>
  )
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { locked, encrypted, lockNow } = useSession()
  const online = useOnlineStatus()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PwaController />
      <ToastHost />

      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-3 sm:px-4">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 rounded-lg py-1 pr-2 text-ink-900"
            aria-label="My Visited Shops home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
              <MapPin className="h-5 w-5" />
            </span>
            <span className="hidden text-base font-semibold tracking-tight sm:inline">
              My Visited Shops
            </span>
          </Link>

          <div className="flex-1" />

          <HeaderSearch />

          {encrypted && (
            <span
              className={clsx(
                'hidden items-center gap-1 rounded-full px-2 py-1 text-xs font-medium xs:inline-flex',
                locked ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700',
              )}
              title={locked ? 'Encrypted — locked' : 'Encrypted — unlocked'}
            >
              <Lock className="h-3 w-3" />
              {locked ? 'Locked' : 'Encrypted'}
            </span>
          )}

          {encrypted && !locked && (
            <button
              type="button"
              className="icon-btn"
              onClick={lockNow}
              title="Lock now"
              aria-label="Lock now"
            >
              <Lock className="h-5 w-5" />
            </button>
          )}

          <DesktopNav />

          <div className="relative md:hidden" ref={menuRef}>
            <button
              type="button"
              className="icon-btn"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-[var(--shadow-lift)]">
                <Link
                  to="/shops"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-ink-700 hover:bg-ink-50"
                >
                  <Search className="h-4 w-4" /> Search all shops
                </Link>
                <Link
                  to="/backup"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-ink-700 hover:bg-ink-50"
                >
                  <Bookmark className="h-4 w-4" /> Backup &amp; restore
                </Link>
                <div className="border-t border-ink-100 px-4 py-2 text-xs text-ink-400">
                  {online ? 'Online' : 'Offline'}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-4 pb-nav sm:px-4 md:pb-8">{children}</main>

      <footer className="hidden border-t border-ink-200 bg-white px-4 py-4 text-center text-xs text-ink-400 md:block">
        My Visited Shops — all records are stored locally in your browser. Map data ©
        OpenStreetMap contributors.
      </footer>

      <BottomNav />
    </div>
  )
}
