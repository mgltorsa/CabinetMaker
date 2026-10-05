import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { HardwareItem, Project } from '@/core/types'
import { MAX_BAYS, MAX_CABINETS, MAX_SECTIONS } from './lib/limits'
import { validateProject } from './lib/projectSchema'
import { createDesignerStore, selectedCabinet } from './store'

function setup(project: Project = fixtureProject()) {
  const store = createDesignerStore(project)
  return { store, get: () => store.getState(), cab: () => store.getState().project.cabinets[0]! }
}

describe('designer store: selection and project', () => {
  it('selects the first cabinet initially', () => {
    const { get } = setup()
    expect(get().selectedCabinetId).toBe('cab_1')
    expect(selectedCabinet(get())?.id).toBe('cab_1')
  })

  it('ignores selection of an unknown cabinet by falling back to the first', () => {
    const { get } = setup()
    get().selectCabinet('nope')
    expect(get().selectedCabinetId).toBe('cab_1')
  })

  it('keeps a valid selection when the project is replaced', () => {
    const { get } = setup()
    const next = { ...fixtureProject(), cabinets: [] }
    get().setProject(next)
    expect(get().project).toBe(next)
    expect(get().selectedCabinetId).toBeNull()
  })

  it('newProject starts an empty project and opens the preset picker', () => {
    const { get } = setup()
    const before = get().project
    get().newProject()
    expect(get().project).not.toBe(before)
    expect(get().project.cabinets).toHaveLength(0)
    expect(get().selectedCabinetId).toBeNull()
    expect(get().isPickerOpen).toBe(true)
  })

  it('adding a preset closes the picker and selects the new cabinet', () => {
    const { get } = setup()
    get().newProject()
    get().addCabinetFromPreset('bookshelf')
    expect(get().isPickerOpen).toBe(false)
    expect(get().selectedCabinetId).toBe(get().project.cabinets[0]!.id)
    expect(get().section).toBe('design')
  })

  it('keeps the picker open while the project has no cabinets', () => {
    const { get } = setup()
    get().newProject()
    get().closePicker()
    expect(get().isPickerOpen).toBe(true)
  })

  it('switches workspace section and views', () => {
    const { get } = setup()
    get().setSection('outputs')
    get().setOutputView('estimate')
    get().setModelView('joinery')
    expect(get().section).toBe('outputs')
    expect(get().outputView).toBe('estimate')
    expect(get().modelView).toBe('joinery')
  })

  it('edits project name and units immutably', () => {
    const { get } = setup()
    const before = get().project
    get().setProjectName('Kitchen')
    get().setUnits('imperial')
    expect(get().project.name).toBe('Kitchen')
    expect(get().project.units).toBe('imperial')
    expect(before.name).toBe('Fixture')
    expect(before.units).toBe('metric')
  })

  it('does not create a new project when units are unchanged', () => {
    const { get } = setup()
    const before = get().project
    get().setUnits('metric')
    expect(get().project).toBe(before)
  })

  it('toggles view flags', () => {
    const { get } = setup()
    get().setViewToggle('doorsOpen', true)
    get().setViewToggle('back', false)
    expect(get().view.doorsOpen).toBe(true)
    expect(get().view.back).toBe(false)
  })
})

