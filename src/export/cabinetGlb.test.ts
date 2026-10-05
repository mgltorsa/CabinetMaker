import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Cabinet, CabinetBuild, Part, Project } from '@/core/types'
import { createPreset } from '@/engine'
import { runPipeline } from '@/pipeline'
import { cabinetToGlb, exportParts } from './cabinetGlb'
import { accessorValues, parseGlb, type ParsedGlb } from './testing/glbCheck'

interface Built {
  project: Project
  cabinet: Cabinet
  build: CabinetBuild
}

function built(edit: (p: Project) => void = () => {}, index = 0): Built {
  const project = fixtureProject()
  edit(project)
  const result = runPipeline(project)
  const cabinet = project.cabinets[index]!
  const build = result.build.cabinets.find((c) => c.cabinetId === cabinet.id)!
  return { project, cabinet, build }
}

function exported(b: Built, options = {}): ParsedGlb {
  return parseGlb(cabinetToGlb(b.cabinet, b.build, b.project, options))
}

const withCountertop = (p: Project): void => {
  p.cabinets[0]!.top = { ...p.cabinets[0]!.top, kind: 'countertop', materialId: null }
}

const rootOf = (glb: ParsedGlb) => glb.json.nodes![glb.json.scenes![glb.json.scene ?? 0]!.nodes[0]!]!
const childrenOf = (glb: ParsedGlb) => rootOf(glb).children!.map((i) => glb.json.nodes![i]!)
const centreM = (p: Part): number[] => (['x', 'y', 'z'] as const).map((k) => (p.bounds.min[k] + p.bounds.max[k]) / 2 / 1000)

describe('cabinetToGlb structure', () => {
  it('writes a valid GLB (header, alignment, accessors, buffer views)', () => {
    const glb = exported(built())
    expect(glb.problems).toEqual([])
    expect(glb.json.asset.version).toBe('2.0')
    expect(glb.json.asset.generator).toMatch(/CabinetMaker/)
  })

  it('has one scene with one root node named after the cabinet', () => {
    const b = built()
    const glb = exported(b)
    expect(glb.json.scenes).toHaveLength(1)
    expect(glb.json.scenes![0]!.nodes).toHaveLength(1)
    expect(glb.json.scenes![0]!.name).toBeUndefined()
    expect(rootOf(glb).name).toBe(b.cabinet.name)
    expect(rootOf(glb).mesh).toBeUndefined()
  })

  it('has one child node and one mesh per part, named after the part', () => {
    const b = built()
    const glb = exported(b)
    const children = childrenOf(glb)
    expect(children.map((n) => n.name)).toEqual(b.build.parts.map((p) => p.name))
    expect(children.map((n) => n.name)).toContain('Left side')
    expect(glb.json.meshes).toHaveLength(b.build.parts.length)
    children.forEach((n, i) => {
      expect(n.mesh).toBe(i)
      expect(glb.json.meshes![n.mesh!]!.name).toBe(b.build.parts[i]!.name)
    })
  })

  it('never scales or rotates nodes', () => {
    const glb = exported(built())
    for (const n of glb.json.nodes!) {
      expect(n.scale).toBeUndefined()
      expect(n.rotation).toBeUndefined()
      expect(n.matrix).toBeUndefined()
    }
  })
})

