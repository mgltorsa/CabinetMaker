import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Part, ProjectBuild, Sheet } from '@/core/types'
import { DEFAULT_VIEW } from '../store'
import { sheetFilename, slugify } from './download'
import { parseLengthField, parseNumberField, parseOptionalLengthField } from './fieldParse'
import { dimsLabel, lengthLabel, money } from './format'
import { buildProject } from '@/engine'
import { buildScene, isDrawerPart, isPartVisible, runOffsets } from './scene'
import { overallYield } from './sheets'

describe('field parsing', () => {
  it('parses metric and imperial lengths into mm', () => {
    expect(parseLengthField('600', 'metric')).toEqual({ ok: true, value: 600 })
    const inches = parseLengthField('23 5/8"', 'imperial')
    expect(inches.ok && inches.value).toBeCloseTo(600.075, 3)
  })

  it('rejects garbage and out-of-range values without producing NaN', () => {
    for (const text of ['', 'abc', 'NaN', '1/0', '12 furlongs']) {
      const r = parseLengthField(text, text === '1/0' ? 'imperial' : 'metric')
      expect(r.ok).toBe(false)
    }
    expect(parseLengthField('-5', 'metric', { min: 0 })).toEqual({ ok: false, error: 'Must be at least 0' })
    expect(parseLengthField('5000', 'metric', { max: 3000 }).ok).toBe(false)
    expect(parseLengthField('12mm', 'metric')).toEqual({ ok: true, value: 12 })
  })

  it('treats an empty optional length as auto', () => {
    expect(parseOptionalLengthField('  ', 'metric')).toEqual({ ok: true, value: null })
    expect(parseOptionalLengthField('300', 'metric')).toEqual({ ok: true, value: 300 })
    expect(parseOptionalLengthField('x', 'metric').ok).toBe(false)
  })

  it('parses plain numbers with integer and range rules', () => {
    expect(parseNumberField('3', { integer: true, min: 0 })).toEqual({ ok: true, value: 3 })
    expect(parseNumberField('2.5', { integer: true })).toEqual({ ok: false, error: 'Enter a whole number' })
    expect(parseNumberField('', {}).ok).toBe(false)
    expect(parseNumberField('Infinity', {}).ok).toBe(false)
  })
})

describe('formatting and downloads', () => {
  it('labels lengths in project units', () => {
    expect(lengthLabel(564, 'metric')).toBe('564 mm')
    expect(lengthLabel(600.075, 'imperial')).toBe('23 5/8"')
    expect(dimsLabel({ length: 564, width: 580, thickness: 18 }, 'metric')).toBe('564 × 580 × 18 mm')
  })

  it('falls back when the currency code is invalid', () => {
    expect(money(12.5, 'not-a-code')).toBe('12.50 not-a-code')
  })

  it('slugs project names for file names', () => {
    expect(slugify('Kitchen Run #2')).toBe('kitchen-run-2')
    expect(slugify('Café  Cabinets!')).toBe('cafe-cabinets')
    expect(slugify('***')).toBe('cabinet-project')
    expect(sheetFilename('untitled-cabinet', { materialId: 'ply-18', index: 2 })).toBe('untitled-cabinet-ply-18-2.nc')
  })
})

describe('nest stats', () => {
  const sheet = (length: number, width: number, y: number): Sheet => ({
    id: `m#${length}`,
    materialId: 'm',
    index: 0,
    length,
    width,
    thickness: 18,
    placements: [],
    yield: y,
  })

  it('weights yield by sheet area', () => {
    expect(overallYield([])).toBe(0)
    expect(overallYield([sheet(100, 100, 1), sheet(100, 300, 0)])).toBeCloseTo(0.25)
  })
})

