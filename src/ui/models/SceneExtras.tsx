'use client'

/**
 * Room shell and imported models inside the 3D canvas (rendered by Viewer3D).
 * Positions are room space (mm) shifted by the scene's `centreX` and scaled
 * to metres, the same mapping the cabinets use.
 */
import { Edges, TransformControls } from '@react-three/drei'
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { Euler, type Group } from 'three'
import type { Room, SceneModel } from '@/core/types'
import { MODEL_SCALE } from '../lib/limits'
import { getDesignerStore } from '../store'
import { notify } from '../toast'
import { type ModelPatch, updateModel } from './modelOps'
import { type GizmoMode, useModelUi } from './modelUi'
import { loadModel, MissingModelFileError } from './modelCache'
import type { ParsedModel } from './loaders'
import { roomBounds, wallFrame, wallPieces } from './room'
import { metresPerModelUnit } from './units'

const MM_PER_M = 1000
const WALL_COLOR = '#ebe6de'
const ROOM_FLOOR_COLOR = '#d9c7a6'
const SELECTED_COLOR = '#f0a640'
const MISSING_COLOR = '#d9822b'
const ERROR_COLOR = '#c0392b'
/** Gizmo snapping: 10 mm, 15°, 5 % scale steps. */
const TRANSLATION_SNAP_M = 0.01
const ROTATION_SNAP_RAD = Math.PI / 12
const SCALE_SNAP = 0.05
/** A click within this long after a gizmo drag belongs to the gizmo, not "click empty space". */
const GIZMO_CLICK_GRACE_MS = 300
/** Smallest rendered wall thickness (m), so a zero-thickness wall still shows. */
const MIN_WALL_M = 0.001

let lastGizmoUse = 0
const warnedMissing = new Set<string>()

export interface SceneExtrasProps {
  /** Room to draw, or null when hidden / absent. */
  room: Room | null
  /** Models to draw (already filtered by visibility). */
  models: readonly SceneModel[]
  /** Room-space X (mm) at scene x = 0 (see SceneSpec.centreX). */
  centreX: number
}

// ─── Room shell ─────────────────────────────────────────────────────────────

/**
 * Walls, cut around openings, plus the room floor. A wall hides while the
 * camera is outside it (dollhouse view), so the room never blocks the model.
 */
