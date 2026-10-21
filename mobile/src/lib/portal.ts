import type { AvailabilityBlock, Mode } from './booking'

// ---------------------------------------------------------------------------
// Weekly availability grid (PRD THR-5, THR-16). A cell is one hour on one weekday.
// ---------------------------------------------------------------------------

export type Cell = 'off' | 'chat' | 'voice' | 'all'
const MODES: Record<Exclude<Cell, 'off'>, Mode[]> = { chat: ['chat'], voice: ['chat', 'voice'], all: ['chat', 'voice', 'video'] }
export const CELL_ORDER: Cell[] = ['off', 'chat', 'voice', 'all']
export const cellKey = (dow: number, hour: number): string => `${dow}-${hour}`
export const nextCell = (c: Cell): Cell => CELL_ORDER[(CELL_ORDER.indexOf(c) + 1) % CELL_ORDER.length]

const hourOf = (hhmm: string): number => Number(hhmm.split(':')[0])
const pad = (n: number): string => String(n).padStart(2, '0')

function cellFor(modes: Mode[]): Cell {
  if (modes.includes('video')) return 'all'
  if (modes.includes('voice')) return 'voice'
  return 'chat'
}

export function blocksToCells(blocks: AvailabilityBlock[]): Record<string, Cell> {
  const cells: Record<string, Cell> = {}
  for (const b of blocks) for (let h = hourOf(b.start); h < hourOf(b.end); h++) cells[cellKey(b.dow, h)] = cellFor(b.modes)
  return cells
}

/** Joins neighbouring hours with the same modes back into blocks. */
export function cellsToBlocks(cells: Record<string, Cell>): AvailabilityBlock[] {
  const out: AvailabilityBlock[] = []
  for (let dow = 0; dow < 7; dow++) {
    let run: { start: number; cell: Exclude<Cell, 'off'> } | null = null
    const close = (endHour: number) => {
      if (run) out.push({ dow, start: `${pad(run.start)}:00`, end: `${pad(endHour)}:00`, modes: MODES[run.cell] })
      run = null
    }
    for (let h = 6; h <= 22; h++) {
      const c = cells[cellKey(dow, h)] ?? 'off'
      if (c === 'off') close(h)
      else if (!run || run.cell !== c) {
        close(h)
        run = { start: h, cell: c }
      }
    }
    close(23)
  }
  return out
}

// ---------------------------------------------------------------------------
// Licence reminders (THR-3, THR-15): a warning 60 days ahead, hidden once it has expired.
// ---------------------------------------------------------------------------

export const LICENCE_WARNING_DAYS = 60

export function licenceStatus(validTo: number, now: number): { state: 'ok' | 'expiring' | 'expired'; days: number } {
  const days = Math.ceil((validTo - now) / 86_400_000)
  if (days <= 0) return { state: 'expired', days: 0 }
  return { state: days <= LICENCE_WARNING_DAYS ? 'expiring' : 'ok', days }
}

// ---------------------------------------------------------------------------
// Forum replies by therapists give general information and never solicit clients (FRM-8).
// ---------------------------------------------------------------------------

const SOLICIT: RegExp[] = [
  /\b(book|see|visit|consult)\s+(a\s+session\s+)?with\s+me\b/i,
  /\b(message|dm|pm|inbox|contact|call|text|whatsapp)\s+me\b/i,
  /\bmy\s+(clinic|practice|rates|fees|prices|services|number|page)\b/i,
  /\bi\s+(charge|offer\s+(sessions|therapy|counselling)|can\s+treat|can\s+help\s+you\s+privately)\b/i,
  /\b(private|one[- ]on[- ]one)\s+(session|therapy|counselling)\b/i,
  /\bhire\s+me\b/i,
]

export function detectSolicitation(text: string): boolean {
  return SOLICIT.some((r) => r.test(text))
}

// ---------------------------------------------------------------------------
// Earnings (THR-20). The fee is a placeholder until D3 is decided.
// ---------------------------------------------------------------------------

export const PLACEHOLDER_FEE_PCT = 0.15
export const HOLD_HOURS = 24

/** The fee fixed on a session when it was completed (the server's), or the placeholder rate in the demo. */
export function split(gross: number | null, fixedFee?: number | null): { gross: number | null; fee: number | null; net: number | null } {
  if (gross === null) return { gross: null, fee: null, net: null }
  const fee = fixedFee ?? Math.round(gross * PLACEHOLDER_FEE_PCT)
  return { gross, fee, net: gross - fee }
}

/** A session is paid out after the hold period. Until then it is pending. */
export function isAvailable(endedAt: number, now: number): boolean {
  return now - endedAt >= HOLD_HOURS * 3_600_000
}
