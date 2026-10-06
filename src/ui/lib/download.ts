import type { Sheet } from '@/core/types'

/** Keep the object URL alive long enough for the browser to start the download. */
const REVOKE_DELAY_MS = 1000

/** Trigger a browser download of `data` as `filename`. */
export function downloadBlob(data: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

/** File-name-safe slug, e.g. `Kitchen Run #2` → `kitchen-run-2`. */
export function slugify(name: string, fallback = 'cabinet-project'): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? fallback : slug
}

/**
 * `${slug}-${materialId}-${index}.nc`: the same per-material sheet number as the
 * drawings and PDF (`Sheet n (materialId#n)`). The material id is slugged so an
 * imported id cannot smuggle path separators into the file name.
 */
export function sheetFilename(projectSlug: string, sheet: Pick<Sheet, 'materialId' | 'index'>): string {
  return `${projectSlug}-${slugify(sheet.materialId, 'material')}-${sheet.index}.nc`
}
