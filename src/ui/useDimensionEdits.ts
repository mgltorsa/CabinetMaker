'use client'

import type { Cabinet, CabinetBuild } from '@/core/types'
import { cabinetDimensionEdits, type DimensionEdits } from './lib/dimensionEdits'
import { useDesigner } from './store'

/** Editable dimensions of `cabinet` wired to the designer store; undefined until it has a build. */
export function useDimensionEdits(cabinet: Cabinet | null, build: CabinetBuild | undefined): DimensionEdits | undefined {
  const project = useDesigner((s) => s.project)
  const updateCabinet = useDesigner((s) => s.updateCabinet)
  const updateConstruction = useDesigner((s) => s.updateConstruction)
  const updateBayHeights = useDesigner((s) => s.updateBayHeights)
  if (!cabinet || !build) return undefined
  return cabinetDimensionEdits(project, cabinet, build, { updateCabinet, updateConstruction, updateBayHeights })
}
