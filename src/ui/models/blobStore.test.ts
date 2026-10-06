import { describe, expect, it } from 'vitest'
import { type BlobStore, contentId, createMemoryBlobStore, isBlobId, storeModelBytes, unusedBlobIds } from './blobStore'

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values)

/** Contract every BlobStore implementation must meet (IndexedDB runs it in e2e). */
function blobStoreContract(make: () => BlobStore): void {
  it('returns null for an unknown id', async () => {
    expect(await make().get('nope')).toBeNull()
  })

  it('stores, lists and deletes bytes', async () => {
    const store = make()
    await store.put('a', bytes(1, 2, 3))
    await store.put('b', bytes(4))
    expect(await store.get('a')).toEqual(bytes(1, 2, 3))
    expect((await store.keys()).sort()).toEqual(['a', 'b'])
    await store.delete('a')
    expect(await store.get('a')).toBeNull()
    expect(await store.keys()).toEqual(['b'])
  })

  it('keeps its own copy (callers cannot mutate stored bytes)', async () => {
    const store = make()
    const data = bytes(1, 2)
    await store.put('a', data)
    data[0] = 9
    const read = await store.get('a')
    read![1] = 9
    expect(await store.get('a')).toEqual(bytes(1, 2))
  })

  it('overwrites an existing id', async () => {
    const store = make()
    await store.put('a', bytes(1))
    await store.put('a', bytes(2))
    expect(await store.get('a')).toEqual(bytes(2))
  })
}

describe('memory BlobStore', () => blobStoreContract(createMemoryBlobStore))

describe('contentId', () => {
  it('is a stable sha256 id of the bytes', async () => {
    const id = await contentId(new TextEncoder().encode('abc'))
    expect(id).toBe('sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(isBlobId(id)).toBe(true)
  })

  it('differs for different bytes', async () => {
    expect(await contentId(bytes(1))).not.toBe(await contentId(bytes(2)))
  })
})

describe('isBlobId', () => {
  it('accepts only safe ids (they become zip entry names)', () => {
    expect(isBlobId('sha256-00ff')).toBe(true)
    expect(isBlobId('../evil')).toBe(false)
    expect(isBlobId('a/b')).toBe(false)
    expect(isBlobId('')).toBe(false)
    expect(isBlobId('x'.repeat(200))).toBe(false)
  })
})

describe('storeModelBytes', () => {
  it('stores under the content hash and deduplicates', async () => {
    const store = createMemoryBlobStore()
    const a = await storeModelBytes(store, bytes(1, 2, 3))
    const b = await storeModelBytes(store, bytes(1, 2, 3))
    expect(a).toBe(b)
    expect(await store.keys()).toEqual([a])
  })
})

describe('unusedBlobIds', () => {
  it('lists stored ids no model references', () => {
    expect(unusedBlobIds(['a', 'b', 'c'], [{ blobId: 'b' }])).toEqual(['a', 'c'])
    expect(unusedBlobIds([], [{ blobId: 'b' }])).toEqual([])
  })
})
