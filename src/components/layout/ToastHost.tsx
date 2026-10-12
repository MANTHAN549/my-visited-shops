import { clsx } from 'clsx'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useToast } from '@/app/providers'

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const

const TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
} as const

/** Renders the toast stack. Mounted once by the app layout. */
export function ToastHost() {
  const { toasts, dismiss } = useToast()

  if (!toasts.length) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-2 z-[1300] flex flex-col items-center gap-2 px-3 sm:top-4"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind]
        return (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border p-3 shadow-[var(--shadow-lift)]',
              TONES[toast.kind],
            )}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-xs break-words opacity-90">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              className="-mt-1 -mr-1 rounded p-1 opacity-70 hover:opacity-100"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss message"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
