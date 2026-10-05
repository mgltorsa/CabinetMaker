'use client'

import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import type { Mm, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'
import { cn } from '../lib/cn'
import type { DimensionEdit } from '../lib/dimensionEdits'
import { parseLengthField } from '../lib/fieldParse'
import { unitSuffix } from '../lib/format'

/** A length as a screen reader should say it: "600 mm", "23 5/8 in". */
export function spokenLength(mm: Mm, units: UnitSystem): string {
  const text = formatLength(mm, units)
  return units === 'metric' ? `${text} mm` : `${text.replace(/"$/, '')} in`
}

type EditableDimensionProps = {
  edit: DimensionEdit
  /** Visible content of the idle button (e.g. the label); none for an overlay on a drawn label. */
  children?: ReactNode
  /** Idle button classes and style (position, size, look). */
  className?: string
  style?: CSSProperties
  /** Open editor wrapper classes and style (position). */
  editorClassName?: string
  editorStyle?: CSSProperties
}

/**
 * A dimension label that turns into a unit-aware input: click, Enter or Space
 * opens it; Enter or leaving the field commits a valid value through
 * `edit.onCommit`; Escape cancels. Invalid text, or a value the model cannot
 * take, shows an inline error and is not committed.
 */
export function EditableDimension({ edit, children, className, style, editorClassName, editorStyle }: EditableDimensionProps) {
  const { name, value, units, min, max } = edit
  const errorId = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Guards against a second commit from the blur that follows an Enter commit. */
  const isOpen = useRef(false)
  const focusButtonOnClose = useRef(false)
  const isEditing = draft !== null

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    } else if (focusButtonOnClose.current) {
      focusButtonOnClose.current = false
      buttonRef.current?.focus()
    }
  }, [isEditing])

  const open = (): void => {
    isOpen.current = true
    setError(null)
    setDraft(formatLength(value, units))
  }

  const close = (refocus: boolean): void => {
    isOpen.current = false
    focusButtonOnClose.current = refocus
    setDraft(null)
    setError(null)
  }

  const commit = (refocus: boolean): void => {
    if (!isOpen.current || draft === null) return
    const parsed = parseLengthField(draft, units, { min, max })
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    const problem = edit.onCommit(parsed.value)
    if (problem !== null) {
      setError(problem)
      return
    }
    close(refocus)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit(true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
  }

  if (!isEditing) {
    return (
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${name} ${spokenLength(value, units)}, edit`}
        title={`Edit ${name.toLowerCase()}`}
        onClick={open}
        className={cn('cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60', className)}
        style={style}
      >
        {children}
      </button>
    )
  }

  return (
    <div className={cn('flex flex-col items-center gap-1', editorClassName)} style={editorStyle}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          aria-label={`${name} (${unitSuffix(units)})`}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          inputMode={units === 'metric' ? 'decimal' : 'text'}
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => commit(false)}
          className={cn(
            'h-7 w-28 rounded-md border border-input bg-background py-0.5 pr-8 pl-2 font-mono text-xs tabular-nums shadow-md outline-none',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          )}
        />
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">
          {unitSuffix(units)}
        </span>
      </div>
      {error && (
        <p id={errorId} role="alert" className="max-w-56 rounded-sm bg-background px-1.5 py-0.5 text-center text-xs text-destructive shadow-sm">
          {error}
        </p>
      )}
    </div>
  )
}
