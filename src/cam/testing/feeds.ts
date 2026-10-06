/**
 * Test helper: scan emitted G-code for feed moves that go down faster than
 * the active tool's plunge feed. Independent of `parseGcode` (which does not
 * track F words) and of the emitter's feed logic.
 */
import type { Tool } from '@/core/types'

export interface DownwardFeedViolation {
  /** 1-based source line. */
  line: number
  text: string
  /** Vertical component of the programmed feed (mm/min). */
  verticalFeed: number
  plungeFeed: number
}

/** Relative slack for float noise in the vertical-rate comparison. */
const SLACK = 1e-9

interface ScanState {
  pos: { x: number | null; y: number | null; z: number | null }
  motion: number | null
  feed: number | null
  tool: number | null
}

function word(text: string, letter: string): number | undefined {
  const match = new RegExp(`${letter}(-?\\d+(?:\\.\\d+)?)`).exec(text)
  return match?.[1] === undefined ? undefined : Number(match[1])
}

function violationOf(s: ScanState, to: { x: number; y: number; z: number }, plungeFeed: number): number | null {
  const { x, y, z } = s.pos
  if (x === null || y === null || z === null || s.feed === null) return null
  const dz = to.z - z
  if (!(dz < 0)) return null
  const length = Math.hypot(to.x - x, to.y - y, dz)
  const vertical = (s.feed * -dz) / length
  return vertical > plungeFeed * (1 + SLACK) ? vertical : null
}

/** Every G1 move with a downward Z component whose vertical feed exceeds the active tool's plunge feed. */
export function downwardFeedViolations(gcode: string, tools: readonly Tool[]): DownwardFeedViolation[] {
  const s: ScanState = { pos: { x: null, y: null, z: null }, motion: null, feed: null, tool: null }
  const violations: DownwardFeedViolation[] = []
  gcode.split('\n').forEach((raw, i) => {
    const text = raw.replace(/\([^)]*\)/g, '').trim()
    const toolChange = /^T(\d+) M6$/.exec(text)
    if (toolChange) s.tool = Number(toolChange[1])
    const g = word(text, 'G')
    if (g === 0 || g === 1) s.motion = g
    const f = word(text, 'F')
    if (f !== undefined) s.feed = f
    const target = { x: word(text, 'X') ?? s.pos.x, y: word(text, 'Y') ?? s.pos.y, z: word(text, 'Z') ?? s.pos.z }
    const moved = /[XYZ]-?\d/.test(text)
    if (!moved) return
    const plungeFeed = tools.find((t) => t.number === s.tool)?.plungeFeed
    if (s.motion === 1 && plungeFeed !== undefined && target.x !== null && target.y !== null && target.z !== null) {
      const vertical = violationOf(s, { x: target.x, y: target.y, z: target.z }, plungeFeed)
      if (vertical !== null) violations.push({ line: i + 1, text: raw, verticalFeed: vertical, plungeFeed })
    }
    s.pos = target
  })
  return violations
}
