import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Cabinet, Project, SceneModel } from '@/core/types'
import { MAX_MODELS } from '../lib/limits'
import { validateProject } from '../lib/projectSchema'
import {
  addModel,
  addOpening,
  clearCabinetPositions,
  MODEL_GAP_MM,
  newSceneModel,
  nextModelPosition,
  placeCabinetsAlongBackWall,
  removeModel,
  removeOpening,
  setCabinetPosition,
  setRoom,
  updateModel,
  updateOpening,
} from './modelOps'
import { BACK_WALL_ID, rectangularRoom } from './room'

const model = (over: Partial<SceneModel> = {}): SceneModel => ({
  id: 'mdl_1',
  name: 'Cube',
  format: 'glb',
  blobId: 'sha256-aa',
  unit: 'm',
  nativeSize: { x: 1, y: 1, z: 1 },
  position: { x: 0, y: 0, z: 0 },
  rotationYDeg: 0,
  scale: 1,
  visible: true,
  ...over,
})

function twoCabinets(): Project {
  const project = fixtureProject()
  const base = project.cabinets[0]!
  const second: Cabinet = { ...structuredClone(base), id: 'cab_2', width: 900 }
  const wall: Cabinet = { ...structuredClone(base), id: 'cab_w', type: 'wall', width: 800, floorHeight: 1400 }
  return { ...project, cabinets: [base, second, wall] }
}

describe('model list ops', () => {
  it('adds a model, giving it a fresh id when the id is taken', () => {
    const p1 = addModel(fixtureProject(), model())
    const p2 = addModel(p1, model())
    expect(p2.models).toHaveLength(2)
    expect(new Set(p2.models!.map((m) => m.id)).size).toBe(2)
    expect(validateProject(p2)).toBeNull()
  })

  it('stops at the model limit', () => {
    let project = fixtureProject()
    for (let i = 0; i < MAX_MODELS + 3; i++) project = addModel(project, model({ id: `m${i}` }))
    expect(project.models).toHaveLength(MAX_MODELS)
  })

  it('updates and removes by id without mutating the input', () => {
    const project = addModel(fixtureProject(), model())
    const frozen = JSON.stringify(project)
    const moved = updateModel(project, 'mdl_1', { position: { x: 10, y: 0, z: 20 }, scale: 2 })
    expect(moved.models![0]).toMatchObject({ position: { x: 10, y: 0, z: 20 }, scale: 2 })
    expect(JSON.stringify(project)).toBe(frozen)
    expect(updateModel(project, 'nope', { scale: 3 })).toBe(project)
    expect(removeModel(moved, 'mdl_1').models).toEqual([])
    expect(removeModel(project, 'nope')).toBe(project)
  })

  it('treats a project without models as an empty list', () => {
    const project = { ...fixtureProject() }
    delete project.models
    expect(updateModel(project, 'x', { scale: 2 })).toBe(project)
    expect(removeModel(project, 'x')).toBe(project)
  })
})

describe('nextModelPosition', () => {
  it('stands a new model on the floor, against the back wall, right of the cabinet run', () => {
    const project = twoCabinets() // floor run: 600 + 20 gap + 900
    const pos = nextModelPosition(project, { x: 1000, y: 500, z: 600 })
    expect(pos).toEqual({ x: 1520 + MODEL_GAP_MM + 500, y: 0, z: 300 })
  })

  it('goes right of models already placed', () => {
    const project = { ...twoCabinets(), models: [model({ position: { x: 5000, y: 0, z: 500 } })] } // 1 m cube: right edge 5500
    expect(nextModelPosition(project, { x: 200, y: 200, z: 200 }).x).toBe(5500 + MODEL_GAP_MM + 100)
  })

  it('starts at the origin of an empty project', () => {
    expect(nextModelPosition({ ...fixtureProject(), cabinets: [] }, { x: 400, y: 1, z: 400 })).toEqual({ x: 200, y: 0, z: 200 })
  })
})

describe('newSceneModel', () => {
  it('builds a visible, unscaled model on the floor next to the run, in the chosen unit', () => {
    const project = twoCabinets()
    const file = { name: 'Fridge', format: 'obj' as const, blobId: 'sha256-ab', nativeSize: { x: 60, y: 180, z: 65 } }
    const made = newSceneModel(project, file, 'cm')
    expect(made).toMatchObject({ ...file, unit: 'cm', rotationYDeg: 0, scale: 1, visible: true })
    expect(made.position).toEqual({ x: 1520 + MODEL_GAP_MM + 300, y: 0, z: 325 })
    expect(validateProject(addModel(project, made))).toBeNull()
  })
})

describe('room ops', () => {
  it('sets and clears the room', () => {
    const room = rectangularRoom({ width: 3000, depth: 2000, height: 2400, thickness: 100 })
    const project = setRoom(fixtureProject(), room)
    expect(project.room).toBe(room)
    expect(setRoom(project, null).room).toBeNull()
  })

  it('adds, edits and removes openings, clamped to their wall', () => {
    const project = setRoom(fixtureProject(), rectangularRoom({ width: 3000, depth: 2000, height: 2400, thickness: 100 }))
    const withDoor = addOpening(project, BACK_WALL_ID, 'door')
    const door = withDoor.room!.openings[0]!
    expect(door).toMatchObject({ wallId: BACK_WALL_ID, kind: 'door', sillHeight: 0 })
    const moved = updateOpening(withDoor, door.id, { offset: 99_999 })
    expect(moved.room!.openings[0]!.offset).toBe(3000 - door.width)
    expect(removeOpening(moved, door.id).room!.openings).toEqual([])
    expect(validateProject(moved)).toBeNull()
  })

  it('ignores opening edits without a room or an unknown wall', () => {
    const project = fixtureProject()
    expect(addOpening(project, BACK_WALL_ID, 'window')).toBe(project)
    const roomed = setRoom(project, rectangularRoom({ width: 3000, depth: 2000, height: 2400, thickness: 100 }))
    expect(addOpening(roomed, 'nope', 'window')).toBe(roomed)
  })
})

describe('cabinet placement ops', () => {
  it('pins every cabinet where the automatic run puts it, against the back wall', () => {
    const project = placeCabinetsAlongBackWall(twoCabinets())
    expect(project.cabinets.map((c) => c.placement?.position)).toEqual([
      { x: 0, z: 0 },
      { x: 620, z: 0 },
      { x: 0, z: 0 },
    ])
    expect(project.cabinets[1]!.placement).toMatchObject({ wallId: null, offset: 620, rotationDeg: 0 })
    expect(validateProject(project)).toBeNull()
  })

  it('names the back wall when the room has one', () => {
    const roomed = setRoom(twoCabinets(), rectangularRoom({ width: 3000, depth: 2000, height: 2400, thickness: 100 }))
    expect(placeCabinetsAlongBackWall(roomed).cabinets[0]!.placement!.wallId).toBe(BACK_WALL_ID)
  })

  it('moves one cabinet and clears positions back to the automatic run', () => {
    const project = setCabinetPosition(twoCabinets(), 'cab_2', { x: 1500, z: 300 })
    expect(project.cabinets[1]!.placement).toEqual({ wallId: null, offset: 1500, rotationDeg: 0, position: { x: 1500, z: 300 } })
    const cleared = clearCabinetPositions(project)
    expect(cleared.cabinets.every((c) => c.placement?.position === undefined)).toBe(true)
    expect(setCabinetPosition(project, 'cab_2', null).cabinets[1]!.placement!.position).toBeUndefined()
  })
})
