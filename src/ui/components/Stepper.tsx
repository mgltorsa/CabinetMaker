'use client'

import { MinusIcon, PlusIcon } from 'lucide-react'
import { useId } from 'react'
import { Button } from './ui/button'
import { Label } from './ui/label'

type StepperProps = {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
  /** Visible text after the number, e.g. "shelves". */
  unit?: string
}

/** − n + control for small integer counts (shelves, drawers). */
export function Stepper({ label, value, min = 0, max = 99, onChange, unit }: StepperProps) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm font-normal text-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <MinusIcon />
        </Button>
        <output id={id} aria-live="polite" className="min-w-10 text-center font-mono text-sm tabular-nums">
          {value}
          {unit && <span className="sr-only"> {unit}</span>}
        </output>
        <Button variant="outline" size="icon-sm" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <PlusIcon />
        </Button>
      </div>
    </div>
  )
}
