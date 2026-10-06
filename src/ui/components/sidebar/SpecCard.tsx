'use client'

import { ChevronDownIcon, SlidersHorizontalIcon } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { cn } from '../../lib/cn'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'

type SpecCardProps = {
  /** "01·6" style index shown above the title. */
  index: string
  title: string
  /** One-line state shown while the card is closed (and open). */
  summary: string
  children: ReactNode
  /** Specialist settings behind an "Advanced" disclosure. */
  advanced?: ReactNode
  defaultOpen?: boolean
  /** Called when the card header is used (e.g. to switch the main view). */
  onActivate?: () => void
}

/**
 * The numbered parameter card: closed it is a title plus a summary line;
 * opened it shows the common fields, with expert settings one click deeper.
 */
export function SpecCard({ index, title, summary, children, advanced, defaultOpen = false, onActivate }: SpecCardProps) {
  const titleId = useId()
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      onOpenChange={(open) => open && onActivate?.()}
      className="group/card rounded-md border border-border/80 bg-card shadow-xs data-[state=open]:bg-background"
    >
      <CollapsibleTrigger
        aria-labelledby={titleId}
        className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-left outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span id={titleId} className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-mono text-[11px] tracking-wider text-muted-foreground">{index}</span>
          <span className="font-mono text-[17px] leading-tight font-semibold">{title}</span>
          <span className="truncate font-mono text-[13px] text-muted-foreground">{summary}</span>
        </span>
        <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/card:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="flex flex-col gap-3 border-t px-4 pt-3 pb-4">
          {children}
          {advanced && <Advanced>{advanced}</Advanced>}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** "Advanced" disclosure for specialist parameters inside a card. */
export function Advanced({ children, label = 'Advanced' }: { children: ReactNode; label?: string }) {
  return (
    <Collapsible className="group/adv">
      <CollapsibleTrigger className="flex items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <SlidersHorizontalIcon aria-hidden="true" className="size-3.5" />
        {label}
        <ChevronDownIcon aria-hidden="true" className="size-3.5 transition-transform group-data-[state=open]/adv:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-dashed bg-muted/40 p-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Small uppercase caption between groups of fields inside a card. */
export function CardCaption({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('font-mono text-[11px] tracking-wider text-muted-foreground uppercase', className)}>{children}</p>
}
