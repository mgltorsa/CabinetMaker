/**
 * Shared data model. This file is the contract between modules:
 *
 *   Project ──engine──▶ ProjectBuild (parts, ops, hardware)
 *                         ├──nest──────▶ NestResult (sheets, placements)
 *                         │               └──cam──▶ Toolpath[] ──▶ G-code
 *                         ├──estimate──▶ Bom, Estimate
 *                         └──drawings──▶ Drawing ──▶ SVG / PDF
 *
 * Only `Project` is stored. Everything else is derived and must never be
 * persisted as a source of truth.
 *
 * Conventions (see docs/architecture.md):
 * - All lengths are millimetres (`Mm`). Imperial is a display/input concern only.
 * - Cabinet space: origin at left / floor / back corner of the cabinet box,
 *   +X to the right, +Y up, +Z toward the front (three.js friendly, Y-up).
 * - Panel space: x along part length (grain direction when grained), y along
 *   part width, z = 0 on face B, z = thickness on face A. Ops are in panel space.
 * - Sheet / machine space: x along sheet length, y along sheet width, origin at
 *   the sheet's front-left corner, Z = 0 at the top of stock, negative into stock.
 */

export type Mm = number
export type Id = string
export type UnitSystem = 'metric' | 'imperial'

export interface Vec2 {
  x: Mm
  y: Mm
}

export interface Vec3 {
  x: Mm
  y: Mm
  z: Mm
}

export interface Box3 {
  min: Vec3
  max: Vec3
}

export type Axis = 'x' | 'y' | 'z'

// ─── Materials & catalog ────────────────────────────────────────────────────

export interface SheetMaterial {
  kind: 'sheet'
  id: Id
  name: string
  thickness: Mm
  /** Sheet size; grain (if any) runs along `sheetLength`. */
  sheetLength: Mm
  sheetWidth: Mm
  grained: boolean
  costPerSheet: number
  /** Display colour (`#rrggbb`) for the 3D view; absent = default finish colour. */
  color?: string
}

export interface LinearMaterial {
  kind: 'linear'
  id: Id
  name: string
  thickness: Mm
  /** Nominal board width the parts are ripped from. */
  width: Mm
  /** Stock board length bought. */
  stockLength: Mm
  costPerMetre: number
  /** Display colour (`#rrggbb`) for the 3D view; absent = default finish colour. */
  color?: string
  /** Cross-section; absent = rectangular. Round stock (hanging rods) is `thickness` in diameter. */
  profile?: 'rectangular' | 'round'
}

export type Material = SheetMaterial | LinearMaterial

export type HardwareKind =
  | 'hinge'
  | 'hinge-plate'
  | 'slide'
  | 'pull'
  | 'shelf-pin'
  | 'dowel'
  | 'domino'
  | 'leg'
  | 'screw'
  | 'other'
  /** Hanging-rod end supports / flanges (`props.centre = 1`: centre support). */
  | 'rod-support'

export interface HardwareItem {
  id: Id
  kind: HardwareKind
  name: string
  manufacturer: string
  /** Manufacturer part number. Catalog values must be verified by the shop. */
  sku: string
  unitCost: number
  /** Kind-specific numeric properties, e.g. slide `length`, hinge `openingAngle`. */
  props: Record<string, number>
}

// ─── Construction method ────────────────────────────────────────────────────

export type ConstructionStyle = 'frameless-overlay' | 'frameless-inset' | 'face-frame-overlay' | 'face-frame-inset'
export type JoineryType = 'none' | 'dowel' | 'domino' | 'dado'
export type BackConstruction = 'captured' | 'applied'
export type ToeKickType = 'none' | 'panel' | 'full'
export type TopConstruction = 'full-top' | 'stretchers'
export type SlideMount = 'undermount' | 'side-mount'
export type DrawerJoinery = 'none' | 'dowel' | 'domino' | 'dado'

