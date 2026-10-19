let n = 0
/** Short unique ids. Good enough for local demo data; a real backend issues its own. */
export function uid(prefix = 'x'): string {
  n += 1
  return `${prefix}-${Date.now().toString(36)}${n.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
}
