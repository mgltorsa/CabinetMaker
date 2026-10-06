import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('assets module boundaries', () => {
  it('is a pure domain module: no React, three, UI, app or engine imports', () => {
    const sources = readdirSync(HERE).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    expect(sources.length).toBeGreaterThan(0)
    for (const file of sources) {
      const text = readFileSync(join(HERE, file), 'utf8')
      expect(text, file).not.toMatch(/from '(react|react-dom|three)(\/[^']*)?'/)
      expect(text, file).not.toMatch(/from '(@\/ui|@\/app|@\/engine|@\/nest|@\/cam|@\/estimate|\.\.\/)/)
    }
  })
})
