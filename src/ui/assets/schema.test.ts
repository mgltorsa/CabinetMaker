import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { PlacedAsset, Project } from '@/core/types'
import { MAX_ASSETS } from '../lib/limits'
import { validateProject } from '../lib/projectSchema'
import { buildProjectBundle, readProjectBundle } from '../models/bundle'
import { parseProjectJson } from '../persistence'

const FRIDGE: PlacedAsset = {
  id: 'ast_1',
  assetId: 'fridge',
  name: 'Fridge',
  position: { x: 2000, y: 0, z: 340 },
  rotationYDeg: 0,
  size: { x: 700, y: 1800, z: 680 },
  color: '#e9e9e6',
  visible: true,
}

const PENDANT: PlacedAsset = {
  id: 'ast_2',
  assetId: 'pendant',
  name: 'Pendant light',
  position: { x: 1000, y: 1600, z: 1200 },
  rotationYDeg: 45,
  size: { x: 360, y: 800, z: 360 },
  visible: true,
  light: { on: true, intensity: 1, color: '#ffd9a8' },
}

function withAssets(assets: unknown[]): unknown {
  return { ...(JSON.parse(JSON.stringify(fixtureProject())) as Project), assets }
}

describe('project schema: placed assets', () => {
  it('loads projects saved before assets existed (no `assets` key)', () => {
    const old = JSON.parse(JSON.stringify(fixtureProject())) as Record<string, unknown>
    delete old.assets
    expect(validateProject(old)).toBeNull()
  })

  it('accepts valid assets, unknown catalog ids and an empty list', () => {
    expect(validateProject(withAssets([]))).toBeNull()
    expect(validateProject(withAssets([FRIDGE, PENDANT]))).toBeNull()
    expect(validateProject(withAssets([{ ...FRIDGE, assetId: 'from-a-newer-version' }]))).toBeNull()
  })

  it.each([
    ['an empty catalog id', { assetId: '' }, 'project.assets[0].assetId'],
    ['a position far outside any room', { position: { x: 1e9, y: 0, z: 0 } }, 'project.assets[0].position.x'],
    ['a negative lift', { position: { x: 0, y: -10, z: 0 } }, 'project.assets[0].position.y'],
    ['a lift above any ceiling', { position: { x: 0, y: 7000, z: 0 } }, 'project.assets[0].position.y'],
    ['a zero width', { size: { x: 0, y: 100, z: 100 } }, 'project.assets[0].size.x'],
    ['a huge depth', { size: { x: 100, y: 100, z: 1e6 } }, 'project.assets[0].size.z'],
    ['a wild rotation', { rotationYDeg: 1e9 }, 'project.assets[0].rotationYDeg'],
    ['a colour that is not #rrggbb', { color: 'red' }, 'project.assets[0].color'],
    ['a non-boolean visibility', { visible: 1 }, 'project.assets[0].visible'],
    ['a negative light intensity', { light: { on: true, intensity: -1, color: '#ffffff' } }, 'project.assets[0].light.intensity'],
    ['a blinding light intensity', { light: { on: true, intensity: 1000, color: '#ffffff' } }, 'project.assets[0].light.intensity'],
    ['a bad light colour', { light: { on: true, intensity: 1, color: 'url(x)' } }, 'project.assets[0].light.color'],
    ['a light without a switch', { light: { intensity: 1, color: '#ffffff' } }, 'project.assets[0].light.on'],
  ])('rejects %s', (_, patch, path) => {
    const error = validateProject(withAssets([{ ...FRIDGE, ...patch }]))
    expect(error).not.toBeNull()
    expect(error!.startsWith(path)).toBe(true)
  })

  it('rejects duplicate asset ids and too many assets', () => {
    expect(validateProject(withAssets([FRIDGE, FRIDGE]))).toMatch(/^project\.assets\[1\]\.id duplicates/)
    const many = Array.from({ length: MAX_ASSETS + 1 }, (_, i) => ({ ...FRIDGE, id: `a${i}` }))
    expect(validateProject(withAssets(many))).toMatch(new RegExp(`^project\\.assets must have at most ${MAX_ASSETS}`))
  })

  it('round-trips assets through JSON', () => {
    const project = { ...fixtureProject(), assets: [FRIDGE, PENDANT] }
    const parsed = parseProjectJson(JSON.stringify(project))
    expect(parsed.ok && parsed.project.assets).toEqual([FRIDGE, PENDANT])
  })

  it('carries assets in the project .zip without any model files', async () => {
    const project = { ...fixtureProject(), assets: [FRIDGE, PENDANT] }
    const read = await readProjectBundle(buildProjectBundle(project, new Map()))
    expect(read.ok && read.project.assets).toEqual([FRIDGE, PENDANT])
    expect(read.ok && read.missing).toEqual([])
  })
})
