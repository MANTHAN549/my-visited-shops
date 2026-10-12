/**
 * Cross-cutting application context: toasts, confirmation dialogs and the
 * lock/unlock session state.
 *
 * Keeping these in one provider means any page can raise a message or ask for
 * confirmation without prop drilling, and there is exactly one place that decides
 * whether encrypted data may be read.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { ToastKind } from '@/types'
import { getEncryptionMeta } from '@/services/settingsService'
import {
  clearSessionKey,
  hasSessionKey,
  setSessionKey,
} from '@/services/encryptionService'
import { bumpRevision } from '@/hooks'
import { useSettings } from '@/hooks'

/* ------------------------------------------------------------------ */
/* Toasts                                                             */
/* ------------------------------------------------------------------ */

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  description?: string
}

interface ToastContextValue {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <AppProviders>')
  return ctx
}

/* ------------------------------------------------------------------ */
/* Confirm dialog                                                     */
/* ------------------------------------------------------------------ */

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  /** Optional extra checkbox, e.g. "also delete visit history". */
  checkbox?: { label: string; defaultChecked?: boolean; hint?: string }
}

export interface ConfirmResult {
  confirmed: boolean
  checked: boolean
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<ConfirmResult>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function useConfirm(): ConfirmContextValue['confirm'] {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <AppProviders>')
  return ctx.confirm
}

/* ------------------------------------------------------------------ */
/* Session / lock                                                     */
/* ------------------------------------------------------------------ */

interface SessionContextValue {
  /** True when encryption is enabled but no key is in memory. */
  locked: boolean
  /** True when the installation uses encrypted storage. */
  encrypted: boolean
  ready: boolean
  /** Called by the unlock screen after a successful unlock. */
  markUnlocked: () => void
  lockNow: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <AppProviders>')
  return ctx
}

/* ------------------------------------------------------------------ */
/* Provider                                                           */
/* ------------------------------------------------------------------ */

export function AppProviders({ children }: { children: ReactNode }) {
  /* toasts */
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      setToasts((current) => [...current.slice(-3), { ...toast, id }])
      const ttl = toast.kind === 'error' ? 8000 : 4500
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ttl),
      )
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) => push({ kind: 'success', title, description }),
      error: (title, description) => push({ kind: 'error', title, description }),
      warning: (title, description) => push({ kind: 'warning', title, description }),
      info: (title, description) => push({ kind: 'info', title, description }),
    }),
    [toasts, push, dismiss],
  )

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const timer of map.values()) clearTimeout(timer)
      map.clear()
    }
  }, [])

  /* confirm */
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (result: ConfirmResult) => void }) | null
  >(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<ConfirmResult>((resolve) => {
        setConfirmState({ ...options, resolve })
      }),
    [],
  )

  const resolveConfirm = useCallback(
    (result: ConfirmResult) => {
      confirmState?.resolve(result)
      setConfirmState(null)
    },
    [confirmState],
  )

  const confirmValue = useMemo<ConfirmContextValue>(() => ({ confirm }), [confirm])

  /* session */
  const [session, setSession] = useState({
    ready: false,
    encrypted: false,
    locked: false,
  })

  const refreshSession = useCallback(async () => {
    try {
      const meta = await getEncryptionMeta()
      const encrypted = meta.mode === 'encrypted'
      setSession({ ready: true, encrypted, locked: encrypted && !hasSessionKey() })
    } catch {
      setSession({ ready: true, encrypted: false, locked: false })
    }
  }, [])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  const markUnlocked = useCallback(() => {
    setSession((current) => ({ ...current, locked: false }))
    bumpRevision()
  }, [])

  const lockNow = useCallback(() => {
    clearSessionKey()
    setSession((current) => ({ ...current, locked: true }))
    bumpRevision()
  }, [])

  /* auto lock */
  const { settings } = useSettings()

  useEffect(() => {
    if (!session.encrypted || session.locked) return
    const minutes = settings.autoLockMinutes
    if (!minutes || minutes <= 0) return

    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => lockNow(), minutes * 60_000)
    }

    const windowEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    const onVisibilityChange = () => reset()

    for (const event of windowEvents) window.addEventListener(event, reset, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)
    reset()

    return () => {
      clearTimeout(timer)
      for (const event of windowEvents) window.removeEventListener(event, reset)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [session.encrypted, session.locked, settings.autoLockMinutes, lockNow])

  const sessionValue = useMemo<SessionContextValue>(
    () => ({ ...session, markUnlocked, lockNow }),
    [session, markUnlocked, lockNow],
  )

  return (
    <ToastContext.Provider value={value}>
      <ConfirmContext.Provider value={confirmValue}>
        <SessionContext.Provider value={sessionValue}>
          {children}
          {confirmState && (
            <ConfirmDialog
              options={confirmState}
              onResolve={resolveConfirm}
            />
          )}
        </SessionContext.Provider>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/* Confirm dialog component (kept here so the provider is self-contained) */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  options,
  onResolve,
}: {
  options: ConfirmOptions
  onResolve: (result: ConfirmResult) => void
}) {
  const [checked, setChecked] = useState(options.checkbox?.defaultChecked ?? false)
  const danger = options.tone === 'danger'

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onResolve({ confirmed: false, checked })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onResolve, checked])

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-ink-900/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="card w-full max-w-md rounded-b-none p-5 sm:rounded-b-[var(--radius-card)]">
        <h2 id="confirm-title" className="text-lg font-semibold">
          {options.title}
        </h2>
        <p className="mt-2 text-sm whitespace-pre-line text-ink-600">{options.message}</p>

        {options.checkbox && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand-700"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-ink-800">{options.checkbox.label}</span>
              {options.checkbox.hint && (
                <span className="mt-0.5 block text-xs text-ink-500">{options.checkbox.hint}</span>
              )}
            </span>
          </label>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onResolve({ confirmed: false, checked })}
          >
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => onResolve({ confirmed: true, checked })}
            autoFocus
          >
            {options.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
