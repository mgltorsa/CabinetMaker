import { newId } from './ids'
import {
  PROJECT_SCHEMA_VERSION,
  type Bay,
  type Cabinet,
  type ConstructionMethod,
  type EstimateSettings,
  type HardwareItem,
  type Machine,
  type Material,
  type NestSettings,
  type Project,
  type Section,
  type Tool,
} from './types'

/**
 * Starter catalog. Prices are placeholders and SKUs are examples: the shop must
 * verify manufacturer data and override costs (see plan "Risks").
 */
export const DEFAULT_MATERIALS: Material[] = [
  { kind: 'sheet', id: 'ply-18', name: '18 mm plywood', thickness: 18, sheetLength: 2440, sheetWidth: 1220, grained: true, costPerSheet: 85 },
  { kind: 'sheet', id: 'ply-6', name: '6 mm plywood (backs)', thickness: 6, sheetLength: 2440, sheetWidth: 1220, grained: true, costPerSheet: 35 },
  // 4×8 rather than the common 5×5 so it fits the default router table (Y 1250).
  { kind: 'sheet', id: 'bb-12', name: '12 mm Baltic birch 4×8 (drawer boxes)', thickness: 12, sheetLength: 2440, sheetWidth: 1220, grained: true, costPerSheet: 95 },
  { kind: 'sheet', id: 'mdf-18', name: '18 mm MDF (paint-grade fronts)', thickness: 18, sheetLength: 2440, sheetWidth: 1220, grained: false, costPerSheet: 55 },
  { kind: 'linear', id: 'maple-19x63', name: 'Maple 19 × 63 mm (face frames)', thickness: 19, width: 63, stockLength: 2440, costPerMetre: 12 },
]

/*
 * Slide props: `length` = nominal slide length (mm, = drawer-box length);
 * `mount` = 0 undermount, 1 side-mount (engine/constants SLIDE_MOUNT_*).
 * Slides without `mount` match either construction.
 * Hinge-plate props: `height` (mm); `faceFrame` = 1 for a face-frame plate,
 * absent/0 for a frameless (carcass-side) plate (engine/constants HINGE_PLATE_FACE_FRAME).
 */
const undermountSlide = (lengthMm: number, sku: string, cost: number): HardwareItem => ({
  id: `blum-tandem-${lengthMm}`,
  kind: 'slide',
  name: `Undermount slide ${lengthMm} mm (pair)`,
  manufacturer: 'Blum',
  sku,
  unitCost: cost,
  props: { length: lengthMm, mount: 0 },
})

/** Generic full-extension ball-bearing side-mount slides (12.7 mm per side). Verify SKU and spec with the supplier. */
const sideMountSlide = (lengthMm: number, cost: number): HardwareItem => ({
  id: `bb-side-${lengthMm}`,
  kind: 'slide',
  name: `Side-mount ball-bearing slide ${lengthMm} mm, full extension (pair)`,
  manufacturer: 'Generic',
  sku: `BB-SM-${lengthMm}`,
  unitCost: cost,
  props: { length: lengthMm, mount: 1 },
})

export const DEFAULT_HARDWARE: HardwareItem[] = [
  undermountSlide(229, 'TANDEM 563H2290B', 28),
  undermountSlide(305, 'TANDEM 563H3050B', 30),
  undermountSlide(381, 'TANDEM 563H3810B', 32),
  undermountSlide(457, 'TANDEM 563H4570B', 34),
  undermountSlide(533, 'TANDEM 563H5330B', 36),
  sideMountSlide(300, 12),
  sideMountSlide(350, 13),
  sideMountSlide(400, 14),
  sideMountSlide(450, 15),
  sideMountSlide(500, 16),
  sideMountSlide(550, 17),
  { id: 'blum-cliptop-110', kind: 'hinge', name: 'Concealed hinge 110°, full overlay', manufacturer: 'Blum', sku: 'CLIP top 71B3550', unitCost: 6.5, props: { openingAngle: 110, cupDiameter: 35 } },
  { id: 'blum-plate-0', kind: 'hinge-plate', name: 'Hinge mounting plate 0 mm', manufacturer: 'Blum', sku: 'CLIP 173L6100', unitCost: 2.2, props: { height: 0 } },
  { id: 'pull-bar-128', kind: 'pull', name: 'Bar pull 128 mm c/c', manufacturer: 'Generic', sku: 'BAR-128', unitCost: 4, props: { centers: 128 } },
  { id: 'pin-5', kind: 'shelf-pin', name: 'Shelf pin 5 mm', manufacturer: 'Generic', sku: 'PIN-5', unitCost: 0.15, props: { diameter: 5 } },
  { id: 'dowel-8x30', kind: 'dowel', name: 'Dowel 8 × 30 mm', manufacturer: 'Generic', sku: 'DOWEL-8x30', unitCost: 0.05, props: { diameter: 8, length: 30 } },
  { id: 'domino-5x30', kind: 'domino', name: 'Domino tenon 5 × 30 mm', manufacturer: 'Festool', sku: '494938', unitCost: 0.12, props: { thickness: 5, length: 30 } },
]

