'use client'

import { XIcon } from 'lucide-react'
import { useMemo } from 'react'
import type { CabinetType } from '@/core/types'
import { PRESETS } from '@/engine/presets'
import { cn } from '../lib/cn'
import { presetIcon } from '../lib/presetIcon'
import { useDesigner } from '../store'
import { Button } from './ui/button'

const CATEGORIES: { title: string; color: string; types: CabinetType[] }[] = [
  { title: 'Furniture', color: 'text-furniture', types: ['bookshelf', 'dresser', 'nightstand', 'custom', 'wardrobe'] },
  { title: 'Base & tall cabinets', color: 'text-base-tall', types: ['base', 'drawer-bank', 'tall', 'vanity'] },
  { title: 'Wall cabinets', color: 'text-wall', types: ['wall'] },
]

function PresetGlyph({ type }: { type: CabinetType }) {
  const icon = useMemo(() => presetIcon(type), [type])
  const pad = 1
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${icon.width + 2 * pad} ${icon.height + 2 * pad}`}
      className="h-10 w-10 shrink-0 text-foreground/80"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
      aria-hidden="true"
    >
      <rect {...icon.outline} width={icon.outline.w} height={icon.outline.h} />
      {icon.fronts.map((f, i) => (
        <rect key={i} x={f.x} y={f.y} width={f.w} height={f.h} strokeWidth={0.75} />
      ))}
      {icon.lines.map((l, i) => (
        <line key={i} x1={l.x1} x2={l.x2} y1={l.y} y2={l.y} strokeWidth={0.75} />
      ))}
      {icon.pulls.map((p, i) => (
        <line key={i} {...p} strokeWidth={0.9} />
      ))}
      {icon.rods.map((r, i) => (
        <line key={`rod-${i}`} x1={r.x1} x2={r.x2} y1={r.y} y2={r.y} strokeWidth={0.9} strokeDasharray="1.6 1" />
      ))}
    </svg>
  )
}

/** "What are you building?": categorised presets, each a starting point over the same engine. */
export function PresetPicker() {
  const addCabinetFromPreset = useDesigner((s) => s.addCabinetFromPreset)
  const closePicker = useDesigner((s) => s.closePicker)
  const hasCabinets = useDesigner((s) => s.project.cabinets.length > 0)
  return (
    <section aria-labelledby="picker-heading" className="flex flex-col gap-5 p-3">
      <div className="flex items-center justify-between">
        <h2 id="picker-heading" className="font-mono text-sm tracking-[0.18em] text-muted-foreground uppercase">
          What are you building?
        </h2>
        {hasCabinets && (
          <Button variant="ghost" size="icon-sm" aria-label="Close preset picker" onClick={closePicker}>
            <XIcon />
          </Button>
        )}
      </div>
      {CATEGORIES.map((cat) => (
        <div key={cat.title} className="flex flex-col gap-2">
          <h3 className={cn('font-mono text-xs font-semibold tracking-[0.14em] uppercase', cat.color)}>{cat.title}</h3>
          <ul className="flex flex-col gap-2">
            {cat.types.map((type) => {
              const preset = PRESETS.find((p) => p.type === type)
              if (!preset) return null
              return (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => addCabinetFromPreset(type)}
                    className="flex w-full items-center gap-4 rounded-md border bg-card px-4 py-3.5 text-left shadow-xs transition-colors outline-none hover:border-primary/50 hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <PresetGlyph type={type} />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-mono text-[17px] font-semibold">{preset.label}</span>
                      <span className="truncate text-xs text-muted-foreground">{preset.description}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
