import { describe, expect, it } from 'vitest'
import { createProject } from '@/core/defaults'
import { fixtureProject } from '@/core/fixtures'
import type { PlacedAsset, Project } from '@/core/types'
import { runPipeline } from '@/pipeline'
import { ASSET_LIFT, MAX_ASSETS, ROOM_COORD } from '../lib/limits'
import { validateProject } from '../lib/projectSchema'
import { addAsset, DUPLICATE_GAP, duplicateAsset, newPlacedAsset, removeAsset, setAssetLight, updateAsset } from './assetOps'

const asset = (over: Partial<PlacedAsset> = {}): PlacedAsset => ({
  id: 'ast_1',
  assetId: 'fridge',
  name: 'Fridge',
  position: { x: 1000, y: 0, z: 340 },
  rotationYDeg: 0,
  size: { x: 700, y: 1800, z: 680 },
  visible: true,
  ...over,
})

const withAssets = (assets: PlacedAsset[]): Project => ({ ...fixtureProject(), assets })

describe('newPlacedAsset', () => {
  it('builds a catalog asset at its default size and colour, visible, with a unique id and name', () => {
    const project = withAssets([asset()])
    const fridge = newPlacedAsset(project, 'fridge')!
    expect(fridge.assetId).toBe('fridge')
    expect(fridge.name).toBe('Fridge 2')
    expect(fridge.id).not.toBe('ast_1')
    expect(fridge.id).toMatch(/^ast_/)
    expect(fridge.size).toEqual({ x: 700, y: 1800, z: 680 })
    expect(fridge.color).toBe('#e9e9e6')
    expect(fridge.visible).toBe(true)
    expect(fridge.light).toBeUndefined()
    expect(validateProject(addAsset(project, fridge))).toBeNull()
  })

  it('switches light assets on with the catalog light colour', () => {
    const pendant = newPlacedAsset(createProject(), 'pendant')!
    expect(pendant.light).toEqual({ on: true, intensity: 1, color: '#ffd9a8' })
  })

  it('returns null for an unknown catalog id', () => {
    expect(newPlacedAsset(createProject(), 'unicorn')).toBeNull()
  })
})

describe('addAsset / updateAsset / removeAsset', () => {
  it('adds immutably and keeps ids unique', () => {
    const project = withAssets([asset()])
    const next = addAsset(project, asset({ name: 'Other' }))
    expect(next).not.toBe(project)
    expect(project.assets).toHaveLength(1)
    expect(next.assets).toHaveLength(2)
    expect(next.assets![1]!.id).not.toBe('ast_1')
  })

  it('adds to a project saved before assets existed', () => {
    const project = createProject()
    delete project.assets
    expect(addAsset(project, asset()).assets).toEqual([asset()])
  })

  it(`stops at ${MAX_ASSETS} assets`, () => {
    const full = withAssets(Array.from({ length: MAX_ASSETS }, (_, i) => asset({ id: `a${i}` })))
    expect(addAsset(full, asset({ id: 'one-more' }))).toBe(full)
  })

  it('updates one asset and returns the same project for an unknown id', () => {
    const project = withAssets([asset(), asset({ id: 'ast_2' })])
    const next = updateAsset(project, 'ast_2', { size: { x: 900, y: 1800, z: 680 }, color: '#112233' })
    expect(next.assets![1]!.size.x).toBe(900)
    expect(next.assets![1]!.color).toBe('#112233')
    expect(next.assets![0]).toBe(project.assets![0])
    expect(updateAsset(project, 'nope', { name: 'x' })).toBe(project)
  })

  it('clamps positions and sizes to what the validator accepts', () => {
    const project = withAssets([asset()])
    const next = updateAsset(project, 'ast_1', { position: { x: 1e9, y: -50, z: -1e9 }, size: { x: 0, y: 1e9, z: 5 } })
    const a = next.assets![0]!
    expect(a.position).toEqual({ x: ROOM_COORD.max, y: ASSET_LIFT.min, z: ROOM_COORD.min })
    expect(a.size).toEqual({ x: 10, y: 10_000, z: 10 })
    expect(validateProject(next)).toBeNull()
  })

  it('removes immutably', () => {
    const project = withAssets([asset(), asset({ id: 'ast_2' })])
    const next = removeAsset(project, 'ast_1')
    expect(next.assets!.map((a) => a.id)).toEqual(['ast_2'])
    expect(project.assets).toHaveLength(2)
    expect(removeAsset(project, 'nope')).toBe(project)
  })
})

describe('duplicateAsset', () => {
  it('copies beside the original with a new id and name', () => {
    const project = withAssets([asset({ light: { on: true, intensity: 2, color: '#ffffff' } })])
    const { project: next, copyId } = duplicateAsset(project, 'ast_1')
    expect(copyId).not.toBeNull()
    const copy = next.assets!.find((a) => a.id === copyId)!
    expect(copy.name).toBe('Fridge 2')
    expect(copy.position).toEqual({ x: 1000 + 700 + DUPLICATE_GAP, y: 0, z: 340 })
    expect(copy.light).toEqual({ on: true, intensity: 2, color: '#ffffff' })
    expect(copy.light).not.toBe(project.assets![0]!.light)
    expect(next.assets).toHaveLength(2)
  })

  it('does nothing for an unknown id or a full project', () => {
    const project = withAssets([asset()])
    expect(duplicateAsset(project, 'nope')).toEqual({ project, copyId: null })
    const full = withAssets(Array.from({ length: MAX_ASSETS }, (_, i) => asset({ id: `a${i}` })))
    expect(duplicateAsset(full, 'a0').copyId).toBeNull()
  })
})

describe('setAssetLight', () => {
  it('merges into the light and ignores assets without one', () => {
    const project = withAssets([asset({ light: { on: true, intensity: 1, color: '#ffffff' } }), asset({ id: 'plain' })])
    const off = setAssetLight(project, 'ast_1', { on: false })
    expect(off.assets![0]!.light).toEqual({ on: false, intensity: 1, color: '#ffffff' })
    expect(setAssetLight(project, 'plain', { on: false })).toBe(project)
  })

  it('clamps the intensity', () => {
    const project = withAssets([asset({ light: { on: true, intensity: 1, color: '#ffffff' } })])
    expect(setAssetLight(project, 'ast_1', { intensity: 99 }).assets![0]!.light!.intensity).toBe(10)
  })
})

describe('assets stay out of manufacturing', () => {
  it('does not change the build, cut list nest, BOM or estimate at all', () => {
    const project = fixtureProject()
    const decorated = addAsset(addAsset(project, asset()), newPlacedAsset(project, 'island')!)
    const plain = runPipeline(project)
    const withAssets = runPipeline(decorated)
    expect(withAssets.build).toEqual(plain.build)
    expect(withAssets.nest).toEqual(plain.nest)
    expect(withAssets.bom).toEqual(plain.bom)
    expect(withAssets.estimate).toEqual(plain.estimate)
  })
})