describe('designer store: cabinets', () => {
  it('updates dimensions without mutating the previous project', () => {
    const { get, cab } = setup()
    const before = get().project
    get().updateCabinet('cab_1', { width: 700, name: 'Wide' })
    expect(cab().width).toBe(700)
    expect(cab().name).toBe('Wide')
    expect(before.cabinets[0]!.width).toBe(600)
  })

  it('updates construction, hardware and top', () => {
    const { get, cab } = setup()
    const c = cab().construction
    get().updateConstruction('cab_1', { joinery: 'domino', toeKick: { ...c.toeKick, height: 120 } })
    get().updateCabinetHardware('cab_1', { pullId: null })
    get().updateCabinetTop('cab_1', { kind: 'countertop', thickness: 40 })
    expect(cab().construction.joinery).toBe('domino')
    expect(cab().construction.toeKick).toEqual({ ...c.toeKick, height: 120 })
    expect(cab().hardware.pullId).toBeNull()
    expect(cab().top.kind).toBe('countertop')
    expect(cab().top.thickness).toBe(40)
  })

  it('adds a cabinet from a preset with a unique name and selects it', () => {
    const { get } = setup()
    get().addCabinetFromPreset('base')
    const cabinets = get().project.cabinets
    expect(cabinets).toHaveLength(2)
    expect(new Set(cabinets.map((c) => c.id)).size).toBe(2)
    expect(new Set(cabinets.map((c) => c.name)).size).toBe(2)
    expect(get().selectedCabinetId).toBe(cabinets[1]!.id)
  })

  it('duplicates a cabinet with fresh section and bay ids', () => {
    const { get } = setup()
    get().duplicateCabinet('cab_1')
    const [orig, copy] = get().project.cabinets
    expect(copy).toBeDefined()
    expect(copy!.id).not.toBe(orig!.id)
    expect(copy!.name).toBe('Base cabinet copy')
    expect(copy!.width).toBe(orig!.width)
    expect(copy!.sections[0]!.id).not.toBe(orig!.sections[0]!.id)
    expect(copy!.sections[0]!.bays[0]!.id).not.toBe(orig!.sections[0]!.bays[0]!.id)
    expect(get().selectedCabinetId).toBe(copy!.id)
    // Editing the copy leaves the original alone.
    get().updateConstruction(copy!.id, { joinery: 'none' })
    expect(get().project.cabinets[0]!.construction.joinery).toBe('dado')
  })

  it('deletes a cabinet and moves the selection to a neighbour', () => {
    const { get } = setup()
    get().duplicateCabinet('cab_1')
    const copyId = get().selectedCabinetId!
    get().deleteCabinet(copyId)
    expect(get().project.cabinets.map((c) => c.id)).toEqual(['cab_1'])
    expect(get().selectedCabinetId).toBe('cab_1')
    get().deleteCabinet('cab_1')
    expect(get().project.cabinets).toEqual([])
    expect(get().selectedCabinetId).toBeNull()
  })

  it('ignores deleting an unknown cabinet', () => {
    const { get } = setup()
    const before = get().project
    get().deleteCabinet('missing')
    expect(get().project).toBe(before)
  })
})

describe('designer store: sections and bays', () => {
  it('adds, reorders and removes sections, keeping at least one', () => {
    const { get, cab } = setup()
    get().addSection('cab_1')
    expect(cab().sections).toHaveLength(2)
    const [first, second] = cab().sections
    get().moveSection('cab_1', second!.id, -1)
    expect(cab().sections.map((s) => s.id)).toEqual([second!.id, first!.id])
    get().moveSection('cab_1', second!.id, -1) // already first: no-op
    expect(cab().sections[0]!.id).toBe(second!.id)
    get().removeSection('cab_1', second!.id)
    get().removeSection('cab_1', first!.id) // last one stays
    expect(cab().sections.map((s) => s.id)).toEqual([first!.id])
  })

  it('sets a section width and resets it to auto', () => {
    const { get, cab } = setup()
    get().updateSection('cab_1', 'sec_1', { width: 300 })
    expect(cab().sections[0]!.width).toBe(300)
    get().updateSection('cab_1', 'sec_1', { width: null })
    expect(cab().sections[0]!.width).toBeNull()
  })

  it('adds, edits, reorders and removes bays, keeping at least one', () => {
    const { get, cab } = setup()
    get().addBay('cab_1', 'sec_1', 'drawer')
    const bays = () => cab().sections[0]!.bays
    expect(bays()).toHaveLength(3)
    expect(bays()[2]!.kind).toBe('drawer')
    get().updateBay('cab_1', 'sec_1', 'bay_1_2', { kind: 'door', doorCount: 1, hingeSide: 'right', shelfCount: 2, height: 400 })
    expect(bays()[1]).toMatchObject({ kind: 'door', doorCount: 1, hingeSide: 'right', shelfCount: 2, height: 400 })
    get().moveBay('cab_1', 'sec_1', 'bay_1_1', 1)
    expect(bays().map((b) => b.id).slice(0, 2)).toEqual(['bay_1_2', 'bay_1_1'])
    for (const b of bays()) get().removeBay('cab_1', 'sec_1', b.id)
    expect(bays()).toHaveLength(1)
  })

  it('sets every bay height of a section in one update', () => {
    const { get, cab } = setup()
    const before = get().project
    get().updateBayHeights('cab_1', 'sec_1', [180, null])
    expect(cab().sections[0]!.bays.map((b) => b.height)).toEqual([180, null])
    expect(before.cabinets[0]!.sections[0]!.bays[0]!.height).toBe(150)
  })

  it('ignores bay heights whose count does not match the section', () => {
    const { get } = setup()
    const before = get().project
    get().updateBayHeights('cab_1', 'sec_1', [180])
    get().updateBayHeights('cab_1', 'nope', [180, null])
    expect(get().project).toBe(before)
  })
})

