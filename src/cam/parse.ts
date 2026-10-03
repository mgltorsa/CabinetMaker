/**
 * Minimal G-code reader for round-trip tests and the preview: returns the
 * cutting polylines (runs of consecutive G1 moves, broken by rapids, tool
 * changes and program end) in absolute mm, plus tool changes.
 *
 * Supported: G0/G1 (modal), G17, G20/G21, G90/G91, T/M6, M0–M9/M30, F, S, N,
 * `( … )` and `;` comments, `%`. Arcs (G2/G3) are not interpolated: they are
 * read as straight feeds to their end point and reported as warnings.
 */
import type { Vec3 } from '@/core/types'
import { MM_PER_INCH } from '@/core/units'
import type { ParsedPolyline, ParsedProgram, ParsedToolChange } from './types'

const IGNORED_G = new Set([4, 17, 40, 49, 54, 80, 94])
const PROGRAM_END_M = new Set([2, 30])
const WORD = /([A-Za-z])\s*([+-]?(?:\d+\.?\d*|\.\d+))/g

interface Word {
  letter: string
  value: number
}

interface State {
  pos: { x: number | null; y: number | null; z: number | null }
  motion: 0 | 1 | 2 | 3 | null
  absolute: boolean
  scale: number
  tool: number | null
  pendingTool: number | null
  current: ParsedPolyline | null
}

interface Output {
  polylines: ParsedPolyline[]
  toolChanges: ParsedToolChange[]
  warnings: string[]
}

function stripComments(line: string): string {
  return line.replace(/\([^)]*\)?/g, ' ').split(';')[0] ?? ''
}

function readWords(text: string): { words: Word[]; leftover: string } {
  const words = [...text.matchAll(WORD)].map((m) => ({ letter: (m[1] ?? '').toUpperCase(), value: Number(m[2]) }))
  return { words, leftover: text.replace(WORD, '').replace(/[\s%]/g, '') }
}

function applyG(code: number, s: State, warn: (msg: string) => void): void {
  if (code === 0 || code === 1 || code === 2 || code === 3) {
    s.motion = code
    if (code > 1) warn(`arc G${code} is not supported; read as a straight feed to its end point`)
  } else if (code === 20) s.scale = MM_PER_INCH
  else if (code === 21) s.scale = 1
  else if (code === 90) s.absolute = true
  else if (code === 91) s.absolute = false
  else if (!IGNORED_G.has(code)) warn(`unsupported G${code} ignored`)
}

function applyM(code: number, s: State, out: Output, line: number, warn: (msg: string) => void): void {
  if (code === 6) {
    if (s.pendingTool === null) {
      warn('M6 without a T word ignored')
      return
    }
    s.tool = s.pendingTool
    s.current = null
    out.toolChanges.push({ tool: s.tool, line })
  } else if (PROGRAM_END_M.has(code)) s.current = null
}

function axisTarget(s: State, axis: 'x' | 'y' | 'z', word: Word | undefined): number | null {
  const from = s.pos[axis]
  if (!word) return from
  const v = word.value * s.scale
  return s.absolute ? v : (from ?? 0) + v
}

function applyMotion(words: readonly Word[], s: State, out: Output, warn: (msg: string) => void): void {
  const find = (l: string): Word | undefined => words.find((w) => w.letter === l)
  const x = find('X')
  const y = find('Y')
  const z = find('Z')
  if (!x && !y && !z) return
  if (s.motion === null) {
    warn('motion without an active G0/G1 ignored')
    return
  }
  s.pos = { x: axisTarget(s, 'x', x), y: axisTarget(s, 'y', y), z: axisTarget(s, 'z', z) }
  if (s.motion === 0) {
    s.current = null
    return
  }
  if (s.pos.x === null || s.pos.y === null || s.pos.z === null) warn('feed from an unknown position; missing axes read as 0')
  const point: Vec3 = { x: s.pos.x ?? 0, y: s.pos.y ?? 0, z: s.pos.z ?? 0 }
  if (!s.current) {
    s.current = { tool: s.tool, points: [] }
    out.polylines.push(s.current)
  }
  s.current.points.push(point)
}

export function parseGcode(text: string): ParsedProgram {
  const out: Output = { polylines: [], toolChanges: [], warnings: [] }
  const s: State = {
    pos: { x: null, y: null, z: null },
    motion: null,
    absolute: true,
    scale: 1,
    tool: null,
    pendingTool: null,
    current: null,
  }
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1
    const warn = (msg: string): void => {
      out.warnings.push(`line ${line}: ${msg}`)
    }
    const { words, leftover } = readWords(stripComments(raw))
    if (leftover.length > 0) {
      warn(`cannot parse "${leftover}"; line ignored`)
      return
    }
    words.filter((w) => w.letter === 'G').forEach((w) => applyG(w.value, s, warn))
    words.filter((w) => w.letter === 'T').forEach((w) => {
      s.pendingTool = w.value
    })
    applyMotion(words, s, out, warn)
    words.filter((w) => w.letter === 'M').forEach((w) => applyM(w.value, s, out, line, warn))
  })
  return out
}
