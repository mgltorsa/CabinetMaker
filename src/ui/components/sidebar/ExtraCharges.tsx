'use client'

import { PlusIcon, Trash2Icon } from 'lucide-react'
import type { ExtraCharge, ExtraChargeUnit } from '@/core/types'
import { EXTRA_QTY, MAX_EXTRA_CHARGES, MAX_MONEY } from '../../lib/limits'
import { useDesigner } from '../../store'
import { NumberInput, SelectField, type SelectOption, TextInput } from '../fields'
import { Button } from '../ui/button'
import { CardCaption } from './SpecCard'

export const EXTRA_UNITS: readonly SelectOption<ExtraChargeUnit>[] = [
  { value: 'job', label: 'job' },
  { value: 'h', label: 'h' },
  { value: 'pcs', label: 'pcs' },
  { value: 'm', label: 'm' },
  { value: 'm²', label: 'm²' },
]

function ExtraChargeRow({ extra }: { extra: ExtraCharge }) {
  const update = useDesigner((s) => s.updateExtraCharge)
  const remove = useDesigner((s) => s.removeExtraCharge)
  const set = (patch: Parameters<typeof update>[1]): void => update(extra.id, patch)
  return (
    <li>
      <fieldset className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-md border bg-background/60 p-2">
        <legend className="sr-only">Extra charge: {extra.label}</legend>
        <TextInput className="col-span-4" label="Description" value={extra.label} onCommit={(label) => set({ label })} />
        <NumberInput label="Qty" value={extra.qty} min={EXTRA_QTY.min} max={EXTRA_QTY.max} onCommit={(qty) => set({ qty })} />
        <SelectField label="Unit" value={extra.unit} options={EXTRA_UNITS} onChange={(unit) => set({ unit })} />
        <NumberInput label="Unit cost" value={extra.unitCost} min={0} max={MAX_MONEY} onCommit={(unitCost) => set({ unitCost })} />
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${extra.label}`} onClick={() => remove(extra.id)}>
          <Trash2Icon />
        </Button>
      </fieldset>
    </li>
  )
}

/** "Extra charges" sub-list of 03·3 Estimate: finishing, delivery, installation, design fee… */
export function ExtraCharges({ extras }: { extras: readonly ExtraCharge[] }) {
  const add = useDesigner((s) => s.addExtraCharge)
  const isFull = extras.length >= MAX_EXTRA_CHARGES
  return (
    <section aria-label="Extra charges" className="flex flex-col gap-2">
      <CardCaption className="pt-1">Extra charges</CardCaption>
      {extras.length === 0 ? (
        <p className="text-xs text-muted-foreground">Finishing, delivery, installation, design fee… Added to the cost before margin.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {extras.map((x) => (
            <ExtraChargeRow key={x.id} extra={x} />
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" className="self-start" onClick={add} disabled={isFull}>
        <PlusIcon /> {isFull ? `Limit of ${MAX_EXTRA_CHARGES} charges reached` : 'Add charge'}
      </Button>
    </section>
  )
}
