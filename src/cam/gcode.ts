/**
 * Toolpaths → G-code. Conservative subset: G0/G1 only (no arcs), G17, G21,
 * G90, M3/M5, Tn M6, F and S words. Numbers carry ≤ 3 decimals.
 *
 * Motion per pass: rapid to safe Z, rapid over the pass start, rapid down to
 * the rapid clearance, feed (plunge feed) to the first point, then feed along
 * the pass. The pass ends with a rapid back to safe Z. `parseGcode` inverts
 * exactly this.
 *
 * Feeds (see `feedFor`): pure-Z moves use the plunge feed; a move that also
 * goes down (ramp, helix) is slowed so its vertical rate never exceeds the
 * plunge feed; level and rising moves use the cut feed.
 */
import type { Machine, Tool, Toolpath, Vec3 } from '@/core/types'
import { formatForMessage, formatNumber as f, sanitizeComment } from './format'
import { OUTPUT_DECIMALS } from './geometry'
import { plungeStartZ } from './machine'
import type { GcodeOptions } from './types'

export const PREVIEW_BANNER = 'PREVIEW - simulate before running; not validated for any specific machine'

interface Position {
  x: string | null
  y: string | null
  z: string | null
}

/** Mutable writer state, local to one `emitGcode` call. */
interface Writer {
  out: string[]
  pos: Position
  feed: number | null
}

const comment = (text: string): string => `(${sanitizeComment(text)})`

const toolName = (tool: Tool): string => `T${tool.number} ${tool.name}`
const toolLabel = (tool: Tool): string => `T${tool.number} D${f(tool.diameter)} ${tool.name}`

function move(w: Writer, code: 'G0' | 'G1', target: Partial<Vec3>, feed?: number): void {
  const words: string[] = []
  for (const axis of ['x', 'y', 'z'] as const) {
    const value = target[axis]
    if (value === undefined) continue
    const text = f(value)
    if (w.pos[axis] === text) continue
    w.pos[axis] = text
    words.push(`${axis.toUpperCase()}${text}`)
  }
  if (words.length === 0) return
  if (feed !== undefined && feed !== w.feed) {
    w.feed = feed
    words.push(`F${f(feed)}`)
  }
  w.out.push([code, ...words].join(' '))
}

function header(w: Writer, toolpaths: readonly Toolpath[], machine: Machine, used: readonly Tool[], options: GcodeOptions): void {
  const sheetId = options.sheetId ?? toolpaths[0]?.sheetId ?? 'unknown'
  w.out.push('%', comment(PREVIEW_BANNER), comment(`Program: ${options.programName}`), comment(`Sheet: ${sheetId}`))
  const thickness = options.thickness === undefined ? null : `${formatForMessage(options.thickness)} mm`
  if (options.material !== undefined) {
    w.out.push(comment(`Material: ${options.material}${thickness === null ? '' : `, ${thickness} thick`}`))
  } else if (thickness !== null) {
    w.out.push(comment(`Stock thickness: ${thickness}`))
  }
  w.out.push(comment(used.length > 0 ? 'Tools:' : 'Tools: none'), ...used.map((t) => comment(toolLabel(t))))
  if (machine.units === 'G20') {
    w.out.push(comment('WARNING: inch output (G20) is coming soon; this program is in millimetres (G21)'))
  }
  w.out.push('G21', 'G90', 'G17')
}

function toolChange(w: Writer, tool: Tool, machine: Machine, retractZ: number): void {
  const tc = machine.toolChange
  w.out.push(comment(`Tool ${toolLabel(tool)}`))
  move(w, 'G0', { z: retractZ })
  move(w, 'G0', { x: tc.x, y: tc.y })
  move(w, 'G0', { z: tc.z })
  w.out.push('M5', `T${tool.number} M6`)
  if (tc.mode === 'manual') w.out.push(`M0 ${comment(`Manual tool change: install ${toolName(tool)}, then resume`)}`)
  w.out.push(`S${f(tool.rpm)} M3`)
  w.feed = null
}

const FEED_SCALE = 10 ** OUTPUT_DECIMALS

