import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { HardwareItem, Project } from '@/core/types'
import { HANDLE_DIMENSION, HANDLE_PROJECTION } from './limits'
import { validateProject } from './projectSchema'

const BLOB = 'sha256-0123abcd'

function withHandle(handle: unknown): Project {
  const p = fixtureProject()
  const i = p.hardware.findIndex((h) => h.id === 'pull-bar-128')
  p.hardware[i] = { ...p.hardware[i], handle } as HardwareItem
  return p
}

const error = (handle: unknown): string | null => validateProject(withHandle(handle))

describe('validateProject: handles', () => {
  it('accepts the default catalog (every built-in handle type) and old pulls without `handle`', () => {
    const p = fixtureProject()
    expect(p.hardware.some((h) => h.handle?.style === 'j-profile')).toBe(true)
    expect(validateProject(p)).toBeNull()
    expect(p.hardware.find((h) => h.id === 'pull-bar-128')!.handle).toBeUndefined()
  })

  it('accepts every style and full custom-model handles', () => {
    for (const style of ['bar', 'knob', 'edge', 'cup', 'j-profile', 'custom']) expect(error({ style })).toBeNull()
    expect(error({ style: 'custom', blobId: BLOB, format: 'glb', unit: 'cm', nativeSize: { x: 1, y: 2, z: 3 }, color: '#aabbcc', length: 120, width: 20, diameter: 10, projection: 30 })).toBeNull()
  })

  it.each([
    [{ style: 'lever' }, /handle\.style/],
    [{}, /handle\.style/],
    [{ style: 'bar', color: 'red' }, /handle\.color/],
    [{ style: 'bar', length: HANDLE_DIMENSION.max + 1 }, /handle\.length/],
    [{ style: 'bar', diameter: 0 }, /handle\.diameter/],
    [{ style: 'bar', width: -1 }, /handle\.width/],
    [{ style: 'bar', projection: HANDLE_PROJECTION.max + 1 }, /handle\.projection/],
    [{ style: 'bar', length: Number.NaN }, /handle\.length/],
    [{ style: 'custom', blobId: '../evil', format: 'glb', unit: 'm', nativeSize: { x: 1, y: 1, z: 1 } }, /handle\.blobId/],
    [{ style: 'custom', blobId: BLOB, format: 'fbx', unit: 'm', nativeSize: { x: 1, y: 1, z: 1 } }, /handle\.format/],
    [{ style: 'custom', blobId: BLOB, format: 'glb', unit: 'ft', nativeSize: { x: 1, y: 1, z: 1 } }, /handle\.unit/],
    [{ style: 'custom', blobId: BLOB, format: 'glb', unit: 'm', nativeSize: { x: -1, y: 1, z: 1 } }, /handle\.nativeSize\.x/],
    [{ style: 'custom', blobId: BLOB }, /handle.*format, unit and nativeSize/],
    ['bar', /handle/],
  ])('rejects handle %j', (handle, message) => {
    expect(error(handle)).toMatch(message)
  })

  it('rejects a handle on hardware that is not a pull', () => {
    const p = fixtureProject()
    p.hardware[0] = { ...p.hardware[0]!, handle: { style: 'knob' } }
    expect(validateProject(p)).toMatch(/handle.*pull/)
  })
})
