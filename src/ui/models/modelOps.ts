/**
 * Pure, immutable Project edits for the room, imported models and free
 * cabinet placement (sidebar 05). Same rules as `projectOps`: return a new
 * Project, or the same reference when nothing changed.
 */
import type { Cabinet, Id, Mm, Project, Room, SceneModel, Vec3, WallOpening } from '@/core/types'
import { MAX_MODELS } from '../lib/limits'
import { runOffsets } from '../lib/scene'
import { mapCabinet, uniqueId } from '../projectOps'
import { BACK_WALL_ID, clampOpening } from './room'
import { modelSizeMm } from './units'

/** Space left between the cabinet run (or the last model) and a newly imported model. */
export const MODEL_GAP_MM = 200

const DEFAULT_OPENINGS: Record<WallOpening['kind'], Omit<WallOpening, 'id' | 'wallId' | 'kind'>> = {
  door: { offset: 200, width: 900, height: 2100, sillHeight: 0 },
  window: { offset: 600, width: 1200, height: 1100, sillHeight: 1000 },
}

export type ModelPatch = Partial<Omit<SceneModel, 'id' | 'blobId' | 'format'>>
export type OpeningPatch = Partial<Omit<WallOpening, 'id'>>
export type CabinetPosition = { x: Mm; z: Mm }

const modelsOf = (project: Project): readonly SceneModel[] => project.models ?? []

export function addModel(project: Project, model: SceneModel): Project {
  const models = modelsOf(project)
  if (models.length >= MAX_MODELS) return project
  const taken = new Set(models.map((m) => m.id))
  const id = taken.has(model.id) ? uniqueId('mdl', taken) : model.id
  return { ...project, models: [...models, { ...model, id }] }
}

export function updateModel(project: Project, modelId: Id, patch: ModelPatch): Project {
  const models = modelsOf(project)
  if (!models.some((m) => m.id === modelId)) return project
  return { ...project, models: models.map((m) => (m.id === modelId ? { ...m, ...patch } : m)) }
}

export function removeModel(project: Project, modelId: Id): Project {
  const models = modelsOf(project)
  const next = models.filter((m) => m.id !== modelId)
  return next.length === models.length ? project : { ...project, models: next }
}

/** Half the width of a model's footprint along X (its rotated bounding box). */
function halfWidthX(model: SceneModel): Mm {
  const size = modelSizeMm(model.nativeSize, model.unit, model.scale)
  const a = (model.rotationYDeg * Math.PI) / 180
  return (Math.abs(Math.cos(a)) * size.x + Math.abs(Math.sin(a)) * size.z) / 2
}

/**
 * Where a new model of `sizeMm` lands: on the floor, its back against the back
 * wall, to the right of the cabinet run and of every model already placed.
 */
export function nextModelPosition(project: Project, sizeMm: Vec3): Vec3 {
  const offsets = runOffsets(project.cabinets)
  const rights = [
    ...project.cabinets.map((c) => (offsets.get(c.id) ?? 0) + c.width),
    ...modelsOf(project).map((m) => m.position.x + halfWidthX(m)),
  ]
  const start = rights.length === 0 ? 0 : Math.max(...rights) + MODEL_GAP_MM
  return { x: start + sizeMm.x / 2, y: 0, z: sizeMm.z / 2 }
}

export interface ImportedFile {
  name: string
  format: SceneModel['format']
  blobId: Id
  nativeSize: Vec3
}

/**
 * The model a freshly imported file becomes in `project`: true size in `unit`
 * (guessed by the caller when the user chose "auto"), on the floor next to
 * the run, visible.
 */
export function newSceneModel(project: Project, file: ImportedFile, unit: SceneModel['unit']): SceneModel {
  const id = uniqueId('mdl', new Set(modelsOf(project).map((m) => m.id)))
  const position = nextModelPosition(project, modelSizeMm(file.nativeSize, unit, 1))
  return { id, ...file, unit, position, rotationYDeg: 0, scale: 1, visible: true }
}

// ─── Room ───────────────────────────────────────────────────────────────────

export function setRoom(project: Project, room: Room | null): Project {
  return project.room === room ? project : { ...project, room }
}

function mapRoom(project: Project, fn: (room: Room) => Room): Project {
  if (!project.room) return project
  const room = fn(project.room)
  return room === project.room ? project : { ...project, room }
}

export function addOpening(project: Project, wallId: Id, kind: WallOpening['kind']): Project {
  return mapRoom(project, (room) => {
    const wall = room.walls.find((w) => w.id === wallId)
    if (!wall) return room
    const id = uniqueId('opening', new Set(room.openings.map((o) => o.id)))
    return { ...room, openings: [...room.openings, clampOpening({ id, wallId, kind, ...DEFAULT_OPENINGS[kind] }, wall)] }
  })
}

export function updateOpening(project: Project, openingId: Id, patch: OpeningPatch): Project {
  return mapRoom(project, (room) => {
    if (!room.openings.some((o) => o.id === openingId)) return room
    const openings = room.openings.map((o) => {
      if (o.id !== openingId) return o
      const next = { ...o, ...patch }
      const wall = room.walls.find((w) => w.id === next.wallId)
      return wall ? clampOpening(next, wall) : next
    })
    return { ...room, openings }
  })
}

export function removeOpening(project: Project, openingId: Id): Project {
  return mapRoom(project, (room) => {
    const openings = room.openings.filter((o) => o.id !== openingId)
    return openings.length === room.openings.length ? room : { ...room, openings }
  })
}

// ─── Free cabinet placement ─────────────────────────────────────────────────

type Placement = NonNullable<Cabinet['placement']>

const UNPLACED: Placement = { wallId: null, offset: 0, rotationDeg: 0 }

function withoutPosition(placement: Placement): Placement {
  return { wallId: placement.wallId, offset: placement.offset, rotationDeg: placement.rotationDeg }
}

/** Pin a cabinet at a room-space position, or return it to the automatic run (`null`). */
export function setCabinetPosition(project: Project, cabinetId: Id, position: CabinetPosition | null): Project {
  return mapCabinet(project, cabinetId, (cab) => {
    const placement = cab.placement ?? UNPLACED
    if (position === null) return cab.placement?.position ? { ...cab, placement: withoutPosition(placement) } : cab
    return { ...cab, placement: { ...placement, offset: position.x, position: { x: position.x, z: position.z } } }
  })
}

/** Give every cabinet the position today's automatic run gives it (backs on the back wall). */
export function placeCabinetsAlongBackWall(project: Project): Project {
  const auto = runOffsets(project.cabinets.map((c) => (c.placement ? { ...c, placement: withoutPosition(c.placement) } : c)))
  const wallId = project.room?.walls.some((w) => w.id === BACK_WALL_ID) ? BACK_WALL_ID : null
  const cabinets = project.cabinets.map((cab): Cabinet => {
    const x = auto.get(cab.id) ?? 0
    return { ...cab, placement: { ...(cab.placement ?? UNPLACED), wallId, offset: x, position: { x, z: 0 } } }
  })
  return { ...project, cabinets }
}

export function clearCabinetPositions(project: Project): Project {
  if (!project.cabinets.some((c) => c.placement?.position)) return project
  const cabinets = project.cabinets.map((cab) => (cab.placement?.position ? { ...cab, placement: withoutPosition(cab.placement) } : cab))
  return { ...project, cabinets }
}
