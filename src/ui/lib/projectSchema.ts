import {
  PROJECT_SCHEMA_VERSION,
  type Bay,
  type Cabinet,
  type ConstructionMethod,
  type EstimateSettings,
  type HardwareItem,
  type LinearMaterial,
  type Machine,
  type MachinePoint,
  type Material,
  type NestSettings,
  type Project,
  type Room,
  type Section,
  type SheetMaterial,
  type Tool,
} from '@/core/types'
import { arrayOf, bool, type Check, isRecord, nullable, num, obj, oneOf, optional, recordOf, str } from './schema'

const construction = obj<ConstructionMethod>({
  style: oneOf('frameless-overlay', 'frameless-inset', 'face-frame-overlay', 'face-frame-inset'),
  carcassMaterialId: str,
  backMaterialId: str,
  frontMaterialId: str,
  drawerBoxMaterialId: str,
  drawerBottomMaterialId: str,
  faceFrameMaterialId: str,
  joinery: oneOf('none', 'dowel', 'domino', 'dado'),
  back: obj({ construction: oneOf('captured', 'applied'), grooveDepth: num, inset: num }),
  reveal: obj({ edge: num, between: num }),
  system32: bool,
  toeKick: obj({ type: oneOf('none', 'panel', 'full'), height: num, setback: num }),
  top: oneOf('full-top', 'stretchers'),
  stretcherWidth: num,
  rearNailer: bool,
  nailerWidth: num,
  faceFrame: obj({ stileWidth: num, railWidth: num, overhang: num }),
  shelfPins: obj({ inset: num, spacing: num, diameter: num, depth: num }),
  hinge: obj({ cupDiameter: num, cupDepth: num, cupEdgeDistance: num, endDistance: num }),
  drawer: obj({
    slideMount: oneOf('undermount', 'side-mount'),
    joinery: oneOf('none', 'dowel', 'domino', 'dado'),
    rearClearance: num,
  }),
})

const bay = obj<Bay>({
  id: str,
  kind: oneOf('drawer', 'door', 'open'),
  height: nullable(num),
  shelfCount: num,
  doorCount: oneOf(1, 2),
  hingeSide: oneOf('left', 'right'),
})

const section = obj<Section>({ id: str, width: nullable(num), bays: arrayOf(bay) })

const cabinet = obj<Cabinet>({
  id: str,
  name: str,
  type: oneOf('base', 'wall', 'tall', 'drawer-bank', 'bookshelf', 'nightstand', 'dresser', 'vanity', 'custom'),
  width: num,
  height: num,
  depth: num,
  floorHeight: num,
  construction,
  sections: arrayOf(section),
  hardware: obj({ hingeId: str, slideId: str, pullId: nullable(str), shelfPinId: str }),
  top: obj({
    kind: oneOf('none', 'finished', 'countertop'),
    materialId: nullable(str),
    thickness: num,
    overhangFront: num,
    overhangSides: num,
  }),
  placement: optional(obj({ wallId: nullable(str), offset: num, rotationDeg: num })),
})

const sheetMaterial = obj<SheetMaterial>({
  kind: oneOf('sheet'),
  id: str,
  name: str,
  thickness: num,
  sheetLength: num,
  sheetWidth: num,
  grained: bool,
  costPerSheet: num,
})

const linearMaterial = obj<LinearMaterial>({
  kind: oneOf('linear'),
  id: str,
  name: str,
  thickness: num,
  width: num,
  stockLength: num,
  costPerMetre: num,
})

const material: Check<Material> = (v, p) => {
  if (isRecord(v) && v.kind === 'sheet') return sheetMaterial(v, p)
  if (isRecord(v) && v.kind === 'linear') return linearMaterial(v, p)
  return `${p}.kind must be sheet or linear`
}

const hardwareItem = obj<HardwareItem>({
  id: str,
  kind: oneOf('hinge', 'hinge-plate', 'slide', 'pull', 'shelf-pin', 'dowel', 'domino', 'leg', 'screw', 'other'),
  name: str,
  manufacturer: str,
  sku: str,
  unitCost: num,
  props: recordOf(num),
})

const tool = obj<Tool>({
  id: str,
  number: num,
  name: str,
  kind: oneOf('end-mill', 'drill', 'compression'),
  diameter: num,
  fluteLength: num,
  rpm: num,
  plungeFeed: num,
  cutFeed: num,
  stepDown: num,
})

const point = obj<MachinePoint>({ x: num, y: num, z: num })

const machine = obj<Machine>({
  name: str,
  tableX: num,
  tableY: num,
  edgeInset: num,
  safeZ: num,
  programSafeZ: num,
  rapidClearance: num,
  home: point,
  toolChange: obj<Machine['toolChange']>({ x: num, y: num, z: num, mode: oneOf('manual', 'auto') }),
  park: point,
  units: oneOf('G21', 'G20'),
  tabs: obj({ enabled: bool, spacing: num, width: num, thickness: num }),
  onionSkin: num,
  throughCutExtra: num,
  profileToolId: str,
  dadoToolId: str,
  drillToolId: str,
})

const nest = obj<NestSettings>({ kerf: num, edgeTrim: num, partSpacing: num, ignoreGrain: bool })

const estimate = obj<EstimateSettings>({
  currency: str,
  shopRate: num,
  margin: num,
  linearWaste: num,
  labor: obj({
    minutesPerSheet: num,
    minutesPerPart: num,
    minutesPerJoineryOp: num,
    minutesPerHole: num,
    minutesPerHardwareItem: num,
    assemblyMinutesPerCabinet: num,
  }),
})

const vec2 = obj({ x: num, y: num })

const room = obj<Room>({
  walls: arrayOf(obj({ id: str, start: vec2, end: vec2, thickness: num, height: num })),
  openings: arrayOf(
    obj({
      id: str,
      wallId: str,
      kind: oneOf('door', 'window'),
      offset: num,
      width: num,
      height: num,
      sillHeight: num,
    }),
  ),
})

const projectShape = obj<Project>({
  schemaVersion: oneOf(PROJECT_SCHEMA_VERSION),
  id: str,
  name: str,
  units: oneOf('metric', 'imperial'),
  cabinets: arrayOf(cabinet),
  materials: arrayOf(material),
  hardware: arrayOf(hardwareItem),
  tools: arrayOf(tool),
  machine,
  nest,
  estimate,
  room: nullable(room),
})

/** Material references every cabinet needs before the engine can build it. */
function checkReferences(project: Project): string | null {
  const materialIds = new Set(project.materials.map((m) => m.id))
  for (const [i, cab] of project.cabinets.entries()) {
    const c = cab.construction
    const refs = [c.carcassMaterialId, c.backMaterialId, c.frontMaterialId, c.drawerBoxMaterialId, c.drawerBottomMaterialId]
    const missing = refs.find((id) => !materialIds.has(id))
    if (missing !== undefined) return `project.cabinets[${i}] uses unknown material "${missing}"`
  }
  return null
}

/** `null` when `value` is a usable current-schema project, else the first problem. */
export function validateProject(value: unknown): string | null {
  if (!isRecord(value)) return 'File is not a JSON object'
  if (value.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    return `Unsupported project schema version ${String(value.schemaVersion)} (expected ${PROJECT_SCHEMA_VERSION})`
  }
  // The cast is safe: checkReferences only runs once projectShape found no error.
  return projectShape(value, 'project') ?? checkReferences(value as unknown as Project)
}

export function isProject(value: unknown): value is Project {
  return validateProject(value) === null
}
