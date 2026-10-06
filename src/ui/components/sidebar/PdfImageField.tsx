'use client'

import { ImageIcon, Loader2Icon, UploadIcon, XIcon } from 'lucide-react'
import { type ChangeEvent, useId, useRef, useState } from 'react'
import { formatBytes } from '@/core/image'
import type { ImageDataUrl } from '@/core/types'
import { readImageFile } from '../../lib/imageUpload'
import { PDF_LIMITS } from '../../lib/limits'
import { errorMessage } from '../../toast'
import { Button } from '../ui/button'
import { Label } from '../ui/label'

type PdfImageFieldProps = {
  label: string
  value: ImageDataUrl | null
  onChange: (value: ImageDataUrl | null) => void
  /** Extra check on a new image (e.g. project size); a message blocks it. */
  validate?: (value: ImageDataUrl) => string | null
  /** Shown in place of the preview when no image is set. */
  emptyText?: string
}

/**
 * PNG/JPEG upload with preview and remove. The image only ever reaches the DOM
 * as an <img> data URL (never as markup), after `readImageFile` has checked
 * its magic bytes, pixel size and byte size.
 */
export function PdfImageField({ label, value, onChange, validate, emptyText = 'None' }: PdfImageFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const handleFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    // Reset so choosing the same file again still fires a change.
    e.target.value = ''
    if (!file) return
    setIsBusy(true)
    setError(null)
    try {
      const result = await readImageFile(file)
      const problem = result.ok ? (validate?.(result.dataUrl) ?? null) : result.error
      if (problem !== null) setError(problem)
      else if (result.ok) onChange(result.dataUrl)
    } catch (err: unknown) {
      setError(`The image could not be read: ${errorMessage(err)}`)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <div className="flex h-12 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- validated data URL preview; next/image cannot optimise it in a static export
            <img src={value} alt={`${label} preview`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ImageIcon aria-hidden="true" className="size-3.5" />
              {emptyText}
            </span>
          )}
        </div>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => void handleFile(e)}
        />
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={isBusy} aria-busy={isBusy}>
          {isBusy ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
          {value ? 'Replace' : 'Upload'}
        </Button>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)} aria-label={`Remove ${label.toLowerCase()}`}>
            <XIcon /> Remove
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">PNG or JPEG, up to {formatBytes(PDF_LIMITS.imageBytes)}; large images are shrunk.</p>
      {error && (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
