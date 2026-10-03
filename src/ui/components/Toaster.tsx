'use client'

import { XIcon } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '../lib/cn'
import { type Toast, useToasts } from '../toast'
import { Button } from './ui/button'

const TOAST_TIMEOUT_MS = { info: 4000, error: 10000 } as const

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss)
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), TOAST_TIMEOUT_MS[toast.kind])
    return () => clearTimeout(timer)
  }, [dismiss, toast.id, toast.kind])

  return (
    <li
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-md border bg-popover px-4 py-3 text-sm shadow-lg animate-in fade-in-0 slide-in-from-bottom-2',
        toast.kind === 'error' && 'border-destructive/40 text-destructive',
      )}
    >
      <span className="flex-1">{toast.message}</span>
      <Button variant="ghost" size="icon-sm" className="-my-1 -mr-2 size-7" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
        <XIcon />
      </Button>
    </li>
  )
}

/** Live region for transient messages (import results, export errors). */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const errors = toasts.filter((t) => t.kind === 'error')
  const infos = toasts.filter((t) => t.kind === 'info')
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {/* Regions stay mounted so screen readers notice additions. */}
      <div role="alert">
        <ul aria-label="Errors" className="flex flex-col gap-2">
          {errors.map((t) => (
            <ToastItem key={t.id} toast={t} />
          ))}
        </ul>
      </div>
      <div role="status">
        <ul aria-label="Notifications" className="flex flex-col gap-2">
          {infos.map((t) => (
            <ToastItem key={t.id} toast={t} />
          ))}
        </ul>
      </div>
    </div>
  )
}