describe('3D scene', () => {
  const part = (over: Partial<Part>): Part => ({
    id: 'c:x',
    cabinetId: 'cab_1',
    name: 'X',
    group: 'carcass',
    role: 'x',
    length: 100,
    width: 100,
    thickness: 18,
    materialId: 'ply-18',
    grain: 'length',
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 200, z: 300 } },
    axes: { length: 'y', width: 'z', thickness: 'x' },
    ops: [],
    ...over,
  })
  const buildOf = (parts: Part[]): ProjectBuild => ({ cabinets: [], parts, hardware: [], warnings: [] })

  const opts = { units: 'metric' as const, selectedCabinetId: 'cab_1' }

  it('hides groups by toggle', () => {
    expect(isPartVisible(part({ group: 'front', role: 'door-1-2-1' }), { ...DEFAULT_VIEW, doors: false })).toBe(false)
    expect(isPartVisible(part({ group: 'front', role: 'drawer-front-1-1' }), { ...DEFAULT_VIEW, doors: false })).toBe(true)
    expect(isPartVisible(part({ group: 'front', role: 'drawer-front-1-1' }), { ...DEFAULT_VIEW, drawerFaces: false })).toBe(false)
    expect(isPartVisible(part({ group: 'drawer-box' }), { ...DEFAULT_VIEW, drawers: false })).toBe(false)
    expect(isPartVisible(part({ group: 'back' }), { ...DEFAULT_VIEW, back: false })).toBe(false)
    expect(isPartVisible(part({ group: 'carcass' }), { ...DEFAULT_VIEW, back: false, doors: false, top: false, drawers: false, drawerFaces: false })).toBe(true)
  })

  it('recognises drawer parts', () => {
    expect(isDrawerPart(part({ group: 'drawer-box' }))).toBe(true)
    expect(isDrawerPart(part({ group: 'front', role: 'drawer-front-1' }))).toBe(true)
    expect(isDrawerPart(part({ group: 'front', role: 'door-left' }))).toBe(false)
  })

  it('builds metre-scale meshes centred on the run in X, backs on the wall plane', () => {
    const { cabinets } = fixtureProject()
    const scene = buildScene(buildOf([part({})]), cabinets, DEFAULT_VIEW, opts)
    expect(scene.meshes).toHaveLength(1)
    const mesh = scene.meshes[0]!
    expect(mesh.size).toEqual([0.1, 0.2, 0.3])
    expect(mesh.position).toEqual([0, 0.1, 0.15])
    expect(mesh.finish).toBe('carcass')
  })

  it('slides drawer parts out along +Z when drawers are open', () => {
    const { cabinets } = fixtureProject()
    const drawer = part({ id: 'c:d', group: 'drawer-box', role: 'drawer-1-side' })
    const carcass = part({ id: 'c:s' })
    const closed = buildScene(buildOf([carcass, drawer]), cabinets, DEFAULT_VIEW, opts)
    const open = buildScene(buildOf([carcass, drawer]), cabinets, { ...DEFAULT_VIEW, drawersOpen: true }, opts)
    const z = (s: typeof open, id: string) => s.meshes.find((m) => m.partId === id)!.position[2]
    expect(z(open, 'c:d') - z(open, 'c:s')).toBeGreaterThan(z(closed, 'c:d') - z(closed, 'c:s'))
  })

  it('swings doors outward on their hinge side', () => {
    const project = fixtureProject()
    const bay = project.cabinets[0]!.sections[0]!.bays[1]!
    bay.doorCount = 1
    for (const side of ['left', 'right'] as const) {
      bay.hingeSide = side
      const build = buildProject(project)
      const door = build.parts.find((p) => p.group === 'front' && p.role.startsWith('door'))!
      const closed = buildScene(build, project.cabinets, DEFAULT_VIEW, opts).meshes.find((m) => m.partId === door.id)!
      const open = buildScene(build, project.cabinets, { ...DEFAULT_VIEW, doorsOpen: true }, opts).meshes.find((m) => m.partId === door.id)!
      expect(open.position[2]).toBeGreaterThan(closed.position[2]) // swings out of the cabinet
      expect(Math.sign(open.position[0] - closed.position[0])).toBe(side === 'left' ? -1 : 1) // towards the hinge
    }
  })

  it('places pulls on show faces and shelf-pin holes on inside faces', () => {
    const project = fixtureProject()
    const scene = buildScene(buildProject(project), project.cabinets, DEFAULT_VIEW, opts)
    expect(scene.pulls.length).toBe(3) // one drawer + two doors
    for (const pull of scene.pulls) expect(pull.normal).toEqual([0, 0, 1])
    expect(scene.pinHoles.length).toBeGreaterThan(0)
    // Pins on the left side point right (into the cabinet), on the right side point left.
    expect(new Set(scene.pinHoles.map((h) => h.normal[0]))).toEqual(new Set([1, -1]))
  })

  it('dimensions the selected cabinet in project units', () => {
    const project = fixtureProject()
    const build = buildProject(project)
    const metric = buildScene(build, project.cabinets, DEFAULT_VIEW, opts)
    expect(metric.dimensions.map((d) => d.label)).toEqual(['600', '870', '580'])
    const imperial = buildScene(build, project.cabinets, DEFAULT_VIEW, { ...opts, units: 'imperial' })
    expect(imperial.dimensions[0]!.label).toBe('23 5/8"')
    expect(buildScene(build, project.cabinets, { ...DEFAULT_VIEW, dimensions: false }, opts).dimensions).toEqual([])
  })

  it('stacks wall cabinets in an upper run from the left', () => {
    const project = fixtureProject()
    const base = project.cabinets[0]!
    const wall = { ...base, id: 'cab_w', type: 'wall' as const }
    const offsets = runOffsets([base, { ...base, id: 'cab_2' }, wall])
    expect(offsets.get('cab_2')).toBeGreaterThan(0)
    expect(offsets.get('cab_w')).toBe(0)
  })

  it('handles an empty build', () => {
    expect(buildScene(buildOf([]), [], DEFAULT_VIEW, opts).meshes).toEqual([])
  })
})

