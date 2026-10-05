'use client'

import type { Drawing, UnitSystem } from '@/core/types'
import { editableAnchors, renderSvg, type LabelAnchor } from '@/drawings'
import { cn } from '../lib/cn'
import type { DimensionEdits } from '../lib/dimensionEdits'
import { errorMessage } from '../toast'
import { EditableDimension } from './EditableDimension'

type RenderOutcome =
  | { kind: 'svg'; svg: string; title: string; anchors: LabelAnchor[] }
  | { kind: 'empty'; title: string }
  | { kind: 'error'; message: string }

function renderSafely(make: () => Drawing, units: UnitSystem, widthPx: number | undefined, withAnchors: boolean): RenderOutcome {
  try {
    const drawing = make()
    if (drawing.shapes.length === 0) return { kind: 'empty', title: drawing.title }
    const anchors = withAnchors ? editableAnchors(drawing, { units }) : []
    return { kind: 'svg', svg: renderSvg(drawing, { units, widthPx }), title: drawing.title, anchors }
  } catch (error: unknown) {
    return { kind: 'error', message: errorMessage(error) }
  }
}

type DrawingViewProps = {
  /** Builds the drawing; errors are caught and shown in place. */
  make: () => Drawing
  units: UnitSystem
  widthPx?: number
  /** Accessible name; defaults to the drawing title. */
  label?: string
  className?: string
  /** Dimensions (by drawing dim id) that can be edited in place; drawn labels without an entry stay read-only. */
  editable?: DimensionEdits
}

/** Share of the label box added around it so the hit area covers the drawn text comfortably. */
const HIT_PAD = 1.25

/** Buttons laid over the drawn labels of editable dimensions (percentages of the SVG box, which keeps the viewBox aspect). */
function DimensionOverlay({ anchors, edits, title }: { anchors: readonly LabelAnchor[]; edits: DimensionEdits; title: string }) {
  const shown = anchors.flatMap((a) => {
    const edit = edits[a.id]
    return edit ? [{ anchor: a, edit }] : []
  })
  if (shown.length === 0) return null
  return (
    <div role="group" aria-label={`Edit dimensions of ${title}`} className="pointer-events-none absolute inset-0">
      {shown.map(({ anchor: a, edit }) => {
        const at = { left: `${a.box.cx * 100}%`, top: `${a.box.cy * 100}%` }
        return (
          <EditableDimension
            key={a.id}
            edit={edit}
            className="pointer-events-auto absolute min-h-6 min-w-6 rounded-sm bg-transparent transition-colors hover:bg-primary/12 hover:ring-1 hover:ring-primary/50"
            style={{
              ...at,
              width: `${a.box.w * HIT_PAD * 100}%`,
              height: `${a.box.h * HIT_PAD * 100}%`,
              transform: `translate(-50%, -50%) rotate(${a.rotation}deg)`,
            }}
            editorClassName="pointer-events-auto absolute z-10 -translate-x-1/2 -translate-y-1/2"
            editorStyle={at}
          />
        )
      })}
    </div>
  )
}

/** Renders a neutral `Drawing` through the drawings module's SVG renderer, on a paper card. */
export function DrawingView({ make, units, widthPx, label, className, editable }: DrawingViewProps) {
  const outcome = renderSafely(make, units, widthPx, editable !== undefined)
  if (outcome.kind === 'error') {
    return (
      <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/8 p-3 text-sm text-destructive">
        <strong>Drawing failed</strong>
        <p>{outcome.message}</p>
      </div>
    )
  }
  if (outcome.kind === 'empty') {
    return <p className="text-sm text-muted-foreground">No drawing content for “{outcome.title}” yet.</p>
  }
  /*
    Safe: the SVG string comes from our own drawings module (`renderSvg`),
    which builds markup from the numeric Drawing model and escapes every
    text node (part and cabinet names are user input). If that renderer ever
    stops escaping text, this becomes an XSS sink.
  */
  const svg = <div className="drawing-svg mx-auto h-full" role="img" aria-label={label ?? outcome.title} dangerouslySetInnerHTML={{ __html: outcome.svg }} />
  return (
    <figure className={cn('rounded-md border bg-white p-4 shadow-xs', className)}>
      {editable === undefined ? (
        svg
      ) : (
        // The overlay maps viewBox fractions to percentages, so the SVG must keep its aspect ratio (no max-height letterboxing).
        <div className="relative [&_svg]:max-h-none">
          {svg}
          <DimensionOverlay anchors={outcome.anchors} edits={editable} title={label ?? outcome.title} />
        </div>
      )}
    </figure>
  )
}
