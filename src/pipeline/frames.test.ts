import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { panelToCabinet } from '@/core/panel'
import { hingeSide } from '@/drawings/part-geometry'
import { buildProject } from '@/engine'
import { panelToCabinet as enginePanelToCabinet } from '@/engine/frame'
import { createPreset, PRESETS } from '@/engine/presets'

describe('panel frames across modules', () => {
  const project = fixtureProject()
  project.cabinets = PRESETS.map((p, i) => ({ ...createPreset(p.type), id: `cab_${i + 1}` }))
  const build = buildProject(project)

  it('core/panel matches the engine mapping for every op of every preset', () => {
    let checked = 0
    for (const part of build.parts) {
      if (!part.frame) continue
      const framed = { bounds: part.bounds, frame: part.frame }
      for (const op of part.ops) {
        if (op.kind === 'dado') continue
        const a = panelToCabinet(part, op.x, op.y, 0)
        const b = enginePanelToCabinet(framed, { x: op.x, y: op.y, z: 0 })
        expect(a.x).toBeCloseTo(b.x, 6)
        expect(a.y).toBeCloseTo(b.y, 6)
        expect(a.z).toBeCloseTo(b.z, 6)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it.each(['left', 'right'] as const)('draws a single %s-hinged door on that side', (side) => {
    const p = fixtureProject()
    const cab = p.cabinets[0]
    const bay = cab?.sections[0]?.bays[1]
    if (!cab || !bay) throw new Error('fixture changed')
    bay.doorCount = 1
    bay.hingeSide = side
    const door = buildProject(p).parts.find((x) => x.group === 'front' && x.ops.some((o) => o.purpose === 'hinge-cup'))
    expect(door).toBeDefined()
    if (door) expect(hingeSide(door, cab)).toBe(side)
  })
})
