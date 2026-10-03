'use client'

import { useState } from 'react'
import type { Project } from '@/core/types'
import type { PipelineResult } from '@/pipeline'
import { CamSection } from '../cam/MachineSettings'
import { selectedCabinet, useDesigner, type WorkspaceSection } from '../store'
import type { Exports } from '../useExports'
import { PresetPicker } from './PresetPicker'
import { BuildSection } from './sidebar/BuildSection'
import { DesignSection } from './sidebar/DesignSection'
import { OutputsSection } from './sidebar/OutputsSection'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion'
import { ScrollArea } from './ui/scroll-area'

const SECTIONS: { value: WorkspaceSection; number: string; title: string }[] = [
  { value: 'design', number: '01', title: 'Cabinet' },
  { value: 'build', number: '02', title: 'Build Options' },
  { value: 'outputs', number: '03', title: 'Drawings & BOM' },
  { value: 'cam', number: '04', title: 'CAM / CNC' },
]

type SidebarProps = { project: Project; result: PipelineResult; exports: Exports }

/** Numbered workflow: 01 design → 02 build options → 03 drawings & BOM → 04 CAM. */
export function Sidebar({ project, result, exports }: SidebarProps) {
  const cabinet = useDesigner(selectedCabinet)
  const section = useDesigner((s) => s.section)
  const setSection = useDesigner((s) => s.setSection)
  const isPickerOpen = useDesigner((s) => s.isPickerOpen)
  // The main area keeps showing the last section even when every panel is collapsed.
  const [open, setOpen] = useState<string>(section)

  return (
    <aside aria-label="Design parameters" className="flex min-h-0 w-full shrink-0 flex-col border-foreground/15 bg-sidebar max-md:h-[48vh] max-md:border-b md:w-[440px] md:border-r">
      <ScrollArea className="h-full">
        {isPickerOpen || !cabinet ? (
          <PresetPicker />
        ) : (
          <Accordion
            type="single"
            collapsible
            value={open}
            onValueChange={(v) => {
              setOpen(v)
              if (v) setSection(v as WorkspaceSection)
            }}
            className="px-3"
          >
            {SECTIONS.map((s) => (
              <AccordionItem key={s.value} value={s.value} className="border-foreground/15">
                <AccordionTrigger className="items-baseline py-3.5 hover:no-underline">
                  <span className="flex items-baseline gap-3">
                    <span className="font-mono text-sm text-muted-foreground">{s.number}</span>
                    <span className="font-mono text-xl font-semibold tracking-tight">{s.title}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  {s.value === 'design' && <DesignSection cabinet={cabinet} project={project} />}
                  {s.value === 'build' && <BuildSection cabinet={cabinet} project={project} />}
                  {s.value === 'outputs' && <OutputsSection project={project} result={result} exports={exports} />}
                  {s.value === 'cam' && <CamSection machine={project.machine} tools={project.tools} units={project.units} />}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </ScrollArea>
    </aside>
  )
}
