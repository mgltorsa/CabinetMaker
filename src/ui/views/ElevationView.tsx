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
  if (!cabinet) return <p className="p-6 text-sm text-muted-foreground">Select a cabinet to see its {kind} elevation.</p>
  const build = result.build.cabinets.find((b) => b.cabinetId === cabinet.id)
  if (!build) return <p className="p-6 text-sm text-muted-foreground">No build output for “{cabinet.name}”. Check the warnings.</p>
  const make = kind === 'front' ? () => frontElevation(cabinet, build, units) : () => sideElevation(cabinet, build, units)
  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <h2 className="font-mono text-sm text-muted-foreground">
        {cabinet.name} — {kind === 'front' ? 'front elevation' : 'side section'}
      </h2>
      <DrawingView make={make} units={units} label={`${cabinet.name} ${kind} elevation`} className="mx-auto w-full max-w-3xl" />
    </div>
  )
}
