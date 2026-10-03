import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Project } from '@/core/types'
import { isProject, validateProject } from './lib/projectSchema'
import {
  attachAutosave,
  loadProject,
  parseProjectJson,
  type ProjectStorage,
  REJECTED_STORAGE_KEY,
  saveProject,
  serializeProject,
  STORAGE_KEY,
} from './persistence'
import { createDesignerStore } from './store'

class MemoryStorage implements ProjectStorage {
  readonly data = new Map<string, string>()
  writes = 0
  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.writes++
    this.data.set(key, value)
  }
}

const throwingStorage: ProjectStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

/** JSON round-trip as `unknown`, then mutate via a path for negative cases. */
function corrupt(edit: (p: Record<string, unknown>) => void): unknown {
  const data = JSON.parse(JSON.stringify(fixtureProject())) as Record<string, unknown>
  edit(data)
  return data
}

describe('project guard', () => {
  it('accepts a valid project, including after a JSON round trip', () => {
    expect(isProject(fixtureProject())).toBe(true)
    expect(isProject(JSON.parse(serializeProject(fixtureProject())))).toBe(true)
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'project'],
  ])('rejects %s', (_, value) => {
    expect(isProject(value)).toBe(false)
  })

  it('rejects other schema versions with a clear message', () => {
    const err = validateProject(corrupt((p) => (p.schemaVersion = 99)))
    expect(err).toMatch(/schema version 99/)
  })

  it('names the offending path for bad nested fields', () => {
    const value = corrupt((p) => {
      const cabinets = p.cabinets as Record<string, unknown>[]
      cabinets[0]!.width = 'wide'
    })
    expect(validateProject(value)).toBe('project.cabinets[0].width must be a finite number')
  })

  it('rejects NaN-like numbers, bad unions and missing objects', () => {
    expect(isProject(corrupt((p) => (p.units = 'furlongs')))).toBe(false)
    expect(isProject(corrupt((p) => delete p.machine))).toBe(false)
    expect(isProject(corrupt((p) => ((p.nest as Record<string, unknown>).kerf = null)))).toBe(false)
    expect(
      isProject(
        corrupt((p) => {
          const bay = ((p.cabinets as { sections: { bays: Record<string, unknown>[] }[] }[])[0]!.sections[0]!.bays[0] ??= {})
          bay.doorCount = 3
        }),
      ),
    ).toBe(false)
  })

  it('rejects materials of an unknown kind', () => {
    const value = corrupt((p) => ((p.materials as Record<string, unknown>[])[0]!.kind = 'liquid'))
    expect(validateProject(value)).toMatch(/materials\[0\]\.kind/)
  })

  it('rejects cabinets that reference a missing material', () => {
    const value = corrupt((p) => {
      const cab = (p.cabinets as { construction: Record<string, unknown> }[])[0]!
      cab.construction.carcassMaterialId = 'unobtainium'
    })
    expect(validateProject(value)).toMatch(/unknown material "unobtainium"/)
  })

  it('accepts an optional placement and a room', () => {
    const value = corrupt((p) => {
      ;(p.cabinets as Record<string, unknown>[])[0]!.placement = { wallId: null, offset: 0, rotationDeg: 0 }
      p.room = { walls: [{ id: 'w', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, thickness: 100, height: 2400 }], openings: [] }
    })
    expect(validateProject(value)).toBeNull()
  })
})

describe('parseProjectJson', () => {
  it('parses a serialized project', () => {
    const result = parseProjectJson(serializeProject(fixtureProject()))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.project.id).toBe('prj_fixture')
  })

  it('reports invalid JSON and invalid shape', () => {
    expect(parseProjectJson('{oops')).toEqual({ ok: false, error: 'File is not valid JSON' })
    const bad = parseProjectJson('{"schemaVersion":1}')
    expect(bad.ok).toBe(false)
  })
})

describe('loadProject / saveProject', () => {
  it('round-trips through storage', () => {
    const storage = new MemoryStorage()
    expect(saveProject(storage, fixtureProject())).toBe(true)
    expect(loadProject(storage).id).toBe('prj_fixture')
  })

  it('falls back to a new project when storage is empty, corrupt, stale or unavailable', () => {
    const storage = new MemoryStorage()
    expect(loadProject(storage).cabinets).toHaveLength(1)
    storage.data.set(STORAGE_KEY, 'not json')
    expect(loadProject(storage).id).not.toBe('prj_fixture')
    storage.data.set(STORAGE_KEY, JSON.stringify({ ...fixtureProject(), schemaVersion: 0 }))
    expect(loadProject(storage).id).not.toBe('prj_fixture')
    expect(loadProject(throwingStorage).cabinets).toHaveLength(1)
    expect(loadProject(null).cabinets).toHaveLength(1)
  })

  it('keeps a copy of a saved project it cannot load so autosave does not destroy it', () => {
    const storage = new MemoryStorage()
    const stale = JSON.stringify({ ...fixtureProject(), tools: [{ ...fixtureProject().tools[0], stepDown: 0.001 }] })
    storage.data.set(STORAGE_KEY, stale)
    expect(loadProject(storage).id).not.toBe('prj_fixture')
    expect(storage.getItem(REJECTED_STORAGE_KEY)).toBe(stale)
  })

  it('tells the caller why a saved project was rejected', () => {
    const storage = new MemoryStorage()
    storage.data.set(STORAGE_KEY, JSON.stringify({ ...fixtureProject(), tools: [{ ...fixtureProject().tools[0], stepDown: 0.001 }] }))
    const onRejected = vi.fn()
    loadProject(storage, onRejected)
    expect(onRejected).toHaveBeenCalledWith(expect.stringContaining('stepDown'))
  })

  it('reports failed writes instead of throwing', () => {
    expect(saveProject(throwingStorage, fixtureProject())).toBe(false)
  })
})

describe('attachAutosave', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function wire(storage: ProjectStorage) {
    const store = createDesignerStore(fixtureProject())
    const detach = attachAutosave({ getProject: () => store.getState().project, subscribe: store.subscribe }, storage, 500)
    return { store, detach }
  }

  const saved = (storage: MemoryStorage): Project => JSON.parse(storage.getItem(STORAGE_KEY)!) as Project

  it('debounces bursts of edits into one write', () => {
    const storage = new MemoryStorage()
    const { store } = wire(storage)
    store.getState().updateCabinet('cab_1', { width: 610 })
    store.getState().updateCabinet('cab_1', { width: 620 })
    vi.advanceTimersByTime(400)
    store.getState().updateCabinet('cab_1', { width: 630 })
    vi.advanceTimersByTime(499)
    expect(storage.writes).toBe(0)
    vi.advanceTimersByTime(1)
    expect(storage.writes).toBe(1)
    expect(saved(storage).cabinets[0]!.width).toBe(630)
  })

  it('does not save for UI-only changes', () => {
    const storage = new MemoryStorage()
    const { store } = wire(storage)
    store.getState().setViewToggle('open', true)
    vi.advanceTimersByTime(1000)
    expect(storage.writes).toBe(0)
  })

  it('flushes a pending save on detach and stops listening', () => {
    const storage = new MemoryStorage()
    const { store, detach } = wire(storage)
    store.getState().setProjectName('Flushed')
    detach()
    expect(saved(storage).name).toBe('Flushed')
    store.getState().setProjectName('Ignored')
    vi.advanceTimersByTime(1000)
    expect(saved(storage).name).toBe('Flushed')
  })

  it('survives a storage that throws', () => {
    const { store } = wire(throwingStorage)
    store.getState().setProjectName('x')
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
  })
})