describe('3D dimension lines', () => {
  it('measure exactly what their labels say, even with a countertop overhang', () => {
    const project = fixtureProject()
    const cab = project.cabinets[0]!
    cab.top = { kind: 'countertop', materialId: null, thickness: 30, overhangFront: 25, overhangSides: 20 }
    const scene = buildScene(buildProject(project), project.cabinets, DEFAULT_VIEW, { units: 'metric', selectedCabinetId: cab.id })
    const length = (id: string): number => {
      const d = scene.dimensions.find((x) => x.id === id)!
      return Math.hypot(d.to[0] - d.from[0], d.to[1] - d.from[1], d.to[2] - d.from[2]) * 1000
    }
    expect(length('width')).toBeCloseTo(cab.width, 6)
    expect(length('height')).toBeCloseTo(cab.height, 6)
    expect(length('depth')).toBeCloseTo(cab.depth, 6)
  })
})

describe('3D supplied countertop', () => {
  it('shows a countertop that is supplied separately (not cut), and hides it with the Top pill', () => {
    const project = fixtureProject()
    project.cabinets[0]!.top = { kind: 'countertop', materialId: null, thickness: 30, overhangFront: 25, overhangSides: 0 }
    const build = buildProject(project)
    expect(build.parts.some((p) => p.group === 'top')).toBe(false)
    const opts = { units: 'metric' as const, selectedCabinetId: 'cab_1' }
    const shown = buildScene(build, project.cabinets, DEFAULT_VIEW, opts)
    expect(shown.meshes.some((m) => m.finish === 'top')).toBe(true)
    expect(buildScene(build, project.cabinets, { ...DEFAULT_VIEW, top: false }, opts).meshes.some((m) => m.finish === 'top')).toBe(false)
  })
})

describe('3D camera focus', () => {
  it('frames the selected cabinet, not the whole run', () => {
    const project = fixtureProject()
    const base = project.cabinets[0]!
    project.cabinets = [base, { ...base, id: 'cab_2', width: 900 }]
    const build = buildProject(project)
    const scene = buildScene(build, project.cabinets, DEFAULT_VIEW, { units: 'metric', selectedCabinetId: 'cab_2' })
    const offsets = runOffsets(project.cabinets)
    const runWidth = (offsets.get('cab_2')! + 900) / 1000
    // cab_2 centre in centred run coordinates.
    expect(scene.focus.target[0]).toBeCloseTo((offsets.get('cab_2')! + 450) / 1000 - runWidth / 2, 2)
    expect(scene.focus.size).toBeCloseTo(0.9, 6)
  })
})