export interface ConstructionMethod {
  style: ConstructionStyle
  carcassMaterialId: Id
  backMaterialId: Id
  frontMaterialId: Id
  drawerBoxMaterialId: Id
  drawerBottomMaterialId: Id
  faceFrameMaterialId: Id
  joinery: JoineryType
  back: {
    construction: BackConstruction
    /** Groove depth into sides/top/bottom when captured. */
    grooveDepth: Mm
    /** Distance from rear edge of carcass to the back panel groove. */
    inset: Mm
  }
  /** Gap between a front and the cabinet edge / adjacent front. */
  reveal: {
    edge: Mm
    between: Mm
  }
  system32: boolean
  toeKick: {
    type: ToeKickType
    height: Mm
    setback: Mm
  }
  top: TopConstruction
  stretcherWidth: Mm
  rearNailer: boolean
  nailerWidth: Mm
  faceFrame: {
    stileWidth: Mm
    railWidth: Mm
    /** How far the face frame overhangs the carcass side, each side. */
    overhang: Mm
  }
  shelfPins: {
    /** Distance from front/back edge of the side to the pin row centre. */
    inset: Mm
    spacing: Mm
    diameter: Mm
    depth: Mm
  }
  hinge: {
    cupDiameter: Mm
    cupDepth: Mm
    /** Door edge to cup edge distance (Blum "TB"). */
    cupEdgeDistance: Mm
    /** Distance from door top/bottom to cup centre. */
    endDistance: Mm
  }
  drawer: {
    slideMount: SlideMount
    joinery: DrawerJoinery
    /** Rear clearance between drawer slide end and cabinet back. */
    rearClearance: Mm
  }
  /** Linear stock hanging rods are cut from; absent = the default rod (`DEFAULT_ROD_MATERIAL_ID`). */
  rodMaterialId?: Id
}

// ─── Cabinet ────────────────────────────────────────────────────────────────

export type CabinetType =
  | 'base'
  | 'wall'
  | 'tall'
  | 'drawer-bank'
  | 'bookshelf'
  | 'nightstand'
  | 'dresser'
  | 'vanity'
  | 'custom'
  | 'wardrobe'

export type BayKind = 'drawer' | 'door' | 'open'

/** A hanging (wardrobe) rod across a door or open bay, cut from linear stock. */
export interface HangingRod {
  /** Rod centre below the top of the bay opening. */
  dropFromTop: Mm
}

/** A horizontal band inside a section. Bays stack top to bottom. */
export interface Bay {
  id: Id
  kind: BayKind
  /** Front (or opening) height. `null` shares the remaining height equally. */
  height: Mm | null
  /** Adjustable shelves inside a door/open bay. */
  shelfCount: number
  /** Door bays: 1 or 2 doors. */
  doorCount: 1 | 2
  /** Single-door bays: hinge side. */
  hingeSide: 'left' | 'right'
  /** Door/open bays: a hanging rod; absent = none. Shelves in the bay sit above it. */
  rod?: HangingRod
}

/** A vertical column inside the carcass. Sections are separated by dividers. */
export interface Section {
  id: Id
  /** Interior width. `null` shares the remaining width equally. */
  width: Mm | null
  bays: Bay[]
}

export type TopKind = 'none' | 'finished' | 'countertop'

export interface Cabinet {
  id: Id
  name: string
  type: CabinetType
  width: Mm
  height: Mm
  depth: Mm
  /** Height of the cabinet bottom above the floor (wall cabinets). */
  floorHeight: Mm
  construction: ConstructionMethod
  sections: Section[]
  hardware: {
    hingeId: Id
    slideId: Id
    pullId: Id | null
    shelfPinId: Id
  }
  top: {
    kind: TopKind
    materialId: Id | null
    thickness: Mm
    overhangFront: Mm
    overhangSides: Mm
  }
  /** Placement in the room (phase 6). Cabinet space origin in room space. */
  placement?: { wallId: Id | null; offset: Mm; rotationDeg: number }
}

// ─── Machine & tools ────────────────────────────────────────────────────────

export interface Tool {
  id: Id
  /** Machine tool number (T1, T2...). */
  number: number
  name: string
  kind: 'end-mill' | 'drill' | 'compression'
  diameter: Mm
  fluteLength: Mm
  rpm: number
  /** mm/min */
  plungeFeed: number
  /** mm/min */
  cutFeed: number
  /** Max depth per pass. */
  stepDown: Mm
}

export interface MachinePoint {
  x: Mm
  y: Mm
  z: Mm
}

export interface Machine {
  name: string
  tableX: Mm
  tableY: Mm
  /** Distance kept from the sheet edge before any cut. */
  edgeInset: Mm
  safeZ: Mm
  programSafeZ: Mm
  rapidClearance: Mm
  home: MachinePoint
  toolChange: MachinePoint & { mode: 'manual' | 'auto' }
  park: MachinePoint
  units: 'G21' | 'G20'
  tabs: {
    enabled: boolean
    spacing: Mm
    width: Mm
    thickness: Mm
  }
  /** Leave this much material at the bottom of a profile when tabs are off. */
  onionSkin: Mm
  /** Extra depth below stock thickness for through cuts. */
  throughCutExtra: Mm
  profileToolId: Id
  dadoToolId: Id
  drillToolId: Id
}

// ─── Settings for derived modules ───────────────────────────────────────────

