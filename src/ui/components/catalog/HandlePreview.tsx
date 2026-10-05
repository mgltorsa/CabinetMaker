import type { ResolvedHandle } from '@/core/handles'
import { HANDLE_STYLE_LABEL } from '../../handleOps'

/** Front shown in the preview: a 400 × 260 mm drawer face, drawn at 0.25 px/mm. */
const PX_PER_MM = 0.25
const FRONT = { x: 10, y: 8, w: 100, h: 65 }
const VIEW_W = 120
const VIEW_H = 81
const MAX_LEN_PX = FRONT.w - 8
const OUTLINE = '#3f3a33'

const px = (mm: number, max = MAX_LEN_PX): number => Math.min(Math.max(mm * PX_PER_MM, 1), max)

function Shape({ handle }: { handle: ResolvedHandle }) {
  const cx = FRONT.x + FRONT.w / 2
  const cy = FRONT.y + FRONT.h / 2
  const fill = handle.color
  const len = px(handle.length)
  const across = px(handle.width, FRONT.h / 2)
  const stroke = { stroke: OUTLINE, strokeWidth: 0.6 }
  switch (handle.style) {
    case 'knob': {
      const r = px(handle.diameter / 2, 12)
      return <circle cx={cx} cy={cy} r={r} fill={fill} {...stroke} />
    }
    case 'cup': {
      const half = len / 2
      const h = across / 2
      return <path d={`M${cx - half} ${cy - h} H${cx + half} V${cy} A${half} ${h} 0 0 1 ${cx - half} ${cy} Z`} fill={fill} {...stroke} />
    }
    case 'edge':
      return <rect x={cx - len / 2} y={FRONT.y - 1.5} width={len} height={across + 1.5} fill={fill} {...stroke} />
    case 'j-profile':
      return <rect x={FRONT.x} y={FRONT.y - 1.5} width={FRONT.w} height={across + 1.5} fill={fill} {...stroke} />
    case 'custom':
      return (
        <g>
          <rect x={cx - len / 2} y={cy - across / 2} width={len} height={across} fill={fill} strokeDasharray="2 1.5" {...stroke} />
          <text x={cx} y={cy + 2.5} textAnchor="middle" fontSize={7} fill={OUTLINE}>
            3D
          </text>
        </g>
      )
    case 'bar': {
      const d = px(handle.diameter, 8)
      const holes = [-1, 1].map((s) => cx + (s * px(handle.centers)) / 2)
      return (
        <g>
          <rect x={cx - len / 2} y={cy - d / 2} width={len} height={d} rx={d / 2} fill={fill} {...stroke} />
          {holes.map((x) => (
            <circle key={x} cx={x} cy={cy} r={0.9} fill={OUTLINE} />
          ))}
        </g>
      )
    }
  }
}

/** Small front view of a handle on a drawer face, to scale, in the handle's colour. */
export function HandlePreview({ handle, className }: { handle: ResolvedHandle; className?: string }) {
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={`Preview: ${HANDLE_STYLE_LABEL[handle.style]}`} className={className}>
      <rect x={FRONT.x} y={FRONT.y} width={FRONT.w} height={FRONT.h} rx={1} fill="#efebe4" stroke="#b9b2a7" strokeWidth={0.6} />
      <Shape handle={handle} />
    </svg>
  )
}
