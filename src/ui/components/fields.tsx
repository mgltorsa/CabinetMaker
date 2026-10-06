'use client'

import { ChevronRightIcon } from 'lucide-react'
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Mm, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'
import {
  type FieldParse,
  type NumberOptions,
  type RangeOptions,
  parseLengthField,
  parseNumberField,
  parseOptionalLengthField,
} from '../lib/fieldParse'
import { unitSuffix } from '../lib/format'
import { cn } from '../lib/cn'
import { MAX_LENGTH } from '../lib/limits'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { NativeSelect } from './ui/native-select'
import { Switch } from './ui/switch'

type CommitFieldProps<T> = {
  label: string
  value: T
  format: (value: T) => string
  parse: (text: string) => FieldParse<T>
  onCommit: (value: T) => void
  suffix?: string
  placeholder?: string
  isDisabled?: boolean
  inputMode?: 'decimal' | 'numeric' | 'text'
  className?: string
  /** Keep the label for screen readers only (e.g. inside table cells). */
  isLabelHidden?: boolean
  /** Free text (names) rather than a measurement: proportional font, no suffix padding. */
  isFreeText?: boolean
  /** Problem with the committed value (e.g. a duplicate); a draft's own parse error wins. */
  error?: string
}

/**
 * Text input that keeps a local draft and only commits a parsed, valid value
 * on blur or Enter. Escape reverts. Invalid drafts are shown, never committed.
 */
export function CommitField<T>({
  label,
  value,
  format,
  parse,
  onCommit,
  suffix,
  placeholder,
  isDisabled = false,
  inputMode = 'decimal',
  className,
  isLabelHidden = false,
  isFreeText = false,
  error: valueError,
}: CommitFieldProps<T>) {
  const id = useId()
  const errorId = `${id}-error`
  const [draft, setDraft] = useState<string | null>(null)
  const parsed = draft === null ? null : parse(draft)
  const error = parsed && !parsed.ok ? parsed.error : (valueError ?? null)

  const commit = (): void => {
    if (draft === null) return
    const result = parse(draft)
    if (!result.ok) return
    if (!Object.is(result.value, value)) onCommit(result.value)
    setDraft(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      setDraft(null)
    }
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id} className={isLabelHidden ? 'sr-only' : undefined}>
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          className={cn(!isFreeText && 'font-mono tabular-nums', suffix && 'pr-9')}
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          value={draft ?? format(value)}
          placeholder={placeholder}
          disabled={isDisabled}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[11px] text-muted-foreground" aria-hidden="true">
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

type LengthInputProps = RangeOptions & {
  label: string
  value: Mm
  units: UnitSystem
  onCommit: (mm: Mm) => void
  isDisabled?: boolean
  isLabelHidden?: boolean
}

/** Unit-aware length: shows project units, commits millimetres. Bounded by `MAX_LENGTH` unless `max` is given. */
export function LengthInput({ label, value, units, onCommit, min = 0, max = MAX_LENGTH, isDisabled, isLabelHidden }: LengthInputProps) {
  return (
    <CommitField<Mm>
      label={label}
      value={value}
      format={(v) => formatLength(v, units)}
      parse={(text) => parseLengthField(text, units, { min, max })}
      onCommit={onCommit}
      suffix={unitSuffix(units)}
      isDisabled={isDisabled}
      isLabelHidden={isLabelHidden}
      inputMode={units === 'metric' ? 'decimal' : 'text'}
    />
  )
}

type OptionalLengthInputProps = RangeOptions & {
  label: string
  value: Mm | null
  units: UnitSystem
  onCommit: (mm: Mm | null) => void
}

/** Length where an empty field means "auto" (share remaining space). */
export function OptionalLengthInput({ label, value, units, onCommit, min = 0, max = MAX_LENGTH }: OptionalLengthInputProps) {
  return (
    <CommitField<Mm | null>
      label={label}
      value={value}
      format={(v) => (v === null ? '' : formatLength(v, units))}
      parse={(text) => parseOptionalLengthField(text, units, { min, max })}
      onCommit={onCommit}
      suffix={unitSuffix(units)}
      placeholder="auto"
      inputMode={units === 'metric' ? 'decimal' : 'text'}
    />
  )
}

type NumberInputProps = NumberOptions & {
  label: string
  value: number
  onCommit: (value: number) => void
  suffix?: string
  isDisabled?: boolean
  isLabelHidden?: boolean
  error?: string
}

export function NumberInput({ label, value, onCommit, suffix, isDisabled, isLabelHidden, error, ...options }: NumberInputProps) {
  return (
    <CommitField<number>
      label={label}
      value={value}
      format={String}
      parse={(text) => parseNumberField(text, options)}
      onCommit={onCommit}
      suffix={suffix}
      isDisabled={isDisabled}
      isLabelHidden={isLabelHidden}
      inputMode={options.integer ? 'numeric' : 'decimal'}
      error={error}
    />
  )
}

type TextInputProps = {
  label: string
  value: string
  onCommit: (value: string) => void
  className?: string
  isLabelHidden?: boolean
}

/** Free text that must not be blank. */
export function TextInput({ label, value, onCommit, className, isLabelHidden }: TextInputProps) {
  return (
    <CommitField<string>
      label={label}
      value={value}
      format={(v) => v}
      parse={(text) => (text.trim() === '' ? { ok: false, error: 'Required' } : { ok: true, value: text.trim() })}
      onCommit={onCommit}
      inputMode="text"
      className={className}
      isLabelHidden={isLabelHidden}
      isFreeText
    />
  )
}

export interface SelectOption<T extends string> {
  value: T
  label: string
  isDisabled?: boolean
}

type SelectFieldProps<T extends string> = {
  label: string
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  isLabelHidden?: boolean
  /** Problem with the current choice, shown under the select. */
  error?: string
}

export function SelectField<T extends string>({ label, value, options, onChange, isLabelHidden = false, error }: SelectFieldProps<T>) {
  const id = useId()
  const errorId = `${id}-error`
  const handleChange = (raw: string): void => {
    const match = options.find((o) => o.value === raw)
    if (match) onChange(match.value)
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className={isLabelHidden ? 'sr-only' : undefined}>
        {label}
      </Label>
      <NativeSelect
        id={id}
        value={value}
        aria-invalid={error !== undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => handleChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.isDisabled}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      {error && (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

type CheckboxFieldProps = {
  label: string
  isChecked: boolean
  onChange: (checked: boolean) => void
}

export function CheckboxField({ label, isChecked, onChange }: CheckboxFieldProps) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label htmlFor={id} className="text-sm font-normal text-foreground">
        {label}
      </Label>
      <Switch id={id} checked={isChecked} onCheckedChange={onChange} />
    </div>
  )
}

type FieldGroupProps = {
  title: string
  children: ReactNode
  isOpen?: boolean
  description?: string
}

/** Collapsible group of related fields (progressive disclosure for specialist settings). */
export function FieldGroup({ title, children, isOpen = false, description }: FieldGroupProps) {
  return (
    <Collapsible defaultOpen={isOpen} className="group/fg rounded-md border bg-background/60">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs font-medium tracking-wide uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <ChevronRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]/fg:rotate-90" />
        {title}
        {description && <span className="ml-auto font-sans text-[11px] tracking-normal text-muted-foreground normal-case">{description}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="grid grid-cols-2 gap-3 border-t px-3 py-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Two-column grid for fields outside a FieldGroup. */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3', className)}>{children}</div>
}
