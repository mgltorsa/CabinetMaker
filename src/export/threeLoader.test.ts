/**
 * Cross-check with an independent glTF reader: three.js's GLTFLoader (already a
 * dependency for the 3D view) must load the exported GLB into the same
 * hierarchy, names, positions and materials.
 */
import { Box3, type Mesh, type MeshStandardMaterial, type Object3D, PropertyBinding, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { runPipeline } from '@/pipeline'
import { cabinetToGlb } from './cabinetGlb'

function load(bytes: Uint8Array): Promise<Object3D> {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Promise((resolve, reject) => new GLTFLoader().parse(data, '', (gltf) => resolve(gltf.scene), reject))
}

describe('GLB read back by three.js GLTFLoader', () => {
  it('loads the cabinet hierarchy with part names, positions, sizes and materials', async () => {
    const project = fixtureProject()
    project.cabinets[0]!.top = { ...project.cabinets[0]!.top, kind: 'countertop', materialId: null }
    const build = runPipeline(project).build.cabinets[0]!
    const scene = await load(cabinetToGlb(project.cabinets[0]!, build, project))

    // three.js sanitizes names for animation binding ('Left side' → 'Left_side').
    const named = (name: string): Object3D | undefined => scene.getObjectByName(PropertyBinding.sanitizeNodeName(name))
    const root = named('Base cabinet')!
    expect(root.userData).toMatchObject({ cabinetType: 'base', widthMm: 600 })
    expect(root.children).toHaveLength(build.parts.length + 1)
    expect(named('Countertop')?.userData.supplied).toBe(true)

    for (const part of build.parts) {
      const mesh = named(part.name) as Mesh
      expect(mesh, part.name).toBeDefined()
      expect(mesh.userData.partId).toBe(part.id)
      const box = new Box3().setFromObject(mesh)
      const size = box.getSize(new Vector3())
      expect(size.x).toBeCloseTo((part.bounds.max.x - part.bounds.min.x) / 1000, 5)
      expect(size.y).toBeCloseTo((part.bounds.max.y - part.bounds.min.y) / 1000, 5)
      expect(box.min.z).toBeCloseTo(part.bounds.min.z / 1000, 5)
      expect((mesh.material as MeshStandardMaterial).metalness).toBe(0)
    }
  })
})
