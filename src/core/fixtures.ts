import { createProject, defaultCabinet } from './defaults'
import type { Project } from './types'

/**
 * Deterministic project for tests and golden snapshots: fixed ids, the default
 * 600 mm base cabinet (drawer over two doors with one shelf).
 */
export function fixtureProject(): Project {
  const project = createProject('Fixture')
  project.id = 'prj_fixture'
  const cab = defaultCabinet('cab_1')
  cab.sections.forEach((s, si) => {
    s.id = `sec_${si + 1}`
    s.bays.forEach((b, bi) => {
      b.id = `bay_${si + 1}_${bi + 1}`
    })
  })
  project.cabinets = [cab]
  return project
}
