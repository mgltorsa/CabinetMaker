/** Short random id for user-created entities (cabinets, bays, sections). */
export function newId(prefix: string): string {
  const rnd = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${rnd}`
}