describe('designer store: count limits keep the project valid', () => {
  it('stops adding and duplicating cabinets at the limit', () => {
    const { get } = setup()
    for (let i = 0; i < MAX_CABINETS + 3; i++) get().addCabinetFromPreset('wall')
    expect(get().project.cabinets).toHaveLength(MAX_CABINETS)
    const before = get().project
    get().duplicateCabinet('cab_1')
    expect(get().project).toBe(before)
    expect(validateProject(get().project)).toBeNull()
  })

  it('stops adding sections and bays at the limit', () => {
    const { get, cab } = setup()
    for (let i = 0; i < MAX_SECTIONS + 3; i++) get().addSection('cab_1')
    expect(cab().sections).toHaveLength(MAX_SECTIONS)
    for (let i = 0; i < MAX_BAYS + 3; i++) get().addBay('cab_1', 'sec_1', 'open')
    expect(cab().sections[0]!.bays).toHaveLength(MAX_BAYS)
    expect(validateProject(get().project)).toBeNull()
  })
})

const sideSlide: HardwareItem = {
  id: 'side-457',
  kind: 'slide',
  name: 'Side-mount slide 457 mm (pair)',
  manufacturer: 'Generic',
  sku: 'SIDE-457',
  unitCost: 15,
  props: { length: 457, mount: 1 },
}

/** Fixture whose catalog has only the undermount slides (plus `extra`). */
function undermountOnly(extra: HardwareItem[] = []): Project {
  const project = fixtureProject()
  project.hardware = [...project.hardware.filter((h) => h.kind !== 'slide' || h.props.mount === 0), ...extra]
  return project
}

describe('designer store: slide mount', () => {
  it('switches the slide to one of the new mount, closest in length', () => {
    const { get, cab } = setup(undermountOnly([{ ...sideSlide, id: 'side-305', props: { length: 305, mount: 1 } }, sideSlide]))
    get().setSlideMount('cab_1', 'side-mount')
    expect(cab().construction.drawer.slideMount).toBe('side-mount')
    expect(cab().hardware.slideId).toBe('side-457')
    get().setSlideMount('cab_1', 'undermount')
    expect(cab().construction.drawer.slideMount).toBe('undermount')
    expect(cab().hardware.slideId).toBe('blum-tandem-457')
  })

  it('keeps the slide when nothing of the new mount exists', () => {
    const { get, cab } = setup(undermountOnly())
    get().setSlideMount('cab_1', 'side-mount')
    expect(cab().construction.drawer.slideMount).toBe('side-mount')
    expect(cab().hardware.slideId).toBe('blum-tandem-533')
  })
})

describe('designer store: project settings', () => {
  it('updates machine, tools, nest and estimate settings', () => {
    const { get } = setup()
    get().updateMachine({ safeZ: 15, tabs: { ...get().project.machine.tabs, enabled: false } })
    get().updateTool('t1', { rpm: 16000 })
    get().updateNest({ kerf: 3 })
    get().updateEstimate({ shopRate: 80, margin: 0.3 })
    get().updateLabor({ minutesPerSheet: 12 })
    const p = get().project
    expect(p.machine.safeZ).toBe(15)
    expect(p.machine.tabs.enabled).toBe(false)
    expect(p.tools.find((t) => t.id === 't1')!.rpm).toBe(16000)
    expect(p.tools.find((t) => t.id === 't2')!.rpm).toBe(18000)
    expect(p.nest.kerf).toBe(3)
    expect(p.estimate.shopRate).toBe(80)
    expect(p.estimate.margin).toBe(0.3)
    expect(p.estimate.labor.minutesPerSheet).toBe(12)
    expect(p.estimate.labor.minutesPerPart).toBe(1.5)
  })
})
