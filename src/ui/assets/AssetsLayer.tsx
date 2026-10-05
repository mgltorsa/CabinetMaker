'use client'

/**
 * Placed catalog assets inside the 3D canvas (rendered by SceneExtras): one
 * group per asset in room space (shifted by the scene's `centreX`, mm → m),
 * meshes built from the catalog's primitives with shared materials, and real
 * three.js lights for switched-on light assets (see `lightPlan`).
 */
import { Edges } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { Object3D, SpotLight } from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { EMITTER_OFF_COLOR, getAssetDef, type LightSource, type Primitive, resolveLook } from '@/assets'
import type { PlacedAsset } from '@/core/types'
import { useAssetUi } from './assetUi'
import { lightPlan, type PlannedLight } from './lightPlan'
import { assetMaterial } from './materialCache'

const M_PER_MM = 0.001
const SELECTED_COLOR = '#f0a640'
/** Colour of an asset whose catalog entry this version does not know. */
const UNKNOWN_COLOR = '#c8c4bc'
const CYLINDER_SEGMENTS = 28
const SHADOW_MAP_SIZE = 512
const SPOT_PENUMBRA = 0.45

// Rect area lights (LED strips) need their lookup tables once per page.
RectAreaLightUniformsLib.init()

const toM = (v: readonly [number, number, number]): [number, number, number] => [v[0] * M_PER_MM, v[1] * M_PER_MM, v[2] * M_PER_MM]

function PrimitiveGeometry({ p }: { p: Primitive }) {
  switch (p.kind) {
    case 'box':
      return <boxGeometry args={toM(p.size)} />
    case 'cylinder':
      return <cylinderGeometry args={[p.radiusTop * M_PER_MM, p.radiusBottom * M_PER_MM, p.height * M_PER_MM, CYLINDER_SEGMENTS, 1, p.openEnded ?? false]} />
    case 'sphere':
      return <sphereGeometry args={[p.radius * M_PER_MM, 24, 16]} />
    case 'torus':
      return <torusGeometry args={[p.radius * M_PER_MM, p.tube * M_PER_MM, 12, 36]} />
  }
}

function SpotDown({ source, castShadow }: { source: LightSource; castShadow: boolean }) {
  const light = useRef<SpotLight>(null)
  const target = useRef<Object3D>(null)
  useLayoutEffect(() => {
    if (light.current && target.current) light.current.target = target.current
  }, [])
  const [x, y, z] = toM(source.position)
  return (
    <>
      <spotLight
        ref={light}
        position={[x, y, z]}
        intensity={source.intensity}
        color={source.color}
        distance={source.distance * M_PER_MM}
        angle={source.angle ?? Math.PI / 4}
        penumbra={SPOT_PENUMBRA}
        decay={2}
        castShadow={castShadow}
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-bias={-0.0005}
      />
      <object3D ref={target} position={[x, y - 1, z]} />
    </>
  )
}

function AssetLight({ plan }: { plan: PlannedLight }) {
  const { source, castShadow } = plan
  if (source.kind === 'spot') return <SpotDown source={source} castShadow={castShadow} />
  if (source.kind === 'rect') {
    return (
      <rectAreaLight
        position={toM(source.position)}
        rotation={[-Math.PI / 2, 0, 0]}
        width={(source.width ?? 0) * M_PER_MM}
        height={(source.depth ?? 0) * M_PER_MM}
        intensity={source.intensity}
        color={source.color}
      />
    )
  }
  return (
    <pointLight
      position={toM(source.position)}
      intensity={source.intensity}
      color={source.color}
      distance={source.distance * M_PER_MM}
      decay={2}
      castShadow={castShadow}
      shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
      shadow-bias={-0.002}
      shadow-camera-near={0.05}
    />
  )
}

function SelectionBox({ asset }: { asset: PlacedAsset }) {
  const [w, h, d] = toM([asset.size.x, asset.size.y, asset.size.z])
  return (
    <mesh position={[0, h / 2, 0]} raycast={() => null}>
      <boxGeometry args={[w, h, d]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <Edges color={SELECTED_COLOR} />
    </mesh>
  )
}

function AssetView({ asset, centreX, isSelected, plan }: { asset: PlacedAsset; centreX: number; isSelected: boolean; plan: PlannedLight | undefined }) {
  const select = useAssetUi((s) => s.selectAsset)
  const def = getAssetDef(asset.assetId)
  const { size } = asset
  const prims = useMemo((): Primitive[] => {
    if (def) return def.build(size)
    return [{ kind: 'box', role: 'body', position: [0, size.y / 2, 0], size: [size.x, size.y, size.z] }]
  }, [def, size])
  const bodyColor = asset.color ?? def?.defaultColor ?? UNKNOWN_COLOR
  const casts = def?.castsShadow ?? true
  const glow = plan ? plan.source.color : null

  const handleClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation()
    select(asset.id)
  }
  const handleMissed = (): void => {
    if (useAssetUi.getState().selectedAssetId === asset.id) select(null)
  }

  return (
    <group
      name={`asset:${asset.id}`}
      position={[(asset.position.x - centreX) * M_PER_MM, asset.position.y * M_PER_MM, asset.position.z * M_PER_MM]}
      rotation={[0, (asset.rotationYDeg * Math.PI) / 180, 0]}
      onClick={handleClick}
      onPointerMissed={handleMissed}
    >
      {prims.map((p, i) => {
        const isEmitter = p.role === 'emitter'
        const look = isEmitter && glow ? { ...resolveLook(p, bodyColor), color: glow } : isEmitter ? { ...resolveLook(p, bodyColor), color: EMITTER_OFF_COLOR } : resolveLook(p, bodyColor)
        const isOpen = p.kind === 'cylinder' && p.openEnded === true
        const material = assetMaterial(look, { emissive: isEmitter ? glow : null, doubleSided: isOpen })
        const isSolid = !isEmitter && p.role !== 'glass'
        return (
          <mesh key={i} position={toM(p.position)} rotation={p.rotation ? [...p.rotation] : undefined} material={material} castShadow={casts && isSolid} receiveShadow={isSolid}>
            <PrimitiveGeometry p={p} />
          </mesh>
        )
      })}
      {plan && <AssetLight plan={plan} />}
      {isSelected && <SelectionBox asset={asset} />}
    </group>
  )
}

export interface AssetsLayerProps {
  /** Assets to draw (already filtered by visibility). */
  assets: readonly PlacedAsset[]
  /** Room-space X (mm) at scene x = 0. */
  centreX: number
}

export function AssetsLayer({ assets, centreX }: AssetsLayerProps) {
  const selectedAssetId = useAssetUi((s) => s.selectedAssetId)
  const plan = useMemo(() => lightPlan(assets), [assets])
  return (
    <>
      {assets.map((a) => (
        <AssetView key={a.id} asset={a} centreX={centreX} isSelected={a.id === selectedAssetId} plan={plan.get(a.id)} />
      ))}
    </>
  )
}
