/**
 * Cross-module invariants: the screen, cut list, nest, BOM, PDF and G-code must
 * describe the same cabinet (the bug class the plan calls out in P3/P4).
 */
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Project } from '@/core/types'
import { emitGcode, generateToolpaths, parseGcode } from '@/cam'
import { downwardFeedViolations } from '@/cam/testing/feeds'
import { sheetLayout } from '@/drawings'
import { buildPlanPdf, planPageCount } from '@/drawings/pdf'
import { validateBuild } from '@/engine/validate'
import { createPreset, PRESETS } from '@/engine/presets'
import { validateNest } from '@/nest'
import { runPipeline } from '.'

function projectsUnderTest(): Project[] {
  const base = fixtureProject()
  const all = fixtureProject()
  all.cabinets = PRESETS.map((p, i) => ({ ...createPreset(p.type), id: `cab_${i + 1}` }))
  return [base, all]
}

describe.each(projectsUnderTest().map((p) => [p.cabinets.length, p] as const))('pipeline invariants (%i cabinets)', (_n, project) => {
  const result = runPipeline(project)
  const { build, nest, bom, estimate, partsById } = result

  it('produces a valid build', () => {
    expect(validateBuild(build).filter((w) => w.level === 'error')).toEqual([])
  })

  it('places every sheet part exactly once', () => {
    expect(validateNest(nest, build.parts, project.materials, result.nestSettings ?? project.nest)).toEqual([])
    expect(nest.unplaced).toEqual([])
    const placed = nest.sheets.flatMap((s) => s.placements.map((p) => p.partId))
    expect(placed.length + nest.linearPartIds.length).toBe(build.parts.length)
  })

  it('keeps the cut list in step with the build', () => {
    expect(bom.parts.map((r) => r.partId).sort()).toEqual(build.parts.map((p) => p.id).sort())
  })

  it('bills the same number of sheets the nest uses', () => {
    for (const s of nest.summary) {
      const line = estimate.materials.find((l) => l.category === 'sheet' && l.refId === s.materialId)
      expect(line?.qty).toBe(s.sheetCount)
    }
  })

  it('produces CAM without error-level warnings on default machine settings', () => {
    for (const sheet of nest.sheets) {
      const cam = generateToolpaths({ sheet, parts: partsById, machine: project.machine, tools: project.tools })
      expect(cam.warnings.filter((w) => w.level === 'error')).toEqual([])
      expect(cam.toolpaths.length).toBeGreaterThan(0)
    }
  })

  it('emits G-code that matches the toolpath preview', () => {
    for (const sheet of nest.sheets) {
      const cam = generateToolpaths({ sheet, parts: partsById, machine: project.machine, tools: project.tools })
      const program = parseGcode(emitGcode(cam.toolpaths, project.machine, project.tools, { programName: sheet.id }))
      const preview = cam.toolpaths.flatMap((tp) => tp.passes)
      expect(program.polylines.length).toBe(preview.length)
      program.polylines.forEach(({ points: line }, i) => {
        const expected = preview[i] ?? []
        expect(line.length).toBe(expected.length)
        line.forEach((pt, j) => {
          const e = expected[j]
          expect(e).toBeDefined()
          expect(Math.abs(pt.x - (e?.x ?? NaN))).toBeLessThan(0.001)
          expect(Math.abs(pt.y - (e?.y ?? NaN))).toBeLessThan(0.001)
          expect(Math.abs(pt.z - (e?.z ?? NaN))).toBeLessThan(0.001)
        })
      })
    }
  })

  it('never feeds down faster than the plunge feed in emitted G-code', () => {
    for (const sheet of nest.sheets) {
      const cam = generateToolpaths({ sheet, parts: partsById, machine: project.machine, tools: project.tools })
      const gcode = emitGcode(cam.toolpaths, project.machine, project.tools, { programName: sheet.id })
      expect(downwardFeedViolations(gcode, project.tools)).toEqual([])
    }
  })

  it('numbers sheet layouts from 1 per material, matching sheet ids', () => {
    for (const sheet of nest.sheets) {
      expect(sheet.id).toBe(`${sheet.materialId}#${sheet.index}`)
      expect(sheetLayout(sheet, partsById, project.units).title).toBe(`Sheet ${sheet.index} (${sheet.id})`)
    }
    const firsts = nest.sheets.filter((s) => s.index === 1).map((s) => s.materialId)
    expect(new Set(firsts)).toEqual(new Set(nest.sheets.map((s) => s.materialId)))
  })

  it('renders a PDF whose page count matches the plan', async () => {
    const bytes = await buildPlanPdf(project, result)
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(planPageCount(project, result))
  })
})

/** Projects whose profile tool is wider than the nest kerf: the pipeline must widen the gap. */
function wideToolProjects(): [string, Project][] {
  return projectsUnderTest().flatMap((base) =>
    [12.7, 19.05].map((diameter): [string, Project] => [
      `${base.cabinets.length} cabinets, ${diameter} mm profile tool`,
      { ...base, tools: base.tools.map((t) => (t.id === base.machine.profileToolId ? { ...t, diameter } : t)) },
    ]),
  )
}

describe.each(wideToolProjects())('pipeline compensates a profile tool wider than the kerf (%s)', (_label, project) => {
  const result = runPipeline(project)
  const { build, nest, partsById } = result

  it('keeps the persisted nest settings and nests with a wider gap', () => {
    expect(project.nest.kerf).toBeLessThan(project.tools.find((t) => t.id === project.machine.profileToolId)?.diameter ?? 0)
    expect(validateNest(nest, build.parts, project.materials, result.nestSettings ?? project.nest)).toEqual([])
    expect(nest.unplaced).toEqual([])
  })

  it('produces CAM without error-level warnings', () => {
    expect(nest.sheets.length).toBeGreaterThan(0)
    for (const sheet of nest.sheets) {
      const cam = generateToolpaths({ sheet, parts: partsById, machine: project.machine, tools: project.tools })
      expect(cam.warnings.filter((w) => w.level === 'error')).toEqual([])
    }
  })
})
