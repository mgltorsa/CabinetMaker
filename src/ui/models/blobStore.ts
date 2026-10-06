/**
 * Model file storage. The `Project` only references models by `blobId`; the
 * bytes live here: IndexedDB in the browser, an in-memory map in tests. Ids are
 * content hashes, so importing the same file twice stores it once.
 */

export interface BlobStore {
  get: (id: string) => Promise<Uint8Array | null>
  put: (id: string, bytes: Uint8Array) => Promise<void>
  delete: (id: string) => Promise<void>
  keys: () => Promise<string[]>
}

/** Safe as a zip entry name and an IndexedDB key: no separators, bounded length. */
const BLOB_ID = /^[a-z0-9][a-z0-9-]{0,99}$/

export function isBlobId(value: string): boolean {
  return BLOB_ID.test(value)
}

const toHex = (buffer: ArrayBuffer): string => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')

/** `sha256-<hex>` of `bytes`. */
export async function contentId(bytes: Uint8Array): Promise<string> {
  // Copy into a plain ArrayBuffer: subtle.digest rejects shared or offset views.
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer)
  return `sha256-${toHex(digest)}`
}

/** Store `bytes` under their content id (no-op when already present) and return the id. */
export async function storeModelBytes(store: BlobStore, bytes: Uint8Array): Promise<string> {
  const id = await contentId(bytes)
  if ((await store.get(id)) === null) await store.put(id, bytes)
  return id
}

/** Stored ids that no model references (candidates for "clear unused files"). */
export function unusedBlobIds(stored: readonly string[], models: readonly { blobId: string }[]): string[] {
  const used = new Set(models.map((m) => m.blobId))
  return stored.filter((id) => !used.has(id))
}

export function createMemoryBlobStore(): BlobStore {
  const data = new Map<string, Uint8Array>()
  return {
    get: async (id) => data.get(id)?.slice() ?? null,
    put: async (id, bytes) => void data.set(id, bytes.slice()),
    delete: async (id) => void data.delete(id),
    keys: async () => [...data.keys()],
  }
}

// ─── IndexedDB ──────────────────────────────────────────────────────────────

export const MODEL_DB_NAME = 'cabinetmaker-models'
const MODEL_DB_VERSION = 1
const OBJECT_STORE = 'blobs'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

/** IndexedDB-backed store. The connection opens lazily and closes when another tab upgrades or deletes the database. */
export function createIdbBlobStore(factory: IDBFactory, dbName = MODEL_DB_NAME): BlobStore {
  let opening: Promise<IDBDatabase> | null = null

  const open = (): Promise<IDBDatabase> => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(dbName, MODEL_DB_VERSION)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(OBJECT_STORE)) req.result.createObjectStore(OBJECT_STORE)
      }
      req.onsuccess = () => {
        const db = req.result
        db.onversionchange = () => {
          db.close()
          opening = null
        }
        resolve(db)
      }
      req.onerror = () => {
        opening = null
        reject(req.error ?? new Error('Model storage (IndexedDB) is unavailable'))
      }
      req.onblocked = () => {
        opening = null
        reject(new Error('Model storage is blocked by another tab'))
      }
    })
    return opening
  }

  const run = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open()
    const tx = db.transaction(OBJECT_STORE, mode)
    const result = request(fn(tx.objectStore(OBJECT_STORE)))
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted (storage full?)'))
    })
    return result
  }

  return {
    get: async (id) => {
      const value: unknown = await run('readonly', (s) => s.get(id))
      if (value instanceof Uint8Array) return value
      if (value instanceof ArrayBuffer) return new Uint8Array(value)
      return null
    },
    put: async (id, bytes) => void (await run('readwrite', (s) => s.put(bytes.slice(), id))),
    delete: async (id) => void (await run('readwrite', (s) => s.delete(id))),
    keys: async () => (await run('readonly', (s) => s.getAllKeys())).filter((k): k is string => typeof k === 'string'),
  }
}

let browserBlobStore: BlobStore | null = null

/** The app's model store: IndexedDB when available, else a session-only memory store. */
export function getBlobStore(): BlobStore {
  if (browserBlobStore) return browserBlobStore
  let factory: IDBFactory | null = null
  try {
    factory = typeof indexedDB === 'undefined' ? null : indexedDB
  } catch {
    factory = null // privacy modes can throw on access
  }
  browserBlobStore = factory ? createIdbBlobStore(factory) : createMemoryBlobStore()
  return browserBlobStore
}