export interface NestSettings {
  kerf: Mm
  /** Trim margin kept clear on every sheet edge. */
  edgeTrim: Mm
  /** Extra spacing between parts on top of kerf (router nests need tool diameter). */
  partSpacing: Mm
  /** Ignore grain and allow any rotation. */
  ignoreGrain: boolean
}

/** Unit of a user-defined extra charge line (finishing, delivery, installation…). */
export type ExtraChargeUnit = 'pcs' | 'h' | 'm' | 'm²' | 'job'

/** A user-defined line added to the estimate on top of materials, hardware and labor. */
export interface ExtraCharge {
  id: Id
  label: string
  qty: number
  unit: ExtraChargeUnit
  unitCost: number
}

export interface EstimateSettings {
  currency: string
  shopRate: number
  /** 0.2 = 20 % margin on cost (price = cost / (1 - margin)). */
  margin: number
  /** Waste factor applied to linear stock. */
  linearWaste: number
  labor: {
    minutesPerSheet: number
    minutesPerPart: number
    minutesPerJoineryOp: number
    minutesPerHole: number
    minutesPerHardwareItem: number
    assemblyMinutesPerCabinet: number
  }
  /*
   * Commercial parameters. Optional so projects saved before they existed
   * still load; absent means 0 / none.
   */
  /** Markup on material cost before margin (0.1 = +10 %). */
  materialMarkup?: number
  /** Markup on hardware cost before margin (0.1 = +10 %). */
  hardwareMarkup?: number
  /** User-defined charges (finishing, delivery, installation, design fee…). */
  extras?: ExtraCharge[]
  /** Tax on the price, shown separately (0.1 = 10 %). */
  taxRate?: number
  /** Lowest pre-tax price charged for a job; 0 or absent = no minimum. */
  minimumCharge?: number
}

// ─── Room (phase 6) ─────────────────────────────────────────────────────────

export interface Wall {
  id: Id
  start: Vec2
  end: Vec2
  thickness: Mm
  height: Mm
}

export interface WallOpening {
  id: Id
  wallId: Id
  kind: 'door' | 'window'
  offset: Mm
  width: Mm
  height: Mm
  sillHeight: Mm
}

export interface Room {
  walls: Wall[]
  openings: WallOpening[]
}

// ─── Project (the only persisted document) ──────────────────────────────────

export const PROJECT_SCHEMA_VERSION = 1

export interface Project {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION
  id: Id
  name: string
  units: UnitSystem
  cabinets: Cabinet[]
  materials: Material[]
  hardware: HardwareItem[]
  tools: Tool[]
  machine: Machine
  nest: NestSettings
  estimate: EstimateSettings
  room: Room | null
  /** Plan-book PDF title block, branding and sections; defaults when absent. */
  pdf?: PdfSettings
}

// ─── Engine output ──────────────────────────────────────────────────────────

export type PartGroup =
  | 'carcass'
  | 'back'
  | 'shelf'
  | 'divider'
  | 'front'
  | 'drawer-box'
  | 'face-frame'
  | 'toe-kick'
  | 'top'
  | 'stretcher'
  /** Hanging rods (round linear stock; bounds are diameter × diameter × length). */
  | 'rod'

export type Grain = 'length' | 'width' | 'none'

/** Panel faces. A/B are the broad faces; edges are named in panel space. */
export type Face = 'A' | 'B' | 'edge-x0' | 'edge-x1' | 'edge-y0' | 'edge-y1'

interface OpBase {
  id: Id
  face: Face
  /** Why this op exists; used by drawings, BOM and labor. */
  purpose: OpPurpose
}

export type OpPurpose =
  | 'shelf-pin'
  | 'hinge-cup'
  | 'hinge-plate'
  | 'slide'
  | 'dowel'
  | 'domino'
  | 'back-groove'
  | 'bottom-groove'
  | 'dado'
  | 'system32'
  | 'pull'

export interface HoleOp extends OpBase {
  kind: 'hole'
  /** Centre, panel space. For edge faces x/y are along that edge and through the thickness. */
  x: Mm
  y: Mm
  diameter: Mm
  depth: Mm
}

/** A straight groove whose centreline runs from (x1,y1) to (x2,y2). */
export interface DadoOp extends OpBase {
  kind: 'dado'
  x1: Mm
  y1: Mm
  x2: Mm
  y2: Mm
  width: Mm
  depth: Mm
}

/** Slot/mortise (Domino), centred at x/y, long axis along `axis`. */
export interface MortiseOp extends OpBase {
  kind: 'mortise'
  x: Mm
  y: Mm
  length: Mm
  width: Mm
  depth: Mm
  axis: 'x' | 'y'
}

