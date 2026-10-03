import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import * as pipeline from '@/pipeline'
import { derive } from './usePipeline'

vi.mock('@/pipeline', { spy: true })

describe('derive', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the pipeline result for a valid project', () => {
    const { result, error } = derive(fixtureProject())
    expect(error).toBeNull()
    expect(result.build.parts.length).toBeGreaterThan(0)
  })

  it('turns a pipeline error into an empty result plus message', () => {
    vi.mocked(pipeline.runPipeline).mockImplementation(() => {
      throw new Error('Unknown material ply-99')
    })
    const project = fixtureProject()
    const { result, error } = derive(project)
    expect(error).toBe('Unknown material ply-99')
    expect(result.build.parts).toEqual([])
    expect(result.nest.sheets).toEqual([])
    expect(result.estimate.currency).toBe(project.estimate.currency)
  })
})
