/**
 * Parsed models by blob id, shared by every model that uses the same file.
 * Parsing happens once per file per session; failures are not cached so a
 * file restored later (zip import) loads on the next attempt.
 */
import type { ModelFormat } from '@/core/types'
import { getBlobStore } from './blobStore'
import { disposeObject, type ParsedModel, parseModel } from './loaders'

/** The model's file is not in this browser's model store. */
export class MissingModelFileError extends Error {
  constructor() {
    super('The model file is not stored in this browser')
  }
}

const cache = new Map<string, Promise<ParsedModel>>()

export function loadModel(blobId: string, format: ModelFormat): Promise<ParsedModel> {
  const cached = cache.get(blobId)
  if (cached) return cached
  const loading = (async () => {
    const bytes = await getBlobStore().get(blobId)
    if (!bytes) throw new MissingModelFileError()
    return parseModel(bytes, format)
  })()
  cache.set(blobId, loading)
  loading.catch(() => cache.delete(blobId))
  return loading
}

/** Seed the cache with a model parsed during import (no second parse). */
export function primeModel(blobId: string, parsed: ParsedModel): void {
  if (!cache.has(blobId)) cache.set(blobId, Promise.resolve(parsed))
}

/** Drop and dispose a model no project uses any more (its file was deleted). */
export function forgetModel(blobId: string): void {
  const cached = cache.get(blobId)
  cache.delete(blobId)
  cached?.then((parsed) => disposeObject(parsed.object)).catch(() => {})
}
