import { useMemo } from 'react'
import type { Project } from '@/core/types'
import { runPipeline, type PipelineResult } from '@/pipeline'
import { errorMessage } from './toast'

export interface PipelineOutcome {
  result: PipelineResult
  /** Set when the pipeline threw; `result` is then empty. */
  error: string | null
}

export function emptyResult(project: Project): PipelineResult {
  return {
    build: { cabinets: [], parts: [], hardware: [], warnings: [] },
    partsById: new Map(),
    nest: { sheets: [], linearPartIds: [], unplaced: [], summary: [] },
    bom: { parts: [], lines: [] },
    estimate: {
      currency: project.estimate.currency,
      materials: [],
      hardware: [],
      labor: [],
      materialCost: 0,
      hardwareCost: 0,
      laborCost: 0,
      subtotal: 0,
      marginAmount: 0,
      price: 0,
    },
  }
}

/** Run the pipeline without letting an engine error take down the page. */
export function derive(project: Project): PipelineOutcome {
  try {
    return { result: runPipeline(project), error: null }
  } catch (error: unknown) {
    return { result: emptyResult(project), error: errorMessage(error) }
  }
}

/** The single derivation every view reads: `useMemo(() => runPipeline(project))`. */
export function usePipeline(project: Project): PipelineOutcome {
  return useMemo(() => derive(project), [project])
}
