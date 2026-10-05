/**
 * Blender bundle: a zip with one GLB (+ optional PNG thumbnail) per cabinet,
 * manifest.json, the import script and a README. Pure: thumbnails are rendered
 * by the caller (the browser has a canvas; node does not).
 */
import { strToU8, zipSync, type Zippable } from 'fflate'
import type { Project, ProjectBuild } from '@/core/types'
import { BLENDER_SCRIPT, BLENDER_SCRIPT_NAME } from './blenderScript'
import { cabinetToGlb } from './cabinetGlb'
import { buildManifest, CABINETS_DIR, type BundleManifest, type CabinetEntry } from './manifest'
import { README_NAME, readmeText } from './readme'
import { cabinetSlugs, slugify } from './slug'

export type { BundleManifest } from './manifest'

export const MANIFEST_NAME = 'manifest.json'

/** Zip entry timestamp when none is given: fixed so the same project gives the same bytes. */
const DEFAULT_MODIFIED = new Date(2020, 0, 1)
const DEFLATE_LEVEL = 6
/** PNG data is already deflated. */
const STORE = 0
const JSON_INDENT = 2
const SKIP_REASON = 'The cabinet could not be built'

export interface BlenderBundleOptions {
  /** PNG thumbnails by cabinet id. Cabinets without one get an asset preview generated in Blender. */
  thumbnails?: ReadonlyMap<string, Uint8Array>
  /** Timestamp stored on the zip entries. */
  modified?: Date
  /** Include separately supplied countertops (default true, like the 3D view). */
  includeSuppliedTop?: boolean
}

/** Build the bundle zip for every cabinet in the project. */
export function buildBlenderBundle(project: Project, result: { build: ProjectBuild }, options: BlenderBundleOptions = {}): Uint8Array {
  const includeSuppliedTop = options.includeSuppliedTop ?? true
  const slugs = cabinetSlugs(project.cabinets)
  const buildsById = new Map(result.build.cabinets.map((b) => [b.cabinetId, b]))
  const entries: CabinetEntry[] = []
  const skipped: BundleManifest['skipped'] = []
  for (const cabinet of project.cabinets) {
    const build = buildsById.get(cabinet.id)
    if (!build) {
      skipped.push({ id: cabinet.id, name: cabinet.name, reason: SKIP_REASON })
      continue
    }
    const slug = slugs.get(cabinet.id) ?? slugify(cabinet.id)
    const hasThumbnail = options.thumbnails?.has(cabinet.id) ?? false
    entries.push({ cabinet, build, slug, glb: `${CABINETS_DIR}/${slug}.glb`, thumbnail: hasThumbnail ? `${CABINETS_DIR}/${slug}.png` : null })
  }

  const manifest = buildManifest(project, entries, skipped, includeSuppliedTop)
  const files: Zippable = {}
  for (const e of entries) {
    files[e.glb] = [cabinetToGlb(e.cabinet, e.build, project, { includeSuppliedTop }), { level: DEFLATE_LEVEL }]
    const png = options.thumbnails?.get(e.cabinet.id)
    if (e.thumbnail && png) files[e.thumbnail] = [png, { level: STORE }]
  }
  files[MANIFEST_NAME] = strToU8(`${JSON.stringify(manifest, null, JSON_INDENT)}\n`)
  files[BLENDER_SCRIPT_NAME] = strToU8(BLENDER_SCRIPT)
  files[README_NAME] = strToU8(readmeText(manifest))
  return zipSync(files, { level: DEFLATE_LEVEL, mtime: options.modified ?? DEFAULT_MODIFIED })
}
