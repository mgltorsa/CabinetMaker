import {
  PROJECT_SCHEMA_VERSION,
  type Bay,
  type Cabinet,
  type ConstructionMethod,
  type EstimateSettings,
  type ExtraCharge,
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
import {
  CABINET_DIMENSION,
  EXTRA_QTY,
  FLOOR_HEIGHT,
  MARKUP,
  MAX_BAYS,
  MAX_CABINETS,
  MAX_CATALOG_ITEMS,
  MAX_EXTRA_CHARGES,
  MAX_LENGTH,
  MAX_MONEY,
  MAX_SECTIONS,
  MAX_SHELF_PIN_DIAMETER,
  MAX_SHELVES,
  MAX_TAB_WIDTH,
  MIN_SHELF_PIN_SPACING,
  MIN_STEP_DOWN,
  MIN_TAB_SPACING,
  SECTION_SIZE,
  TAX_RATE,
  TOOL_NUMBER,
} from './limits'
import {
  arrayOf,
  bool,
  type Check,
  isRecord,
  nonNegative,
  nullable,
  num,
  numIn,
  obj,
  oneOf,
  optional,
  positive,
  recordOf,
  refine,
  str,
  uniqueList,
} from './schema'

const catalog = { max: MAX_CATALOG_ITEMS }

/** Any length that must not be negative (gaps, depths, insets, reveals…). */
const length = nonNegative(MAX_LENGTH)
/** A length that must be positive (thicknesses, widths of real stock…). */
const size = positive(MAX_LENGTH)

const construction = obj<ConstructionMethod>({
  style: oneOf('frameless-overlay', 'frameless-inset', 'face-frame-overlay', 'face-frame-inset'),
  carcassMaterialId: str,
  backMaterialId: str,
  frontMaterialId: str,
  drawerBoxMaterialId: str,
  drawerBottomMaterialId: str,
  faceFrameMaterialId: str,
  joinery: oneOf('none', 'dowel', 'domino', 'dado'),
  back: obj({ construction: oneOf('captured', 'applied'), grooveDepth: length, inset: length }),
  reveal: obj({ edge: length, between: length }),
  system32: bool,
  toeKick: obj({ type: oneOf('none', 'panel', 'full'), height: length, setback: length }),
  top: oneOf('full-top', 'stretchers'),
  stretcherWidth: length,
  rearNailer: bool,
  nailerWidth: length,
  faceFrame: obj({ stileWidth: size, railWidth: size, overhang: length }),
  // Spacing ≥ MIN_SHELF_PIN_SPACING ≥ MAX_SHELF_PIN_DIAMETER, so pins never overlap.
  shelfPins: obj({
    inset: length,
    spacing: numIn({ min: MIN_SHELF_PIN_SPACING, max: MAX_LENGTH }),
    diameter: numIn({ above: 0, max: MAX_SHELF_PIN_DIAMETER }),
    depth: length,
  }),
  hinge: obj({ cupDiameter: size, cupDepth: length, cupEdgeDistance: length, endDistance: length }),
  drawer: obj({
    slideMount: oneOf('undermount', 'side-mount'),
    joinery: oneOf('none', 'dowel', 'domino', 'dado'),
    rearClearance: length,
  }),
})

const sectionSize = nullable(numIn(SECTION_SIZE))

const bay = obj<Bay>({
  id: str,
  kind: oneOf('drawer', 'door', 'open'),
  height: sectionSize,
  shelfCount: numIn({ min: 0, max: MAX_SHELVES, integer: true }),
  doorCount: oneOf(1, 2),
  hingeSide: oneOf('left', 'right'),
})

const section = obj<Section>({ id: str, width: sectionSize, bays: arrayOf(bay, { min: 1, max: MAX_BAYS }) })

/** Bay ids must be unique across all sections of a cabinet. */
function uniqueBayIds(sections: readonly Section[], path: string): string | null {
  const seen = new Set<string>()
  for (const [si, s] of sections.entries()) {
    for (const [bi, b] of s.bays.entries()) {
      if (seen.has(b.id)) return `${path}.sections[${si}].bays[${bi}].id duplicates "${b.id}"; ids must be unique`
      seen.add(b.id)
    }
  }
  return null
}

const cabinetDimension = numIn(CABINET_DIMENSION)

const cabinet = refine(
  obj<Cabinet>({
    id: str,
    name: str,
    type: oneOf('base', 'wall', 'tall', 'drawer-bank', 'bookshelf', 'nightstand', 'dresser', 'vanity', 'custom'),
    width: cabinetDimension,
    height: cabinetDimension,
    depth: cabinetDimension,
    floorHeight: numIn(FLOOR_HEIGHT),
    construction,
    sections: uniqueList(section, { min: 1, max: MAX_SECTIONS }),
    hardware: obj({ hingeId: str, slideId: str, pullId: nullable(str), shelfPinId: str }),
    top: obj({
      kind: oneOf('none', 'finished', 'countertop'),
      materialId: nullable(str),
      thickness: length,
      overhangFront: length,
      overhangSides: length,
    }),
    placement: optional(obj({ wallId: nullable(str), offset: num, rotationDeg: num })),
  }),
  (c, p) => uniqueBayIds(c.sections, p),
)

const sheetMaterial = obj<SheetMaterial>({
  kind: oneOf('sheet'),
  id: str,
  name: str,
  thickness: size,
  sheetLength: size,
  sheetWidth: size,
  grained: bool,
  costPerSheet: nonNegative(),
})

const linearMaterial = obj<LinearMaterial>({
  kind: oneOf('linear'),
  id: str,
  name: str,
  thickness: size,
  width: size,
  stockLength: size,
  costPerMetre: nonNegative(),
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
  unitCost: nonNegative(),
  props: recordOf(num),
})

const tool = refine(
  obj<Tool>({
    id: str,
    number: numIn({ ...TOOL_NUMBER, integer: true }),
    name: str,
    kind: oneOf('end-mill', 'drill', 'compression'),
    diameter: size,
    fluteLength: size,
    rpm: positive(),
    plungeFeed: positive(),
    cutFeed: positive(),
    stepDown: numIn({ min: MIN_STEP_DOWN, max: MAX_LENGTH }),
  }),
  (t, p) => (t.stepDown <= t.fluteLength ? null : `${p}.stepDown (${t.stepDown}) must not exceed the flute length (${t.fluteLength})`),
)

const point = obj<MachinePoint>({ x: num, y: num, z: num })

const machine = obj<Machine>({
  name: str,
  tableX: size,
  tableY: size,
  edgeInset: num,
  safeZ: num,
  programSafeZ: num,
  rapidClearance: length,
  home: point,
  toolChange: obj<Machine['toolChange']>({ x: num, y: num, z: num, mode: oneOf('manual', 'auto') }),
  park: point,
  units: oneOf('G21', 'G20'),
  // Spacing ≥ MIN_TAB_SPACING > MAX_TAB_WIDTH, so tabs never merge.
  tabs: obj({
    enabled: bool,
    spacing: numIn({ min: MIN_TAB_SPACING, max: MAX_LENGTH }),
    width: numIn({ above: 0, max: MAX_TAB_WIDTH }),
    thickness: length,
  }),
  onionSkin: length,
  throughCutExtra: length,
  profileToolId: str,
  dadoToolId: str,
  drillToolId: str,
})

const nest = obj<NestSettings>({ kerf: length, edgeTrim: length, partSpacing: length, ignoreGrain: bool })

const minutes = nonNegative()

const extraCharge = obj<ExtraCharge>({
  id: str,
  label: str,
  qty: numIn(EXTRA_QTY),
  unit: oneOf('pcs', 'h', 'm', 'm²', 'job'),
  unitCost: nonNegative(MAX_MONEY),
})

const estimate = obj<EstimateSettings>({
  currency: str,
  shopRate: nonNegative(),
  // price = cost / (1 - margin)
  margin: numIn({ min: 0, below: 1 }),
  linearWaste: nonNegative(),
  labor: obj({
    minutesPerSheet: minutes,
    minutesPerPart: minutes,
    minutesPerJoineryOp: minutes,
    minutesPerHole: minutes,
    minutesPerHardwareItem: minutes,
    assemblyMinutesPerCabinet: minutes,
  }),
  // Optional: projects saved before these existed omit them.
  materialMarkup: optional(numIn(MARKUP)),
  hardwareMarkup: optional(numIn(MARKUP)),
  extras: optional(uniqueList(extraCharge, { max: MAX_EXTRA_CHARGES })),
  taxRate: optional(numIn(TAX_RATE)),
  minimumCharge: optional(nonNegative(MAX_MONEY)),
})

const vec2 = obj({ x: num, y: num })

const room = obj<Room>({
  walls: uniqueList(obj({ id: str, start: vec2, end: vec2, thickness: length, height: length }), catalog),
  openings: uniqueList(
    obj({
      id: str,
      wallId: str,
      kind: oneOf('door', 'window'),
      offset: num,
      width: length,
      height: length,
      sillHeight: num,
    }),
    catalog,
  ),
})

const projectShape = obj<Project>({
  schemaVersion: oneOf(PROJECT_SCHEMA_VERSION),
  id: str,
  name: str,
  units: oneOf('metric', 'imperial'),
  cabinets: uniqueList(cabinet, { max: MAX_CABINETS }),
  materials: uniqueList(material, catalog),
  hardware: uniqueList(hardwareItem, catalog),
  tools: uniqueList(tool, { max: TOOL_NUMBER.max }),
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

/**
 * `null` when `value` is a usable current-schema project, else the first
 * problem with its path. Beyond the shape this enforces the sanity bounds of
 * `./limits` (so an import cannot hang the pipeline), unique ids, and that
 * cabinets reference known materials.
 */
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
