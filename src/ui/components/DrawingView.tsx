'use client'

import type { Drawing, UnitSystem } from '@/core/types'
import { renderSvg } from '@/drawings'
import { cn } from '../lib/cn'
import { errorMessage } from '../toast'

type RenderOutcome = { kind: 'svg'; svg: string; title: string } | { kind: 'empty'; title: string } | { kind: 'error'; message: string }

function renderSafely(make: () => Drawing, units: UnitSystem, widthPx: number | undefined): RenderOutcome {
  try {
    const drawing = make()
    if (drawing.shapes.length === 0) return { kind: 'empty', title: drawing.title }
    return { kind: 'svg', svg: renderSvg(drawing, { units, widthPx }), title: drawing.title }
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
}

/** Renders a neutral `Drawing` through the drawings module's SVG renderer, on a paper card. */
export function DrawingView({ make, units, widthPx, label, className }: DrawingViewProps) {
  const outcome = renderSafely(make, units, widthPx)
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
  return (
    <figure className={cn('rounded-md border bg-white p-4 shadow-xs', className)}>
      {/*
        Safe: the SVG string comes from our own drawings module (`renderSvg`),
        which builds markup from the numeric Drawing model and escapes every
        text node (part and cabinet names are user input). If that renderer ever
        stops escaping text, this becomes an XSS sink.
      */}
      <div className="drawing-svg mx-auto h-full" role="img" aria-label={label ?? outcome.title} dangerouslySetInnerHTML={{ __html: outcome.svg }} />
    </figure>
  )
}
