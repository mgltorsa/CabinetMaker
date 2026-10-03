'use client'

import { Edges, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import type { MeshSpec, SceneSpec } from '../lib/scene'

const EDGE_COLOR = '#3a3128'
const HOVER_COLOR = '#f0a640'
/** Camera distance as a multiple of the scene's largest extent. */
const CAMERA_DISTANCE = 2.2

type PartMeshProps = {
  mesh: MeshSpec
  isHovered: boolean
  onHover: (partId: string | null) => void
  onPick: (cabinetId: string) => void
}

function PartMesh({ mesh, isHovered, onHover, onPick }: PartMeshProps) {
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
    <mesh position={mesh.position} onPointerOver={handleOver} onPointerOut={handleOut} onClick={handleClick}>
      <boxGeometry args={mesh.size} />
      <meshStandardMaterial color={isHovered ? HOVER_COLOR : mesh.color} roughness={0.85} metalness={0} />
      <Edges color={EDGE_COLOR} />
    </mesh>
  )
}

export type Viewer3DProps = {
  scene: SceneSpec
  hoveredPartId: string | null
  onHover: (partId: string | null) => void
  onPick: (cabinetId: string) => void
}

/** WebGL view; loaded client-side only (see ThreeView). */
export default function Viewer3D({ scene, hoveredPartId, onHover, onPick }: Viewer3DProps) {
  const d = scene.extent * CAMERA_DISTANCE
  return (
    <Canvas
      camera={{ position: [d * 0.55, scene.centerY + d * 0.45, d], fov: 40, near: 0.01, far: 100 }}
      dpr={[1, 2]}
      onPointerMissed={() => onHover(null)}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={1.1} />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} />
      {scene.meshes.map((m) => (
        <PartMesh key={m.partId} mesh={m} isHovered={m.partId === hoveredPartId} onHover={onHover} onPick={onPick} />
      ))}
      <gridHelper args={[Math.max(2, Math.ceil(scene.extent * 2)), Math.max(8, Math.ceil(scene.extent * 8)), '#bdb6aa', '#ddd7cc']} />
      <OrbitControls makeDefault target={[0, scene.centerY, 0]} />
    </Canvas>
  )
}
