import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Project } from '@/core/types'
import { buildBom } from './bom'
import { dado, hole, makeBuild, makeNest, makePart, usage } from './test-fixtures'

function twoCabinetProject(): Project {
  const base = fixtureProject()
  const first = base.cabinets[0]!
  return { ...base, cabinets: [{ ...first, id: 'cab_a', name: 'A' }, { ...first, id: 'cab_b', name: 'B' }] }
}

describe('buildBom part schedule', () => {
  it('emits one row per part sorted by cabinet order, then group, then name', () => {
    const parts = [
      makePart({ id: 'cab_b:side', cabinetId: 'cab_b', name: 'Side', group: 'carcass' }),
      makePart({ id: 'cab_a:shelf-10', cabinetId: 'cab_a', name: 'Shelf 10', group: 'shelf' }),
      makePart({ id: 'cab_a:front', cabinetId: 'cab_a', name: 'Door', group: 'front' }),
      makePart({ id: 'cab_a:shelf-2', cabinetId: 'cab_a', name: 'Shelf 2', group: 'shelf' }),
      makePart({ id: 'cab_a:side-r', cabinetId: 'cab_a', name: 'Side right', group: 'carcass' }),
      makePart({ id: 'cab_a:side-l', cabinetId: 'cab_a', name: 'Side left', group: 'carcass' }),
      makePart({ id: 'cab_z:orphan', cabinetId: 'cab_z', name: 'Orphan', group: 'carcass' }),
    ]
    const bom = buildBom(twoCabinetProject(), makeBuild(parts), makeNest([]))
    expect(bom.parts.map((r) => r.partId)).toEqual([
      'cab_a:side-l',
      'cab_a:side-r',
      'cab_a:shelf-2',
      'cab_a:shelf-10',
      'cab_a:front',
      'cab_b:side',
      'cab_z:orphan',
    ])
  })

  it('copies part dimensions, material, grain and op count', () => {
    const part = makePart({ id: 'p', length: 720, width: 560, thickness: 18, grain: 'width', ops: [dado('o1'), hole('o2', 'shelf-pin')] })
    const [row] = buildBom(fixtureProject(), makeBuild([part]), makeNest([])).parts
    expect(row).toEqual({
      partId: 'p',
      cabinetId: 'cab_1',
      name: 'p',
      materialId: 'ply-18',
      length: 720,
      width: 560,
      thickness: 18,
      grain: 'width',
      opCount: 2,
    })
  })

  it('does not mutate the build', () => {
    const parts = [makePart({ id: 'b', name: 'B' }), makePart({ id: 'a', name: 'A' })]
    const build = makeBuild(parts)
    const snapshot = structuredClone(build)
    buildBom(fixtureProject(), build, makeNest([]))
    expect(build).toEqual(snapshot)
  })
})

describe('buildBom sheet lines', () => {
  it('counts nest sheets per material in first-appearance order', () => {
    const nest = makeNest([
      { materialId: 'ply-18', partIds: ['a'] },
      { materialId: 'mdf-18', partIds: ['b'] },
      { materialId: 'ply-18', partIds: ['c'] },
      { materialId: 'ply-18', partIds: [] },
    ])
    const lines = buildBom(fixtureProject(), makeBuild([]), nest).lines
    expect(lines).toEqual([
      { category: 'sheet', refId: 'ply-18', description: '18 mm plywood (2440 × 1220 mm)', qty: 3, unit: 'sheet', unitCost: 85, total: 255 },
      { category: 'sheet', refId: 'mdf-18', description: '18 mm MDF (paint-grade fronts) (2440 × 1220 mm)', qty: 1, unit: 'sheet', unitCost: 55, total: 55 },
    ])
  })

  it('describes sheet sizes in inches for imperial projects', () => {
    const project: Project = { ...fixtureProject(), units: 'imperial' }
    const [line] = buildBom(project, makeBuild([]), makeNest([{ materialId: 'ply-18', partIds: [] }])).lines
    expect(line?.description).toBe('18 mm plywood (96 1/16" × 48 1/16")')
  })

  it('flags a sheet material missing from the catalog with zero cost', () => {
    const nest = makeNest([{ materialId: 'ghost', partIds: [] }, { materialId: 'maple-19x63', partIds: [] }])
    const lines = buildBom(fixtureProject(), makeBuild([]), nest).lines
    expect(lines).toEqual([
      { category: 'sheet', refId: 'ghost', description: 'ghost (not in catalog)', qty: 1, unit: 'sheet', unitCost: 0, total: 0 },
      { category: 'sheet', refId: 'maple-19x63', description: 'maple-19x63 (not in catalog)', qty: 1, unit: 'sheet', unitCost: 0, total: 0 },
    ])
  })
})