describe('cabinetToGlb coordinates (metres, Y-up, cabinet space)', () => {
  it("puts each part's node at its bounds centre in metres", () => {
    const b = built()
    const glb = exported(b)
    childrenOf(glb).forEach((n, i) => {
      const part = b.build.parts[i]!
      n.translation!.forEach((v, k) => expect(v).toBeCloseTo(centreM(part)[k]!, 9))
    })
    // Spot check: the left side sits at x = 9 mm (18 mm panel from x = 0).
    const left = childrenOf(glb).find((n) => n.name === 'Left side')!
    expect(left.translation![0]).toBeCloseTo(0.009, 9)
  })

  it('writes vertices relative to the node: a box of the part size centred on the origin', () => {
    const b = built()
    const glb = exported(b)
    childrenOf(glb).forEach((n, i) => {
      const part = b.build.parts[i]!
      const pos = glb.json.accessors![glb.json.meshes![n.mesh!]!.primitives[0]!.attributes.POSITION!]!
      ;(['x', 'y', 'z'] as const).forEach((k, c) => {
        const half = (part.bounds.max[k] - part.bounds.min[k]) / 2 / 1000
        expect(pos.max![c]).toBeCloseTo(half, 6)
        expect(pos.min![c]).toBeCloseTo(-half, 6)
      })
    })
  })

  it('keeps wall cabinets at their hanging height (cabinet space includes floorHeight)', () => {
    const b = built((p) => {
      p.cabinets.push({ ...createPreset('wall'), id: 'cab_2' })
    }, 1)
    const glb = exported(b)
    const lowest = Math.min(...childrenOf(glb).map((n) => n.translation![1]!))
    expect(lowest).toBeGreaterThan(1.4)
  })

  it('exports doors closed (fronts at the cabinet front, z = depth side)', () => {
    const b = built()
    const glb = exported(b)
    const door = childrenOf(glb).find((n) => n.name?.startsWith('Door'))!
    expect(door.translation![2]).toBeGreaterThan(b.cabinet.depth / 1000)
  })

  it('writes per-face normals that agree with counter-clockwise outward winding', () => {
    const glb = exported(built())
    const prim = glb.json.meshes![0]!.primitives[0]!
    expect(prim.mode ?? 4).toBe(4)
    const pos = accessorValues(glb, prim.attributes.POSITION!)
    const nor = accessorValues(glb, prim.attributes.NORMAL!)
    const idx = accessorValues(glb, prim.indices!)
    expect(pos).toHaveLength(24 * 3)
    expect(idx).toHaveLength(36)
    const v = (i: number, arr: number[]) => [arr[i * 3]!, arr[i * 3 + 1]!, arr[i * 3 + 2]!]
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [v(idx[t]!, pos), v(idx[t + 1]!, pos), v(idx[t + 2]!, pos)]
      const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]
      const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!]
      const cross = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!]
      const n = v(idx[t]!, nor)
      expect(Math.hypot(...n)).toBeCloseTo(1, 6)
      expect(cross[0]! * n[0]! + cross[1]! * n[1]! + cross[2]! * n[2]!).toBeGreaterThan(0)
      // The face normal points away from the box centre.
      expect(a[0]! * n[0]! + a[1]! * n[1]! + a[2]! * n[2]!).toBeGreaterThan(0)
    }
  })
})

