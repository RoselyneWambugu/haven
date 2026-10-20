/** Prices are placeholders until D2 and D3 are decided, so a missing price shows as "KES ___". */
export function kes(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return 'KES ___'
  return `KES ${Math.round(amount).toLocaleString('en-US')}`
}