export type Op = HoleOp | DadoOp | MortiseOp

export interface Part {
  /** Stable, deterministic id: `${cabinetId}:${role}` (+ index where needed). */
  id: Id
  cabinetId: Id
  name: string
  group: PartGroup
  /** Machine-readable role, e.g. 'side-left', 'shelf-2', 'drawer-front-1'. */
  role: string
  length: Mm
  width: Mm
  thickness: Mm
  materialId: Id
  grain: Grain
  /** Axis-aligned bounds in cabinet space (for 3D and elevations). */
  bounds: Box3
  /** Which cabinet axis each panel axis maps to. */
  axes: { length: Axis; width: Axis; thickness: Axis }
  ops: Op[]
  /** Signed panel-space orientation in cabinet space (set by the engine). */
  frame?: PanelFrame
}

export interface HardwareUsage {
  hardwareId: Id
  cabinetId: Id
  qty: number
  note: string
}

export type WarningLevel = 'info' | 'warn' | 'error'

export interface BuildWarning {
  level: WarningLevel
  code: string
  message: string
  cabinetId?: Id
  partId?: Id
}

export interface CabinetBuild {
  cabinetId: Id
  parts: Part[]
  hardware: HardwareUsage[]
  warnings: BuildWarning[]
}

export interface ProjectBuild {
  cabinets: CabinetBuild[]
  /** Flattened parts of all cabinets, in cabinet order. */
  parts: Part[]
  hardware: HardwareUsage[]
  warnings: BuildWarning[]
}

// ─── Nest output ────────────────────────────────────────────────────────────

export interface Placement {
  partId: Id
  /** Lower-left corner of the part's placed rectangle, sheet space. */
  x: Mm
  y: Mm
  /** true: part length runs along sheet Y. */
  rotated: boolean
  /** Placed footprint along sheet X / Y. */
  sizeX: Mm
  sizeY: Mm
}

export interface Sheet {
  /** `${materialId}#${index}` */
  id: Id
  materialId: Id
  index: number
  length: Mm
  width: Mm
  thickness: Mm
  placements: Placement[]
  /** Part area / sheet area, 0..1. */
  yield: number
}

export interface NestMaterialSummary {
  materialId: Id
  sheetCount: number
  partCount: number
  yield: number
}

export interface NestResult {
  sheets: Sheet[]
  /** Linear-stock parts are not nested; they are listed here for the BOM. */
  linearPartIds: Id[]
  unplaced: { partId: Id; reason: string }[]
  summary: NestMaterialSummary[]
}

// ─── CAM output ─────────────────────────────────────────────────────────────

export type ToolpathKind = 'profile' | 'dado' | 'pocket' | 'drill'

/** Polyline in machine space (sheet space XY, Z ≤ 0 into stock). */
export type Polyline3 = Vec3[]

export interface Toolpath {
  id: Id
  sheetId: Id
  partId: Id | null
  kind: ToolpathKind
  toolId: Id
  /** Cutting moves only. Rapids between passes are implied (retract to safeZ). */
  passes: Polyline3[]
}

export interface CamResult {
  sheetId: Id
  toolpaths: Toolpath[]
  /** Ops CAM could not machine (edge bores, face-B ops) — must be done by hand. */
  manualOps: { partId: Id; opId: Id; reason: string }[]
  warnings: BuildWarning[]
}

// ─── Estimate output ────────────────────────────────────────────────────────

export type BomCategory = 'sheet' | 'linear' | 'hardware' | 'extra'

export interface BomLine {
  category: BomCategory
  refId: Id
  description: string
  manufacturer?: string
  sku?: string
  qty: number
  unit: 'sheet' | 'm' | 'pcs' | ExtraChargeUnit
  unitCost: number
  total: number
}

export interface PartScheduleRow {
  partId: Id
  cabinetId: Id
  name: string
  materialId: Id
  length: Mm
  width: Mm
  thickness: Mm
  grain: Grain
  opCount: number
}

export interface Bom {
  parts: PartScheduleRow[]
  lines: BomLine[]
}

export interface LaborLine {
  bucket: 'cutting' | 'joinery' | 'drilling' | 'assembly' | 'hardware'
  minutes: number
  cost: number
}

