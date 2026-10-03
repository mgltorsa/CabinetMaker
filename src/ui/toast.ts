import { create } from 'zustand'

export type ToastKind = 'info' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (kind: ToastKind, message: string) => void
  dismiss: (id: number) => void
}

let nextToastId = 1

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (kind, message) => set((s) => ({ toasts: [...s.toasts, { id: nextToastId++, kind, message }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Show a toast from outside React (event handlers, async callbacks). */
export function notify(kind: ToastKind, message: string): void {
  useToasts.getState().push(kind, message)
}

/** Message for an unknown thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message
  return 'Something went wrong'
}
