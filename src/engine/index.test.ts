import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Cabinet, Section } from '@/core/types'
import { buildCabinet, buildProject, validateBuild } from '.'
import { testCabinet } from './testkit'

describe('buildProject', () => {
  it('builds every cabinet and flattens parts, hardware and warnings in order', () => {
    const project = fixtureProject()
    const second: Cabinet = { ...testCabinet({ id: 'cab_2' }), width: 20 }
    const b = buildProject({ ...project, cabinets: [...project.cabinets, second] })
    expect(b.cabinets.map((c) => c.cabinetId)).toEqual(['cab_1', 'cab_2'])
    expect(b.parts).toEqual(b.cabinets.flatMap((c) => c.parts))
    expect(b.hardware.length).toBeGreaterThan(0)
    expect(b.warnings.some((w) => w.cabinetId === 'cab_2' && w.code === 'too-narrow')).toBe(true)
    expect(validateBuild(b)).toEqual([])
  })

  it('uses the project hardware catalog', () => {
    const project = fixtureProject()
    const b = buildProject({ ...project, hardware: project.hardware.filter((h) => h.kind !== 'hinge') })
    expect(b.hardware.some((h) => h.hardwareId === 'blum-cliptop-110')).toBe(false)
    expect(b.warnings.some((w) => w.code === 'unknown-hardware')).toBe(true)
  })
})

describe('buildCabinet robustness', () => {
  it('turns an unexpected failure into an error warning', () => {
    const broken = { ...testCabinet(), sections: null as unknown as Section[] }
    const b = buildCabinet(broken, { materials: fixtureProject().materials })
    expect(b.parts).toEqual([])
    expect(b.warnings[0]).toMatchObject({ level: 'error', code: 'engine-failure' })
  })
})