function RoomShell({ room, centreX }: { room: Room; centreX: number }) {
  const walls = useMemo(
    () =>
      room.walls.map((wall) => {
        const frame = wallFrame(wall)
        const t = Math.max(wall.thickness / MM_PER_M, MIN_WALL_M)
        // Each wall runs past its end by its thickness to fill the outside corner once.
        const pieces = wallPieces(wall, room.openings).map((p) => ({ ...p, u1: p.u1 === frame.length ? p.u1 + wall.thickness : p.u1 }))
        return {
          id: wall.id,
          origin: [(wall.start.x - centreX) / MM_PER_M, 0, wall.start.y / MM_PER_M] as const,
          angle: Math.atan2(-frame.dir.z, frame.dir.x),
          mid: { x: (wall.start.x + wall.end.x) / 2 - centreX, z: (wall.start.y + wall.end.y) / 2 },
          outward: frame.outward,
          t,
          pieces,
        }
      }),
    [room, centreX],
  )
  const bounds = roomBounds(room)
  const groups = useRef<(Group | null)[]>([])
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    walls.forEach((w, i) => {
      const g = groups.current[i]
      if (!g) return
      const toCamX = camera.position.x - w.mid.x / MM_PER_M
      const toCamZ = camera.position.z - w.mid.z / MM_PER_M
      g.visible = toCamX * w.outward.x + toCamZ * w.outward.z <= 0
    })
  })
  const floorW = (bounds.maxX - bounds.minX) / MM_PER_M
  const floorD = (bounds.maxZ - bounds.minZ) / MM_PER_M
  return (
    <group>
      {floorW > 0 && floorD > 0 && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[((bounds.minX + bounds.maxX) / 2 - centreX) / MM_PER_M, 0.0005, (bounds.minZ + bounds.maxZ) / 2 / MM_PER_M]}
          receiveShadow
        >
          <planeGeometry args={[floorW, floorD]} />
          <meshStandardMaterial color={ROOM_FLOOR_COLOR} roughness={0.85} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      )}
      {walls.map((w, i) => (
        <group
          key={w.id}
          ref={(g) => {
            groups.current[i] = g
          }}
          position={w.origin}
          rotation={[0, w.angle, 0]}
        >
          {/* Local +X runs along the wall, local -Z points out of the room. */}
          {w.pieces.map((p) => (
            <mesh
              key={`${p.u0}:${p.v0}`}
              position={[(p.u0 + p.u1) / 2 / MM_PER_M, (p.v0 + p.v1) / 2 / MM_PER_M, -w.t / 2]}
              receiveShadow
            >
              <boxGeometry args={[(p.u1 - p.u0) / MM_PER_M, (p.v1 - p.v0) / MM_PER_M, w.t]} />
              <meshStandardMaterial color={WALL_COLOR} roughness={0.95} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// ─── Models ─────────────────────────────────────────────────────────────────

type LoadState = { status: 'loading' } | { status: 'ready'; parsed: ParsedModel } | { status: 'missing' } | { status: 'error' }

function useParsedModel(model: SceneModel): LoadState {
  const epoch = useModelUi((s) => s.blobEpoch)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const { blobId, format, name } = model
  useEffect(() => {
    let isCurrent = true
    loadModel(blobId, format).then(
      (parsed) => {
        if (isCurrent) setState({ status: 'ready', parsed })
      },
      (error: unknown) => {
        if (!isCurrent) return
        const isMissing = error instanceof MissingModelFileError
        setState({ status: isMissing ? 'missing' : 'error' })
        if (!warnedMissing.has(blobId)) {
          warnedMissing.add(blobId)
          notify('error', isMissing ? `“${name}”: model file not found in this browser; showing a placeholder. Import the project .zip to restore it.` : `“${name}” could not be displayed; showing a placeholder.`)
        }
      },
    )
    return () => {
      isCurrent = false
    }
  }, [blobId, format, name, epoch])
  return state
}

const toRad = (deg: number): number => (deg * Math.PI) / 180
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

/** Signed degrees in (-180, 180], one decimal. */
function normalizeDeg(rad: number): number {
  let deg = (rad * 180) / Math.PI
  deg = ((((deg + 180) % 360) + 360) % 360) - 180
  if (deg === -180) deg = 180
  return Math.round(deg * 10) / 10 || 0
}

function readTransform(g: Group, model: SceneModel, centreX: number): ModelPatch {
  // YXZ order: a pure yaw reads back whole, even past ±90°.
  const yaw = new Euler().setFromQuaternion(g.quaternion, 'YXZ').y
  return {
    position: { x: Math.round(g.position.x * MM_PER_M + centreX), y: model.position.y, z: Math.round(g.position.z * MM_PER_M) },
    rotationYDeg: normalizeDeg(yaw),
    scale: Math.round(clamp(g.scale.x, MODEL_SCALE.min, MODEL_SCALE.max) * 1000) / 1000,
  }
}

function ModelGizmo({ target, model, centreX, mode }: { target: RefObject<Group | null>; model: SceneModel; centreX: number; mode: GizmoMode }) {
  const uniform = useRef(model.scale)
  const handleDown = (): void => {
    lastGizmoUse = performance.now()
    uniform.current = target.current?.scale.x ?? model.scale
  }
  const handleChange = (): void => {
    const g = target.current
    if (mode !== 'scale' || !g) return
    // Keep scale uniform: take whichever axis the user dragged.
    const prev = uniform.current
    const next = [g.scale.x, g.scale.y, g.scale.z].find((v) => Math.abs(v - prev) > 1e-9) ?? prev
    uniform.current = next
    g.scale.setScalar(next)
  }
  const handleUp = (): void => {
    lastGizmoUse = performance.now()
    const g = target.current
    if (!g) return
    const patch = readTransform(g, model, centreX)
    getDesignerStore()
      .getState()
      .editProject((p) => updateModel(p, model.id, patch))
  }
  return (
    <TransformControls
      object={target as RefObject<Group>}
      mode={mode}
      size={0.8}
      translationSnap={TRANSLATION_SNAP_M}
      rotationSnap={ROTATION_SNAP_RAD}
      scaleSnap={SCALE_SNAP}
      showX={mode !== 'rotate'}
      showY={mode !== 'translate'}
      showZ={mode !== 'rotate'}
      onMouseDown={handleDown}
      onObjectChange={handleChange}
      onMouseUp={handleUp}
    />
  )
}

/** Box standing in for a model whose file is missing or unreadable, sized from the saved bounding box. */
function Placeholder({ model, color }: { model: SceneModel; color: string }) {
  const s = model.nativeSize
  const size: [number, number, number] = [Math.max(s.x, 1e-3), Math.max(s.y, 1e-3), Math.max(s.z, 1e-3)]
  return (
    <mesh position={[0, size[1] / 2, 0]}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={0.35} depthWrite={false} />
      <Edges color={color} />
    </mesh>
  )
}

function SelectionBox({ model }: { model: SceneModel }) {
  const s = model.nativeSize
  return (
    <mesh position={[0, s.y / 2, 0]} raycast={() => null}>
      <boxGeometry args={[Math.max(s.x, 1e-3), Math.max(s.y, 1e-3), Math.max(s.z, 1e-3)]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <Edges color={SELECTED_COLOR} />
    </mesh>
  )
}

function ModelView({ model, centreX, isSelected, mode }: { model: SceneModel; centreX: number; isSelected: boolean; mode: GizmoMode }) {
  const state = useParsedModel(model)
  const outer = useRef<Group>(null)
  const parsed = state.status === 'ready' ? state.parsed : null
  // One clone per placed model; geometry and materials stay shared with the cache.
  const object = useMemo(() => parsed?.object.clone(true) ?? null, [parsed])
  const select = useModelUi((s) => s.selectModel)

  const handleClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation()
    select(model.id)
  }
  const handleMissed = (): void => {
    if (performance.now() - lastGizmoUse < GIZMO_CLICK_GRACE_MS) return
    if (useModelUi.getState().selectedModelId === model.id) select(null)
  }

  return (
    <>
      <group
        ref={outer}
        name={`model:${model.id}`}
        position={[(model.position.x - centreX) / MM_PER_M, model.position.y / MM_PER_M, model.position.z / MM_PER_M]}
        rotation={[0, toRad(model.rotationYDeg), 0]}
        scale={model.scale}
        onClick={handleClick}
        onPointerMissed={handleMissed}
      >
        <group scale={metresPerModelUnit(model.unit)}>
          {object && parsed ? (
            <primitive object={object} position={[-parsed.centre.x, -parsed.minY, -parsed.centre.z]} />
          ) : state.status === 'loading' ? null : (
            <Placeholder model={model} color={state.status === 'missing' ? MISSING_COLOR : ERROR_COLOR} />
          )}
          {isSelected && <SelectionBox model={model} />}
        </group>
      </group>
      {isSelected && <ModelGizmo target={outer} model={model} centreX={centreX} mode={mode} />}
    </>
  )
}

/** Everything the room & models feature adds to the 3D view. */
export function SceneExtras({ room, models, centreX }: SceneExtrasProps) {
  const selectedModelId = useModelUi((s) => s.selectedModelId)
  const mode = useModelUi((s) => s.gizmoMode)
  return (
    <>
      {room && <RoomShell room={room} centreX={centreX} />}
      {models.map((m) => (
        <ModelView key={`${m.id}:${m.blobId}`} model={m} centreX={centreX} isSelected={m.id === selectedModelId} mode={mode} />
      ))}
    </>
  )
}
