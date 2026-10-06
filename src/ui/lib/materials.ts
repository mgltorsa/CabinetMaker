/** Material library helpers: colours, one-line descriptions and sanity warnings. */
import type { Material, Project, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'
import { lengthLabel } from './format'

/** Where a cabinet references a material (construction fields plus the top). */
export type MaterialUseField = 'carcass' | 'back' | 'fronts' | 'drawerBox' | 'drawerBottom' | 'faceFrame' | 'top'

export const MATERIAL_USE_LABELS: Record<MaterialUseField, string> = {
  carcass: 'carcass',
  back: 'back',
  fronts: 'fronts',
  drawerBox: 'drawer boxes',
  drawerBottom: 'drawer bottoms',
  faceFrame: 'face frame',
  top: 'top',
}

/** Below this a sheet is more likely a typo than real stock (veneers are not cut on the router). */
export const MIN_SENSIBLE_THICKNESS = 1

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** `#rrggbb` only (what `<input type="color">` produces). */
export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value)
}

/**
 * Colours handed to new materials, in order: wood tones and paint colours that
 * read apart from each other and from the default catalog's colours in 3D.
 */
export const MATERIAL_PALETTE: readonly string[] = [
  '#b5793f', // oak
  '#6b4630', // walnut
  '#a8432f', // cherry red
  '#5f7f6e', // sage paint
  '#3f5f86', // navy paint
  '#c9a227', // mustard paint
  '#8a8f96', // grey melamine
  '#2f2f33', // black melamine
  '#c46f8c', // rose paint
  '#7d9c3b', // olive paint
]

/** First palette colour no material uses yet; once all are taken, cycle by count. */
export function nextMaterialColor(materials: readonly Material[]): string {
  const used = new Set(materials.map((m) => m.color?.toLowerCase()))
  const free = MATERIAL_PALETTE.find((c) => !used.has(c))
  return free ?? MATERIAL_PALETTE[materials.length % MATERIAL_PALETTE.length] ?? '#b5793f'
}

/** e.g. "5 materials · 4 sheet, 1 linear". */
export function librarySummary(materials: readonly Material[]): string {
  const sheets = materials.filter((m) => m.kind === 'sheet').length
  const n = materials.length
  return `${n} ${n === 1 ? 'material' : 'materials'} · ${sheets} sheet, ${n - sheets} linear`
}

/** Thickness and stock size in project units, e.g. "18 mm · 2440 × 1220 mm · grained". */
export function materialSpec(material: Material, units: UnitSystem): string {
  const f = (mm: number): string => formatLength(mm, units)
  const unit = units === 'metric' ? ' mm' : ''
  if (material.kind === 'sheet') {
    const size = `${f(material.sheetLength)} × ${f(material.sheetWidth)}${unit}`
    return [lengthLabel(material.thickness, units), size, ...(material.grained ? ['grained'] : [])].join(' · ')
  }
  return `${f(material.thickness)} × ${f(material.width)}${unit} · ${lengthLabel(material.stockLength, units)} boards`
}

/** Inline warnings for a material row; empty when it looks sane. */
export function materialWarnings(material: Material, project: Project): string[] {
  const warnings: string[] = []
  const { tableX, tableY } = project.machine
  if (material.kind === 'sheet' && (material.sheetLength > tableX || material.sheetWidth > tableY)) {
    warnings.push(`Sheet is larger than the ${formatLength(tableX, 'metric')} × ${formatLength(tableY, 'metric')} mm machine table; CAM will flag it.`)
  }
  if (material.thickness < MIN_SENSIBLE_THICKNESS) warnings.push(`Thinner than ${MIN_SENSIBLE_THICKNESS} mm: check the thickness.`)
  if (project.materials.some((m) => m.id !== material.id && m.name === material.name)) warnings.push('Another material has the same name.')
  return warnings
}
