'use client'

import type { Project } from '@/core/types'
import type { PipelineResult } from '@/pipeline'
import { type ModelView, type OutputView, selectedCabinet, useDesigner } from '../store'
import { CamView } from '../views/CamView'
import { CutPlanView } from '../views/CutPlanView'
import { ElevationView } from '../views/ElevationView'
import { EstimateView } from '../views/EstimateView'
import { JoineryView } from '../views/JoineryView'
import { PartsView } from '../views/PartsView'
import { ThreeView } from '../views/ThreeView'
import { ErrorBoundary } from './ErrorBoundary'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

const MODEL_VIEWS: { value: ModelView; label: string }[] = [
  { value: '3d', label: '3D' },
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'joinery', label: 'Joinery' },
]

const OUTPUT_VIEWS: { value: OutputView; label: string }[] = [
  { value: 'cutlist', label: 'Cut list' },
  { value: 'cutplan', label: 'Cut plan' },
  { value: 'estimate', label: 'Estimate' },
]

type WorkspaceProps = { project: Project; result: PipelineResult }

/** Main area: what it shows follows the active sidebar section. */
export function Workspace({ project, result }: WorkspaceProps) {
  const section = useDesigner((s) => s.section)
  const modelView = useDesigner((s) => s.modelView)
  const setModelView = useDesigner((s) => s.setModelView)
  const outputView = useDesigner((s) => s.outputView)
  const setOutputView = useDesigner((s) => s.setOutputView)
  const cabinet = useDesigner(selectedCabinet)

  if (section === 'cam') {
    return (
      <div className="h-full overflow-y-auto">
        <ErrorBoundary title="The CAM view failed." resetKey={result}>
          <CamView project={project} result={result} />
        </ErrorBoundary>
      </div>
    )
  }

  if (section === 'models') {
    return (
      <div className="h-full">
        <ErrorBoundary title="The 3D view failed." resetKey={result}>
          <ThreeView project={project} result={result} />
        </ErrorBoundary>
      </div>
    )
  }

  if (section === 'outputs') {
    return (
      <Tabs value={outputView} onValueChange={(v) => setOutputView(v as OutputView)} className="h-full gap-0">
        <div className="flex h-12 shrink-0 items-center border-b border-foreground/10 px-3">
          <TabsList aria-label="Views">
            {OUTPUT_VIEWS.map((v) => (
              <TabsTrigger key={v.value} value={v.value}>
                {v.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {OUTPUT_VIEWS.map((v) => (
          <TabsContent key={v.value} value={v.value} className="min-h-0 overflow-y-auto">
            <ErrorBoundary title={`The ${v.label} view failed.`} resetKey={result}>
              {v.value === 'cutlist' && <PartsView project={project} result={result} />}
              {v.value === 'cutplan' && <CutPlanView project={project} result={result} />}
              {v.value === 'estimate' && <EstimateView project={project} result={result} />}
            </ErrorBoundary>
          </TabsContent>
        ))}
      </Tabs>
    )
  }

  return (
    <Tabs value={modelView} onValueChange={(v) => setModelView(v as ModelView)} className="relative h-full gap-0">
      <div className="pointer-events-none absolute top-3 left-3 z-10">
        <TabsList aria-label="Views" className="pointer-events-auto shadow-xs">
          {MODEL_VIEWS.map((v) => (
            <TabsTrigger key={v.value} value={v.value}>
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {MODEL_VIEWS.map((v) => (
        <TabsContent key={v.value} value={v.value} className={v.value === '3d' ? 'h-full' : 'h-full overflow-y-auto pt-12'}>
          <ErrorBoundary title={`The ${v.label} view failed.`} resetKey={result}>
            {v.value === '3d' && (
              <div className="h-full">
                <ThreeView project={project} result={result} />
              </div>
            )}
            {v.value === 'front' && <ElevationView kind="front" cabinet={cabinet} result={result} units={project.units} hardware={project.hardware} />}
            {v.value === 'side' && <ElevationView kind="side" cabinet={cabinet} result={result} units={project.units} />}
            {v.value === 'joinery' && <JoineryView project={project} cabinet={cabinet} result={result} />}
          </ErrorBoundary>
        </TabsContent>
      ))}
    </Tabs>
  )
}
