import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('flex flex-col gap-4 rounded-md border bg-card text-card-foreground', className)} {...props} />
}

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex flex-col gap-1 px-4 pt-4', className)} {...props} />
}

function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 data-slot="card-title" className={cn('font-mono text-sm leading-none font-semibold', className)} {...props} />
}

function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="card-description" className={cn('text-xs text-muted-foreground', className)} {...props} />
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-4 pb-4', className)} {...props} />
}

export { Card, CardContent, CardDescription, CardHeader, CardTitle }
