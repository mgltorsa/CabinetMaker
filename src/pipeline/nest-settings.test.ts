import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Project, Tool } from '@/core/types'
import { validateNest } from '@/nest'
import { effectiveNestSettings, runPipeline } from '.'

function withTool(project: Project, id: string, patch: Partial<Tool>): Project {
  return { ...project, tools: project.tools.map((t) => (t.id === id ? { ...t, ...patch } : t)) }
}

describe('effectiveNestSettings', () => {
  it('keeps the project settings when they already clear the tools', () => {
    const project = fixtureProject()
    expect(effectiveNestSettings(project)).toEqual(project.nest)
  })

  it('widens the part gap to the profile tool diameter', () => {
    const project = withTool(fixtureProject(), profileToolId(), { diameter: 12.7 })
    const settings = effectiveNestSettings(project)
    expect(settings.kerf + settings.partSpacing).toBe(12.7)
    expect(settings.partSpacing).toBe(project.nest.partSpacing)
  })

  it('counts part spacing towards the gap', () => {
    const base = withTool(fixtureProject(), profileToolId(), { diameter: 12.7 })
    const project = { ...base, nest: { ...base.nest, kerf: 3, partSpacing: 5 } }
    const settings = effectiveNestSettings(project)
    expect(settings.kerf).toBeCloseTo(7.7, 9)
    expect(settings.partSpacing).toBe(5)
  })

  it('widens the edge trim so profiles stay on the sheet', () => {
    const project = withTool(fixtureProject(), profileToolId(), { diameter: 25 })
    expect(effectiveNestSettings(project).edgeTrim).toBe(25)
  })

  it('leaves room for a through dado overrun of half the dado tool', () => {
    const base = fixtureProject()
    const project = withTool({ ...base, nest: { ...base.nest, kerf: 6.35, edgeTrim: 5 } }, base.machine.dadoToolId, { diameter: 16 })
    expect(effectiveNestSettings(project)).toMatchObject({ kerf: 8, edgeTrim: 8 })
  })

  it('ignores missing, invalid and drill tools (CAM reports them)', () => {
    const base = fixtureProject()
    const missing = { ...base, machine: { ...base.machine, profileToolId: 'nope', dadoToolId: 'nope' } }
    expect(effectiveNestSettings(missing)).toEqual(base.nest)
    const drill = { ...base, machine: { ...base.machine, profileToolId: base.machine.drillToolId } }
    expect(effectiveNestSettings(withTool(drill, base.machine.drillToolId, { diameter: 30 }))).toEqual(base.nest)
    expect(effectiveNestSettings(withTool(base, profileToolId(), { diameter: Number.NaN }))).toEqual(base.nest)
  })

  it('leaves invalid settings as entered so the nest reports them', () => {
    const base = withTool(fixtureProject(), profileToolId(), { diameter: 12.7 })
    const project = { ...base, nest: { ...base.nest, partSpacing: Number.NaN, edgeTrim: Number.NaN } }
    const settings = effectiveNestSettings(project)
    expect(settings.kerf).toBe(base.nest.kerf)
    expect(settings.edgeTrim).toBeNaN()
    expect(settings.partSpacing).toBeNaN()
  })

  it('does not change the project', () => {
    const project = withTool(fixtureProject(), profileToolId(), { diameter: 12.7 })
    const before = structuredClone(project.nest)
    runPipeline(project)
    expect(project.nest).toEqual(before)
  })
})

describe('runPipeline nest settings', () => {
  it('nests with, and reports, the effective settings', () => {
    const project = withTool(fixtureProject(), profileToolId(), { diameter: 12.7 })
    const result = runPipeline(project)
    expect(result.nestSettings).toEqual(effectiveNestSettings(project))
    expect(validateNest(result.nest, result.build.parts, project.materials, effectiveNestSettings(project))).toEqual([])
  })
})

function profileToolId(): string {
  return fixtureProject().machine.profileToolId
}
