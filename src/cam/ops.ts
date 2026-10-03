/** Dispatch one panel op: reject what a 3-axis router cannot do, plan the rest. */
import type { Op } from '@/core/types'
import { invalidOpFields, opOutsidePartReason } from './checks'
import type { PartContext } from './context'
import { planDado, planMortise } from './grooves'
import { planHole } from './holes'
import type { OpPlan } from './types'

function faceReason(op: Op): string | null {
  if (op.face === 'A') return null
  if (op.face === 'B') return 'on face B: the router only reaches face A (flip the part or cut by hand)'
  return `on ${op.face}: edge ${op.kind === 'hole' ? 'bores' : 'ops'} need a horizontal drill or a jig`
}

function manual(reason: string): OpPlan {
  return { status: 'manual', reason, warnings: [] }
}

export function planOp(op: Op, ctx: PartContext): OpPlan {
  const face = faceReason(op)
  if (face) return manual(face)
  const invalid = invalidOpFields(op)
  if (invalid.length > 0) return manual(`invalid ${op.kind}: ${invalid.join(', ')} must be finite and positive`)
  const outside = opOutsidePartReason(ctx, op)
  if (outside) return manual(outside)
  switch (op.kind) {
    case 'hole':
      return planHole(op, ctx)
    case 'dado':
      return planDado(op, ctx)
    case 'mortise':
      return planMortise(op, ctx)
  }
}