describe('cabinetToGlb materials', () => {
  it('names materials after the project materials and uses an opaque PBR base colour', () => {
    const b = built()
    const glb = exported(b)
    const names = glb.json.materials!.map((m) => m.name ?? '')
    expect(names.some((n) => n.startsWith('18 mm plywood'))).toBe(true)
    expect(names.some((n) => n.startsWith('18 mm MDF'))).toBe(true)
    for (const m of glb.json.materials!) {
      const c = m.pbrMetallicRoughness!.baseColorFactor!
      expect(c).toHaveLength(4)
      c.forEach((x) => expect(x).toBeGreaterThanOrEqual(0))
      c.forEach((x) => expect(x).toBeLessThanOrEqual(1))
      expect(c[3]).toBe(1)
      expect(m.pbrMetallicRoughness!.metallicFactor).toBe(0)
    }
  })

  it("assigns every part the material of its project material and finish", () => {
    const b = built()
    const glb = exported(b)
    childrenOf(glb).forEach((n, i) => {
      const part = b.build.parts[i]!
      const mat = glb.json.materials![glb.json.meshes![n.mesh!]!.primitives[0]!.material!]!
      expect(mat.extras?.materialId).toBe(part.materialId)
    })
  })

  it('splits one project material used for two finishes into distinctly named materials', () => {
    const glb = exported(built())
    // 6 mm plywood is both the back and the drawer bottom.
    const ply6 = glb.json.materials!.filter((m) => m.extras?.materialId === 'ply-6')
    expect(ply6.map((m) => m.extras?.finish).sort()).toEqual(['back', 'drawer-box'])
    expect(new Set(ply6.map((m) => m.name)).size).toBe(2)
    const names = glb.json.materials!.map((m) => m.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('cabinetToGlb extras', () => {
  it('describes each part on its node', () => {
    const b = built()
    const glb = exported(b)
    const part = b.build.parts.find((p) => p.role === 'side-left')!
    const node = childrenOf(glb).find((n) => n.name === 'Left side')!
    expect(node.extras).toEqual({
      partId: part.id,
      role: 'side-left',
      group: 'carcass',
      lengthMm: part.length,
      widthMm: part.width,
      thicknessMm: part.thickness,
      materialId: 'ply-18',
      materialName: '18 mm plywood',
      grain: part.grain,
      opCount: part.ops.length,
      supplied: false,
    })
  })

  it('describes the cabinet on the root node', () => {
    const b = built()
    const glb = exported(b)
    expect(rootOf(glb).extras).toEqual({
      source: 'CabinetMaker',
      projectName: 'Fixture',
      cabinetId: 'cab_1',
      cabinetType: 'base',
      widthMm: 600,
      heightMm: 870,
      depthMm: 580,
      floorHeightMm: 0,
      constructionStyle: 'frameless-overlay',
      partCount: b.build.parts.length,
    })
  })
})

describe('cabinetToGlb supplied countertops', () => {
  it('includes a supplied countertop like the 3D view', () => {
    const b = built(withCountertop)
    const glb = exported(b)
    expect(glb.problems).toEqual([])
    const top = childrenOf(glb).find((n) => n.name === 'Countertop')!
    expect(top.extras).toMatchObject({ role: 'countertop', group: 'top', supplied: true, materialId: '' })
    expect(rootOf(glb).extras?.partCount).toBe(b.build.parts.length + 1)
    const mat = glb.json.materials![glb.json.meshes![top.mesh!]!.primitives[0]!.material!]!
    expect(mat.name).toBe('Countertop (supplied)')
  })

  it('can leave the supplied countertop out', () => {
    const b = built(withCountertop)
    const glb = exported(b, { includeSuppliedTop: false })
    expect(childrenOf(glb).map((n) => n.name)).not.toContain('Countertop')
  })

  it('exportParts lists the cut parts plus the supplied top', () => {
    const b = built(withCountertop)
    expect(exportParts(b.cabinet, b.build).map((p) => p.role)).toEqual([...b.build.parts.map((p) => p.role), 'countertop'])
    expect(exportParts(b.cabinet, b.build, false)).toHaveLength(b.build.parts.length)
  })
})

describe('cabinetToGlb edge cases', () => {
  it('gives zero-size parts a tiny but valid box', () => {
    const b = built()
    const flat: Part = { ...b.build.parts[0]!, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 100, z: 100 } } }
    const glb = parseGlb(cabinetToGlb(b.cabinet, { ...b.build, parts: [flat] }, b.project))
    expect(glb.problems).toEqual([])
    const pos = glb.json.accessors![glb.json.meshes![0]!.primitives[0]!.attributes.POSITION!]!
    expect(pos.max![0]!).toBeGreaterThan(0)
  })

  it('writes a valid GLB for a cabinet without parts', () => {
    const b = built()
    const glb = parseGlb(cabinetToGlb(b.cabinet, { ...b.build, parts: [] }, b.project))
    expect(glb.problems).toEqual([])
    expect(rootOf(glb).children ?? []).toEqual([])
  })

  it('falls back to the material id when the material is not in the project', () => {
    const b = built()
    const odd: Part = { ...b.build.parts[0]!, materialId: 'walnut-19' }
    const glb = parseGlb(cabinetToGlb(b.cabinet, { ...b.build, parts: [odd] }, b.project))
    expect(glb.json.materials![0]!.name).toBe('walnut-19')
  })
})
