import { describe, expect, it } from 'vitest'
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
