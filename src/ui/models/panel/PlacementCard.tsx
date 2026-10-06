'use client'

import { AlignHorizontalJustifyStartIcon, RotateCcwIcon } from 'lucide-react'
import type { Project } from '@/core/types'
import { SpecCard } from '../../components/sidebar/SpecCard'
import { LengthInput } from '../../components/fields'
import { Button } from '../../components/ui/button'
import { ROOM_COORD } from '../../lib/limits'
import { runOffsets } from '../../lib/scene'
import { useDesigner } from '../../store'
import { clearCabinetPositions, placeCabinetsAlongBackWall, setCabinetPosition } from '../modelOps'

/** 05·3 Cabinet placement: pin cabinets anywhere in the room, or keep the automatic run. */
export function PlacementCard({ project }: { project: Project }) {
  const editProject = useDesigner((s) => s.editProject)
  const offsets = runOffsets(project.cabinets)
  const placedCount = project.cabinets.filter((c) => c.placement?.position).length
  const units = project.units

  return (
    <SpecCard index="05·3" title="Cabinet placement" summary={placedCount === 0 ? 'Automatic run along the back wall' : `${placedCount} of ${project.cabinets.length} placed freely`}>
      <p className="text-xs text-muted-foreground">
        Cabinets without a position line up along the back wall. Give one an X / Z (its back-left floor corner) to place it anywhere in the room.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => editProject(placeCabinetsAlongBackWall)}>
          <AlignHorizontalJustifyStartIcon /> Place cabinets along back wall
        </Button>
        <Button variant="ghost" size="sm" disabled={placedCount === 0} onClick={() => editProject(clearCabinetPositions)}>
          <RotateCcwIcon /> Back to automatic run
        </Button>
      </div>
      <ul aria-label="Cabinet positions" className="flex flex-col gap-2">
        {project.cabinets.map((cab) => {
          const position = cab.placement?.position ?? { x: offsets.get(cab.id) ?? 0, z: 0 }
          const isPlaced = cab.placement?.position !== undefined
          const commit = (patch: Partial<typeof position>): void => editProject((p) => setCabinetPosition(p, cab.id, { ...position, ...patch }))
          return (
            <li key={cab.id} className="grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] items-end gap-2">
              <span className="truncate pb-2 text-sm">
                {cab.name}
                {!isPlaced && <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">auto</span>}
              </span>
              <LengthInput label={`${cab.name} X`} value={position.x} units={units} min={ROOM_COORD.min} max={ROOM_COORD.max} onCommit={(x) => commit({ x })} />
              <LengthInput label={`${cab.name} Z`} value={position.z} units={units} min={ROOM_COORD.min} max={ROOM_COORD.max} onCommit={(z) => commit({ z })} />
            </li>
          )
        })}
      </ul>
    </SpecCard>
  )
}