/** A coordinate as the controller reads it back (rounded to the output resolution). */
const emitted = (value: number): number => Number(f(value))

/**
 * Feed for a G1 move from `prev` to `p`: plunge feed for pure-Z moves; for a
 * move that also descends, `min(cutFeed, plungeFeed × length / |dz|)` rounded
 * down to the output resolution, so the vertical component of the feed is
 * ≤ the plunge feed; cut feed for level and rising moves. Computed from the
 * emitted (rounded) coordinates so the program itself obeys the rule.
 */
function feedFor(prev: Vec3, p: Vec3, tool: Tool): number {
  const dx = emitted(p.x) - emitted(prev.x)
  const dy = emitted(p.y) - emitted(prev.y)
  const dz = emitted(p.z) - emitted(prev.z)
  const run = Math.hypot(dx, dy)
  if (run === 0) return tool.plungeFeed
  if (dz >= 0) return tool.cutFeed
  const limited = Math.floor(((tool.plungeFeed * Math.hypot(run, dz)) / -dz) * FEED_SCALE) / FEED_SCALE
  return Math.min(tool.cutFeed, limited)
}

function cutPass(w: Writer, pass: readonly Vec3[], tool: Tool, machine: Machine): void {
  const first = pass[0]
  if (!first) return
  const above = pass.find((p) => p.z >= plungeStartZ(machine))
  if (above) throw new Error(`Pass point at Z${f(above.z)} is at or above the plunge start height; it would not be cut as a feed move`)
  move(w, 'G0', { z: machine.safeZ })
  move(w, 'G0', { x: first.x, y: first.y })
  move(w, 'G0', { z: plungeStartZ(machine) })
  move(w, 'G1', { z: first.z }, tool.plungeFeed)
  pass.slice(1).forEach((p, i) => move(w, 'G1', p, feedFor(pass[i] ?? p, p, tool)))
  move(w, 'G0', { z: machine.safeZ })
}

function footer(w: Writer, machine: Machine, retractZ: number): void {
  w.out.push('M5')
  move(w, 'G0', { z: retractZ })
  move(w, 'G0', { x: machine.park.x, y: machine.park.y })
  move(w, 'G0', { z: machine.park.z })
  w.out.push('M30', '%')
}

function toolsInOrder(toolpaths: readonly Toolpath[], tools: readonly Tool[]): Tool[] {
  const ids = [...new Set(toolpaths.map((t) => t.toolId))]
  const used = ids.map((id) => {
    const tool = tools.find((t) => t.id === id)
    if (!tool) throw new Error(`Toolpath uses tool "${id}" which is not in the tool table`)
    return tool
  })
  used.forEach((tool, i) => {
    const clash = used.slice(0, i).find((t) => t.number === tool.number)
    if (clash) {
      throw new Error(
        `Tools "${clash.name}" and "${tool.name}" share tool number T${tool.number}; refusing to write an ambiguous program (T${tool.number} M6 would load the same tool for both)`,
      )
    }
  })
  return used
}

export function emitGcode(toolpaths: Toolpath[], machine: Machine, tools: Tool[], options: GcodeOptions): string {
  if (!(machine.safeZ > 0)) throw new Error(`Safe Z must be above the stock (got ${machine.safeZ}); refusing to write G-code`)
  const used = toolsInOrder(toolpaths, tools)
  const retractZ = Math.max(machine.programSafeZ, machine.safeZ)
  const w: Writer = { out: [], pos: { x: null, y: null, z: null }, feed: null }
  header(w, toolpaths, machine, used, options)
  let current: string | null = null
  for (const tp of toolpaths) {
    const tool = used.find((t) => t.id === tp.toolId)
    if (!tool) throw new Error(`Toolpath ${tp.id} uses unknown tool "${tp.toolId}"`)
    if (tool.id !== current) {
      toolChange(w, tool, machine, retractZ)
      current = tool.id
    }
    w.out.push(comment(`${tp.kind} ${tp.id}`))
    tp.passes.forEach((pass) => cutPass(w, pass, tool, machine))
  }
  footer(w, machine, retractZ)
  return `${w.out.join('\n')}\n`
}
