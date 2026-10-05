import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Project, SceneModel } from '@/core/types'
import { MAX_MODELS } from '../lib/limits'
import { validateProject } from '../lib/projectSchema'
import { parseProjectJson } from '../persistence'
import { rectangularRoom } from './room'

const MODEL: SceneModel = {
  id: 'mdl_1',
  name: 'Fridge',
  format: 'glb',
  blobId: 'sha256-00ff',
  unit: 'm',
  nativeSize: { x: 0.6, y: 1.8, z: 0.65 },
  position: { x: 2000, y: 0, z: 400 },
  rotationYDeg: 90,
  scale: 1,
  visible: true,
}

function withModels(models: unknown[], edit: (p: Project) => void = () => {}): unknown {
  const project = JSON.parse(JSON.stringify(fixtureProject())) as Project
  edit(project)
  return { ...project, models }
}

describe('project schema: models', () => {
  it('loads projects saved before models existed (no `models` key)', () => {
    const old = JSON.parse(JSON.stringify(fixtureProject())) as Record<string, unknown>
    delete old.models
    expect(validateProject(old)).toBeNull()
  })

  it('accepts valid models and an empty list', () => {
    expect(validateProject(withModels([]))).toBeNull()
    expect(validateProject(withModels([MODEL, { ...MODEL, id: 'mdl_2', format: 'stl', unit: 'mm' }]))).toBeNull()
  })

  it.each([
    ['an unknown format', { format: 'fbx' }, 'project.models[0].format'],
    ['an unknown unit', { unit: 'ft' }, 'project.models[0].unit'],
    ['a blob id that could escape a zip folder', { blobId: '../../etc/passwd' }, 'project.models[0].blobId'],
    ['a zero scale', { scale: 0 }, 'project.models[0].scale'],
    ['a huge scale', { scale: 1e6 }, 'project.models[0].scale'],
    ['a position far outside any room', { position: { x: 1e9, y: 0, z: 0 } }, 'project.models[0].position.x'],
    ['a non-finite rotation', { rotationYDeg: null }, 'project.models[0].rotationYDeg'],
    ['a negative native size', { nativeSize: { x: -1, y: 1, z: 1 } }, 'project.models[0].nativeSize.x'],
    ['a non-boolean visibility', { visible: 'yes' }, 'project.models[0].visible'],
  ])('rejects %s', (_, patch, path) => {
    const error = validateProject(withModels([{ ...MODEL, ...patch }]))
    expect(error).not.toBeNull()
    expect(error!.startsWith(path)).toBe(true)
  })

  it('rejects duplicate model ids and too many models', () => {
    expect(validateProject(withModels([MODEL, MODEL]))).toMatch(/^project\.models\[1\]\.id duplicates/)
    const many = Array.from({ length: MAX_MODELS + 1 }, (_, i) => ({ ...MODEL, id: `m${i}` }))
    expect(validateProject(withModels(many))).toMatch(/^project\.models must have at most 50/)
  })

  it('round-trips models and a built room through JSON', () => {
    const project = { ...fixtureProject(), room: rectangularRoom({ width: 3000, depth: 2500, height: 2400, thickness: 100 }), models: [MODEL] }
    const parsed = parseProjectJson(JSON.stringify(project))
    expect(parsed.ok && parsed.project.models).toEqual([MODEL])
  })
})

describe('project schema: free cabinet placement', () => {
  const placed = (placement: unknown): unknown =>
    withModels([], (p) => {
      ;(p.cabinets[0] as unknown as Record<string, unknown>).placement = placement
    })

  it('accepts placement with and without a free position', () => {
    expect(validateProject(placed({ wallId: null, offset: 0, rotationDeg: 0 }))).toBeNull()
    expect(validateProject(placed({ wallId: 'wall-back', offset: 100, rotationDeg: 0, position: { x: 100, z: 0 } }))).toBeNull()
  })

  it('rejects a malformed or out-of-range position', () => {
    expect(validateProject(placed({ wallId: null, offset: 0, rotationDeg: 0, position: { x: 'left', z: 0 } }))).toMatch(
      /^project\.cabinets\[0\]\.placement\.position\.x/,
    )
    expect(validateProject(placed({ wallId: null, offset: 0, rotationDeg: 0, position: { x: 0, z: 1e9 } }))).toMatch(
      /^project\.cabinets\[0\]\.placement\.position\.z/,
    )
  })
})
