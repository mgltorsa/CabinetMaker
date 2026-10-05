'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import type { Project } from '@/core/types'
import type { PipelineResult } from '@/pipeline'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { cn } from '../lib/cn'
import { dimsLabel } from '../lib/format'
import { buildScene } from '../lib/scene'
import { ModelDropZone } from '../models/ModelDropZone'
import { roomCentreX } from '../models/room'
import { type ViewToggle, useDesigner } from '../store'
import { useDimensionEdits } from '../useDimensionEdits'

// three.js touches `window`/WebGL at import time, so keep it out of the static HTML.
const Viewer3D = dynamic(() => import('./Viewer3D'), {
  ssr: false,
  loading: () => <p className="grid h-full place-items-center text-sm text-muted-foreground">Loading 3D view…</p>,
})

/** The floating "Toggle visibility" pills, in the order shown. */
export const VISIBILITY_TOGGLES: { key: ViewToggle; label: string }[] = [
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'top', label: 'Top' },
  { key: 'doors', label: 'Doors' },
  { key: 'doorsOpen', label: 'Doors open' },
  { key: 'drawerFaces', label: 'Drawer faces' },
  { key: 'drawers', label: 'Drawers' },
  { key: 'drawersOpen', label: 'Drawers open' },
  { key: 'back', label: 'Cabinet back' },
  { key: 'room', label: 'Room' },
  { key: 'models', label: 'Models' },
]

function VisibilityPills() {
  const view = useDesigner((s) => s.view)
  const setViewToggle = useDesigner((s) => s.setViewToggle)
  // Small screens: the pills fold behind their heading so they do not cover the model.
  const [isOpenOnSmall, setIsOpenOnSmall] = useState(false)
  return (
    <div role="group" aria-labelledby="visibility-heading" className="pointer-events-auto flex w-fit flex-col gap-1.5">
      <p id="visibility-heading" className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase max-md:hidden">
        Toggle visibility
      </p>
      <button
        type="button"
        aria-expanded={isOpenOnSmall}
        onClick={() => setIsOpenOnSmall((v) => !v)}
        className="w-fit rounded-md border bg-background/90 px-2.5 py-1 font-mono text-[11px] tracking-wider uppercase shadow-xs md:hidden"
      >
        Toggle visibility {isOpenOnSmall ? '▴' : '▾'}
      </button>
      {VISIBILITY_TOGGLES.map((t) => {
        const isOn = view[t.key]
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={isOn}
            onClick={() => setViewToggle(t.key, !isOn)}
            className={cn(
              'flex h-7 items-center gap-2 rounded-md border px-2.5 text-left text-[13px] shadow-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              !isOpenOnSmall && 'max-md:hidden',
              isOn ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90' : 'border-border bg-background/85 text-muted-foreground hover:bg-background',
            )}
          >
            <span aria-hidden="true" className={cn('size-1.5 rounded-full', isOn ? 'bg-primary-foreground' : 'border border-muted-foreground')} />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

type ThreeViewProps = {
  project: Project
  result: PipelineResult
}

export function ThreeView({ project, result }: ThreeViewProps) {
  const view = useDesigner((s) => s.view)
  const selectedCabinetId = useDesigner((s) => s.selectedCabinetId)
  const selectCabinet = useDesigner((s) => s.selectCabinet)
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null)
  // A shown room fixes the centre, so the room and models stay put while cabinets change.
  const room = view.room && project.room && project.room.walls.length > 0 ? project.room : null
  const centreX = room ? roomCentreX(room) : undefined
  const scene = useMemo(
    () => buildScene(result.build, project.cabinets, view, { units: project.units, selectedCabinetId, materials: project.materials, centreX }),
    [result.build, project.cabinets, view, project.units, selectedCabinetId, project.materials, centreX],
  )
  const selected = project.cabinets.find((c) => c.id === selectedCabinetId) ?? null
  const dimensionEdits = useDimensionEdits(selected, result.build.cabinets.find((b) => b.cabinetId === selectedCabinetId))
  const models = useMemo(() => (view.models ? (project.models ?? []).filter((m) => m.visible) : []), [view.models, project.models])
  const extras = useMemo(() => ({ room, models, centreX: scene.centreX }), [room, models, scene.centreX])
  const isEmpty = scene.meshes.length === 0 && room === null && models.length === 0
  const hovered = hoveredPartId === null ? undefined : result.partsById.get(hoveredPartId)
  const cabinetName = hovered ? project.cabinets.find((c) => c.id === hovered.cabinetId)?.name : undefined

  return (
    <ModelDropZone className="h-full min-h-[420px] w-full">
      <p className="sr-only">
        3D model with {scene.meshes.length} visible parts. Drag to orbit, scroll to zoom; the Front, Side and Joinery views and the cut list give the same
        information as drawings and text.
      </p>
      {isEmpty ? (
        <p className="grid h-full place-items-center text-sm text-muted-foreground">Nothing to show. Add a cabinet or turn parts back on.</p>
      ) : (
        <ErrorBoundary title="The 3D view could not start (WebGL may be unavailable).">
          <Viewer3D
            scene={scene}
            focusKey={selectedCabinetId ?? ''}
            hoveredPartId={hoveredPartId}
            onHover={setHoveredPartId}
            onPick={selectCabinet}
            dimensionEdits={dimensionEdits}
            extras={extras}
          />
        </ErrorBoundary>
      )}
      <div className="pointer-events-none absolute top-14 left-3">
        <VisibilityPills />
      </div>
      <div
        aria-live="polite"
        className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-background/90 px-2.5 py-1.5 font-mono text-xs shadow-xs empty:hidden"
      >
        {hovered && (
          <>
            <strong className="font-semibold">{hovered.name}</strong>
            {cabinetName && <span className="text-muted-foreground"> · {cabinetName}</span>}
            <span className="text-muted-foreground"> · {dimsLabel(hovered, project.units)}</span>
          </>
        )}
      </div>
    </ModelDropZone>
  )
}
