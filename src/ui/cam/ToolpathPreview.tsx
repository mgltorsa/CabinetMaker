'use client'

import type { Part, Polyline3, Sheet, Tool, Toolpath, ToolpathKind } from '@/core/types'

export const TOOLPATH_COLORS: Record<ToolpathKind, string> = {
  profile: '#1d5fa8',
  dado: '#c26a00',
  pocket: '#7a3fb8',
  drill: '#c22b2b',
}

/** A pass whose points all share one XY is a plunge (drill) rather than a path. */
function isPlunge(pass: Polyline3): boolean {
  const first = pass[0]
  return first !== undefined && pass.every((p) => p.x === first.x && p.y === first.y)
}

type PassProps = { pass: Polyline3; color: string; radius: number }

function Pass({ pass, color, radius }: PassProps) {
  const first = pass[0]
  if (!first) return null
  if (isPlunge(pass)) return <circle cx={first.x} cy={first.y} r={radius} fill={color} fillOpacity={0.35} stroke={color} vectorEffect="non-scaling-stroke" />
  const points = pass.map((p) => `${p.x},${p.y}`).join(' ')
  return <polyline points={points} fill="none" stroke={color} strokeWidth={1.25} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
}

type ToolpathPreviewProps = {
  sheet: Sheet
  toolpaths: readonly Toolpath[]
  partsById: ReadonlyMap<string, Part>
  tools: readonly Tool[]
  title: string
}

/** Plan view of the sheet (origin front-left, +Y away from the operator). Rapids are not drawn. */
export function ToolpathPreview({ sheet, toolpaths, partsById, tools, title }: ToolpathPreviewProps) {
  const toolRadius = (toolId: string): number => (tools.find((t) => t.id === toolId)?.diameter ?? 6) / 2
  const kinds = [...new Set(toolpaths.map((t) => t.kind))]

  return (
    <figure className="toolpath-preview">
      <svg viewBox={`0 0 ${sheet.length} ${sheet.width}`} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
        <title>{title}</title>
        {/* Flip Y so the sheet origin sits bottom-left like the machine. */}
        <g transform={`translate(0 ${sheet.width}) scale(1 -1)`}>
          <rect x={0} y={0} width={sheet.length} height={sheet.width} className="sheet-stock" vectorEffect="non-scaling-stroke" />
          {sheet.placements.map((pl) => (
            <rect key={pl.partId} x={pl.x} y={pl.y} width={pl.sizeX} height={pl.sizeY} className="sheet-part" vectorEffect="non-scaling-stroke">
              <title>{partsById.get(pl.partId)?.name ?? pl.partId}</title>
            </rect>
          ))}
          {toolpaths.map((tp) => (
            <g key={tp.id}>
              {tp.passes.map((pass, i) => (
                // Passes have no id; their order within a toolpath is stable.
                <Pass key={i} pass={pass} color={TOOLPATH_COLORS[tp.kind]} radius={toolRadius(tp.toolId)} />
              ))}
            </g>
          ))}
        </g>
      </svg>
      {kinds.length > 0 && (
        <figcaption className="legend">
          {kinds.map((k) => (
            <span key={k} className="legend-item">
              <span className="swatch" style={{ background: TOOLPATH_COLORS[k] }} aria-hidden="true" />
              {k}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  )
}
