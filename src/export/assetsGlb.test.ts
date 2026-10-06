import { strFromU8, unzipSync } from 'fflate'
import { Box3, type Object3D, PropertyBinding, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { ASSET_CATALOG, localHalfExtents, type Primitive } from '@/assets'
import { fixtureProject } from '@/core/fixtures'
import type { PlacedAsset, Project } from '@/core/types'
import { runPipeline } from '@/pipeline'
import { ASSETS_ROOT_NAME, placedAssetsToGlb } from './assetsGlb'
import { buildBlenderBundle, SCENE_ASSETS_GLB, type BundleManifest } from './bundle'
import { primitiveMesh, type TriMesh } from './primitiveMesh'
import { parseGlb } from './testing/glbCheck'

const FRIDGE: PlacedAsset = {
  id: 'ast_1',
  assetId: 'fridge',
  name: 'Fridge',
  position: { x: 2000, y: 0, z: 340 },
  rotationYDeg: 90,
  size: { x: 700, y: 1800, z: 680 },
  color: '#ffffff',
  visible: true,
}
const PENDANT: PlacedAsset = {
  id: 'ast_2',
  assetId: 'pendant',
  name: 'Pendant light',
  position: { x: 1000, y: 1600, z: 1200 },
  rotationYDeg: 0,
  size: { x: 360, y: 800, z: 360 },
  visible: true,
  light: { on: true, intensity: 1, color: '#ffd9a8' },
}

function load(bytes: Uint8Array): Promise<Object3D> {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Promise((resolve, reject) => new GLTFLoader().parse(data, '', (gltf) => resolve(gltf.scene), reject))
}

function checkMesh(mesh: TriMesh, label: string): void {
  const n = mesh.positions.length / 3
  expect(mesh.normals.length, label).toBe(mesh.positions.length)
  expect(mesh.indices.length % 3, label).toBe(0)
  for (const i of mesh.indices) expect(i, label).toBeLessThan(n)
  for (let v = 0; v < n; v++) expect(Math.hypot(mesh.normals[v * 3]!, mesh.normals[v * 3 + 1]!, mesh.normals[v * 3 + 2]!), label).toBeCloseTo(1, 5)
  // Counter-clockwise outward: each face normal agrees with its vertex normals.
  const at = (k: number): Vector3 => new Vector3(mesh.positions[k * 3], mesh.positions[k * 3 + 1], mesh.positions[k * 3 + 2])
  const nAt = (k: number): Vector3 => new Vector3(mesh.normals[k * 3], mesh.normals[k * 3 + 1], mesh.normals[k * 3 + 2])
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!]
    const face = at(b).sub(at(a)).cross(at(c).sub(at(a)))
    if (face.length() < 1e-12) continue
    expect(face.dot(nAt(a).add(nAt(b)).add(nAt(c))), `${label} triangle ${t / 3}`).toBeGreaterThan(0)
  }
}

describe('primitiveMesh', () => {
  const cases: Primitive[] = [
    { kind: 'box', role: 'body', position: [0, 0, 0], size: [100, 200, 300] },
    { kind: 'cylinder', role: 'body', position: [0, 0, 0], radiusTop: 50, radiusBottom: 50, height: 120 },
    { kind: 'cylinder', role: 'body', position: [0, 0, 0], radiusTop: 20, radiusBottom: 80, height: 100, openEnded: true },
    { kind: 'sphere', role: 'body', position: [0, 0, 0], radius: 70 },
    { kind: 'torus', role: 'body', position: [0, 0, 0], radius: 100, tube: 10 },
  ]

  it.each(cases.map((p) => [p.kind + (p.kind === 'cylinder' && p.openEnded ? ' (open)' : ''), p] as const))('%s: well-formed, outward, sized in metres', (label, p) => {
    const mesh = primitiveMesh(p)
    checkMesh(mesh, label)
    const half = localHalfExtents(p)
    for (let k = 0; k < 3; k++) {
      const column = Array.from(mesh.positions).filter((_, i) => i % 3 === k)
      expect(Math.max(...column)).toBeCloseTo(half[k]! / 1000, 6)
      expect(Math.min(...column)).toBeCloseTo(-half[k]! / 1000, 6)
    }
  })

  it('meshes every primitive of every catalog asset', () => {
    for (const def of ASSET_CATALOG) for (const p of def.build(def.defaultSize)) checkMesh(primitiveMesh(p), def.id)
  })
})

