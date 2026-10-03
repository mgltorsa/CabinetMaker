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

/** `${slug}-sheet-${n}.nc`, n is 1-based across all sheets. */
export function sheetFilename(projectSlug: string, sheetNumber: number): string {
  return `${projectSlug}-sheet-${sheetNumber}.nc`
}
