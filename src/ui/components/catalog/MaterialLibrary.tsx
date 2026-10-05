'use client'

import { PlusIcon } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import type { Id, Material, Project } from '@/core/types'
import { MAX_CATALOG_ITEMS } from '../../lib/limits'
import { librarySummary } from '../../lib/materials'
import { useDesigner } from '../../store'
import { SpecCard } from '../sidebar/SpecCard'
import { Button } from '../ui/button'
import { MaterialRow } from './MaterialRow'

const GROUPS: { kind: Material['kind']; title: string; addLabel: string }[] = [
  { kind: 'sheet', title: 'Sheet goods', addLabel: 'Add sheet material' },
  { kind: 'linear', title: 'Linear stock', addLabel: 'Add linear stock' },
]

/** 02·4 Material library: the project's materials, which every material select offers. */
export function MaterialLibrary({ project }: { project: Project }) {
  return (
    <SpecCard index="02·4" title="Material library" summary={librarySummary(project.materials)}>
      <MaterialList project={project} />
      <p className="text-xs text-muted-foreground">Parts take their thickness from the material, so edits here flow into every drawing, the cut plan and the estimate.</p>
    </SpecCard>
  )
}

/** Materials grouped by kind; a newly added or duplicated material opens for editing. */
export function MaterialList({ project }: { project: Project }) {
  const addMaterial = useDesigner((s) => s.addMaterial)
  const [openId, setOpenId] = useState<Id | null>(null)
  const isFull = project.materials.length >= MAX_CATALOG_ITEMS

  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map((group) => (
        <MaterialGroup key={group.kind} title={group.title}>
          {project.materials
            .filter((m) => m.kind === group.kind)
            .map((m) => (
              <MaterialRow key={m.id} project={project} material={m} defaultOpen={m.id === openId} onAdded={setOpenId} />
            ))}
          <Button variant="outline" size="sm" className="self-start" disabled={isFull} onClick={() => setOpenId(addMaterial(group.kind))}>
            <PlusIcon aria-hidden="true" /> {group.addLabel}
          </Button>
        </MaterialGroup>
      ))}
    </div>
  )
}

function MaterialGroup({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}
