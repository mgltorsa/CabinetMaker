'use client'

import { useEffect } from 'react'
import { type Toast, useToasts } from '../toast'

const TOAST_TIMEOUT_MS = { info: 4000, error: 10000 } as const

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss)
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), TOAST_TIMEOUT_MS[toast.kind])
    return () => clearTimeout(timer)
  }, [dismiss, toast.id, toast.kind])

  return (
    <li className={`toast toast-${toast.kind}`}>
      <span>{toast.message}</span>
      <button type="button" className="ghost small" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
        ×
      </button>
    </li>
  )
}

/** Live region for transient messages (import results, export errors). */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const errors = toasts.filter((t) => t.kind === 'error')
  const infos = toasts.filter((t) => t.kind === 'info')
  return (
    <div className="toaster">
      {/* Regions stay mounted so screen readers notice additions. */}
      <div role="alert">
        <ul aria-label="Errors">
          {errors.map((t) => (
            <ToastItem key={t.id} toast={t} />
          ))}
        </ul>
      </div>
      <div role="status">
        <ul aria-label="Notifications">
          {infos.map((t) => (
            <ToastItem key={t.id} toast={t} />
          ))}
        </ul>
      </div>
    </div>
  )
}
