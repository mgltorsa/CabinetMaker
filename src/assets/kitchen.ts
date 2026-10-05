/**
 * Kitchen assets. Default sizes are typical European / North American
 * appliance sizes (mm); every shape stretches to the size the user gives.
 */
import type { Vec3 } from '@/core/types'
import { barX, barZ, detail, flatRing, post, span } from './shapes'
import type { AssetDef, Primitive } from './types'

/** Appliance front: handles live in the zone in front of the door faces. */
function applianceFront(s: Vec3): { hd: number; doorT: number; front: number } {
  const hd = detail(s.z, 0.05, 35)
  const doorT = detail(s.z, 0.05, 30)
  return { hd, doorT, front: s.z / 2 - hd }
}

function fridge(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const { doorT, front } = applianceFront(s)
  const kick = detail(h, 0.05, 80)
  const split = h * 0.38
  const gap = detail(h, 0.004, 6)
  const bar = detail(w, 0.025, 20)
  const hx = w / 2 - detail(w, 0.1, 70)
  return [
    span('body', [-w / 2, w / 2], [0, h], [-d / 2, front - doorT]),
    span('dark', [-w / 2 + w * 0.03, w / 2 - w * 0.03], [0, kick], [front - doorT, front - doorT / 2]),
    span('body', [-w / 2, w / 2], [kick, split - gap / 2], [front - doorT, front]),
    span('body', [-w / 2, w / 2], [split + gap / 2, h], [front - doorT, front]),
    // Handles: vertical on the fridge door, horizontal on the freezer drawer.
    span('metal', [hx - bar, hx], [split + h * 0.06, split + h * 0.3], [front, d / 2]),
    span('metal', [-w * 0.3, w * 0.3], [split - gap - h * 0.05, split - gap - h * 0.05 + bar], [front, d / 2]),
  ]
}

