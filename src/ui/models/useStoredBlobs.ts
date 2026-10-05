'use client'

import { useCallback, useEffect, useState } from 'react'
import { getBlobStore } from './blobStore'
import { useModelUi } from './modelUi'

export interface StoredBlobs {
  /** Ids in this browser's model store; `null` until read. */
  ids: ReadonlySet<string> | null
  refresh: () => void
}

/** Which model files this browser holds (re-read when models change or files arrive). */
export function useStoredBlobs(dependencyKey: string): StoredBlobs {
  const epoch = useModelUi((s) => s.blobEpoch)
  const [ids, setIds] = useState<ReadonlySet<string> | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let isCurrent = true
    getBlobStore()
      .keys()
      .then(
        (keys) => {
          if (isCurrent) setIds(new Set(keys))
        },
        () => {
          if (isCurrent) setIds(new Set())
        },
      )
    return () => {
      isCurrent = false
    }
  }, [dependencyKey, epoch, tick])
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  return { ids, refresh }
}
