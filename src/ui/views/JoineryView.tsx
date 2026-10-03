'use client'

import { useState } from 'react'
import type { Cabinet, Part, PartGroup, Project } from '@/core/types'
import { panelDetail } from '@/drawings'
import type { PipelineResult } from '@/pipeline'
import { DrawingView } from '../components/DrawingView'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/cn'
import { materialName } from '../lib/format'

const JOINERY_GROUPS: readonly PartGroup[] = ['carcass', 'divider', 'stretcher', 'back', 'shelf', 'drawer-box', 'face-frame', 'toe-kick']

function opSummary(part: Part): string {
  const counts = new Map<string, number>()
  for (const op of part.ops) counts.set(op.purpose, (counts.get(op.purpose) ?? 0) + 1)
  return [...counts.entries()].map(([purpose, n]) => `${n} ${purpose}`).join(' · ') || 'no machining'
}

type JoineryViewProps = { project: Project; cabinet: Cabinet | null; result: PipelineResult }

/** Joinery: every structural panel of the cabinet with its grooves, bores and mortises. */
export function JoineryView({ project, cabinet, result }: JoineryViewProps) {
  const parts = result.build.parts.filter((p) => p.cabinetId === cabinet?.id && JOINERY_GROUPS.includes(p.group))
  const [chosenId, setChosenId] = useState<string | null>(null)
  const chosen = parts.find((p) => p.id === chosenId) ?? parts.find((p) => p.ops.length > 0) ?? parts[0]
  if (!cabinet || !chosen) return <p className="p-6 text-sm text-muted-foreground">No panels to show.</p>
  const joinery = cabinet.construction.joinery

  return (
    <div className="flex h-full min-h-0 gap-4 p-6 max-lg:flex-col">
      <nav aria-label="Panels" className="flex shrink-0 flex-col gap-1 overflow-y-auto lg:w-64">
        <p className="mb-1 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
          Panels · <span className="normal-case">{joinery === 'none' ? 'screwed' : joinery}</span>
        </p>
        {parts.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={p.id === chosen.id}
            onClick={() => setChosenId(p.id)}
            className={cn(
              'flex flex-col items-start rounded-md border px-2.5 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
              p.id === chosen.id ? 'border-primary bg-primary/10' : 'border-transparent',
            )}
          >
            <span className="text-sm font-medium">{p.name}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{opSummary(p)}</span>
          </button>
        ))}
      </nav>
      <section aria-labelledby="joinery-panel" className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="joinery-panel" className="font-mono text-sm font-semibold">
            {chosen.name}
          </h2>
          <Badge variant="outline">{materialName(project, chosen.materialId)}</Badge>
          <Badge variant="secondary">{chosen.ops.length} ops</Badge>
        </div>
        <DrawingView
          make={() => panelDetail(chosen, project.units, { materialName: materialName(project, chosen.materialId) })}
          units={project.units}
          label={`${chosen.name} joinery detail`}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">Solid lines are machined from face A on the CNC; dashed operations are on face B or an edge and are done by hand.</p>
      </section>
    </div>
  )
}
