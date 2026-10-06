/**
 * Local-first persistence: only `Project` is stored (never derived data).
 * Every read of untrusted JSON goes through `validateProject`.
 */
import { createProject } from '@/core/defaults'
import type { Project } from '@/core/types'
import { validateProject } from './lib/projectSchema'

export const STORAGE_KEY = 'cabinetmaker:project'
/** Where a saved project that no longer validates is kept, so autosave cannot overwrite the only copy. */
export const REJECTED_STORAGE_KEY = 'cabinetmaker:project:rejected'
export const AUTOSAVE_DELAY_MS = 500

/** The subset of `Storage` persistence needs; lets tests pass a fake. */
export type ProjectStorage = Pick<Storage, 'getItem' | 'setItem'>

export type ParseResult = { ok: true; project: Project } | { ok: false; error: string }

export function parseProjectJson(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File is not valid JSON' }
  }
  const error = validateProject(data)
  return error === null ? { ok: true, project: data as Project } : { ok: false, error }
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2)
}

/**
 * Saved project if present and valid, otherwise a fresh default project. An
 * invalid saved project is copied to `REJECTED_STORAGE_KEY` first and
 * `onRejected` is called with the validation error.
 */
export function loadProject(storage: ProjectStorage | null, onRejected?: (error: string) => void): Project {
  if (!storage) return createProject()
  try {
    const text = storage.getItem(STORAGE_KEY)
    if (text === null) return createProject()
    const parsed = parseProjectJson(text)
    if (parsed.ok) return parsed.project
    storage.setItem(REJECTED_STORAGE_KEY, text)
    onRejected?.(parsed.error)
    return createProject()
  } catch {
    // Storage can throw (disabled cookies, privacy mode); start fresh.
    return createProject()
  }
}

/** Returns false when the write failed (quota, privacy mode). */
export function saveProject(storage: ProjectStorage, project: Project): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(project))
    return true
  } catch {
    return false
  }
}

/** Browser localStorage, or null where it is unavailable. */
export function browserStorage(): ProjectStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export interface AutosaveSource {
  getProject: () => Project
  subscribe: (listener: () => void) => () => void
}

/**
 * Debounced autosave. Saves `delayMs` after the last project change and flushes
 * a pending save on detach. Returns the detach function.
 */
export function attachAutosave(source: AutosaveSource, storage: ProjectStorage, delayMs = AUTOSAVE_DELAY_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let last = source.getProject()
  const flush = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    saveProject(storage, source.getProject())
  }
  const unsubscribe = source.subscribe(() => {
    const next = source.getProject()
    if (next === last) return
    last = next
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(flush, delayMs)
  })
  return () => {
    unsubscribe()
    if (timer !== null) flush()
  }
}