describe('placedAssetsToGlb', () => {
  it('writes a well-formed GLB with one node per visible asset under the root', () => {
    const glb = parseGlb(placedAssetsToGlb([FRIDGE, PENDANT, { ...FRIDGE, id: 'hidden', name: 'Hidden', visible: false }]))
    expect(glb.problems).toEqual([])
    const nodes = glb.json.nodes!
    expect(nodes[0]!.name).toBe(ASSETS_ROOT_NAME)
    const children = nodes[0]!.children!.map((i) => nodes[i]!)
    expect(children.map((c) => c.name)).toEqual(['Fridge', 'Pendant light'])
    expect(children[0]!.translation).toEqual([2, 0, 0.34])
    expect(children[0]!.rotation![1]).toBeCloseTo(Math.SQRT1_2, 6)
    expect(children[0]!.extras).toMatchObject({ assetId: 'fridge', widthMm: 700 })
    expect(children[1]!.extras).toMatchObject({ lightOn: true, lightColor: '#ffd9a8' })
    const emissive = glb.json.materials!.filter((m) => (m as { emissiveFactor?: number[] }).emissiveFactor)
    expect(emissive).toHaveLength(1)
  })

  it('writes an empty but valid scene when nothing is visible', () => {
    const glb = parseGlb(placedAssetsToGlb([]))
    expect(glb.problems).toEqual([])
    expect(glb.json.nodes).toEqual([{ name: ASSETS_ROOT_NAME, extras: { source: 'CabinetMaker', assetCount: 0, space: 'room' } }])
  })

  it('loads in three.js with the asset at its room position and size', async () => {
    const scene = await load(placedAssetsToGlb([{ ...FRIDGE, rotationYDeg: 0 }, { ...FRIDGE, id: 'x', name: 'Mystery', assetId: 'from-the-future' }]))
    scene.updateMatrixWorld(true)
    const fridge = scene.getObjectByName(PropertyBinding.sanitizeNodeName('Fridge'))!
    const box = new Box3().setFromObject(fridge)
    expect(box.min.x).toBeCloseTo(1.65, 4)
    expect(box.max.x).toBeCloseTo(2.35, 4)
    expect(box.min.y).toBeCloseTo(0, 4)
    expect(box.max.y).toBeCloseTo(1.8, 4)
    expect(box.max.z).toBeCloseTo(0.68, 4)
    const mystery = new Box3().setFromObject(scene.getObjectByName('Mystery')!)
    expect(mystery.getSize(new Vector3()).y).toBeCloseTo(1.8, 4)
  })
})

describe('Blender bundle with placed assets', () => {
  function bundle(project: Project) {
    const files = unzipSync(buildBlenderBundle(project, runPipeline(project)))
    return { files, manifest: JSON.parse(strFromU8(files['manifest.json']!)) as BundleManifest }
  }

  it('adds scene/placed-assets.glb and lists the visible assets in the manifest and README', () => {
    const { files, manifest } = bundle({ ...fixtureProject(), assets: [FRIDGE, { ...PENDANT, visible: false }] })
    expect(parseGlb(files[SCENE_ASSETS_GLB]!).problems).toEqual([])
    expect(manifest.sceneAssets?.glb).toBe(SCENE_ASSETS_GLB)
    expect(manifest.sceneAssets?.assets.map((a) => a.name)).toEqual(['Fridge'])
    expect(strFromU8(files['README.txt']!)).toContain(SCENE_ASSETS_GLB)
    expect(manifest.cabinets).toHaveLength(1) // assets never become cabinets
  })

  it('leaves the bundle unchanged without visible assets', () => {
    const { files, manifest } = bundle({ ...fixtureProject(), assets: [{ ...FRIDGE, visible: false }] })
    expect(files[SCENE_ASSETS_GLB]).toBeUndefined()
    expect(manifest.sceneAssets).toBeUndefined()
  })
})
