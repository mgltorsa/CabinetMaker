'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import type { Project, UnitSystem } from '@/core/types'
import type { PipelineResult } from '@/pipeline'
import { downloadBlob, slugify } from '../lib/download'
import { parseProjectJson, serializeProject } from '../persistence'
import { useDesigner } from '../store'
import { errorMessage, notify } from '../toast'
import { TextInput } from './fields'

const UNIT_CHOICES: { value: UnitSystem; label: string; title: string }[] = [
  { value: 'metric', label: 'mm', title: 'Millimetres' },
  { value: 'imperial', label: 'in', title: 'Inches (fractions to 1/16)' },
]

type HeaderProps = {
  project: Project
  result: PipelineResult
}

export function Header({ project, result }: HeaderProps) {
  const setProjectName = useDesigner((s) => s.setProjectName)
  const setUnits = useDesigner((s) => s.setUnits)
  const setProject = useDesigner((s) => s.setProject)
  const newProject = useDesigner((s) => s.newProject)
  const fileInput = useRef<HTMLInputElement>(null)
  const [isPdfBusy, setIsPdfBusy] = useState(false)
  const slug = slugify(project.name)

  const handleNew = (): void => {
    if (window.confirm('Start a new project? The current project will be replaced (export it first to keep a copy).')) newProject()
  }

  const handleExport = (): void => {
    downloadBlob(serializeProject(project), `${slug}.json`, 'application/json')
  }

  const handleImport = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = e.currentTarget
    const file = input.files?.[0]
    input.value = '' // allow re-importing the same file
    if (!file) return
    try {
      const parsed = parseProjectJson(await file.text())
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

  const handlePdf = async (): Promise<void> => {
    setIsPdfBusy(true)
    try {
      // pdf-lib is large; load it only when a plan book is requested.
      const { buildPlanPdf } = await import('@/drawings/pdf')
      const bytes = await buildPlanPdf(project, result)
      downloadBlob(bytes.slice(), `${slug}-plans.pdf`, 'application/pdf')
    } catch (error: unknown) {
      notify('error', `PDF export failed: ${errorMessage(error)}`)
    } finally {
      setIsPdfBusy(false)
    }
  }

  return (
    <header className="app-header">
      <div className="brand" aria-hidden="true">
        Cabinet<span>Maker</span>
      </div>
      <h1 className="visually-hidden">CabinetMaker designer</h1>
      <TextInput label="Project name" isLabelHidden value={project.name} onCommit={setProjectName} className="project-name" />
      <div className="segmented" role="group" aria-label="Units">
        {UNIT_CHOICES.map((u) => (
          <button key={u.value} type="button" aria-pressed={project.units === u.value} title={u.title} onClick={() => setUnits(u.value)}>
            {u.label}
          </button>
        ))}
      </div>
      <div className="header-actions" role="group" aria-label="Project actions">
        <button type="button" className="secondary" onClick={handleNew}>
          New
        </button>
        <button type="button" className="secondary" onClick={() => fileInput.current?.click()}>
          Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void handleImport(e)}
        />
        <button type="button" className="secondary" onClick={handleExport}>
          Export JSON
        </button>
        <button type="button" onClick={() => void handlePdf()} disabled={isPdfBusy} aria-busy={isPdfBusy}>
          {isPdfBusy ? 'Building PDF…' : 'Download PDF'}
        </button>
      </div>
    </header>
  )
}
