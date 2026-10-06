'use client'

import { useEffect, useMemo, useState } from 'react'
import { Matrix4, type Object3D, Quaternion, Vector3 } from 'three'
import { MM_PER_MODEL_UNIT } from '@/core/units'
import type { HandleModel } from '@/core/handles'
import type { PullSpec, Vec3Tuple } from '../lib/scene'
import { loadModel } from '../models/modelCache'

/**
 * One pull, drawn in its local frame: x along the pull, y across it (toward
 * the grip edge for edge pulls / J-profiles), z out of the show face (z = 0 on
 * the face). Light metalness only: the scene has no environment map.
 */
const METALNESS = 0.35
const ROUGHNESS = 0.3
const MM_PER_M = 1000
/** Knob: post radius and post share of the projection. */
const KNOB_POST_RADIUS = 0.2
const KNOB_POST_SHARE = 0.55
/** Cup pull: the hood covers this share of the cup height. */
const CUP_HOOD_SHARE = 0.55
/** Sheet thickness floor so thin profiles stay visible (m). */
const MIN_SHEET = 0.0015

type Box = { position: Vec3Tuple; size: Vec3Tuple }

function Metal({ color }: { color: string }) {
  return <meshStandardMaterial color={color} metalness={METALNESS} roughness={ROUGHNESS} />
}

function Boxes({ boxes, color }: { boxes: readonly Box[]; color: string }) {
  return (
    <>
      {boxes.map((b, i) => (
        <mesh key={i} position={b.position} castShadow>
          <boxGeometry args={b.size} />
          <Metal color={color} />
        </mesh>
      ))}
    </>
  )
}

/** Hole positions along the pull (local x), from the spec's `a` / `b`. */
function holeXs(pull: PullSpec): number[] {
  const along = new Vector3(...pull.along)
  const c = new Vector3(...pull.centre)
  const xa = new Vector3(...pull.a).sub(c).dot(along)
  const xb = new Vector3(...pull.b).sub(c).dot(along)
  return Math.abs(xa - xb) < 1e-9 ? [xa] : [xa, xb]
}

function Bar({ pull }: { pull: PullSpec }) {
  const r = pull.diameter / 2
  const p = pull.standoff
  return (
    <>
      <mesh position={[0, 0, p]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[r, r, pull.length, 16]} />
        <Metal color={pull.color} />
      </mesh>
      {holeXs(pull).map((x) => (
        <mesh key={x} position={[x, 0, p / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[r * 0.8, r * 0.8, p, 12]} />
          <Metal color={pull.color} />
        </mesh>
      ))}
    </>
  )
}

function Knob({ pull }: { pull: PullSpec }) {
  const r = pull.diameter / 2
  const post = pull.standoff * KNOB_POST_SHARE
  const head = pull.standoff - post
  return (
    <>
      <mesh position={[0, 0, post / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[r * KNOB_POST_RADIUS * 2, r * KNOB_POST_RADIUS * 2, post, 16]} />
        <Metal color={pull.color} />
      </mesh>
      <mesh position={[0, 0, post + head / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[r, r * 0.9, head, 32]} />
        <Metal color={pull.color} />
      </mesh>
    </>
  )
}

/** Edge pull / J-profile: a flange over the grip edge and a lip in front of the show face. */
export function profileBoxes(pull: PullSpec): Box[] {
  const t = Math.max(pull.diameter, MIN_SHEET)
  const edge = pull.edgeDistance
  const depth = pull.frontThickness + pull.standoff
  return [
    { position: [0, edge + t / 2, (pull.standoff - pull.frontThickness) / 2], size: [pull.length, t, depth] },
    { position: [0, edge + t - pull.width / 2, pull.standoff - t / 2], size: [pull.length, pull.width, t] },
  ]
}

/** Cup pull: back plate, hood (top, front) and end cheeks, open at the bottom. */
export function cupBoxes(pull: PullSpec): Box[] {
  const t = Math.max(pull.diameter, MIN_SHEET)
  const { length: l, width: w, standoff: p } = pull
  const hood = w * CUP_HOOD_SHARE
  return [
    { position: [0, 0, t / 2], size: [l, w, t] },
    { position: [0, w / 2 - t / 2, p / 2], size: [l, t, p] },
    { position: [0, w / 2 - hood / 2, p - t / 2], size: [l, hood, t] },
    ...[-1, 1].map((s): Box => ({ position: [(s * (l - t)) / 2, w / 2 - hood / 2, p / 2], size: [t, hood, p] })),
  ]
}

/** An imported handle model, scaled from its file units, its back on the show face. Bar placeholder until loaded. */
function CustomModel({ pull, model }: { pull: PullSpec; model: HandleModel }) {
  const [object, setObject] = useState<Object3D | null>(null)
  const { blobId, format, unit } = model
  useEffect(() => {
    let isCurrent = true
    loadModel(blobId, format).then(
      (parsed) => {
        if (!isCurrent) return
        const k = MM_PER_MODEL_UNIT[unit] / MM_PER_M
        const copy = parsed.object.clone(true)
        copy.scale.setScalar(k)
        copy.position.set(-parsed.centre.x * k, -parsed.centre.y * k, (parsed.nativeSize.z / 2 - parsed.centre.z) * k)
        setObject(copy)
      },
      () => {
        if (isCurrent) setObject(null)
      },
    )
    return () => {
      isCurrent = false
    }
  }, [blobId, format, unit])
  return object ? <primitive object={object} /> : <Bar pull={pull} />
}

function StyleMesh({ pull }: { pull: PullSpec }) {
  switch (pull.style) {
    case 'knob':
      return <Knob pull={pull} />
    case 'edge':
    case 'j-profile':
      return <Boxes boxes={profileBoxes(pull)} color={pull.color} />
    case 'cup':
      return <Boxes boxes={cupBoxes(pull)} color={pull.color} />
    case 'custom':
      return pull.model ? <CustomModel pull={pull} model={pull.model} /> : <Bar pull={pull} />
    case 'bar':
      return <Bar pull={pull} />
  }
}

/** A pull of any style, placed and oriented on its front. */
export function Pull({ pull }: { pull: PullSpec }) {
  const quaternion = useMemo(() => {
    const basis = new Matrix4().makeBasis(new Vector3(...pull.along), new Vector3(...pull.up), new Vector3(...pull.normal))
    return new Quaternion().setFromRotationMatrix(basis)
  }, [pull.along, pull.up, pull.normal])
  return (
    <group position={pull.centre} quaternion={quaternion}>
      <StyleMesh pull={pull} />
    </group>
  )
}
