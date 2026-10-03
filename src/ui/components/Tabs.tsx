'use client'

import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface TabDef<T extends string> {
  id: T
  label: string
}

type TabsProps<T extends string> = {
  label: string
  tabs: readonly TabDef<T>[]
  active: T
  onChange: (id: T) => void
  /** Content of a panel; only the active panel's content is mounted. */
  renderPanel: (id: T) => ReactNode
}

const tabId = (id: string): string => `tab-${id}`
const panelId = (id: string): string => `panel-${id}`

/** WAI-ARIA tabs with automatic activation and roving tabindex. */
export function Tabs<T extends string>({ label, tabs, active, onChange, renderPanel }: TabsProps<T>) {
  const buttons = useRef(new Map<T, HTMLButtonElement>())

  const focusTab = (id: T): void => {
    onChange(id)
    buttons.current.get(id)?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const index = tabs.findIndex((t) => t.id === active)
    const last = tabs.length - 1
    const target =
      e.key === 'ArrowRight' ? (index >= last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index <= 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null
    if (target === null) return
    const next = tabs[target]
    if (!next) return
    e.preventDefault()
    focusTab(next.id)
  }

  return (
    <div className="tabs">
      <div role="tablist" aria-label={label} className="tablist" onKeyDown={handleKeyDown}>
        {tabs.map((t) => {
          const isActive = t.id === active
          return (
            <button
              key={t.id}
              ref={(el) => {
                if (el) buttons.current.set(t.id, el)
                else buttons.current.delete(t.id)
              }}
              type="button"
              role="tab"
              id={tabId(t.id)}
              aria-selected={isActive}
              aria-controls={panelId(t.id)}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(t.id)}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      {tabs.map((t) => {
        const isActive = t.id === active
        return (
          <div key={t.id} role="tabpanel" id={panelId(t.id)} aria-labelledby={tabId(t.id)} tabIndex={0} hidden={!isActive} className="tabpanel">
            {isActive && renderPanel(t.id)}
          </div>
        )
      })}
    </div>
  )
}
