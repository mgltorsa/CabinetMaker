'use client'

import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import type { HardwareKind, Id, Project } from '@/core/types'
import { canAddHardware, HARDWARE_KIND_LABEL } from '../../costOps'
import { MAX_CATALOG_ITEMS } from '../../lib/limits'
import { useDesigner } from '../../store'
import { SelectField, type SelectOption } from '../fields'
import { SpecCard } from '../sidebar/SpecCard'
import { Button } from '../ui/button'
import { HandlesArea } from './HandlesArea'
import { HARDWARE_KINDS, HardwareItemEditor } from './HardwareItemEditor'

type KindFilter = HardwareKind | 'all'

/** Kind a new item gets when the list shows every kind. */
const DEFAULT_NEW_KIND: HardwareKind = 'other'

function filterOptions(project: Project): SelectOption<KindFilter>[] {
  const count = (kind: HardwareKind): number => project.hardware.filter((h) => h.kind === kind).length
  return [
    { value: 'all', label: `All kinds (${project.hardware.length})` },
    ...HARDWARE_KINDS.map((k) => ({ value: k, label: `${HARDWARE_KIND_LABEL[k]} (${count(k)})` })),
  ]
}

/** The project's hardware catalog: every item the estimate prices and the engine picks from. */
export function HardwareCatalog({ project }: { project: Project }) {
  const add = useDesigner((s) => s.addHardwareItem)
  const [filter, setFilter] = useState<KindFilter>('all')
  const [addedId, setAddedId] = useState<Id | null>(null)
  const showsHandles = filter === 'all' || filter === 'pull'
  // Pulls are listed in the Handles area; the plain list holds everything else.
  const items = filter === 'all' ? project.hardware.filter((h) => h.kind !== 'pull') : filter === 'pull' ? [] : project.hardware.filter((h) => h.kind === filter)
  const newKind = filter === 'all' ? DEFAULT_NEW_KIND : filter
  const isFull = !canAddHardware(project)

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <SelectField label="Show" value={filter} options={filterOptions(project)} onChange={setFilter} />
        <Button variant="outline" size="sm" disabled={isFull} onClick={() => setAddedId(add(newKind))}>
          <PlusIcon /> {filter === 'all' ? 'Add item' : `Add ${HARDWARE_KIND_LABEL[filter].toLowerCase()}`}
        </Button>
      </div>
      {isFull && <p className="text-xs text-muted-foreground">The catalog holds at most {MAX_CATALOG_ITEMS} items.</p>}
      {showsHandles && <HandlesArea project={project} openId={addedId} onCreated={setAddedId} />}
      {filter === 'pull' ? null : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No items of this kind.</p>
      ) : (
        <ul aria-label="Hardware items" className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <HardwareItemEditor item={item} project={project} isOpen={item.id === addedId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 02·5 Hardware catalog card. */
export function HardwareCatalogCard({ project }: { project: Project }) {
  const kinds = new Set(project.hardware.map((h) => h.kind)).size
  return (
    <SpecCard index="02·5" title="Hardware catalog" summary={`${project.hardware.length} items · ${kinds} kinds`}>
      <p className="text-xs text-muted-foreground">Unit costs drive the estimate. Verify prices and part numbers with your supplier.</p>
      <HardwareCatalog project={project} />
    </SpecCard>
  )
}
