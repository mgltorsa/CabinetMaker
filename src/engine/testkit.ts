/**
 * Test helpers for engine specs: deterministic cabinets (fixed ids) and part
 * lookups. Not used by production code.
 */
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS, defaultConstruction } from '@/core/defaults'
import type { Bay, BayKind, Cabinet, CabinetBuild, ConstructionMethod, Mm, Part, Section } from '@/core/types'
import { buildCabinet } from '.'

export function bay(kind: BayKind, height: Mm | null = null, extra: Partial<Omit<Bay, 'id' | 'kind' | 'height'>> = {}): Omit<Bay, 'id'> {
  return { kind, height, shelfCount: 0, doorCount: 1, hingeSide: 'left', ...extra }
}

export interface SectionInput {
  width: Section['width']
  bays: Omit<Bay, 'id'>[]
}

export function section(bays: Omit<Bay, 'id'>[], width: Mm | null = null): SectionInput {
  return { width, bays }
}

export interface TestCabinetInput extends Partial<Omit<Cabinet, 'construction' | 'sections'>> {
  construction?: Partial<ConstructionMethod>
  sections?: SectionInput[]
}

/** A cabinet with deterministic ids; defaults to the 600 × 870 × 580 base box with one open bay. */
export function testCabinet(input: TestCabinetInput = {}): Cabinet {
  const { construction, sections, ...rest } = input
  const secs = (sections ?? [section([bay('open')])]).map((s, si) => ({
    ...s,
    id: `sec_${si + 1}`,
    bays: s.bays.map((b, bi) => ({ ...b, id: `bay_${si + 1}_${bi + 1}` })),
  }))
  return {
    id: 'cab',
    name: 'Test cabinet',
    type: 'base',
    width: 600,
    height: 870,
    depth: 580,
    floorHeight: 0,
    hardware: { hingeId: 'blum-cliptop-110', slideId: 'blum-tandem-533', pullId: 'pull-bar-128', shelfPinId: 'pin-5' },
    top: { kind: 'none', materialId: null, thickness: 30, overhangFront: 25, overhangSides: 0 },
    ...rest,
    construction: { ...defaultConstruction(), ...construction },
    sections: secs,
  }
}

export function build(cabinet: Cabinet): CabinetBuild {
  return buildCabinet(cabinet, { materials: DEFAULT_MATERIALS, hardware: DEFAULT_HARDWARE })
}

export function part(b: CabinetBuild, role: string): Part {
  const p = b.parts.find((x) => x.role === role)
  if (!p) throw new Error(`No part with role ${role}; have ${b.parts.map((x) => x.role).join(', ')}`)
  return p
}

export function roles(b: CabinetBuild): string[] {
  return b.parts.map((p) => p.role)
}

export function usage(b: CabinetBuild, hardwareId: string): number {
  return b.hardware.filter((h) => h.hardwareId === hardwareId).reduce((n, h) => n + h.qty, 0)
}

export function warningCodes(b: CabinetBuild): string[] {
  return b.warnings.map((w) => w.code)
}
