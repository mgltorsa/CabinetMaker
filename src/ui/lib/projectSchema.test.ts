import { describe, expect, it } from 'vitest'
import { createProject } from '@/core/defaults'
import { fixtureProject } from '@/core/fixtures'
import type { Cabinet, Project } from '@/core/types'
import { PRESETS, createPreset } from '@/engine/presets'
import { MARKUP, MAX_BAYS, MAX_CABINETS, MAX_EXTRA_CHARGES, MAX_MONEY, MAX_SECTIONS, TAX_RATE } from './limits'
import { validateProject } from './projectSchema'

/** JSON round trip of the fixture, edited in place (the copy is ours). */
function edited(edit: (p: Project) => void): unknown {
  const project = JSON.parse(JSON.stringify(fixtureProject())) as Project
  edit(project)
  return project
}

const cab = (p: Project): Cabinet => p.cabinets[0]!

describe('validateProject: semantic ranges', () => {
  it('accepts the default project, the fixture and every preset', () => {
    expect(validateProject(createProject())).toBeNull()
    expect(validateProject(fixtureProject())).toBeNull()
    const project = fixtureProject()
    project.cabinets = PRESETS.map((p, i) => ({ ...createPreset(p.type), id: `cab_${i}` }))
    expect(validateProject(project)).toBeNull()
  })

  it.each([
    ['a tiny tool step down', (p: Project) => (p.tools[0]!.stepDown = 0.001), 'project.tools[0].stepDown'],
    ['a step down deeper than the flutes', (p: Project) => (p.tools[0]!.stepDown = p.tools[0]!.fluteLength + 1), 'project.tools[0].stepDown'],
    ['a zero tool diameter', (p: Project) => (p.tools[1]!.diameter = 0), 'project.tools[1].diameter'],
    ['a zero feed', (p: Project) => (p.tools[0]!.cutFeed = 0), 'project.tools[0].cutFeed'],
    ['a negative plunge feed', (p: Project) => (p.tools[0]!.plungeFeed = -5), 'project.tools[0].plungeFeed'],
    ['a zero rpm', (p: Project) => (p.tools[2]!.rpm = 0), 'project.tools[2].rpm'],
    ['a fractional tool number', (p: Project) => (p.tools[0]!.number = 1.5), 'project.tools[0].number'],
    ['a dense shelf pin spacing', (p: Project) => (cab(p).construction.shelfPins.spacing = 0.1), 'project.cabinets[0].construction.shelfPins.spacing'],
    ['a zero pin diameter', (p: Project) => (cab(p).construction.shelfPins.diameter = 0), 'project.cabinets[0].construction.shelfPins.diameter'],
    ['a microscopic cabinet', (p: Project) => (cab(p).width = 10), 'project.cabinets[0].width'],
    ['a huge cabinet', (p: Project) => (cab(p).height = 30_000), 'project.cabinets[0].height'],
    ['a negative reveal', (p: Project) => (cab(p).construction.reveal.edge = -1), 'project.cabinets[0].construction.reveal.edge'],
    ['a negative top thickness', (p: Project) => (cab(p).top.thickness = -2), 'project.cabinets[0].top.thickness'],
    ['too many shelves', (p: Project) => (cab(p).sections[0]!.bays[1]!.shelfCount = 21), 'project.cabinets[0].sections[0].bays[1].shelfCount'],
    ['a fractional shelf count', (p: Project) => (cab(p).sections[0]!.bays[1]!.shelfCount = 1.5), 'project.cabinets[0].sections[0].bays[1].shelfCount'],
    ['a zero bay height', (p: Project) => (cab(p).sections[0]!.bays[0]!.height = 0), 'project.cabinets[0].sections[0].bays[0].height'],
    ['dense tabs', (p: Project) => (p.machine.tabs.spacing = 1), 'project.machine.tabs.spacing'],
    ['tabs wider than their spacing', (p: Project) => (p.machine.tabs.width = 500), 'project.machine.tabs.width'],
    ['a negative kerf', (p: Project) => (p.nest.kerf = -1), 'project.nest.kerf'],
    ['a zero material thickness', (p: Project) => (p.materials[0]!.thickness = 0), 'project.materials[0].thickness'],
    ['a margin of 100 %', (p: Project) => (p.estimate.margin = 1), 'project.estimate.margin'],
  ])('rejects %s and names the path', (_, edit, path) => {
    const error = validateProject(edited(edit))
    expect(error).not.toBeNull()
    expect(error!.startsWith(path)).toBe(true)
  })

  it('bounds the number of cabinets, sections and bays', () => {
    const many = <T>(item: T, n: number): T[] => Array.from({ length: n }, () => structuredClone(item))
    expect(validateProject(edited((p) => (p.cabinets = many(cab(p), MAX_CABINETS + 1).map((c, i) => ({ ...c, id: `c${i}` })))))).toMatch(
      /^project\.cabinets must have at most 100/,
    )
    expect(
      validateProject(edited((p) => (cab(p).sections = many(cab(p).sections[0]!, MAX_SECTIONS + 1).map((s, i) => ({ ...s, id: `s${i}`, bays: [] }))))),
    ).toMatch(/^project\.cabinets\[0\]\.sections must have at most 10/)
    expect(validateProject(edited((p) => (cab(p).sections[0]!.bays = many(cab(p).sections[0]!.bays[0]!, MAX_BAYS + 1).map((b, i) => ({ ...b, id: `b${i}` })))))).toMatch(
      /^project\.cabinets\[0\]\.sections\[0\]\.bays must have at most 20/,
    )
  })

  it('bounds the tool library and catalogs', () => {
    expect(validateProject(edited((p) => (p.tools = Array.from({ length: 100 }, (_, i) => ({ ...p.tools[0]!, id: `t${i}` })))))).toMatch(
      /^project\.tools must have at most 99/,
    )
    expect(validateProject(edited((p) => (p.hardware = Array.from({ length: 1001 }, (_, i) => ({ ...p.hardware[0]!, id: `h${i}` })))))).toMatch(
      /^project\.hardware must have at most 1000/,
    )
  })

  it('requires at least one section per cabinet and one bay per section', () => {
    expect(validateProject(edited((p) => (cab(p).sections = [])))).toMatch(/^project\.cabinets\[0\]\.sections must have at least 1/)
    expect(validateProject(edited((p) => (cab(p).sections[0]!.bays = [])))).toMatch(/^project\.cabinets\[0\]\.sections\[0\]\.bays must have at least 1/)
  })
})