function range(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const knobZone = detail(d, 0.05, 30)
  const fz = d / 2 - knobZone
  const doorT = detail(d, 0.03, 20)
  const topY = h * 0.94
  const topT = detail(h, 0.012, 10)
  const guardD = detail(d, 0.1, 60)
  const ringR = Math.min(w, d) * 0.1
  const tube = Math.min(ringR * 0.12, h * 0.012)
  const knobR = Math.min(w * 0.025, h * 0.02, knobZone / 2)
  const handleR = Math.min(knobZone / 2, h * 0.012)
  const prims: Primitive[] = [
    span('body', [-w / 2, w / 2], [0, topY], [-d / 2, fz - doorT]),
    span('dark', [-w / 2, w / 2], [topY, topY + topT], [-d / 2 + guardD, fz]),
    span('body', [-w / 2, w / 2], [topY, h], [-d / 2, -d / 2 + guardD]),
    span('dark', [-w * 0.45, w * 0.45], [h * 0.08, h * 0.64], [fz - doorT, fz]),
    span('dark', [-w / 2, w / 2], [h * 0.74, h * 0.88], [fz - doorT, fz]),
    barX('metal', [0, h * 0.68, fz + knobZone / 2], w * 0.8, handleR),
  ]
  for (const kx of [-0.3, -0.1, 0.1, 0.3]) prims.push(barZ('metal', [w * kx, h * 0.81, fz + knobZone / 2], knobZone, knobR))
  const ringY = topY + topT + tube
  const cz = (-d / 2 + guardD + fz) / 2
  const dz = Math.min((fz - (-d / 2 + guardD)) / 4, d * 0.18)
  for (const [bx, bz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    prims.push(flatRing('metal', [bx * w * 0.22, ringY, cz + bz * dz], Math.min(ringR, dz - tube, w * 0.22 - tube), tube))
  }
  return prims
}

function cooktop(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const r = Math.min(w * 0.12, d * 0.16)
  const tube = Math.min(r * 0.1, h * 0.2)
  const glassY = h - 2 * tube
  const prims: Primitive[] = [span('body', [-w / 2, w / 2], [0, glassY], [-d / 2, d / 2])]
  for (const [bx, bz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    prims.push(flatRing('metal', [bx * w * 0.24, glassY + tube, bz * d * 0.22], r, tube))
  }
  return prims
}

function dishwasher(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const { doorT, front } = applianceFront(s)
  const kick = detail(h, 0.1, 90)
  const panel = detail(h, 0.1, 90)
  const bar = detail(h, 0.02, 18)
  return [
    span('body', [-w / 2, w / 2], [0, h], [-d / 2, front - doorT]),
    span('dark', [-w / 2, w / 2], [0, kick], [front - doorT, front - doorT / 2]),
    span('body', [-w / 2, w / 2], [kick, h - panel], [front - doorT, front]),
    span('dark', [-w / 2, w / 2], [h - panel, h], [front - doorT, front]),
    span('metal', [-w * 0.35, w * 0.35], [h - panel - bar * 2.5, h - panel - bar * 1.5], [front, d / 2]),
  ]
}

function sink(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const deck = d * 0.2
  const rim = detail(h, 0.04, 12)
  const lip = detail(Math.min(w, d), 0.06, 40)
  const z0 = -d / 2 + deck
  const r = Math.min(w, d) * 0.03
  const spoutR = Math.min(r * 0.7, h * 0.04)
  const spoutY = h - spoutR
  const fz = -d / 2 + deck / 2
  const reach = d * 0.35
  return [
    span('body', [-w / 2, w / 2], [0, rim], [-d / 2, z0]),
    span('body', [-w / 2, w / 2], [0, rim], [z0, z0 + lip]),
    span('body', [-w / 2, w / 2], [0, rim], [d / 2 - lip, d / 2]),
    span('body', [-w / 2, -w / 2 + lip], [0, rim], [z0 + lip, d / 2 - lip]),
    span('body', [w / 2 - lip, w / 2], [0, rim], [z0 + lip, d / 2 - lip]),
    span('steel', [-w / 2 + lip, w / 2 - lip], [0, rim * 0.3], [z0 + lip, d / 2 - lip]),
    // Faucet: post, spout reaching over the basin, short outlet.
    post('metal', 0, fz, 0, spoutY, r),
    barZ('metal', [0, spoutY, fz + reach / 2], reach, spoutR),
    post('metal', 0, fz + reach - spoutR, spoutY - h * 0.12, h * 0.12, spoutR),
  ]
}

function rangeHood(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const filter = detail(h, 0.015, 8)
  return [
    span('body', [-w / 2, w / 2], [filter, h * 0.18], [-d / 2, d / 2]),
    span('dark', [-w * 0.44, w * 0.44], [0, filter], [-d * 0.44, d * 0.44]),
    span('body', [-w * 0.3, w * 0.3], [h * 0.18, h * 0.3], [-d / 2, -d / 2 + d * 0.65]),
    span('body', [-w * 0.16, w * 0.16], [h * 0.3, h], [-d / 2, -d / 2 + d * 0.5]),
  ]
}

function microwave(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const { hd, doorT, front } = applianceFront(s)
  const doorRight = w / 2 - w * 0.26
  const bar = detail(w, 0.02, 14)
  return [
    span('body', [-w / 2, w / 2], [0, h], [-d / 2, front - doorT]),
    span('dark', [-w / 2 + w * 0.04, doorRight], [h * 0.1, h * 0.9], [front - doorT, front]),
    span('dark', [doorRight + w * 0.04, w / 2 - w * 0.04], [h * 0.1, h * 0.9], [front - doorT, front - doorT / 2]),
    span('metal', [doorRight - bar * 2, doorRight - bar], [h * 0.2, h * 0.8], [front, front + hd]),
  ]
}

function island(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const topT = detail(h, 0.045, 40)
  const side = detail(w, 0.02, 25)
  const kick = detail(h, 0.1, 100)
  const seat = d * 0.28
  const handle = detail(d, 0.02, 20)
  const front = d / 2 - handle
  const bodyX: [number, number] = [-w / 2 + side, w / 2 - side]
  const prims: Primitive[] = [
    span('white', [-w / 2, w / 2], [h - topT, h], [-d / 2, d / 2]),
    span('body', bodyX, [kick, h - topT], [-d / 2 + seat, front]),
    span('dark', [bodyX[0] + side, bodyX[1] - side], [0, kick], [-d / 2 + seat + handle, front - handle]),
  ]
  const doors = Math.max(1, Math.round((w - 2 * side) / 600))
  const pitch = (w - 2 * side) / doors
  for (let i = 0; i < doors; i++) {
    const cx = bodyX[0] + pitch * (i + 0.5)
    prims.push(span('metal', [cx - pitch * 0.2, cx + pitch * 0.2], [h - topT - h * 0.09, h - topT - h * 0.07], [front, d / 2]))
  }
  return prims
}

function barStool(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const m = Math.min(w, d)
  const seatT = detail(h, 0.06, 45)
  const legR = m * 0.03
  const legY = h - seatT
  const prims: Primitive[] = [post('body', 0, 0, legY, seatT, m * 0.48)]
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) prims.push(post('metal', lx * m * 0.28, lz * m * 0.28, 0, legY, legR))
  const tube = m * 0.02
  prims.push(flatRing('metal', [0, h * 0.3, 0], m * 0.4, tube))
  return prims
}

export const KITCHEN_ASSETS: readonly AssetDef[] = [
  { id: 'fridge', name: 'Fridge', category: 'kitchen', keywords: ['refrigerator', 'freezer', 'appliance'], defaultSize: { x: 700, y: 1800, z: 680 }, defaultColor: '#e9e9e6', mount: 'floor-wall', build: fridge },
  { id: 'range', name: 'Range / oven', category: 'kitchen', keywords: ['stove', 'oven', 'cooker', 'appliance'], defaultSize: { x: 760, y: 920, z: 650 }, defaultColor: '#cfd1d3', mount: 'floor-wall', build: range },
  { id: 'cooktop', name: 'Cooktop', category: 'kitchen', keywords: ['hob', 'induction', 'burner'], defaultSize: { x: 600, y: 50, z: 520 }, defaultColor: '#1d1d20', mount: 'counter', build: cooktop },
  { id: 'dishwasher', name: 'Dishwasher', category: 'kitchen', keywords: ['appliance'], defaultSize: { x: 600, y: 820, z: 570 }, defaultColor: '#dcdddf', mount: 'floor-wall', build: dishwasher },
  { id: 'sink', name: 'Sink with faucet', category: 'kitchen', keywords: ['basin', 'tap', 'faucet'], defaultSize: { x: 800, y: 330, z: 500 }, defaultColor: '#c7cbd0', mount: 'counter', build: sink },
  { id: 'range-hood', name: 'Range hood', category: 'kitchen', keywords: ['extractor', 'vent', 'chimney'], defaultSize: { x: 900, y: 900, z: 500 }, defaultColor: '#c9ccd0', mount: 'wall', defaultLift: 1550, build: rangeHood },
  { id: 'microwave', name: 'Microwave', category: 'kitchen', keywords: ['appliance', 'oven'], defaultSize: { x: 500, y: 300, z: 380 }, defaultColor: '#d5d6d8', mount: 'counter', build: microwave },
  { id: 'island', name: 'Kitchen island', category: 'kitchen', keywords: ['counter', 'worktop', 'peninsula'], defaultSize: { x: 1800, y: 920, z: 1000 }, defaultColor: '#7b8c84', mount: 'floor', build: island },
  { id: 'bar-stool', name: 'Bar stool', category: 'kitchen', keywords: ['stool', 'seat', 'counter stool'], defaultSize: { x: 420, y: 750, z: 420 }, defaultColor: '#3c3a37', mount: 'floor', build: barStool },
]
