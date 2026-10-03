/**
 * Cabinet presets: each preset is just a `Cabinet` value over the same engine.
 * Bootstrap — the engine work stream fills in real presets.
 */
import { defaultCabinet } from '@/core/defaults'
import type { Cabinet, CabinetType } from '@/core/types'

export interface PresetInfo {
  type: CabinetType
  label: string
  description: string
}

export const PRESETS: PresetInfo[] = [{ type: 'base', label: 'Base cabinet', description: 'Drawer over two doors' }]

export function createPreset(type: CabinetType): Cabinet {
  const cab = defaultCabinet()
  return { ...cab, type }
}
