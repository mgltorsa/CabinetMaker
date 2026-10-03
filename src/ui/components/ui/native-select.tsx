import { ChevronDownIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

/** shadcn "native-select": a styled <select>, keeps native a11y and form behaviour. */
function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative w-full">
      <select
        data-slot="native-select"
        className={cn(
          'h-8 w-full appearance-none rounded-md border border-input bg-background pr-8 pl-2.5 text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive',
          className,
        )}
        {...props}
      />
      <ChevronDownIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export { NativeSelect }
