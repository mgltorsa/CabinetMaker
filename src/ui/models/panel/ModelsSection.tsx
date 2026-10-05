'use client'

import type { Project } from '@/core/types'
import { AssetLibraryCard } from '../../assets/panel/AssetLibraryCard'
import { ModelsCard } from './ModelsCard'
import { PlacementCard } from './PlacementCard'
import { RoomCard } from './RoomCard'

/** 05 Room & Models: room shell, imported models, free cabinet placement, asset library. */
export function ModelsSection({ project }: { project: Project }) {
  return (
    <div className="flex flex-col gap-2">
      <RoomCard project={project} />
      <ModelsCard project={project} />
      <PlacementCard project={project} />
      <AssetLibraryCard project={project} />
    </div>
  )
}
