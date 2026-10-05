'use client'

import { useId, useState } from 'react'
import type { FieldParse } from '../../lib/fieldParse'
import { isHexColor } from '../../lib/materials'
import { CommitField } from '../fields'
import { Label } from '../ui/label'

type ColorFieldProps = {
  label: string
  /** `#rrggbb`, or undefined for "default". */
  value: string | undefined
  /** Shown in the swatch while `value` is undefined. */
  fallback: string
  onCommit: (color: string | undefined) => void
}

/** Empty = back to the default colour; `#` is optional; stored lowercase. */
export function parseHexColor(text: string): FieldParse<string | undefined> {
  const t = text.trim().toLowerCase()
  if (t === '') return { ok: true, value: undefined }
  const hex = t.startsWith('#') ? t : `#${t}`
  return isHexColor(hex) ? { ok: true, value: hex } : { ok: false, error: 'Use #rrggbb, e.g. #b5793f' }
}

/**
 * Colour swatch (native picker) plus a hex text field. The swatch previews
 * while dragging and commits on the native `change` event (picker closed) or
 * blur, so the pipeline does not rerun on every pointer move.
 */
export function ColorField({ label, value, fallback, onCommit }: ColorFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (next: string): void => {
    setDraft(null)
    if (next !== value) onCommit(next)
  }
  const bindChange = (el: HTMLInputElement | null): (() => void) | undefined => {
    if (!el) return undefined
    const handle = (): void => commit(el.value.toLowerCase())
    el.addEventListener('change', handle)
    return () => el.removeEventListener('change', handle)
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-start gap-2">
        <input
          id={id}
          ref={bindChange}
          type="color"
          value={draft ?? value ?? fallback}
          onChange={(e) => setDraft(e.target.value.toLowerCase())}
          onBlur={() => draft !== null && commit(draft)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-0.5 shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <CommitField<string | undefined>
          label={`${label} (hex)`}
          isLabelHidden
          value={value}
          format={(v) => v ?? ''}
          parse={parseHexColor}
          onCommit={onCommit}
          placeholder="default"
          inputMode="text"
          className="flex-1"
        />
      </div>
    </div>
  )
}
