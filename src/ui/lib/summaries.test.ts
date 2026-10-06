import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { setDrawerCount } from '../projectOps'
import { dimensionsSummary, doorsSummary, drawerCount, drawersSummary, layoutSummary, shelvesSummary, toeKickSummary, topSummary } from './summaries'

describe('card summaries', () => {
  const project = fixtureProject()
  const cab = project.cabinets[0]!

  it('describes the fixture cabinet', () => {
    expect(dimensionsSummary(cab, 'metric')).toBe('600 × 870 × 580 mm')
    expect(dimensionsSummary(cab, 'imperial')).toBe('23 5/8" × 34 1/4" × 22 13/16"')
    expect(toeKickSummary(cab, 'metric')).toBe('Panel · 100 mm, 75 mm setback')
    expect(topSummary(cab, 'metric')).toBe('Stretchers · no countertop')
    expect(layoutSummary(cab)).toBe('1 section · 2 bays')
    expect(shelvesSummary(cab)).toBe('1 shelf')
    expect(drawersSummary(cab, project.hardware)).toBe('1 drawer · undermount 533')
    expect(doorsSummary(cab)).toBe('2 doors · Slab')
  })
})

describe('setDrawerCount', () => {
  it('adds drawers after the existing ones and removes the lowest first', () => {
    const project = fixtureProject()
    const more = setDrawerCount(project, 'cab_1', 'sec_1', 3)
    const kinds = more.cabinets[0]!.sections[0]!.bays.map((b) => b.kind)
    expect(kinds).toEqual(['drawer', 'drawer', 'drawer', 'door'])
    const fewer = setDrawerCount(more, 'cab_1', 'sec_1', 1)
    expect(fewer.cabinets[0]!.sections[0]!.bays.map((b) => b.id)).toEqual(['bay_1_1', 'bay_1_2'])
    expect(drawerCount(fewer.cabinets[0]!)).toBe(1)
  })

  it('never leaves a section without bays', () => {
    const project = fixtureProject()
    const drawersOnly = setDrawerCount(setDrawerCount(project, 'cab_1', 'sec_1', 2), 'cab_1', 'sec_1', 2)
    const sec = drawersOnly.cabinets[0]!.sections[0]!
    sec.bays = sec.bays.filter((b) => b.kind === 'drawer')
    const none = setDrawerCount(drawersOnly, 'cab_1', 'sec_1', 0)
    expect(none.cabinets[0]!.sections[0]!.bays.map((b) => b.kind)).toEqual(['open'])
  })

  it('leaves the bays unchanged when the count already matches', () => {
    const project = fixtureProject()
    expect(setDrawerCount(project, 'cab_1', 'sec_1', 1).cabinets[0]!.sections[0]!.bays).toBe(project.cabinets[0]!.sections[0]!.bays)
  })
})
