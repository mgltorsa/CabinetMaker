'use client'

import type { Cabinet, UnitSystem } from '@/core/types'
import { frontElevation, sideElevation } from '@/drawings'
import type { PipelineResult } from '@/pipeline'
import { DrawingView } from '../components/DrawingView'

type ElevationViewProps = {
  kind: 'front' | 'side'
  cabinet: Cabinet | null
  result: PipelineResult
  units: UnitSystem
}

export function ElevationView({ kind, cabinet, result, units }: ElevationViewProps) {
  if (!cabinet) return <p className="empty">Select a cabinet to see its {kind} elevation.</p>
  const build = result.build.cabinets.find((b) => b.cabinetId === cabinet.id)
  if (!build) return <p className="empty">No build output for “{cabinet.name}”. Check the warnings below.</p>
  const make = kind === 'front' ? () => frontElevation(cabinet, build, units) : () => sideElevation(cabinet, build, units)
  return (
    <div className="view-pad">
      <h3 className="view-title">
        {cabinet.name} — {kind} elevation
      </h3>
      <DrawingView make={make} units={units} label={`${cabinet.name} ${kind} elevation`} />
    </div>
  )
}
