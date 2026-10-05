'use client'

import { Edges, Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber'
import { PencilIcon } from 'lucide-react'
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { CanvasTexture, type InstancedMesh, Object3D, Quaternion, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three'
import { isDrawingDimId } from '@/drawings'
import { EditableDimension } from '../components/EditableDimension'
import type { DimensionEdit, DimensionEdits } from '../lib/dimensionEdits'
import type { DimensionSpec, Finish, MeshSpec, PinHoleSpec, PullSpec, RodSpec, SceneSpec } from '../lib/scene'
import { SceneExtras, type SceneExtrasProps } from '../models/SceneExtras'

/** Camera distance as a multiple of the scene's largest extent. */
const CAMERA_DISTANCE = 3.1
const DIMENSION_COLOR = '#2f4a6b'
const HOVER_EMISSIVE = '#f0a640'

/** Daylight vs evening: evening dims the sky and sun so placed lights read. */
const LIGHTING = {
  day: { background: '#e7e2da', hemisphere: 0.75, sun: 1.05, fill: 0.35 },
  evening: { background: '#24262d', hemisphere: 0.1, sun: 0.06, fill: 0.03 },
} as const

const FINISHES: Record<Finish, { color: string; roughness: number }> = {
  carcass: { color: '#f3f0ea', roughness: 0.55 },
  front: { color: '#efebe4', roughness: 0.45 },
  back: { color: '#5a5651', roughness: 0.85 },
  'drawer-box': { color: '#e3cea2', roughness: 0.7 },
  'toe-kick': { color: '#ddd7cd', roughness: 0.7 },
  top: { color: '#ece8e1', roughness: 0.35 },
  'face-frame': { color: '#dcc59f', roughness: 0.6 },
  rod: { color: '#e4e8ec', roughness: 0.2 },
}

/** Deterministic plank texture for the floor (no network assets in a static export). */
function useFloorTexture(repeat: number): CanvasTexture | null {
  return useMemo(() => {
    if (typeof document === 'undefined') return null
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    let seed = 7
    const rand = (): number => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const plank = size / 8
    for (let row = 0; row < 8; row++) {
      const shade = 196 + Math.floor(rand() * 18)
      ctx.fillStyle = `rgb(${shade + 8}, ${shade - 18}, ${shade - 62})`
      ctx.fillRect(0, row * plank, size, plank)
      for (let g = 0; g < 14; g++) {
        ctx.strokeStyle = `rgba(120, 85, 45, ${0.05 + rand() * 0.07})`
        ctx.lineWidth = 1
        const y = row * plank + rand() * plank
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.bezierCurveTo(size * 0.3, y + rand() * 4 - 2, size * 0.7, y + rand() * 4 - 2, size, y)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(90, 62, 30, 0.35)'
      ctx.fillRect(0, row * plank, size, 1.5)
      const joint = rand() * size
      ctx.fillRect(joint, row * plank, 1.5, plank)
    }
    const texture = new CanvasTexture(canvas)
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.repeat.set(repeat, repeat)
    texture.colorSpace = SRGBColorSpace
    return texture
  }, [repeat])
}

type PartMeshProps = {
  mesh: MeshSpec
  isHovered: boolean
  onHover: (partId: string | null) => void
  onPick: (cabinetId: string) => void
}

function PartMesh({ mesh, isHovered, onHover, onPick }: PartMeshProps) {
  const finish = FINISHES[mesh.finish]
  const handleOver = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation()
    onHover(mesh.partId)
  }
  const handleOut = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation()
    onHover(null)
  }
  const handleClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation()
    onPick(mesh.cabinetId)
  }
  return (
    <mesh
      position={mesh.position}
      rotation={[0, mesh.rotationY, 0]}
      castShadow
      receiveShadow
      onPointerOver={handleOver}
      onPointerOut={handleOut}
      onClick={handleClick}
    >
      <boxGeometry args={mesh.size} />
      <meshStandardMaterial color={mesh.color ?? finish.color} roughness={finish.roughness} metalness={0} emissive={HOVER_EMISSIVE} emissiveIntensity={isHovered ? 0.28 : 0} />
      <Edges color="#000000" opacity={0.16} transparent threshold={20} />
    </mesh>
  )
}

