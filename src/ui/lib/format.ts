import type { Material, Mm, Project, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'

/** Length with its unit, e.g. `564 mm` or `22 3/16"`. */
export function lengthLabel(mm: Mm, units: UnitSystem): string {
  return units === 'metric' ? `${formatLength(mm, units)} mm` : formatLength(mm, units)
}

export function unitSuffix(units: UnitSystem): string {
  return units === 'metric' ? 'mm' : 'in'
}

/** `L × W × T` in project units. */
export function dimsLabel(dims: { length: Mm; width: Mm; thickness: Mm }, units: UnitSystem): string {
  const f = (v: Mm): string => formatLength(v, units)
  const suffix = units === 'metric' ? ' mm' : ''
  return `${f(dims.length)} × ${f(dims.width)} × ${f(dims.thickness)}${suffix}`
}

export function percent(ratio: number, decimals = 1): string {
  return `${(ratio * 100).toFixed(decimals)} %`
}

/** Currency amount; falls back to a plain number when the code is not ISO 4217. */
export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes.toFixed(0)} min`
  const h = Math.floor(minutes / 60)
  return `${h} h ${Math.round(minutes - h * 60)} min`
}

export function findMaterial(project: Project, id: string | null): Material | undefined {
  return id === null ? undefined : project.materials.find((m) => m.id === id)
}

export function materialName(project: Project, id: string): string {
  return findMaterial(project, id)?.name ?? id
}
