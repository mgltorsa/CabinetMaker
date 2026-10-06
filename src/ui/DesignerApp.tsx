'use client'

import { useSyncExternalStore } from 'react'
import { Designer } from './Designer'

const subscribeNothing = (): (() => void) => () => {}

/**
 * The designer reads localStorage and random ids on first render, so it only
 * renders in the browser. The static HTML carries a lightweight shell instead,
 * which avoids hydration mismatches.
 */
export function DesignerApp() {
  const isClient = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  )
  if (!isClient) {
    return (
      <div className="app-loading" aria-busy="true">
        <p>Loading designer…</p>
      </div>
    )
  }
  return <Designer />
}