const UP = new Vector3(0, 1, 0)

/** Chrome-ish rod: only lightly metallic — the scene has no environment map, so high metalness renders black. */
const ROD_METALNESS = 0.3
/** End flanges: discs this many rod radii across, filling the gap between rod end and panel. */
const ROD_SUPPORT_RADIUS_FACTOR = 2.2
const ROD_SUPPORT_THICKNESS = 0.003

/** three.js cylinders run along +Y; turn them onto the rod's axis. */
function rodRotation(axis: RodSpec['axis']): [number, number, number] {
  if (axis === 'x') return [0, 0, Math.PI / 2]
  if (axis === 'z') return [Math.PI / 2, 0, 0]
  return [0, 0, 0]
}

/** Hanging rod: a cylinder along its length axis with a support disc at each end. */
function RodMesh({ mesh, rod, isHovered, onHover, onPick }: PartMeshProps & { rod: RodSpec }) {
  const finish = FINISHES[mesh.finish]
  const half = rod.length / 2 + ROD_SUPPORT_THICKNESS / 2
  const supportRadius = rod.radius * ROD_SUPPORT_RADIUS_FACTOR
  const handleOver = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation()
    onHover(mesh.partId)
  }
  const handleOut = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation()
    onHover(null)
  }
  const handleClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation()
    onPick(mesh.cabinetId)
  }
  return (
    <group position={mesh.position} rotation={[0, mesh.rotationY, 0]}>
      <group rotation={rodRotation(rod.axis)}>
        <mesh castShadow onPointerOver={handleOver} onPointerOut={handleOut} onClick={handleClick}>
          <cylinderGeometry args={[rod.radius, rod.radius, rod.length, 24]} />
          <meshStandardMaterial color={finish.color} roughness={finish.roughness} metalness={ROD_METALNESS} emissive={HOVER_EMISSIVE} emissiveIntensity={isHovered ? 0.28 : 0} />
        </mesh>
        {[-half, half].map((y) => (
          <mesh key={y} position={[0, y, 0]} castShadow>
            <cylinderGeometry args={[supportRadius, supportRadius, ROD_SUPPORT_THICKNESS, 24]} />
            <meshStandardMaterial color={finish.color} roughness={finish.roughness} metalness={ROD_METALNESS} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** Bar pull: a rod between the two holes, held off the face by two posts. */
function Pull({ pull }: { pull: PullSpec }) {
  const { rod, posts } = useMemo(() => {
    const a = new Vector3(...pull.a)
    const b = new Vector3(...pull.b)
    const n = new Vector3(...pull.normal).normalize()
    const offA = a.clone().addScaledVector(n, pull.standoff)
    const offB = b.clone().addScaledVector(n, pull.standoff)
    const along = offB.clone().sub(offA)
    const length = along.length()
    const quat = new Quaternion().setFromUnitVectors(UP, along.clone().normalize())
    const postQuat = new Quaternion().setFromUnitVectors(UP, n)
    const mid = (p: Vector3, q: Vector3): Vector3 => p.clone().add(q).multiplyScalar(0.5)
    return {
      rod: { position: mid(offA, offB), quaternion: quat, length: length + 0.03 },
      posts: [
        { position: mid(a, offA), quaternion: postQuat },
        { position: mid(b, offB), quaternion: postQuat },
      ],
    }
  }, [pull])
  return (
    <group>
      <mesh position={rod.position} quaternion={rod.quaternion} castShadow>
        <cylinderGeometry args={[0.006, 0.006, rod.length, 16]} />
        <meshStandardMaterial color="#c9ccd0" metalness={0.35} roughness={0.3} />
      </mesh>
      {posts.map((p, i) => (
        <mesh key={i} position={p.position} quaternion={p.quaternion} castShadow>
          <cylinderGeometry args={[0.005, 0.005, pull.standoff, 12]} />
          <meshStandardMaterial color="#b9bdc2" metalness={0.35} roughness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

/** Shelf-pin holes as dark discs, one instanced draw call. */
function PinHoles({ holes }: { holes: readonly PinHoleSpec[] }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const o = new Object3D()
    holes.forEach((h, i) => {
      const n = new Vector3(...h.normal).normalize()
      o.position.set(h.position[0] + n.x * 0.0002, h.position[1] + n.y * 0.0002, h.position[2] + n.z * 0.0002)
      o.quaternion.setFromUnitVectors(UP, n)
      o.scale.set(h.radius / 0.0025, 1, h.radius / 0.0025)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [holes])
  if (holes.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, holes.length]}>
      <cylinderGeometry args={[0.0025, 0.0025, 0.0004, 12]} />
      <meshBasicMaterial color="#3b3833" />
    </instancedMesh>
  )
}

const DIMENSION_LABEL_CLASS =
  'rounded-sm border border-[#2f4a6b]/40 bg-white/95 px-1.5 py-0.5 font-mono text-xs whitespace-nowrap text-[#2f4a6b] shadow-sm'

/** The label of a dimension line: plain text, or an in-place editor when `edit` is given. */
function DimensionLabel({ label, edit }: { label: string; edit: DimensionEdit | undefined }) {
  if (!edit) return <span className={`pointer-events-none ${DIMENSION_LABEL_CLASS}`}>{label}</span>
  return (
    <EditableDimension
      edit={edit}
      className={`pointer-events-auto inline-flex min-h-6 items-center gap-1 transition-colors hover:border-[#2f4a6b] hover:bg-white ${DIMENSION_LABEL_CLASS}`}
      editorClassName="pointer-events-auto"
    >
      {label}
      <PencilIcon aria-hidden="true" className="size-3 opacity-50" />
    </EditableDimension>
  )
}

function Dimension({ dim, portal, edit }: { dim: DimensionSpec; portal: RefObject<HTMLDivElement | null>; edit?: DimensionEdit }) {
  const mid: [number, number, number] = [(dim.from[0] + dim.to[0]) / 2, (dim.from[1] + dim.to[1]) / 2, (dim.from[2] + dim.to[2]) / 2]
  return (
    <group>
      <Line points={[dim.from, dim.to]} color={DIMENSION_COLOR} lineWidth={1.4} />
      {dim.extensions.map(([a, b], i) => (
        <Line key={i} points={[a, b]} color={DIMENSION_COLOR} lineWidth={0.8} transparent opacity={0.7} />
      ))}
      <Html position={mid} center zIndexRange={[20, 0]} portal={portal as RefObject<HTMLElement>}>
        <DimensionLabel label={dim.label} edit={edit} />
      </Html>
    </group>
  )
}

function editFor(edits: DimensionEdits | undefined, id: string): DimensionEdit | undefined {
  return isDrawingDimId(id) ? edits?.[id] : undefined
}

type OrbitLike = { target: Vector3; update: () => void }

function cameraOffset(size: number): [number, number, number] {
  const d = Math.max(size, 0.6) * CAMERA_DISTANCE
  return [d * 0.55, d * 0.38, d * 0.92]
}

/**
 * Frames the selected cabinet whenever the selection changes (not on every
 * edit, so the user's orbit survives typing a new width).
 */
function CameraRig({ focus, focusKey }: { focus: SceneSpec['focus']; focusKey: string }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null
  const latest = useRef(focus)
  // Keep the latest focus without re-running the framing effect on every edit.
  useLayoutEffect(() => {
    latest.current = focus
  }, [focus])
  useEffect(() => {
    if (!controls) return
    const [tx, ty, tz] = latest.current.target
    const [ox, oy, oz] = cameraOffset(latest.current.size)
    camera.position.set(tx + ox, ty + oy, tz + oz)
    controls.target.set(tx, ty, tz)
    controls.update()
  }, [focusKey, controls, camera])
  return null
}

export type Viewer3DProps = {
  scene: SceneSpec
  /** Changes when the camera should re-frame (e.g. the selected cabinet id). */
  focusKey: string
  hoveredPartId: string | null
  onHover: (partId: string | null) => void
  onPick: (cabinetId: string) => void
  /** Dimension labels (by `DimensionSpec.id`) that can be edited in place. */
  dimensionEdits?: DimensionEdits
  /** Room shell, imported models and placed assets (sidebar 05). */
  extras?: SceneExtrasProps
  /** Evening lighting (dim daylight). */
  isEvening?: boolean
}

/** WebGL view; loaded client-side only (see ThreeView). */
export default function Viewer3D({ scene, focusKey, hoveredPartId, onHover, onPick, dimensionEdits, extras, isEvening = false }: Viewer3DProps) {
  const lighting = isEvening ? LIGHTING.evening : LIGHTING.day
  const floorSize = Math.max(8, Math.ceil(scene.extent * 6))
  const floorTexture = useFloorTexture(floorSize / 1.6)
  const [tx, ty, tz] = scene.focus.target
  const [ox, oy, oz] = cameraOffset(scene.focus.size)
  const shadowSpan = Math.max(2, scene.extent * 1.5)
  // Labels portal into a layer we own: drei's default target is the canvas
  // wrapper, which React also manages (unmounts then fail with removeChild).
  const overlay = useRef<HTMLDivElement>(null)

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        flat
        camera={{ position: [tx + ox, ty + oy, tz + oz], fov: 36, near: 0.01, far: 200 }}
        dpr={[1, 2]}
        onPointerMissed={() => onHover(null)}
      >
        <color attach="background" args={[lighting.background]} />
        <hemisphereLight args={['#fffaf2', '#b89a6e', lighting.hemisphere]} />
        <directionalLight
          position={[tx + 2.2, 4.5, tz + 3.2]}
          intensity={lighting.sun}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-camera-left={-shadowSpan}
          shadow-camera-right={shadowSpan}
          shadow-camera-top={shadowSpan}
          shadow-camera-bottom={-shadowSpan}
        />
        <directionalLight position={[-3, 2.5, 2]} intensity={lighting.fill} />

        {/* Floor and back wall: the cabinets' backs sit on the wall plane (z = 0). */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, floorSize / 2 - 0.5]} receiveShadow>
          <planeGeometry args={[floorSize, floorSize]} />
          <meshStandardMaterial map={floorTexture} color={floorTexture ? '#ffffff' : '#c9ab7c'} roughness={0.8} />
        </mesh>
        {/* A built room replaces the default back wall. */}
        {!extras?.room && (
          <mesh position={[0, 1.6, -0.002]} receiveShadow>
            <planeGeometry args={[floorSize, 3.2]} />
            <meshStandardMaterial color="#ebe6de" roughness={0.95} />
          </mesh>
        )}
        {extras && <SceneExtras {...extras} />}

        {scene.meshes.map((m) =>
          m.rod ? (
            <RodMesh key={m.partId} mesh={m} rod={m.rod} isHovered={m.partId === hoveredPartId} onHover={onHover} onPick={onPick} />
          ) : (
            <PartMesh key={m.partId} mesh={m} isHovered={m.partId === hoveredPartId} onHover={onHover} onPick={onPick} />
          ),
        )}
        {scene.pulls.map((p) => (
          <Pull key={p.id} pull={p} />
        ))}
        <PinHoles holes={scene.pinHoles} />
        {scene.dimensions.map((dim) => (
          <Dimension key={dim.id} dim={dim} portal={overlay} edit={editFor(dimensionEdits, dim.id)} />
        ))}
        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.02} minDistance={0.3} maxDistance={40} enableDamping />
        <CameraRig focus={scene.focus} focusKey={focusKey} />
      </Canvas>
      <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  )
}
