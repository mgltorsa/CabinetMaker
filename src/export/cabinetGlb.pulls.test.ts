import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Project } from '@/core/types'
import { runPipeline } from '@/pipeline'
import { buildBlenderBundle } from './bundle'
import { cabinetToGlb } from './cabinetGlb'
import { parseGlb, type GltfNode, type ParsedGlb } from './testing/glbCheck'

function project(pullId = 'pull-bar-128'): Project {
  const p = fixtureProject()
  p.cabinets[0]!.hardware.pullId = pullId
  return p
}

function exported(p: Project, includePulls = true): ParsedGlb {
  const build = runPipeline(p).build.cabinets[0]!
  return parseGlb(cabinetToGlb(p.cabinets[0]!, build, p, { includePulls }))
}

const nodes = (glb: ParsedGlb): GltfNode[] => glb.json.nodes ?? []
const pullNodes = (glb: ParsedGlb): GltfNode[] => nodes(glb).filter((n) => n.extras?.handleStyle !== undefined)
const frontNodes = (glb: ParsedGlb): GltfNode[] => nodes(glb).filter((n) => n.extras?.group === 'front')

describe('cabinetToGlb pulls', () => {
  it('leaves pulls out unless asked', () => {
    expect(pullNodes(exported(project(), false))).toEqual([])
  })

  it.each([
    ['pull-bar-128', 'bar'],
    ['pull-knob-30', 'knob'],
    ['pull-edge-150', 'edge'],
    ['pull-cup-96', 'cup'],
    ['pull-j-profile', 'j-profile'],
  ])('hangs one %s pull node under each front, with a valid mesh', (pullId, style) => {
    const glb = exported(project(pullId))
    expect(glb.problems).toEqual([])
    const fronts = frontNodes(glb)
    const pulls = pullNodes(glb)
    expect(pulls).toHaveLength(fronts.length)
    for (const front of fronts) {
      expect(front.children).toHaveLength(1)
      const pull = nodes(glb)[front.children![0]!]!
      expect(pull.extras).toMatchObject({ hardwareId: pullId, handleStyle: style })
      expect(pull.rotation).toBeUndefined()
      expect(pull.scale).toBeUndefined()
      // Child translation is relative to the front: the pull stands proud of the show face (+Z).
      expect(pull.translation![2]).toBeGreaterThan(0)
      const mesh = glb.json.meshes![pull.mesh!]!
      expect(mesh.primitives.length).toBeGreaterThan(0)
    }
  })

  it('colours pulls with their handle colour in a material named after the item', () => {
    const p = project('pull-knob-30')
    p.hardware = p.hardware.map((h) => (h.id === 'pull-knob-30' ? { ...h, handle: { ...h.handle!, style: 'knob', color: '#ffffff' } } : h))
    const glb = exported(p)
    const mat = glb.json.materials!.find((m) => m.extras?.hardwareId === 'pull-knob-30')!
    expect(mat.name).toBe('Round knob Ø30')
    expect(mat.pbrMetallicRoughness!.baseColorFactor).toEqual([1, 1, 1, 1])
  })

  it('exports a custom handle as a bar placeholder', () => {
    const p = project('pull-custom')
    p.hardware.push({ id: 'pull-custom', kind: 'pull', name: 'Custom', manufacturer: '', sku: '', unitCost: 1, props: { centers: 64 }, handle: { style: 'custom', blobId: 'sha256-ab', format: 'glb', unit: 'mm', nativeSize: { x: 90, y: 12, z: 30 } } })
    const glb = exported(p)
    expect(glb.problems).toEqual([])
    expect(pullNodes(glb).length).toBe(frontNodes(glb).length)
    expect(pullNodes(glb)[0]!.extras).toMatchObject({ handleStyle: 'custom', placeholder: true })
  })

  it('puts pulls in the Blender bundle', () => {
    const p = project('pull-cup-96')
    const files = unzipSync(buildBlenderBundle(p, runPipeline(p)))
    const glbName = Object.keys(files).find((f) => f.endsWith('.glb'))!
    const glb = parseGlb(files[glbName]!)
    expect(glb.problems).toEqual([])
    expect(pullNodes(glb).length).toBeGreaterThan(0)
  })
})
