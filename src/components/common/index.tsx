import { clsx } from 'clsx'
import { AlertCircle, Inbox, Loader2, MapPin, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/* Spinner                                                            */
/* ------------------------------------------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-brand-700', className)} aria-hidden />
}

export function InlineLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-500">
      <Spinner className="h-4 w-4" />
      {label}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Empty / error states                                               */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-white/60 px-6 py-10 text-center',
        className,
      )}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-500">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <h3 className="text-base font-semibold text-ink-800">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-red-800">{title}</h3>
          <p className="mt-1 text-sm text-red-700">{message}</p>
          {onRetry && (
            <button type="button" className="btn-secondary btn-sm mt-3" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Uniform loading / error / empty handling for database-backed views.
 * `locked` is surfaced as a distinct state so the user knows to unlock rather
 * than thinking their data disappeared.
 */
export function DataState({
  loading,
  error,
  locked,
  empty,
  emptyState,
  onRetry,
  children,
}: {
  loading: boolean
  error: string | null
  locked?: boolean
  empty?: boolean
  emptyState?: ReactNode
  onRetry?: () => void
  children: ReactNode
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink-500">
        <Spinner />
        Reading your local records…
      </div>
    )
  }

  if (locked) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-6 w-6" />}
        title="Your data is locked"
        description="Enter your data passphrase to decrypt your shops and visit history."
      />
    )
  }

  if (error) return <ErrorState message={error} onRetry={onRetry} />

  if (empty && emptyState) return <>{emptyState}</>

  return <>{children}</>
}

/* ------------------------------------------------------------------ */
/* Avatar                                                             */
/* ------------------------------------------------------------------ */

export function ShopAvatar({
  name,
  imageDataUrl,
  size = 48,
  seed,
  className,
}: {
  name: string
  imageDataUrl?: string | null
  size?: number
  seed?: string
  className?: string
}) {
  const style = { width: size, height: size }

  if (imageDataUrl) {
    return (
      <img
        src={imageDataUrl}
        alt={name}
        loading="lazy"
        style={style}
        className={clsx('shrink-0 rounded-lg border border-ink-200 object-cover', className)}
      />
    )
  }

  return (
    <div
      style={style}
      aria-hidden
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-ink-100 text-ink-500',
        className,
      )}
    >
      <MapPin className="h-1/2 w-1/2" />
      <span className="sr-only">{name}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Stat card                                                          */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  icon,
  tone = 'default',
  hint,
  onClick,
}: {
  label: string
  value: number | string
  icon: ReactNode
  tone?: 'default' | 'brand' | 'amber' | 'slate'
  hint?: string
  onClick?: () => void
}) {
  const tones: Record<string, string> = {
    default: 'bg-ink-100 text-ink-600',
    brand: 'bg-brand-100 text-brand-700',
    amber: 'bg-amber-100 text-amber-700',
    slate: 'bg-slate-200 text-slate-700',
  }

  const content = (
    <>
      <div className={clsx('flex h-10 w-10 items-center justify-center rounded-lg', tones[tone])}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl leading-tight font-semibold text-ink-900">{value}</p>
        <p className="truncate text-xs font-medium text-ink-500">{label}</p>
      </div>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="card card-hover flex items-center gap-3 p-3 text-left sm:p-4"
        title={hint}
      >
        {content}
      </button>
    )
  }

  return (
    <div className="card flex items-center gap-3 p-3 sm:p-4" title={hint}>
      {content}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page header                                                        */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: string
  description?: string
  actions?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="page-title flex items-center gap-2">
          {icon}
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Section                                                            */
/* ------------------------------------------------------------------ */

export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={clsx('mt-6', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Modal                                                              */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  if (!open) return null

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-ink-900/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={clsx(
          'card flex max-h-[92vh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-b-[var(--radius-card)]',
          widths[size],
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <span aria-hidden className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-ink-200 bg-ink-50 p-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Form fields                                                        */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  error?: string
  hint?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      {children}
      {error ? (
        <p className="error-text" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        hint && <div className="hint">{hint}</div>
      )}
    </div>
  )
}
