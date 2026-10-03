/**
 * Multi-page plan book rendered from the same `Drawing` model as the screen.
 * Stub — the drawings work stream implements this with pdf-lib.
 */
import type { Project } from '@/core/types'
import type { PipelineResult } from '@/pipeline'

export async function buildPlanPdf(project: Project, result: PipelineResult): Promise<Uint8Array> {
  void project
  void result
  throw new Error('PDF export not implemented yet')
}
