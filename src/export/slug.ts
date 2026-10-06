/**
 * File-name slugs for cabinets. Same rules as the UI's `slugify` (the domain
 * module cannot import the UI): lower-case ASCII letters, digits and dashes,
 * so a cabinet name can never smuggle a path separator into the bundle.
 */
import type { Cabinet } from '@/core/types'

const FALLBACK_SLUG = 'cabinet'
/** Keeps file names well inside every file system's limit. */
const MAX_SLUG_LENGTH = 60

export function slugify(name: string, fallback = FALLBACK_SLUG): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, '')
  return slug === '' ? fallback : slug
}

/** Unique slug per cabinet id, in cabinet order (`base-cabinet`, `base-cabinet-2`, ...). */
export function cabinetSlugs(cabinets: readonly Pick<Cabinet, 'id' | 'name'>[]): Map<string, string> {
  const used = new Set<string>()
  const out = new Map<string, string>()
  for (const cabinet of cabinets) {
    const base = slugify(cabinet.name)
    let slug = base
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`
    used.add(slug)
    out.set(cabinet.id, slug)
  }
  return out
}
