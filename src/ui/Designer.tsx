'use client'

import { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { Toaster } from './components/Toaster'
import { TopBar } from './components/TopBar'
import { TooltipProvider } from './components/ui/tooltip'
import { Workspace } from './components/Workspace'
import { attachAutosave, browserStorage, saveProject } from './persistence'
import { getDesignerStore, useDesigner } from './store'
import { useExports } from './useExports'
import { usePipeline } from './usePipeline'

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
  const { result, error } = usePipeline(project)
  const exports = useExports(project, result)
  useAutosave()

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col overflow-hidden">
        <TopBar project={project} warnings={result.build.warnings} pipelineError={error} exports={exports} />
        <div className="flex min-h-0 flex-1 max-md:flex-col">
          <Sidebar project={project} result={result} exports={exports} />
          <main className="relative min-h-0 min-w-0 flex-1 bg-viewport">
            <Workspace project={project} result={result} />
          </main>
        </div>
        <Toaster />
      </div>
    </TooltipProvider>
  )
}
