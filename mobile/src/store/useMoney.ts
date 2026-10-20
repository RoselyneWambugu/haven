import { CONFIG } from '@/data/config'
import { kes } from '@/lib/money'
import { useDb } from './db'

/** Formats an amount, or "KES ___" while prices are an open decision (D2, D3) and the demo flag is off. */
export function useMoney(): (amount: number | null | undefined) => string {
  const show = useDb((s) => s.demo.showPrices)
  return (amount) => kes(CONFIG.pricesDecided || show ? amount : null)
}