describe('buildBom linear lines', () => {
  const maple = (id: string, length: number) => makePart({ id, materialId: 'maple-19x63', group: 'face-frame', length, width: 38, thickness: 19 })

  it('totals linear part lengths with waste, in metres, with the board count', () => {
    const parts = [maple('s1', 1000), maple('s2', 700)]
    const lines = buildBom(fixtureProject(), makeBuild(parts), makeNest([], ['s1', 's2'])).lines
    // 1700 mm × 1.15 = 1955 mm → 1.955 m × 12 = 23.46; ceil(1955 / 2440) = 1 board
    expect(lines).toEqual([
      {
        category: 'linear',
        refId: 'maple-19x63',
        description: 'Maple 19 × 63 mm (face frames): 1.7 m net + 15% waste, 1 × 2440 mm board',
        qty: 1.955,
        unit: 'm',
        unitCost: 12,
        total: 23.46,
      },
    ])
  })

  it('counts several stock boards and pluralises', () => {
    const parts = [maple('s1', 2400), maple('s2', 2400)]
    const [line] = buildBom(fixtureProject(), makeBuild(parts), makeNest([], ['s1', 's2'])).lines
    // 4800 × 1.15 = 5520 mm → ceil(5520 / 2440) = 3 boards
    expect(line?.description).toContain('3 × 2440 mm boards')
    expect(line?.qty).toBe(5.52)
    expect(line?.total).toBe(66.24)
  })

  it('clamps negative waste to zero', () => {
    const base = fixtureProject()
    const project: Project = { ...base, estimate: { ...base.estimate, linearWaste: -0.5 } }
    const [line] = buildBom(project, makeBuild([maple('s1', 1000)]), makeNest([], ['s1'])).lines
    expect(line?.qty).toBe(1)
    expect(line?.description).toContain('+ 0% waste')
  })

  it('ignores linear ids that are not parts of the build', () => {
    const lines = buildBom(fixtureProject(), makeBuild([]), makeNest([], ['nope'])).lines
    expect(lines).toEqual([])
  })

  it('flags linear parts whose material is not linear stock in the catalog', () => {
    const parts = [makePart({ id: 'x', materialId: 'ghost', length: 500 }), makePart({ id: 'y', materialId: 'ply-18', length: 500 })]
    const lines = buildBom(fixtureProject(), makeBuild(parts), makeNest([], ['x', 'y'])).lines
    expect(lines.map((l) => [l.refId, l.description, l.unitCost, l.total, l.qty])).toEqual([
      ['ghost', 'ghost (not in catalog)', 0, 0, 0.575],
      ['ply-18', 'ply-18 (not in catalog)', 0, 0, 0.575],
    ])
  })

  it('omits the board count when the stock length is not positive', () => {
    const base = fixtureProject()
    const project: Project = {
      ...base,
      materials: base.materials.map((m) => (m.kind === 'linear' ? { ...m, stockLength: 0 } : m)),
    }
    const [line] = buildBom(project, makeBuild([maple('s1', 1000)]), makeNest([], ['s1'])).lines
    expect(line?.description).toBe('Maple 19 × 63 mm (face frames): 1 m net + 15% waste')
  })
})

describe('buildBom hardware lines', () => {
  it('aggregates usage by hardware id across cabinets with manufacturer and SKU', () => {
    const hw = [usage('blum-cliptop-110', 4, 'cab_a'), usage('pin-5', 8, 'cab_a'), usage('blum-cliptop-110', 2, 'cab_b')]
    const lines = buildBom(twoCabinetProject(), makeBuild([], hw), makeNest([])).lines
    expect(lines).toEqual([
      {
        category: 'hardware',
        refId: 'blum-cliptop-110',
        description: 'Concealed hinge 110°, full overlay',
        manufacturer: 'Blum',
        sku: 'CLIP top 71B3550',
        qty: 6,
        unit: 'pcs',
        unitCost: 6.5,
        total: 39,
      },
      { category: 'hardware', refId: 'pin-5', description: 'Shelf pin 5 mm', manufacturer: 'Generic', sku: 'PIN-5', qty: 8, unit: 'pcs', unitCost: 0.15, total: 1.2 },
    ])
  })

  it('flags hardware missing from the catalog with zero cost', () => {
    const [line] = buildBom(fixtureProject(), makeBuild([], [usage('acme-9000', 3)]), makeNest([])).lines
    expect(line).toEqual({ category: 'hardware', refId: 'acme-9000', description: 'acme-9000 (not in catalog)', qty: 3, unit: 'pcs', unitCost: 0, total: 0 })
  })

  it('drops hardware whose total quantity is not positive', () => {
    const hw = [usage('pin-5', 0), usage('pull-bar-128', Number.NaN), usage('dowel-8x30', -2)]
    expect(buildBom(fixtureProject(), makeBuild([], hw), makeNest([])).lines).toEqual([])
  })
})

describe('buildBom catalog price guards', () => {
  it('treats negative or non-finite catalog prices as zero', () => {
    const base = fixtureProject()
    const project: Project = {
      ...base,
      materials: base.materials.map((m) => (m.kind === 'sheet' ? { ...m, costPerSheet: -85 } : { ...m, costPerMetre: Number.NaN })),
      hardware: base.hardware.map((h) => ({ ...h, unitCost: -1 })),
    }
    const parts = [makePart({ id: 's', materialId: 'maple-19x63', length: 100 })]
    const bom = buildBom(project, makeBuild(parts, [usage('pin-5', 3)]), makeNest([{ materialId: 'ply-18', partIds: [] }], ['s']))
    expect(bom.lines.map((l) => [l.unitCost, l.total])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ])
  })
})

describe('buildBom line order', () => {
  it('lists sheets, then linear stock, then hardware', () => {
    const parts = [makePart({ id: 's', materialId: 'maple-19x63', length: 100 })]
    const bom = buildBom(fixtureProject(), makeBuild(parts, [usage('pin-5', 1)]), makeNest([{ materialId: 'ply-18', partIds: [] }], ['s']))
    expect(bom.lines.map((l) => l.category)).toEqual(['sheet', 'linear', 'hardware'])
  })
})
