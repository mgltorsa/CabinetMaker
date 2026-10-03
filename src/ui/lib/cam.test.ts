import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as cam from '@/cam'
import { fixtureProject } from '@/core/fixtures'
import type { Project } from '@/core/types'
import { runPipeline } from '@/pipeline'
import { sheetFilename } from './download'
import { exportGcode } from './gcodeExport'
import { cuttingTools, duplicateToolNumbers, toolSetupProblems } from './machineTools'
import { sheetLabel } from './sheets'

vi.mock('@/cam', { spy: true })

describe('machine tool checks', () => {
  it('offers only non-drill tools for profile and dado cuts', () => {
    expect(cuttingTools(fixtureProject().tools).map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('finds duplicate tool numbers', () => {
    const tools = fixtureProject().tools.map((t) => (t.id === 't3' ? { ...t, number: 1 } : t))
    expect([...duplicateToolNumbers(tools)]).toEqual([1])
    expect(duplicateToolNumbers(fixtureProject().tools).size).toBe(0)
  })

  it('reports a drill used for profiles, a missing tool and duplicate numbers', () => {
    const project = fixtureProject()
    expect(toolSetupProblems(project.machine, project.tools)).toEqual([])
    const machine = { ...project.machine, profileToolId: 't3', dadoToolId: 'gone' }
    const tools = project.tools.map((t) => (t.id === 't2' ? { ...t, number: 1 } : t))
    const problems = toolSetupProblems(machine, tools)
    expect(problems).toHaveLength(3)
    expect(problems[0]).toMatch(/Profile tool T3 .* is a drill/)
    expect(problems[1]).toMatch(/Dado tool "gone" is not in the tool library/)
    expect(problems[2]).toMatch(/T1 is used by 2 tools/)
  })
})

describe('sheet naming', () => {
  it('numbers sheets per material, like the drawings and PDF', () => {
    const project = fixtureProject()
    const sheet = runPipeline(project).nest.sheets[0]!
    expect(sheetLabel(project, sheet)).toBe('Sheet 1 (ply-18#1) — 18 mm plywood')
    expect(sheetFilename('fixture', sheet)).toBe('fixture-ply-18-1.nc')
    expect(sheetFilename('x', { ...sheet, materialId: 'Ply/18 mm' })).toBe('x-ply-18-mm-1.nc')
  })
})

describe('exportGcode', () => {
  // Spies keep the real implementation unless a test overrides it.
  beforeEach(() => {
    vi.mocked(cam.generateToolpaths).mockReset()
    vi.mocked(cam.emitGcode).mockReset()
  })

  const setup = (edit: (p: Project) => void = () => undefined) => {
    const project = fixtureProject()
    edit(project)
    const result = runPipeline(project)
    return { project, sheets: result.nest.sheets, partsById: result.partsById }
  }

  it('writes one file per sheet named by material and per-material index', () => {
    const { project, sheets, partsById } = setup()
    const out = exportGcode(project, sheets, partsById)
    if (!out.ok) throw new Error(JSON.stringify(out.problems))
    expect(out.files.map((f) => f.name)).toEqual(sheets.map((s) => `fixture-${s.materialId}-${s.index}.nc`))
    expect(out.files[0]!.text).toContain('(Sheet: ply-18#1)')
    expect(out.files[0]!.text).toContain('(Material: 18 mm plywood, 18 mm)')
  })

  it('blocks every sheet with error-level CAM warnings and lists them by sheet', () => {
    const { project, sheets, partsById } = setup((p) => (p.machine = { ...p.machine, tableX: 1000 }))
    const out = exportGcode(project, sheets, partsById)
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.problems.map((p) => p.label)).toEqual(sheets.map((s) => sheetLabel(project, s)))
    expect(out.problems[0]!.messages[0]).toMatch(/larger than the 1000 × 1250 mm table/)
  })

  it('ignores info and warn levels', async () => {
    const { project, sheets, partsById } = setup()
    const real = (await vi.importActual<typeof cam>('@/cam')).generateToolpaths
    vi.mocked(cam.generateToolpaths).mockImplementation((input) => ({
      ...real(input),
      warnings: [{ level: 'warn', code: 'x', message: 'just a heads-up' }],
    }))
    expect(exportGcode(project, sheets, partsById).ok).toBe(true)
  })

  it('blocks on machine and tool setup problems before generating anything', () => {
    const { project, sheets, partsById } = setup((p) => (p.machine = { ...p.machine, profileToolId: 't3' }))
    const out = exportGcode(project, sheets, partsById)
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.problems[0]!.label).toBe('Machine & tools')
    expect(cam.emitGcode).not.toHaveBeenCalled()
  })

  it('reports a sheet whose toolpaths or G-code throw instead of crashing', () => {
    const { project, sheets, partsById } = setup()
    vi.mocked(cam.emitGcode).mockImplementation(() => {
      throw new Error('Duplicate tool number T1')
    })
    const out = exportGcode(project, sheets, partsById)
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.problems).toHaveLength(sheets.length)
    expect(out.problems[0]!.messages).toEqual(['Duplicate tool number T1'])

    vi.mocked(cam.generateToolpaths).mockImplementation(() => {
      throw new Error('bad placement')
    })
    const failed = exportGcode(project, sheets.slice(0, 1), partsById)
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.problems[0]!.messages).toEqual(['bad placement'])
  })
})
