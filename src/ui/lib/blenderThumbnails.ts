/**
 * Cabinet thumbnails for the Blender bundle: the front elevation SVG (the same
 * drawing as the Elevation view) drawn onto an offscreen canvas and saved as a
 * square PNG. Browser only (canvas); `thumbnailSvg` and `containRect` are pure.
 */
import type { Cabinet, CabinetBuild, Project, UnitSystem } from '@/core/types'
import { frontElevation, renderSvg } from '@/drawings'
import type { PipelineResult } from '@/pipeline'

export const THUMBNAIL_PX = 512
const BACKGROUND = '#ffffff'

export function thumbnailSvg(cabinet: Cabinet, build: CabinetBuild, units: UnitSystem): string {
  return renderSvg(frontElevation(cabinet, build, units), { units, widthPx: THUMBNAIL_PX })
}

/** Largest rectangle with the image's aspect ratio centred in a `size` square. */
export function containRect(width: number, height: number, size: number): { x: number; y: number; w: number; h: number } {
  if (width <= 0 || height <= 0) return { x: 0, y: 0, w: 0, h: 0 }
  const scale = Math.min(size / width, size / height)
  const w = width * scale
  const h = height * scale
  return { x: (size - w) / 2, y: (size - h) / 2, w, h }
}

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

/** An offscreen canvas where supported, else a detached <canvas> element. */
function squareCanvas(size: number): { ctx: Canvas2D; toPng: () => Promise<Blob> } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(size, size)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available')
    return { ctx, toPng: () => canvas.convertToBlob({ type: 'image/png' }) }
  }
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  return {
    ctx,
    toPng: () => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')),
  }
}

/** Rasterise an SVG string to a square PNG (white background, aspect kept). */
export async function svgToPng(svg: string, size: number = THUMBNAIL_PX): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const { ctx, toPng } = squareCanvas(size)
    ctx.fillStyle = BACKGROUND
    ctx.fillRect(0, 0, size, size)
    const r = containRect(image.naturalWidth, image.naturalHeight, size)
    ctx.drawImage(image, r.x, r.y, r.w, r.h)
    return new Uint8Array(await (await toPng()).arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface ThumbnailResult {
  thumbnails: Map<string, Uint8Array>
  /** Names of cabinets whose thumbnail could not be drawn. */
  failed: string[]
}

/** One PNG per built cabinet. A cabinet that cannot be drawn is reported, not fatal. */
export async function renderCabinetThumbnails(project: Project, result: Pick<PipelineResult, 'build'>): Promise<ThumbnailResult> {
  const buildsById = new Map(result.build.cabinets.map((b) => [b.cabinetId, b]))
  const jobs = project.cabinets.flatMap((cabinet) => {
    const build = buildsById.get(cabinet.id)
    return build ? [{ cabinet, png: svgToPng(thumbnailSvg(cabinet, build, project.units)) }] : []
  })
  const settled = await Promise.allSettled(jobs.map((j) => j.png))
  const thumbnails = new Map<string, Uint8Array>()
  const failed: string[] = []
  settled.forEach((outcome, i) => {
    const cabinet = jobs[i]?.cabinet
    if (!cabinet) return
    // A failed thumbnail is not fatal: the Blender script generates a preview instead.
    if (outcome.status === 'fulfilled') thumbnails.set(cabinet.id, outcome.value)
    else failed.push(cabinet.name)
  })
  return { thumbnails, failed }
}
