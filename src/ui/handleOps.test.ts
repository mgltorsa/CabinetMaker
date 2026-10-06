import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Project } from '@/core/types'
import { duplicateHardwareItem, updateHardwareItem } from './costOps'
import { addCustomHandle, addHandleItem, guessHandleUnit, HANDLE_STYLE_LABEL, setHandleModel, updateHandle } from './handleOps'
import { MAX_CATALOG_ITEMS } from './lib/limits'
import { validateProject } from './lib/projectSchema'

const item = (p: Project, id: string) => p.hardware.find((h) => h.id === id)!
const MODEL = { name: 'cube', format: 'glb' as const, blobId: 'sha256-cafe', nativeSize: { x: 1, y: 1, z: 1 } }

describe('addHandleItem', () => {
  it('appends a pull of the chosen style with a unique name and valid defaults', () => {
    const before = fixtureProject()
    const { project, id } = addHandleItem(before, 'knob')
    expect(before.hardware.some((h) => h.id === id)).toBe(false)
    const added = item(project, id!)
    expect(added).toMatchObject({ kind: 'pull', name: 'New knob', handle: { style: 'knob' }, props: { centers: 0 } })
    expect(validateProject(project)).toBeNull()
    const second = addHandleItem(project, 'knob')
    expect(item(second.project, second.id!).name).toBe('New knob 2')
  })

  it('gives two-hole styles their centres', () => {
    const { project, id } = addHandleItem(fixtureProject(), 'cup')
    expect(item(project, id!).props.centers).toBe(96)
    const bar = addHandleItem(fixtureProject(), 'bar')
    expect(item(bar.project, bar.id!).props.centers).toBe(128)
  })

  it('refuses at the catalog limit', () => {
    const p = fixtureProject()
    p.hardware = Array.from({ length: MAX_CATALOG_ITEMS }, (_, i) => ({ ...p.hardware[0]!, id: `h${i}` }))
    expect(addHandleItem(p, 'bar')).toEqual({ project: p, id: null })
  })

  it('labels every style', () => {
    expect(Object.keys(HANDLE_STYLE_LABEL).sort()).toEqual(['bar', 'cup', 'custom', 'edge', 'j-profile', 'knob'])
  })
})

describe('updateHandle', () => {
  it('merges a patch into the handle of a pull (creating it on an old bar pull)', () => {
    const p = updateHandle(fixtureProject(), 'pull-bar-128', { color: '#123456' })
    expect(item(p, 'pull-bar-128').handle).toEqual({ style: 'bar', color: '#123456' })
    const knob = updateHandle(p, 'pull-bar-128', { style: 'knob' })
    expect(item(knob, 'pull-bar-128').handle).toEqual({ style: 'knob', color: '#123456' })
  })

  it('removes fields patched to undefined', () => {
    const p = updateHandle(updateHandle(fixtureProject(), 'pull-knob-30', { color: '#123456' }), 'pull-knob-30', { color: undefined })
    expect('color' in item(p, 'pull-knob-30').handle!).toBe(false)
  })

  it('ignores items that are not pulls and unknown ids (same reference)', () => {
    const p = fixtureProject()
    expect(updateHandle(p, 'blum-cliptop-110', { style: 'knob' })).toBe(p)
    expect(updateHandle(p, 'nope', { style: 'knob' })).toBe(p)
  })

  it('never mutates its input', () => {
    const p = fixtureProject()
    const snapshot = structuredClone(p)
    updateHandle(p, 'pull-cup-96', { width: 50 })
    expect(p).toEqual(snapshot)
  })
})

describe('custom handle models', () => {
  it('adds a custom handle for an imported model', () => {
    const { project, id } = addCustomHandle(fixtureProject(), MODEL, 'cm')
    expect(item(project, id!)).toMatchObject({ kind: 'pull', name: 'cube', props: { centers: 0 }, handle: { style: 'custom', blobId: MODEL.blobId, format: 'glb', unit: 'cm', nativeSize: MODEL.nativeSize } })
    expect(validateProject(project)).toBeNull()
  })

  it('sets or replaces the model of an existing pull and makes it custom', () => {
    const p = setHandleModel(fixtureProject(), 'pull-knob-30', MODEL, 'mm')
    expect(item(p, 'pull-knob-30').handle).toMatchObject({ style: 'custom', blobId: MODEL.blobId, unit: 'mm' })
    // A model's sizes win over the old style's explicit ones.
    expect(item(p, 'pull-knob-30').handle!.diameter).toBeUndefined()
  })

  it('guesses a handle-sized unit (a 1-unit glTF cube reads as 10 mm, not 1 m)', () => {
    expect(guessHandleUnit('glb', { x: 1, y: 1, z: 1 })).toBe('cm')
    expect(guessHandleUnit('glb', { x: 0.16, y: 0.03, z: 0.03 })).toBe('m')
    expect(guessHandleUnit('obj', { x: 128, y: 12, z: 30 })).toBe('mm')
    expect(guessHandleUnit('stl', { x: 0, y: 0, z: 0 })).toBe('mm')
  })
})

describe('catalog ops keep handles intact', () => {
  it('duplicates a handle as an independent copy', () => {
    const { project, copyId } = duplicateHardwareItem(fixtureProject(), 'pull-cup-96')
    const copy = item(project, copyId!)
    expect(copy.handle).toEqual(item(project, 'pull-cup-96').handle)
    expect(copy.handle).not.toBe(item(project, 'pull-cup-96').handle)
    expect(copy.name).toBe('Cup pull 96 mm c/c copy')
  })

  it('drops the handle when an unused item stops being a pull', () => {
    const p = updateHardwareItem(fixtureProject(), 'pull-knob-30', { kind: 'other' })
    expect(item(p, 'pull-knob-30').handle).toBeUndefined()
    expect(validateProject(p)).toBeNull()
  })
})
