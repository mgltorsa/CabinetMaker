import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Project } from '@/core/types'
import { runPipeline } from '@/pipeline'
import {
  addExtraCharge,
  addHardwareItem,
  DEFAULT_HARDWARE_PROPS,
  deleteHardwareItem,
  duplicateHardwareItem,
  hardwareUses,
  removeExtraCharge,
  replaceHardwareItem,
  replacementCandidates,
  setHardwareProp,
  updateExtraCharge,
  updateHardwareItem,
} from './costOps'
import { MAX_CATALOG_ITEMS, MAX_EXTRA_CHARGES } from './lib/limits'
import { validateProject } from './lib/projectSchema'

const HINGE = 'blum-cliptop-110'
const PULL = 'pull-bar-128'
const DOWEL = 'dowel-8x30'

/** Every cabinet hardware reference points at a catalog item of the right kind. */
function danglingRefs(project: Project): string[] {
  const kinds = new Map(project.hardware.map((h) => [h.id, h.kind]))
  return project.cabinets.flatMap((c) => {
    const refs: [string | null, string][] = [
      [c.hardware.hingeId, 'hinge'],
      [c.hardware.slideId, 'slide'],
      [c.hardware.pullId, 'pull'],
      [c.hardware.shelfPinId, 'shelf-pin'],
    ]
    return refs.filter(([id, kind]) => id !== null && kinds.get(id) !== kind).map(([id]) => `${c.id}:${id}`)
  })
}

function twoCabinets(): Project {
  const base = fixtureProject()
  const second = { ...structuredClone(base.cabinets[0]!), id: 'cab_2', name: 'Second' }
  return { ...base, cabinets: [...base.cabinets, second] }
}

describe('hardwareUses', () => {
  it('lists every cabinet slot that references an item', () => {
    expect(hardwareUses(twoCabinets(), HINGE)).toEqual([
      { cabinetId: 'cab_1', cabinetName: 'Base cabinet', slot: 'hingeId' },
      { cabinetId: 'cab_2', cabinetName: 'Second', slot: 'hingeId' },
    ])
  })

  it('is empty for items the cabinets do not reference (picked by kind or unused)', () => {
    expect(hardwareUses(fixtureProject(), DOWEL)).toEqual([])
    expect(hardwareUses(fixtureProject(), 'nope')).toEqual([])
  })
})

describe('addHardwareItem', () => {
  it('appends an item of the kind with default props, a fresh id and a unique name', () => {
    const project = fixtureProject()
    const first = addHardwareItem(project, 'slide')
    const second = addHardwareItem(first.project, 'slide')
    const added = second.project.hardware.slice(-2)
    expect(added.map((h) => h.kind)).toEqual(['slide', 'slide'])
    expect(added[0]!.props).toEqual(DEFAULT_HARDWARE_PROPS.slide)
    expect(added.map((h) => h.id)).toEqual([first.id, second.id])
    expect(new Set(second.project.hardware.map((h) => h.id)).size).toBe(second.project.hardware.length)
    expect(added[0]!.name).not.toBe(added[1]!.name)
    expect(project.hardware).toHaveLength(fixtureProject().hardware.length)
    expect(validateProject(second.project)).toBeNull()
  })

  it('refuses to grow the catalog past its limit', () => {
    const base = fixtureProject()
    const full = { ...base, hardware: Array.from({ length: MAX_CATALOG_ITEMS }, (_, i) => ({ ...base.hardware[0]!, id: `h${i}` })) }
    expect(addHardwareItem(full, 'pull')).toEqual({ project: full, id: null })
  })
})

describe('updateHardwareItem / setHardwareProp', () => {
  it('edits fields immutably and the estimate follows the new unit cost', () => {
    const project = fixtureProject()
    const next = updateHardwareItem(project, HINGE, { unitCost: 10, name: 'Hinge', manufacturer: 'Acme', sku: 'H-1' })
    expect(next.hardware.find((h) => h.id === HINGE)).toMatchObject({ unitCost: 10, name: 'Hinge', manufacturer: 'Acme', sku: 'H-1' })
    expect(project.hardware.find((h) => h.id === HINGE)!.unitCost).toBe(6.5)
    const line = runPipeline(next).estimate.hardware.find((l) => l.refId === HINGE)!
    expect(line.unitCost).toBe(10)
    expect(line.total).toBe(line.qty * 10)
  })

  it('resets props to the new kind defaults when an unused item changes kind', () => {
    const next = updateHardwareItem(fixtureProject(), DOWEL, { kind: 'pull' })
    expect(next.hardware.find((h) => h.id === DOWEL)).toMatchObject({ kind: 'pull', props: DEFAULT_HARDWARE_PROPS.pull })
  })

  it('keeps the kind of an item a cabinet uses, so references never dangle', () => {
    const project = fixtureProject()
    expect(updateHardwareItem(project, HINGE, { kind: 'pull' })).toBe(project)
    const renamed = updateHardwareItem(project, HINGE, { kind: 'hinge', name: 'Renamed' })
    expect(renamed.hardware.find((h) => h.id === HINGE)!.name).toBe('Renamed')
  })

  it('sets one prop and keeps the others', () => {
    const next = setHardwareProp(fixtureProject(), 'blum-tandem-457', 'mount', 1)
    expect(next.hardware.find((h) => h.id === 'blum-tandem-457')!.props).toEqual({ length: 457, mount: 1 })
  })

  it('returns the same project for an unknown id', () => {
    const project = fixtureProject()
    expect(updateHardwareItem(project, 'nope', { unitCost: 1 })).toBe(project)
    expect(setHardwareProp(project, 'nope', 'length', 1)).toBe(project)
  })
})