export interface Estimate {
  currency: string
  materials: BomLine[]
  hardware: BomLine[]
  labor: LaborLine[]
  materialCost: number
  hardwareCost: number
  laborCost: number
  /** Cost basis the margin applies to: materials + hardware + labor + extras + markups. */
  subtotal: number
  marginAmount: number
  /** Pre-tax price: subtotal + marginAmount + minimumChargeAdjustment. */
  price: number
  /** User-defined extra charge lines (category 'extra'). */
  extras: BomLine[]
  extrasCost: number
  materialMarkupAmount: number
  hardwareMarkupAmount: number
  /** materialMarkupAmount + hardwareMarkupAmount. */
  markupAmount: number
  /** Added so the price reaches the minimum charge; 0 when it already does. */
  minimumChargeAdjustment: number
  /** Tax rate applied (fraction), for labels. */
  taxRate: number
  tax: number
  /** price + tax. */
  total: number
}

// ─── Drawings ───────────────────────────────────────────────────────────────

export type DrawingLayer = 'outline' | 'hidden' | 'op' | 'dimension' | 'text' | 'hatch'

export type Shape =
  | { type: 'line'; x1: Mm; y1: Mm; x2: Mm; y2: Mm; layer: DrawingLayer }
  | { type: 'rect'; x: Mm; y: Mm; w: Mm; h: Mm; layer: DrawingLayer; fill?: string }
  | { type: 'circle'; cx: Mm; cy: Mm; r: Mm; layer: DrawingLayer }
  | { type: 'polyline'; points: Vec2[]; closed: boolean; layer: DrawingLayer }
  | { type: 'text'; x: Mm; y: Mm; text: string; size: Mm; anchor: 'start' | 'middle' | 'end'; layer: DrawingLayer }
  | {
      type: 'dim'
      x1: Mm
      y1: Mm
      x2: Mm
      y2: Mm
      /** Perpendicular offset of the dimension line from the measured points. */
      offset: Mm
      /** Pre-formatted label; renderer formats the distance when omitted. */
      label?: string
    }

/**
 * Neutral 2D drawing. Model space is mm with +Y **up** (like a technical
 * drawing); renderers flip Y for SVG/PDF. Both SVG and PDF are rendered from
 * this one model so the screen and the plan book cannot disagree.
 */
export interface Drawing {
  id: Id
  title: string
  /** Model-space extents (mm). */
  bounds: { minX: Mm; minY: Mm; maxX: Mm; maxY: Mm }
  shapes: Shape[]
}

// ─── Panel frame (engine) ───────────────────────────────────────────────────

/** A signed cabinet-space direction. */
export type SignedAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'

/**
 * Orientation of a part's panel space in cabinet space. Panel +x (length),
 * +y (width) and +z (face A normal) point along these cabinet directions.
 * Panel (0, 0, 0) is the corner of `bounds` from which all three run, and the
 * frame is right-handed (x × y = z), so face A seen from outside is not mirrored.
 */
export interface PanelFrame {
  x: SignedAxis
  y: SignedAxis
  z: SignedAxis
}

// ─── Plan-book PDF settings ─────────────────────────────────────────────────

export type PdfPageSize = 'letter' | 'a4'
/** Plan-book sections that can be switched off. */
export type PdfSectionKey = 'cover' | 'elevations' | 'panels' | 'sheets' | 'cutList' | 'bom' | 'estimate'
export type PdfDateMode = 'today' | 'fixed'
export type WatermarkKind = 'image' | 'text'
export type WatermarkPlacement = 'centre' | 'tiled' | 'corner'
/** Behind the drawings (drawn first) or over them (drawn last). */
export type WatermarkLayer = 'behind' | 'over'

/**
 * A PNG or JPEG as a `data:image/png;base64,…` / `data:image/jpeg;base64,…`
 * URL. Untrusted: validated by magic bytes and size before use.
 */
export type ImageDataUrl = string

export interface PdfWatermark {
  enabled: boolean
  kind: WatermarkKind
  /** Text for a text watermark, e.g. "DRAFT". */
  text: string
  /** 0.05–0.5. */
  opacity: number
  /** Watermark width as a percentage of the page width. */
  sizePercent: number
  /** Counter-clockwise, degrees. */
  rotationDeg: number
  placement: WatermarkPlacement
  layer: WatermarkLayer
}

export interface PdfSettings {
  /** Shown as the project title; blank uses the project name. */
  title: string
  client: string
  company: string
  designer: string
  /** Address or contact line. */
  contact: string
  /** e.g. "Rev B". */
  revision: string
  dateMode: PdfDateMode
  /** `YYYY-MM-DD` used when `dateMode` is `fixed`; may be blank otherwise. */
  fixedDate: string
  pageSize: PdfPageSize
  sections: Record<PdfSectionKey, boolean>
  /** Notes printed on the cover. */
  notes: string
  logo: ImageDataUrl | null
  /** Image watermark; `null` uses the logo. */
  watermarkImage: ImageDataUrl | null
  watermark: PdfWatermark
}
