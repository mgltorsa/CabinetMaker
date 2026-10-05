'use client'

import { useState } from 'react'
import type { Project } from '@/core/types'
import { bomToCsv, partsToCsv } from '@/estimate'
import type { PipelineResult } from '@/pipeline'
import { downloadBlob, slugify } from './lib/download'
import { serializeProject } from './persistence'
import { errorMessage, notify } from './toast'

export interface Exports {
  isPdfBusy: boolean
  downloadPdf: () => Promise<void>
  downloadProjectJson: () => void
  downloadCutListCsv: () => void
  downloadBomCsv: () => void
  isBlenderBusy: boolean
  /** Zip of GLB models, thumbnails, manifest and the Home Builder import script. */
  downloadBlenderBundle: () => Promise<void>
}

/** File exports shared by the top bar menu and the Drawings & BOM cards. */
export function useExports(project: Project, result: PipelineResult): Exports {
  const [isPdfBusy, setIsPdfBusy] = useState(false)
  const [isBlenderBusy, setIsBlenderBusy] = useState(false)
  const slug = slugify(project.name)
  return {
    isPdfBusy,
    downloadPdf: async () => {
      setIsPdfBusy(true)
      try {
        // pdf-lib is large; load it only when a plan book is requested.
        const { buildPlanPdf } = await import('@/drawings/pdf')
        const bytes = await buildPlanPdf(project, result)
        downloadBlob(bytes.slice(), `${slug}-plans.pdf`, 'application/pdf')
      } catch (error: unknown) {
        notify('error', `PDF export failed: ${errorMessage(error)}`)
      } finally {
        setIsPdfBusy(false)
      }
    },
    downloadProjectJson: () => downloadBlob(serializeProject(project), `${slug}.json`, 'application/json'),
    downloadCutListCsv: () => downloadBlob(partsToCsv(result.bom, project), `${slug}-cut-list.csv`, 'text/csv'),
    downloadBomCsv: () => downloadBlob(bomToCsv(result.bom, project.estimate.currency, result.estimate), `${slug}-bom.csv`, 'text/csv'),
    isBlenderBusy,
    downloadBlenderBundle: async () => {
      setIsBlenderBusy(true)
      try {
        // Loaded on demand like the PDF: most sessions never export to Blender.
        const [{ buildBlenderBundle }, { renderCabinetThumbnails }] = await Promise.all([import('@/export'), import('./lib/blenderThumbnails')])
        const { thumbnails, failed } = await renderCabinetThumbnails(project, result)
        const zip = buildBlenderBundle(project, result, { thumbnails, modified: new Date() })
        downloadBlob(zip.slice(), `${slug}-blender.zip`, 'application/zip')
        if (failed.length > 0) notify('info', `No thumbnail for ${failed.join(', ')}; Blender will generate a preview.`)
      } catch (error: unknown) {
        notify('error', `Blender export failed: ${errorMessage(error)}`)
      } finally {
        setIsBlenderBusy(false)
      }
    },
  }
}