export const DEFAULT_TOOLS: Tool[] = [
  { id: 't1', number: 1, name: '1/4" compression end mill', kind: 'compression', diameter: 6.35, fluteLength: 22, rpm: 18000, plungeFeed: 1000, cutFeed: 4000, stepDown: 6 },
  { id: 't2', number: 2, name: '3/16" up-cut end mill', kind: 'end-mill', diameter: 4.76, fluteLength: 16, rpm: 18000, plungeFeed: 800, cutFeed: 3000, stepDown: 4 },
  { id: 't3', number: 3, name: '5 mm brad-point drill', kind: 'drill', diameter: 5, fluteLength: 20, rpm: 6000, plungeFeed: 600, cutFeed: 600, stepDown: 5 },
]

export const DEFAULT_MACHINE: Machine = {
  name: 'Generic 4×8 router',
  tableX: 2500,
  tableY: 1250,
  edgeInset: 10,
  safeZ: 10,
  programSafeZ: 25,
  rapidClearance: 3,
  home: { x: 0, y: 0, z: 25 },
  toolChange: { x: 0, y: 0, z: 50, mode: 'manual' },
  park: { x: 0, y: 1200, z: 50 },
  units: 'G21',
  tabs: { enabled: true, spacing: 400, width: 10, thickness: 3 },
  onionSkin: 0.3,
  throughCutExtra: 0.3,
  profileToolId: 't1',
  dadoToolId: 't2',
  drillToolId: 't3',
}

export const DEFAULT_NEST: NestSettings = {
  kerf: 6.35,
  edgeTrim: 10,
  partSpacing: 0,
  ignoreGrain: false,
}

export const DEFAULT_ESTIMATE: EstimateSettings = {
  currency: 'USD',
  shopRate: 65,
  margin: 0.2,
  linearWaste: 0.15,
  labor: {
    minutesPerSheet: 8,
    minutesPerPart: 1.5,
    minutesPerJoineryOp: 0.5,
    minutesPerHole: 0.1,
    minutesPerHardwareItem: 3,
    assemblyMinutesPerCabinet: 45,
  },
}

export function defaultConstruction(): ConstructionMethod {
  return {
    style: 'frameless-overlay',
    carcassMaterialId: 'ply-18',
    backMaterialId: 'ply-6',
    frontMaterialId: 'mdf-18',
    drawerBoxMaterialId: 'bb-12',
    drawerBottomMaterialId: 'ply-6',
    faceFrameMaterialId: 'maple-19x63',
    joinery: 'dado',
    back: { construction: 'captured', grooveDepth: 6, inset: 12 },
    reveal: { edge: 1.5, between: 3 },
    system32: true,
    toeKick: { type: 'panel', height: 100, setback: 75 },
    top: 'stretchers',
    stretcherWidth: 100,
    rearNailer: true,
    nailerWidth: 100,
    faceFrame: { stileWidth: 38, railWidth: 38, overhang: 3 },
    shelfPins: { inset: 37, spacing: 32, diameter: 5, depth: 12 },
    hinge: { cupDiameter: 35, cupDepth: 13, cupEdgeDistance: 4, endDistance: 100 },
    drawer: { slideMount: 'undermount', joinery: 'dado', rearClearance: 10 },
  }
}

export function newBay(kind: Bay['kind'], height: Bay['height'] = null, shelfCount = 0): Bay {
  return { id: newId('bay'), kind, height, shelfCount, doorCount: 1, hingeSide: 'left' }
}

export function newSection(bays: Bay[], width: Section['width'] = null): Section {
  return { id: newId('sec'), width, bays }
}

/** A 600 mm base cabinet: one drawer over a two-door bay with one shelf. */
export function defaultCabinet(id = newId('cab')): Cabinet {
  const doors = newBay('door', null, 1)
  doors.doorCount = 2
  return {
    id,
    name: 'Base cabinet',
    type: 'base',
    width: 600,
    height: 870,
    depth: 580,
    floorHeight: 0,
    construction: defaultConstruction(),
    sections: [newSection([newBay('drawer', 150), doors])],
    hardware: { hingeId: 'blum-cliptop-110', slideId: 'blum-tandem-533', pullId: 'pull-bar-128', shelfPinId: 'pin-5' },
    top: { kind: 'none', materialId: null, thickness: 30, overhangFront: 25, overhangSides: 0 },
  }
}

export function createProject(name = 'Untitled cabinet'): Project {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newId('prj'),
    name,
    units: 'metric',
    cabinets: [defaultCabinet()],
    materials: structuredClone(DEFAULT_MATERIALS),
    hardware: structuredClone(DEFAULT_HARDWARE),
    tools: structuredClone(DEFAULT_TOOLS),
    machine: structuredClone(DEFAULT_MACHINE),
    nest: { ...DEFAULT_NEST },
    estimate: structuredClone(DEFAULT_ESTIMATE),
    room: null,
  }
}
