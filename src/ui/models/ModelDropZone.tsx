'use client'

import { type DragEvent, type ReactNode, useRef, useState } from 'react'
import { cn } from '../lib/cn'
import { useDesigner } from '../store'
import { GIZMO_MODES, useModelUi } from './modelUi'
import { importModelFiles } from './modelImport'

const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer.types).includes('Files')

/** Move / Rotate / Scale for the selected model, over the 3D view. */
function GizmoToolbar() {
  const selectedModelId = useModelUi((s) => s.selectedModelId)
  const mode = useModelUi((s) => s.gizmoMode)
  const setMode = useModelUi((s) => s.setGizmoMode)
  const select = useModelUi((s) => s.selectModel)
  // The selection can outlive its model (project replaced); then there is nothing to transform.
  const exists = useDesigner((s) => selectedModelId !== null && (s.project.models ?? []).some((m) => m.id === selectedModelId && m.visible))
  if (!exists) return null
  return (
    <div role="toolbar" aria-label="Model gizmo" className="pointer-events-auto absolute top-3 right-3 z-10 flex gap-1 rounded-md border bg-background/90 p-1 shadow-xs">
      {GIZMO_MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          aria-pressed={mode === m.value}
          onClick={() => setMode(m.value)}
          className={cn(
            'h-7 rounded-sm px-2.5 text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            mode === m.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
          )}
        >
          {m.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => select(null)}
        className="h-7 rounded-sm px-2.5 text-[13px] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        Done
      </button>
    </div>
  )
}

type ModelDropZoneProps = { className?: string; children: ReactNode }

/** Wraps the 3D view: drop GLB / glTF / OBJ / STL files to import them as models. */
export function ModelDropZone({ className, children }: ModelDropZoneProps) {
  const [isOver, setIsOver] = useState(false)
  // dragenter/dragleave fire for every child; count them so the highlight does not flicker.
  const depth = useRef(0)

  const handleEnter = (e: DragEvent<HTMLDivElement>): void => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth.current += 1
    setIsOver(true)
  }
  const handleOver = (e: DragEvent<HTMLDivElement>): void => {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const handleLeave = (e: DragEvent<HTMLDivElement>): void => {
    if (!hasFiles(e)) return
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setIsOver(false)
  }
  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth.current = 0
    setIsOver(false)
    void importModelFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <div className={cn('relative', className)} onDragEnter={handleEnter} onDragOver={handleOver} onDragLeave={handleLeave} onDrop={handleDrop}>
      {children}
      <GizmoToolbar />
      {isOver && (
        <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-background/70 text-sm font-medium">
          Drop GLB, glTF, OBJ or STL to add it to the room
        </div>
      )}
    </div>
  )
}
