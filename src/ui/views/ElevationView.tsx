'use client'

import type { Cabinet, HardwareItem, UnitSystem } from '@/core/types'
import { frontElevation, sideElevation } from '@/drawings'
import type { PipelineResult } from '@/pipeline'
import { DrawingView } from '../components/DrawingView'
import { useDimensionEdits } from '../useDimensionEdits'

type ElevationViewProps = {
  kind: 'front' | 'side'
  cabinet: Cabinet | null
  result: PipelineResult
  units: UnitSystem
  /** Project hardware catalog: pulls are drawn in their handle style. */
  hardware?: readonly HardwareItem[]
}

export function ElevationView({ kind, cabinet, result, units, hardware }: ElevationViewProps) {
  const build = cabinet ? result.build.cabinets.find((b) => b.cabinetId === cabinet.id) : undefined
  const edits = useDimensionEdits(cabinet, build)
  if (!cabinet) return <p className="p-6 text-sm text-muted-foreground">Select a cabinet to see its {kind} elevation.</p>
  if (!build) return <p className="p-6 text-sm text-muted-foreground">No build output for “{cabinet.name}”. Check the warnings.</p>
  const make = kind === 'front' ? () => frontElevation(cabinet, build, units, { hardware }) : () => sideElevation(cabinet, build, units)
  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <h2 className="font-mono text-sm text-muted-foreground">
        {cabinet.name} — {kind === 'front' ? 'front elevation' : 'side section'}
      </h2>
      <p className="text-xs text-muted-foreground">Select a dimension to change it.</p>
      <DrawingView make={make} units={units} label={`${cabinet.name} ${kind} elevation`} className="mx-auto w-full max-w-3xl" editable={edits} />
    </div>
  )
}
