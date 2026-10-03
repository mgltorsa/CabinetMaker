/** Guards for user-entered estimate settings. */

/** Non-finite or negative numbers become 0. */
export function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}
