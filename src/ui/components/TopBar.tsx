'use client'

import {
  AlertTriangleIcon,
  ChevronDownIcon,
  CopyIcon,
  FileArchiveIcon,
  FileDownIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderOpenIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { type ChangeEvent, useRef } from 'react'
import type { BuildWarning, Project, UnitSystem, WarningLevel } from '@/core/types'
import { cn } from '../lib/cn'
import { downloadProjectBundle, readProjectFile } from '../models/bundleIo'
import { MAX_CABINETS } from '../lib/limits'
import { selectedCabinet, useDesigner } from '../store'
import { errorMessage, notify } from '../toast'
import type { Exports } from '../useExports'
import { TextInput } from './fields'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Separator } from './ui/separator'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

const LEVEL_LABEL: Record<WarningLevel, string> = { error: 'Error', warn: 'Warning', info: 'Note' }
const LEVEL_ORDER: Record<WarningLevel, number> = { error: 0, warn: 1, info: 2 }

/** Build warnings, errors first, with the cabinet each belongs to. */
export function WarningsList({ project, warnings, pipelineError }: { project: Project; warnings: readonly BuildWarning[]; pipelineError: string | null }) {
  const sorted = [...warnings].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
  const count = sorted.length + (pipelineError ? 1 : 0)
  const cabinetName = (id: string | undefined): string | undefined => (id === undefined ? undefined : project.cabinets.find((c) => c.id === id)?.name)
  return (
    <>
        {count === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">No build warnings.</p>
      ) : (
        <ul className="max-h-80 divide-y overflow-y-auto text-sm">
          {pipelineError && (
            <li className="px-4 py-2.5">
              <Badge variant="destructive">Error</Badge> The design could not be built: {pipelineError}
            </li>
          )}
          {sorted.map((w, i) => {
            const cab = cabinetName(w.cabinetId)
            return (
              <li key={`${w.code}:${w.partId ?? w.cabinetId ?? ''}:${i}`} className="flex flex-col gap-1 px-4 py-2.5">
                <span className="flex items-center gap-2">
                  <Badge variant={w.level === 'error' ? 'destructive' : w.level === 'warn' ? 'warning' : 'secondary'}>{LEVEL_LABEL[w.level]}</Badge>
                  {cab && <span className="font-mono text-xs text-muted-foreground">{cab}</span>}
                </span>
                <span>{w.message}</span>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function WarningsPopover({ project, warnings, pipelineError }: { project: Project; warnings: readonly BuildWarning[]; pipelineError: string | null }) {
  const sorted = [...warnings].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
  const count = sorted.length + (pipelineError ? 1 : 0)
  const hasErrors = pipelineError !== null || sorted.some((w) => w.level === 'error')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Warnings (${count})`} className="font-mono">
          <AlertTriangleIcon className={cn(count === 0 ? 'text-muted-foreground' : hasErrors ? 'text-destructive' : 'text-warning')} />
          <Badge variant={count === 0 ? 'outline' : hasErrors ? 'destructive' : 'warning'}>{count}</Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0">
        <h2 className="border-b px-4 py-2.5 font-mono text-xs tracking-wider uppercase">Build warnings</h2>
        <WarningsList project={project} warnings={warnings} pipelineError={pipelineError} />
      </PopoverContent>
    </Popover>
  )
}

function CabinetSwitcher() {
  const project = useDesigner((s) => s.project)
  const cabinet = useDesigner(selectedCabinet)
  const selectCabinet = useDesigner((s) => s.selectCabinet)
  const openPicker = useDesigner((s) => s.openPicker)
  const duplicateCabinet = useDesigner((s) => s.duplicateCabinet)
  const deleteCabinet = useDesigner((s) => s.deleteCabinet)
  const isFull = project.cabinets.length >= MAX_CABINETS

  const handleDelete = (): void => {
    if (cabinet && window.confirm(`Delete “${cabinet.name}”? This cannot be undone.`)) deleteCabinet(cabinet.id)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-64 font-mono text-[15px] font-semibold" aria-label={`Cabinet: ${cabinet?.name ?? 'none'}`}>
          <span className="truncate">{cabinet?.name ?? 'No cabinet'}</span>
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Cabinets in this project</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={cabinet?.id ?? ''} onValueChange={selectCabinet}>
          {project.cabinets.map((c) => (
            <DropdownMenuRadioItem key={c.id} value={c.id}>
              <span className="truncate">{c.name}</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{c.width}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isFull} onSelect={openPicker}>
          <PlusIcon /> Add cabinet…
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!cabinet || isFull} onSelect={() => cabinet && duplicateCabinet(cabinet.id)}>
          <CopyIcon /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" disabled={!cabinet} onSelect={handleDelete}>
          <Trash2Icon /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type TopBarProps = {
  project: Project
  warnings: readonly BuildWarning[]
  pipelineError: string | null
  exports: Exports
}

export function TopBar({ project, warnings, pipelineError, exports }: TopBarProps) {
  const setProjectName = useDesigner((s) => s.setProjectName)
  const setUnits = useDesigner((s) => s.setUnits)
  const setProject = useDesigner((s) => s.setProject)
  const newProject = useDesigner((s) => s.newProject)
  const fileInput = useRef<HTMLInputElement>(null)

  const handleNew = (): void => {
    if (window.confirm('Start a new project? The current project will be replaced (export it first to keep a copy).')) newProject()
  }

  const handleImport = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = e.currentTarget
    const file = input.files?.[0]
    input.value = '' // allow re-importing the same file
    if (!file) return
    try {
      const parsed = await readProjectFile(file)
      if (!parsed.ok) {
        notify('error', `Import failed: ${parsed.error}`)
        return
      }
      setProject(parsed.project)
      notify('info', `Imported “${parsed.project.name}”`)
    } catch (error: unknown) {
      notify('error', `Import failed: ${errorMessage(error)}`)
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-foreground/15 bg-topbar px-2 font-mono">
      <h1 className="sr-only">CabinetMaker designer</h1>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Project menu" className="font-mono text-[15px] font-semibold">
            cabinetmaker
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Project</DropdownMenuLabel>
          <DropdownMenuItem onSelect={handleNew}>
            <FilePlusIcon /> New project
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
            <FolderOpenIcon /> Import JSON or .zip…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exports.downloadProjectJson}>
            <FileDownIcon /> Export JSON
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void downloadProjectBundle(project).catch((error: unknown) => notify('error', `Export failed: ${errorMessage(error)}`))}>
            <FileArchiveIcon /> Export project with models (.zip)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={exports.isPdfBusy} onSelect={() => void exports.downloadPdf()}>
            <FileTextIcon /> {exports.isPdfBusy ? 'Building PDF…' : 'Download plan book (PDF)'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Units</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={project.units} onValueChange={(v) => setUnits(v as UnitSystem)}>
            <DropdownMenuRadioItem value="metric">Millimetres</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="imperial">Inches (1/16 fractions)</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json,application/zip,.zip"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void handleImport(e)}
      />
      <Separator orientation="vertical" className="!h-6 bg-foreground/15" />
      <div className="w-56 [&_input]:h-8 [&_input]:border-transparent [&_input]:bg-transparent [&_input]:font-mono [&_input]:shadow-none [&_input:hover]:border-input [&_input:focus-visible]:bg-background">
        <TextInput label="Project name" isLabelHidden value={project.name} onCommit={setProjectName} />
      </div>
      <span aria-hidden="true" className="text-muted-foreground">
        /
      </span>
      <CabinetSwitcher />
      <div className="flex-1" />
      <WarningsPopover project={project} warnings={warnings} pipelineError={pipelineError} />
      <ToggleGroup
        type="single"
        aria-label="Units"
        value={project.units}
        onValueChange={(v) => v && setUnits(v as UnitSystem)}
      >
        <ToggleGroupItem value="metric" aria-label="Millimetres">
          mm
        </ToggleGroupItem>
        <ToggleGroupItem value="imperial" aria-label="Inches">
          in
        </ToggleGroupItem>
      </ToggleGroup>
      <span className="sr-only" aria-live="polite">
        {project.units === 'metric' ? 'Units: millimetres' : 'Units: inches'}
      </span>
    </header>
  )
}
