import { describe, expect, it } from 'vitest'
import type { Tool } from '@/core/types'
import { resolveTools } from './tools'
import { makeMachine, makeTools } from './testing/fixtures'

describe('resolveTools', () => {
  it('resolves the machine drill, dado and profile tools', () => {
    const { tools, warnings } = resolveTools(makeMachine(), makeTools())
    expect(tools.drill?.id).toBe('t3')
    expect(tools.dado?.id).toBe('t2')
    expect(tools.profile?.id).toBe('t1')
    expect(tools.endMills.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(warnings).toEqual([])
  })

  it('reports a missing tool as an error', () => {
    const { tools, warnings } = resolveTools(makeMachine({ dadoToolId: 'nope' }), makeTools())
    expect(tools.dado).toBeNull()
    expect(tools.endMills.map((t) => t.id)).toEqual(['t1'])
    expect(warnings).toEqual([expect.objectContaining({ level: 'error', code: 'cam/tool-missing' })])
    expect(warnings[0]?.message).toContain('nope')
  })

  it('rejects a tool with invalid numbers', () => {
    const tools = makeTools().map((t) => (t.id === 't3' ? { ...t, stepDown: 0 } : t))
    const result = resolveTools(makeMachine(), tools)
    expect(result.tools.drill).toBeNull()
    expect(result.warnings).toEqual([expect.objectContaining({ level: 'error', code: 'cam/tool-invalid' })])
  })

  it('does not use a drill as an end mill', () => {
    const result = resolveTools(makeMachine({ dadoToolId: 't3' }), makeTools())
    expect(result.tools.endMills.map((t) => t.id)).toEqual(['t1'])
  })
})

describe('resolveTools: tool kinds', () => {
  it('rejects a drill as the profile tool', () => {
    const result = resolveTools(makeMachine({ profileToolId: 't3' }), makeTools())
    expect(result.tools.profile).toBeNull()
    expect(result.warnings).toEqual([expect.objectContaining({ level: 'error', code: 'cam/tool-kind' })])
    expect(result.warnings[0]?.message).toMatch(/drill.*profile/)
  })

  it('rejects a drill as the dado tool', () => {
    const result = resolveTools(makeMachine({ dadoToolId: 't3' }), makeTools())
    expect(result.tools.dado).toBeNull()
    expect(result.warnings).toEqual([expect.objectContaining({ level: 'error', code: 'cam/tool-kind' })])
  })
})

describe('resolveTools: tool numbers', () => {
  it('reports two different machine tools with the same number', () => {
    const tools = makeTools().map((t) => (t.id === 't2' ? { ...t, number: 1 } : t))
    const result = resolveTools(makeMachine(), tools)
    expect(result.warnings).toEqual([expect.objectContaining({ level: 'error', code: 'cam/tool-number-duplicate' })])
    expect(result.warnings[0]?.message).toMatch(/T1/)
  })

  it('accepts one tool used for two roles', () => {
    expect(resolveTools(makeMachine({ dadoToolId: 't1' }), makeTools()).warnings).toEqual([])
  })

  it('ignores duplicate numbers on tools the machine does not use', () => {
    const t2 = makeTools().find((t) => t.id === 't2')
    if (!t2) throw new Error('fixture tool t2 missing')
    const spare: Tool = { ...t2, id: 'spare', number: 1 }
    expect(resolveTools(makeMachine(), [...makeTools(), spare]).warnings).toEqual([])
  })
})
