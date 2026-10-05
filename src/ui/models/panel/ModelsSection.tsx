'use client'

import type { Project } from '@/core/types'
import { ModelsCard } from './ModelsCard'
import { PlacementCard } from './PlacementCard'
import { RoomCard } from './RoomCard'

/** 05 Room & Models: room shell, imported models, free cabinet placement. */
export function ModelsSection({ project }: { project: Project }) {
  return (
    <div className="flex flex-col gap-2">
      <RoomCard project={project} />
      <ModelsCard project={project} />
      <PlacementCard project={project} />
    </div>
  )
}
