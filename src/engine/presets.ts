/**
 * Cabinet presets: each preset is just a `Cabinet` value over the same engine
 * (plan P8-lite). Metric defaults; every preset builds without warnings above
 * 'info' and passes `validateBuild`.
 */
import { defaultCabinet, defaultConstruction, newBay, newSection } from '@/core/defaults'
import type { Bay, Cabinet, CabinetType, ConstructionMethod, Section } from '@/core/types'
import { WARDROBE_ROD_DROP } from './constants'

export interface PresetInfo {
  type: CabinetType
  label: string
  description: string
}

export const PRESETS: PresetInfo[] = [
  { type: 'base', label: 'Base cabinet', description: '600 × 870 × 580, drawer over two doors' },
  { type: 'wall', label: 'Wall cabinet', description: '600 × 720 × 330, two doors, hung at 1450' },
  { type: 'tall', label: 'Tall / pantry', description: '600 × 2100 × 580, upper and lower door pairs' },
  { type: 'drawer-bank', label: 'Drawer bank', description: '600 × 870 × 580, three drawers' },
  { type: 'bookshelf', label: 'Bookshelf', description: '900 × 1800 × 300, open with four shelves' },
  { type: 'nightstand', label: 'Nightstand', description: '450 × 600 × 400, drawer over an open shelf' },
  { type: 'dresser', label: 'Dresser', description: '1200 × 800 × 500, two columns of three drawers' },
  { type: 'vanity', label: 'Vanity', description: '900 × 810 × 530, sink doors beside three drawers' },
  { type: 'custom', label: 'Custom box', description: '600 × 720 × 560 frameless box with one shelf' },
  { type: 'wardrobe', label: 'Wardrobe / closet tower', description: '1000 × 2100 × 600, two doors, upper shelf over a hanging rod' },
]

type BaySpec = Partial<Omit<Bay, 'id' | 'kind' | 'height'>>

function bay(kind: Bay['kind'], height: Bay['height'] = null, extra: BaySpec = {}): Bay {
  return { ...newBay(kind, height), ...extra }
}

function construction(changes: Partial<ConstructionMethod> = {}): ConstructionMethod {
  return { ...defaultConstruction(), ...changes }
}

const NO_KICK: ConstructionMethod['toeKick'] = { type: 'none', height: 0, setback: 0 }

type PresetBody = Omit<Cabinet, 'id' | 'hardware'> & Partial<Pick<Cabinet, 'hardware'>>

function bodyFor(type: CabinetType): PresetBody {
  const base = defaultCabinet()
  const common = { type, floorHeight: 0, top: base.top }
  // Presets pick the longest default-catalog slide that fits their depth so
  // the chosen slide is used as is (no too-long fallback warning).
  const withSlide = (slideId: string): Cabinet['hardware'] => ({ ...base.hardware, slideId })
  switch (type) {
    case 'base':
      return { ...base, ...common, name: 'Base cabinet' }
    case 'wall':
      return {
        ...common,
        name: 'Wall cabinet',
        width: 600,
        height: 720,
        depth: 330,
        floorHeight: 1450,
        construction: construction({ toeKick: NO_KICK, top: 'full-top' }),
        sections: [newSection([bay('door', null, { doorCount: 2, shelfCount: 2 })])],
      }
    case 'tall':
      return {
        ...common,
        name: 'Tall pantry',
        width: 600,
        height: 2100,
        depth: 580,
        construction: construction({ top: 'full-top' }),
        sections: [newSection([bay('door', 700, { doorCount: 2, shelfCount: 2 }), bay('door', null, { doorCount: 2, shelfCount: 3 })])],
      }
    case 'drawer-bank':
      return { ...common, name: 'Drawer bank', width: 600, height: 870, depth: 580, construction: construction(), sections: [newSection([bay('drawer', 140), bay('drawer'), bay('drawer')])] }
    case 'bookshelf':
      return {
        ...common,
        name: 'Bookshelf',
        width: 900,
        height: 1800,
        depth: 300,
        construction: construction({ toeKick: { type: 'panel', height: 75, setback: 20 }, top: 'full-top', back: { construction: 'captured', grooveDepth: 6, inset: 12 } }),
        sections: [newSection([bay('open', null, { shelfCount: 4 })])],
      }
    case 'nightstand':
      return {
        ...common,
        name: 'Nightstand',
        // 400 − 18 back − 10 rear clearance = 372 available ⇒ 305
        hardware: withSlide('blum-tandem-305'),
        width: 450,
        height: 600,
        depth: 400,
        construction: construction({ toeKick: NO_KICK, top: 'full-top', rearNailer: false }),
        sections: [newSection([bay('drawer', 150), bay('open', null, { shelfCount: 1 })])],
        top: { kind: 'finished', materialId: 'ply-18', thickness: 18, overhangFront: 10, overhangSides: 10 },
      }
    case 'dresser':
      return {
        ...common,
        name: 'Dresser',
        // 500 − 18 back − 10 rear clearance = 472 available ⇒ 457
        hardware: withSlide('blum-tandem-457'),
        width: 1200,
        height: 800,
        depth: 500,
        construction: construction({ toeKick: { type: 'panel', height: 75, setback: 50 }, top: 'full-top', rearNailer: false }),
        sections: [newSection([bay('drawer'), bay('drawer'), bay('drawer')]), newSection([bay('drawer'), bay('drawer'), bay('drawer')])],
        top: { kind: 'finished', materialId: 'ply-18', thickness: 18, overhangFront: 15, overhangSides: 15 },
      }
    case 'vanity':
      return {
        ...common,
        name: 'Vanity',
        // 530 − 18 back − 18 nailer − 10 rear clearance = 484 available ⇒ 457
        hardware: withSlide('blum-tandem-457'),
        width: 900,
        height: 810,
        depth: 530,
        construction: construction(),
        sections: [newSection([bay('door', null, { doorCount: 2 })]), newSection([bay('drawer'), bay('drawer'), bay('drawer')], 300)],
        top: { kind: 'countertop', materialId: null, thickness: 30, overhangFront: 20, overhangSides: 0 },
      }
    case 'custom':
      return {
        ...common,
        name: 'Custom box',
        width: 600,
        height: 720,
        depth: 560,
        construction: construction({ toeKick: NO_KICK, top: 'full-top', rearNailer: false }),
        sections: [newSection([bay('open', null, { shelfCount: 1 })])],
      }
    case 'wardrobe':
      return {
        ...common,
        name: 'Wardrobe',
        width: 1000,
        height: 2100,
        depth: 600,
        construction: construction({ top: 'full-top' }),
        sections: [newSection([bay('door', null, { doorCount: 2, shelfCount: 1, rod: { dropFromTop: WARDROBE_ROD_DROP } })])],
      }
  }
}

/** A fresh cabinet (new ids) of the given type with sensible metric defaults. */
export function createPreset(type: CabinetType): Cabinet {
  const fallback = defaultCabinet()
  const body = bodyFor(type)
  const sections: Section[] = body.sections.map((s) => ({ ...s, bays: s.bays.map((b) => ({ ...b })) }))
  return { ...body, id: fallback.id, hardware: body.hardware ?? fallback.hardware, sections, construction: structuredClone(body.construction), top: { ...body.top } }
}
