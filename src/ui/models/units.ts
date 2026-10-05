/**
 * Unit handling for imported models. glTF is metres by specification; OBJ and
 * STL carry no unit, so the import guesses one from the model's size and the
 * user can correct it.
 */
import type { ModelFormat, ModelUnit, UnitSystem, Vec3 } from '@/core/types'
import { formatLength } from '@/core/units'

export const MM_PER_MODEL_UNIT: Readonly<Record<ModelUnit, number>> = { m: 1000, cm: 10, mm: 1, in: 25.4 }

export const MODEL_UNITS: readonly { value: ModelUnit; label: string }[] = [
  { value: 'm', label: 'Metres' },
  { value: 'cm', label: 'Centimetres' },
  { value: 'mm', label: 'Millimetres' },
  { value: 'in', label: 'Inches' },
]

/**
 * Guess thresholds on the largest extent (in file units). Furniture and rooms
 * are 0.3–10 m: under 20 units reads as metres. OBJ under 400 reads as
 * centimetres (a 4 m wall is 400 cm); STL is millimetres by 3D-printing
 * convention. Anything larger is millimetres.
 */
const METRES_BELOW = 20
const OBJ_CENTIMETRES_BELOW = 400

const MM_PER_M = 1000

export function metresPerModelUnit(unit: ModelUnit): number {
  return MM_PER_MODEL_UNIT[unit] / MM_PER_M
}

/** World size (mm) of a model whose bounding box is `nativeSize` file units. */
export function modelSizeMm(nativeSize: Vec3, unit: ModelUnit, scale: number): Vec3 {
  const k = MM_PER_MODEL_UNIT[unit] * scale
  return { x: nativeSize.x * k, y: nativeSize.y * k, z: nativeSize.z * k }
}

export function guessModelUnit(format: ModelFormat, nativeSize: Vec3): ModelUnit {
  if (format === 'glb' || format === 'gltf') return 'm'
  const largest = Math.max(nativeSize.x, nativeSize.y, nativeSize.z)
  if (!Number.isFinite(largest) || largest <= 0) return 'mm'
  if (largest < METRES_BELOW) return 'm'
  if (format === 'obj' && largest < OBJ_CENTIMETRES_BELOW) return 'cm'
  return 'mm'
}

/** `W × H × D` (X × Y × Z) in project units, e.g. `1000 × 1000 × 1000 mm`. */
export function sizeLabel(size: Vec3, units: UnitSystem): string {
  const f = (v: number): string => formatLength(v, units)
  return `${f(size.x)} × ${f(size.y)} × ${f(size.z)}${units === 'metric' ? ' mm' : ''}`
}