describe('validateProject: unique ids', () => {
  it.each([
    ['cabinets', (p: Project) => (p.cabinets = [cab(p), { ...structuredClone(cab(p)), name: 'Copy' }]), 'project.cabinets[1].id'],
    ['sections', (p: Project) => (cab(p).sections = [cab(p).sections[0]!, structuredClone(cab(p).sections[0]!)]), 'project.cabinets[0].sections[1].id'],
    ['bays', (p: Project) => (cab(p).sections[0]!.bays[1]!.id = cab(p).sections[0]!.bays[0]!.id), 'project.cabinets[0].sections[0].bays[1].id'],
    ['tools', (p: Project) => (p.tools[1]!.id = 't1'), 'project.tools[1].id'],
    ['materials', (p: Project) => (p.materials[1]!.id = 'ply-18'), 'project.materials[1].id'],
    ['hardware', (p: Project) => (p.hardware[1]!.id = p.hardware[0]!.id), 'project.hardware[1].id'],
  ])('rejects duplicate %s ids', (_, edit, path) => {
    expect(validateProject(edited(edit))).toMatch(new RegExp(`^${path.replace(/[[\].]/g, '\\$&')} duplicates`))
  })

  it('rejects bay ids repeated across sections of one cabinet', () => {
    const value = edited((p) => {
      const sections = cab(p).sections
      sections.push({ id: 'sec_2', width: null, bays: [{ ...sections[0]!.bays[0]! }] })
    })
    expect(validateProject(value)).toMatch(/^project\.cabinets\[0\]\.sections\[1\]\.bays\[0\]\.id duplicates/)
  })
})

describe('validateProject: estimate commercial parameters', () => {
  const extra = { id: 'x1', label: 'Installation', qty: 3, unit: 'h' as const, unitCost: 50 }
  const loose = (p: Project): Record<string, unknown> => p.estimate as unknown as Record<string, unknown>

  it('accepts a project saved before markups, extras, tax and minimum charge existed', () => {
    const legacy = edited((p) => {
      const { currency, shopRate, margin, linearWaste, labor } = p.estimate
      p.estimate = { currency, shopRate, margin, linearWaste, labor }
    })
    expect(validateProject(legacy)).toBeNull()
  })

  it('accepts every extra charge unit and a full set of parameters', () => {
    const units = ['pcs', 'h', 'm', 'm²', 'job'] as const
    const value = edited((p) => {
      p.estimate = {
        ...p.estimate,
        materialMarkup: 0.15,
        hardwareMarkup: MARKUP.max,
        taxRate: TAX_RATE.max,
        minimumCharge: 500,
        extras: units.map((unit, i) => ({ ...extra, id: `x${i}`, unit })),
      }
    })
    expect(validateProject(value)).toBeNull()
  })

  it.each([
    ['a negative material markup', (p: Project) => (p.estimate.materialMarkup = -0.1), 'project.estimate.materialMarkup'],
    ['a huge hardware markup', (p: Project) => (p.estimate.hardwareMarkup = MARKUP.max + 1), 'project.estimate.hardwareMarkup'],
    ['a tax rate above 100 %', (p: Project) => (p.estimate.taxRate = 1.5), 'project.estimate.taxRate'],
    ['a non-numeric tax rate', (p: Project) => (loose(p).taxRate = '10%'), 'project.estimate.taxRate'],
    ['a negative minimum charge', (p: Project) => (p.estimate.minimumCharge = -1), 'project.estimate.minimumCharge'],
    ['extras that are not a list', (p: Project) => (loose(p).extras = {}), 'project.estimate.extras'],
    ['an extra with an unknown unit', (p: Project) => (loose(p).extras = [{ ...extra, unit: 'kg' }]), 'project.estimate.extras[0].unit'],
    ['an extra with a negative quantity', (p: Project) => (p.estimate.extras = [{ ...extra, qty: -1 }]), 'project.estimate.extras[0].qty'],
    ['an extra with a huge unit cost', (p: Project) => (p.estimate.extras = [{ ...extra, unitCost: MAX_MONEY + 1 }]), 'project.estimate.extras[0].unitCost'],
    ['an extra without a label', (p: Project) => (loose(p).extras = [{ ...extra, label: null }]), 'project.estimate.extras[0].label'],
    ['duplicate extra ids', (p: Project) => (p.estimate.extras = [extra, { ...extra }]), 'project.estimate.extras[1].id'],
  ])('rejects %s and names the path', (_, edit, path) => {
    const error = validateProject(edited(edit))
    expect(error).not.toBeNull()
    expect(error!.startsWith(path)).toBe(true)
  })

  it('bounds the number of extra charges', () => {
    const value = edited((p) => (p.estimate.extras = Array.from({ length: MAX_EXTRA_CHARGES + 1 }, (_, i) => ({ ...extra, id: `x${i}` }))))
    expect(validateProject(value)).toMatch(new RegExp(`^project\\.estimate\\.extras must have at most ${MAX_EXTRA_CHARGES}`))
  })
})
