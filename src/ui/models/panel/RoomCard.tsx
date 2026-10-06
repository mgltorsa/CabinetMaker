'use client'

import { DoorOpenIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import type { Project, Room, WallOpening } from '@/core/types'
import { CardCaption, SpecCard } from '../../components/sidebar/SpecCard'
import { FieldGrid, LengthInput, SelectField } from '../../components/fields'
import { Button } from '../../components/ui/button'
import { lengthLabel } from '../../lib/format'
import { ROOM_HEIGHT, ROOM_SIZE, WALL_THICKNESS } from '../../lib/limits'
import { useDesigner } from '../../store'
import { addOpening, type OpeningPatch, removeOpening, setRoom, updateOpening } from '../modelOps'
import { BACK_WALL_ID, DEFAULT_ROOM, rectangularRoom, rectRoomParams, type RectRoomParams } from '../room'

const WALL_LABELS: Record<string, string> = { 'wall-back': 'Back wall', 'wall-right': 'Right wall', 'wall-front': 'Front wall', 'wall-left': 'Left wall' }
const wallLabel = (id: string): string => WALL_LABELS[id] ?? id

const PARAM_FIELDS: { key: keyof RectRoomParams; label: string; min: number; max: number }[] = [
  { key: 'width', label: 'Room width', ...ROOM_SIZE },
  { key: 'depth', label: 'Room depth', ...ROOM_SIZE },
  { key: 'height', label: 'Wall height', ...ROOM_HEIGHT },
  { key: 'thickness', label: 'Wall thickness', ...WALL_THICKNESS },
]

function OpeningEditor({ opening, room, units, onChange, onRemove }: {
  opening: WallOpening
  room: Room
  units: Project['units']
  onChange: (patch: OpeningPatch) => void
  onRemove: () => void
}) {
  const kind = opening.kind === 'door' ? 'Door' : 'Window'
  return (
    <li className="flex flex-col gap-2 rounded-md border bg-background/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium tracking-wide uppercase">{kind}</span>
        <Button variant="ghost" size="sm" aria-label={`Remove ${kind.toLowerCase()} on ${wallLabel(opening.wallId)}`} onClick={onRemove}>
          <Trash2Icon />
        </Button>
      </div>
      <FieldGrid>
        <SelectField
          label={`${kind} wall`}
          value={opening.wallId}
          options={room.walls.map((w) => ({ value: w.id, label: wallLabel(w.id) }))}
          onChange={(wallId) => onChange({ wallId })}
        />
        <LengthInput label={`${kind} offset`} value={opening.offset} units={units} onCommit={(offset) => onChange({ offset })} />
        <LengthInput label={`${kind} width`} value={opening.width} units={units} min={1} onCommit={(width) => onChange({ width })} />
        <LengthInput label={`${kind} height`} value={opening.height} units={units} min={1} onCommit={(height) => onChange({ height })} />
        {opening.kind === 'window' && (
          <LengthInput label="Sill height" value={opening.sillHeight} units={units} onCommit={(sillHeight) => onChange({ sillHeight })} />
        )}
      </FieldGrid>
    </li>
  )
}

/** 05·1 Room: rectangular room builder plus door / window openings. */
export function RoomCard({ project }: { project: Project }) {
  const editProject = useDesigner((s) => s.editProject)
  const [draft, setDraft] = useState<RectRoomParams>(DEFAULT_ROOM)
  const room = project.room
  const params = room ? rectRoomParams(room) : null
  const units = project.units
  const shown = params ?? draft

  const commitParam = (key: keyof RectRoomParams, value: number): void => {
    const next = { ...shown, [key]: value }
    if (room && params) editProject((p) => setRoom(p, rectangularRoom(next, room.openings)))
    else setDraft(next)
  }

  const summary = room
    ? params
      ? `${lengthLabel(params.width, units)} × ${lengthLabel(params.depth, units)} · ${room.openings.length} openings`
      : `Custom room · ${room.walls.length} walls`
    : 'No room · single back wall'

  return (
    <SpecCard index="05·1" title="Room" summary={summary} defaultOpen>
      {(!room || params) && (
        <FieldGrid>
          {PARAM_FIELDS.map((f) => (
            <LengthInput key={f.key} label={f.label} value={shown[f.key]} units={units} min={f.min} max={f.max} onCommit={(v) => commitParam(f.key, v)} />
          ))}
        </FieldGrid>
      )}
      {room ? (
        <>
          <CardCaption className="mt-1">Doors & windows</CardCaption>
          {room.openings.length > 0 && (
            <ul className="flex flex-col gap-2">
              {room.openings.map((o) => (
                <OpeningEditor
                  key={o.id}
                  opening={o}
                  room={room}
                  units={units}
                  onChange={(patch) => editProject((p) => updateOpening(p, o.id, patch))}
                  onRemove={() => editProject((p) => removeOpening(p, o.id))}
                />
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => editProject((p) => addOpening(p, BACK_WALL_ID, 'door'))} disabled={!room.walls.some((w) => w.id === BACK_WALL_ID)}>
              <DoorOpenIcon /> Add door
            </Button>
            <Button variant="outline" size="sm" onClick={() => editProject((p) => addOpening(p, BACK_WALL_ID, 'window'))} disabled={!room.walls.some((w) => w.id === BACK_WALL_ID)}>
              <PlusIcon /> Add window
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => editProject((p) => setRoom(p, null))}>
              <Trash2Icon /> Remove room
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Four walls around the cabinet run; the back-left inside corner is where the run starts.</p>
          <Button size="sm" onClick={() => editProject((p) => setRoom(p, rectangularRoom(draft)))}>
            Build room
          </Button>
        </>
      )}
    </SpecCard>
  )
}
