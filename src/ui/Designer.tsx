'use client'

import { useEffect, useState } from 'react'
import { CabinetForm } from './components/CabinetForm'
import { CabinetList } from './components/CabinetList'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Header } from './components/Header'
import { type TabDef, Tabs } from './components/Tabs'
import { Toaster } from './components/Toaster'
import { WarningsPanel } from './components/WarningsPanel'
import { attachAutosave, browserStorage, saveProject } from './persistence'
import { getDesignerStore, selectedCabinet, useDesigner } from './store'
import { usePipeline } from './usePipeline'
import { CamView } from './views/CamView'
import { CutPlanView } from './views/CutPlanView'
import { ElevationView } from './views/ElevationView'
import { EstimateView } from './views/EstimateView'
import { PartsView } from './views/PartsView'
import { ThreeView } from './views/ThreeView'

type TabId = '3d' | 'front' | 'side' | 'parts' | 'cut' | 'cam' | 'estimate'

const TABS: readonly TabDef<TabId>[] = [
  { id: '3d', label: '3D' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'parts', label: 'Parts' },
  { id: 'cut', label: 'Cut plan' },
  { id: 'cam', label: 'CAM' },
  { id: 'estimate', label: 'Estimate' },
]

/** Autosave the project to localStorage for the lifetime of the designer. */
function useAutosave(): void {
  useEffect(() => {
    const storage = browserStorage()
    if (!storage) return
    const store = getDesignerStore()
    const getProject = () => store.getState().project
    const detach = attachAutosave({ getProject, subscribe: store.subscribe }, storage)
    const handlePageHide = (): void => {
      saveProject(storage, getProject())
    }
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      detach()
    }
  }, [])
}

export function Designer() {
  const project = useDesigner((s) => s.project)
  const cabinet = useDesigner(selectedCabinet)
  const { result, error } = usePipeline(project)
  const [tab, setTab] = useState<TabId>('3d')
  useAutosave()

  const renderPanel = (id: TabId) => {
    const label = TABS.find((t) => t.id === id)?.label ?? id
    return (
      <ErrorBoundary title={`The ${label} view failed.`} resetKey={result}>
        {id === '3d' && <ThreeView project={project} result={result} />}
        {id === 'front' && <ElevationView kind="front" cabinet={cabinet} result={result} units={project.units} />}
        {id === 'side' && <ElevationView kind="side" cabinet={cabinet} result={result} units={project.units} />}
        {id === 'parts' && <PartsView project={project} result={result} />}
        {id === 'cut' && <CutPlanView project={project} result={result} />}
        {id === 'cam' && <CamView project={project} result={result} />}
        {id === 'estimate' && <EstimateView project={project} result={result} />}
      </ErrorBoundary>
    )
  }

  return (
    <div className="app">
      <Header project={project} result={result} />
      <div className="workspace">
        <aside className="sidebar" aria-label="Cabinets and parameters">
          <CabinetList />
          <CabinetForm />
        </aside>
        <main className="main">
          <Tabs label="Views" tabs={TABS} active={tab} onChange={setTab} renderPanel={renderPanel} />
          <WarningsPanel project={project} warnings={result.build.warnings} pipelineError={error} />
        </main>
      </div>
      <Toaster />
    </div>
  )
}