describe('duplicateHardwareItem', () => {
  it('inserts a copy with a fresh id and name right after the source', () => {
    const project = fixtureProject()
    const index = project.hardware.findIndex((h) => h.id === HINGE)
    const { project: next, copyId } = duplicateHardwareItem(project, HINGE)
    const copy = next.hardware[index + 1]!
    expect(copy.id).toBe(copyId)
    expect(copy.id).not.toBe(HINGE)
    expect(copy).toMatchObject({ kind: 'hinge', unitCost: 6.5, props: { openingAngle: 110, cupDiameter: 35 } })
    expect(copy.name).toMatch(/copy/)
    expect(copy.props).not.toBe(project.hardware[index]!.props)
    expect(validateProject(next)).toBeNull()
  })

  it('is a no-op for an unknown id', () => {
    const project = fixtureProject()
    expect(duplicateHardwareItem(project, 'nope')).toEqual({ project, copyId: null })
  })
})

describe('deleteHardwareItem', () => {
  it('removes an unused item', () => {
    const next = deleteHardwareItem(fixtureProject(), DOWEL)
    expect(next.hardware.some((h) => h.id === DOWEL)).toBe(false)
  })

  it('refuses to delete an item a cabinet uses', () => {
    const project = fixtureProject()
    expect(deleteHardwareItem(project, HINGE)).toBe(project)
    expect(deleteHardwareItem(project, 'nope')).toBe(project)
  })
})

describe('replaceHardwareItem', () => {
  it('offers the other items of the same kind as replacements', () => {
    const { project } = duplicateHardwareItem(fixtureProject(), HINGE)
    expect(replacementCandidates(project, HINGE).map((h) => h.kind)).toEqual(['hinge'])
    expect(replacementCandidates(fixtureProject(), HINGE)).toEqual([])
  })

  it('moves every cabinet onto the replacement, then deletes the item', () => {
    const { project, copyId } = duplicateHardwareItem(twoCabinets(), HINGE)
    const next = replaceHardwareItem(project, HINGE, copyId)
    expect(next.hardware.some((h) => h.id === HINGE)).toBe(false)
    expect(next.cabinets.map((c) => c.hardware.hingeId)).toEqual([copyId, copyId])
    expect(danglingRefs(next)).toEqual([])
    expect(validateProject(next)).toBeNull()
  })

  it('can replace a pull with no pull', () => {
    const next = replaceHardwareItem(fixtureProject(), PULL, null)
    expect(next.cabinets[0]!.hardware.pullId).toBeNull()
    expect(next.hardware.some((h) => h.id === PULL)).toBe(false)
  })

  it.each([
    ['a replacement of another kind', PULL, 'pin-5'],
    ['the item itself', HINGE, HINGE],
    ['a missing replacement', HINGE, 'nope'],
    ['no replacement for a hinge', HINGE, null],
    ['an unknown item', 'nope', HINGE],
  ])('refuses %s', (_, id, replacement) => {
    const project = fixtureProject()
    expect(replaceHardwareItem(project, id, replacement)).toBe(project)
  })

  it('refuses "no pull" when a non-pull slot (wrongly) references the pull', () => {
    const base = fixtureProject()
    const cab = base.cabinets[0]!
    const project = { ...base, cabinets: [{ ...cab, hardware: { ...cab.hardware, hingeId: PULL } }] }
    expect(replaceHardwareItem(project, PULL, null)).toBe(project)
  })
})

describe('extra charges', () => {
  it('adds, edits and removes lines immutably', () => {
    const project = fixtureProject()
    const added = addExtraCharge(project)
    expect(project.estimate.extras).toEqual([])
    const extras = added.project.estimate.extras ?? []
    expect(extras).toHaveLength(1)
    expect(extras[0]).toMatchObject({ id: added.id, qty: 1, unit: 'job', unitCost: 0 })

    const edited = updateExtraCharge(added.project, added.id!, { label: 'Installation', qty: 3, unit: 'h', unitCost: 50 })
    expect(edited.estimate.extras![0]).toEqual({ id: added.id, label: 'Installation', qty: 3, unit: 'h', unitCost: 50 })
    expect(validateProject(edited)).toBeNull()
    expect(runPipeline(edited).estimate.extrasCost).toBe(150)

    expect(removeExtraCharge(edited, added.id!).estimate.extras).toEqual([])
  })

  it('works on a project saved without extras', () => {
    const base = fixtureProject()
    const legacy: Project = { ...base, estimate: { currency: 'USD', shopRate: 60, margin: 0.2, linearWaste: 0, labor: base.estimate.labor } }
    const { project, id } = addExtraCharge(legacy)
    expect(project.estimate.extras?.map((x) => x.id)).toEqual([id])
  })

  it('gives each new line a unique id and label, up to the limit', () => {
    let project = fixtureProject()
    for (let i = 0; i < MAX_EXTRA_CHARGES; i++) project = addExtraCharge(project).project
    const extras = project.estimate.extras ?? []
    expect(new Set(extras.map((x) => x.id)).size).toBe(MAX_EXTRA_CHARGES)
    expect(new Set(extras.map((x) => x.label)).size).toBe(MAX_EXTRA_CHARGES)
    expect(addExtraCharge(project)).toEqual({ project, id: null })
    expect(validateProject(project)).toBeNull()
  })

  it('returns the same project for unknown ids', () => {
    const project = fixtureProject()
    expect(updateExtraCharge(project, 'nope', { qty: 2 })).toBe(project)
    expect(removeExtraCharge(project, 'nope')).toBe(project)
  })
})
