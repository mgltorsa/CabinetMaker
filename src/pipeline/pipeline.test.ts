import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { runPipeline } from '.'

describe('pipeline', () => {
  it('derives a build from the fixture project', () => {
    const result = runPipeline(fixtureProject())
    expect(result.build.parts.length).toBeGreaterThan(0)
    expect(result.partsById.size).toBe(result.build.parts.length)
  })

  it('gives every part a unique id', () => {
    const { build } = runPipeline(fixtureProject())
    expect(new Set(build.parts.map((p) => p.id)).size).toBe(build.parts.length)
  })
})
