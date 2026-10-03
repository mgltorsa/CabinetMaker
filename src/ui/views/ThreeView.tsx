'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import type { Project } from '@/core/types'
import type { PipelineResult } from '@/pipeline'
import { CheckboxField } from '../components/fields'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { dimsLabel } from '../lib/format'
import { buildScene } from '../lib/scene'
import { type ViewToggle, useDesigner } from '../store'

// three.js touches `window`/WebGL at import time, so keep it out of the static HTML.
const Viewer3D = dynamic(() => import('./Viewer3D'), {
  ssr: false,
  loading: () => <p className="empty">Loading 3D view…</p>,
})

const TOGGLES: { key: ViewToggle; label: string }[] = [
  { key: 'fronts', label: 'Doors & fronts' },
  { key: 'drawerBoxes', label: 'Drawer boxes' },
  { key: 'back', label: 'Back' },
  { key: 'top', label: 'Top / countertop' },
  { key: 'open', label: 'Open drawers' },
]

type ThreeViewProps = {
  project: Project
  result: PipelineResult
}

export function ThreeView({ project, result }: ThreeViewProps) {
  const view = useDesigner((s) => s.view)
  const setViewToggle = useDesigner((s) => s.setViewToggle)
  const selectCabinet = useDesigner((s) => s.selectCabinet)
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null)
  const scene = useMemo(() => buildScene(result.build, project.cabinets, view), [result.build, project.cabinets, view])
  const hovered = hoveredPartId === null ? undefined : result.partsById.get(hoveredPartId)
  const cabinetName = hovered ? project.cabinets.find((c) => c.id === hovered.cabinetId)?.name : undefined

  return (
    <div className="three-view">
      <fieldset className="toggles">
        <legend className="visually-hidden">Show in 3D</legend>
        {TOGGLES.map((t) => (
          <CheckboxField key={t.key} label={t.label} isChecked={view[t.key]} onChange={(v) => setViewToggle(t.key, v)} />
        ))}
      </fieldset>
      <p className="visually-hidden">
        3D model with {scene.meshes.length} visible parts. Drag to orbit, scroll to zoom; the Front, Side and Parts tabs give the same information as text and
        drawings.
      </p>
      <div className="canvas-wrap">
        {scene.meshes.length === 0 ? (
          <p className="empty">Nothing to show. Add a cabinet or turn parts back on.</p>
        ) : (
          <ErrorBoundary title="The 3D view could not start (WebGL may be unavailable).">
            <Viewer3D scene={scene} hoveredPartId={hoveredPartId} onHover={setHoveredPartId} onPick={selectCabinet} />
          </ErrorBoundary>
        )}
        <div className="hover-info" aria-live="polite">
          {hovered && (
            <>
              <strong>{hovered.name}</strong>
              {cabinetName && <span> · {cabinetName}</span>}
              <span> · {dimsLabel(hovered, project.units)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
