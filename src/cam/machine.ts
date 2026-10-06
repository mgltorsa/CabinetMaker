/** Sanity checks on machine settings that would make generated code unsafe. */
import type { BuildWarning, Machine } from '@/core/types'
import { formatForMessage as f } from './format'

function invalid(message: string): BuildWarning {
  return { level: 'error', code: 'cam/machine-invalid', message }
}

export function machineWarnings(machine: Machine): BuildWarning[] {
  const warnings: BuildWarning[] = []
  if (!(machine.safeZ > 0)) warnings.push(invalid(`Safe Z must be above the stock (got ${f(machine.safeZ)} mm)`))
  if (!(machine.programSafeZ >= machine.safeZ)) {
    warnings.push(invalid(`Program safe Z (${f(machine.programSafeZ)}) must be at or above safe Z (${f(machine.safeZ)})`))
  }
  if (!(machine.rapidClearance > 0 && machine.rapidClearance < machine.safeZ)) {
    warnings.push(
      invalid(`Rapid clearance (${f(machine.rapidClearance)}) must be above the stock and below safe Z; plunges start at safe Z`),
    )
  }
  if (!(machine.throughCutExtra >= 0)) {
    warnings.push(invalid(`Through-cut extra must not be negative (got ${f(machine.throughCutExtra)}); 0 is used`))
  }
  if (!(machine.onionSkin >= 0)) {
    warnings.push(invalid(`Onion skin must not be negative (got ${f(machine.onionSkin)})`))
  }
  if (machine.units === 'G20') {
    warnings.push({
      level: 'info',
      code: 'cam/units-inch',
      message: 'Inch output (G20) is coming soon; G-code is written in millimetres (G21)',
    })
  }
  return warnings
}

/** Height the plunge feed starts from: the rapid clearance when it is sane, else safe Z. */
export function plungeStartZ(machine: Machine): number {
  return machine.rapidClearance > 0 && machine.rapidClearance < machine.safeZ ? machine.rapidClearance : machine.safeZ
}
