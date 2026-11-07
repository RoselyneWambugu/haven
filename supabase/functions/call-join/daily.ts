// Daily (https://www.daily.co) for Echo's voice and video sessions. Secrets, set in the Supabase dashboard under Edge Functions > Secrets:
//   DAILY_API_KEY   a Daily API key (Daily dashboard > Developers)
//   DAILY_DOMAIN    your Daily subdomain, for example "echo" for echo.daily.co (a full host name also works)
// The pure parts (names, settings, the address) have no network calls so they can be tested.

declare const Deno: { env: { get(key: string): string | undefined } }

export interface CallCtx {
  room: string
  mode: 'voice' | 'video'
  name: string
  is_therapist: boolean
  /** Milliseconds since 1970. */
  start: number
  end: number
}

const MIN = 60

export const dailyConfigured = (): boolean => !!Deno.env.get('DAILY_API_KEY') && !!Deno.env.get('DAILY_DOMAIN')

/** "echo" gives echo.daily.co; "echo.daily.co" is used as it is. */
export function dailyHost(domain: string): string {
  const d = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return d.includes('.') ? d : `${d}.daily.co`
}

/** The address a person opens to be in the room. The token says who they are and what they may do. */
export function callUrl(domain: string, room: string, token: string): string {
  return `https://${dailyHost(domain)}/${room}?t=${encodeURIComponent(token)}`
}

/**
 * A private room that closes 30 minutes after the session ends and holds only the two people. Nobody can record or share a screen,
 * and the camera starts off. Joining needs a token.
 */
export function roomProps(c: CallCtx): Record<string, unknown> {
  return {
    name: c.room,
    privacy: 'private',
    properties: {
      exp: Math.floor(c.end / 1000) + 30 * MIN,
      eject_at_room_exp: true,
      max_participants: 2,
      enable_chat: false,
      enable_screenshare: false,
      enable_knocking: false,
      enable_prejoin_ui: true,
      start_video_off: true,
      start_audio_off: false,
    },
  }
}

/**
 * A meeting token for one person: it works from 10 minutes before the start until 15 minutes after the end. The therapist is the room's owner.
 * A voice session can send audio only, so a camera can't be switched on by mistake.
 */
export function tokenProps(c: CallCtx, userId: string): Record<string, unknown> {
  return {
    properties: {
      room_name: c.room,
      user_name: c.name,
      user_id: userId,
      is_owner: c.is_therapist,
      nbf: Math.floor(c.start / 1000) - 10 * MIN,
      exp: Math.floor(c.end / 1000) + 15 * MIN,
      eject_at_token_exp: true,
      start_video_off: true,
      start_audio_off: false,
      enable_screenshare: false,
      permissions: { hasPresence: true, canSend: c.mode === 'video' ? ['audio', 'video'] : ['audio'] },
    },
  }
}

const API = 'https://api.daily.co/v1'
const headers = () => ({ Authorization: `Bearer ${Deno.env.get('DAILY_API_KEY')}`, 'Content-Type': 'application/json' })

/** Makes sure the room exists, then returns a token for this person. */
export async function openRoom(c: CallCtx, userId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const have = await fetch(`${API}/rooms/${encodeURIComponent(c.room)}`, { headers: headers() })
    if (have.status === 404) {
      const made = await fetch(`${API}/rooms`, { method: 'POST', headers: headers(), body: JSON.stringify(roomProps(c)) })
      if (!made.ok) return { ok: false, error: `room ${made.status}` }
    } else if (!have.ok) {
      return { ok: false, error: `room ${have.status}` }
    }
    const t = await fetch(`${API}/meeting-tokens`, { method: 'POST', headers: headers(), body: JSON.stringify(tokenProps(c, userId)) })
    const j = await t.json().catch(() => ({}))
    if (!t.ok || !j.token) return { ok: false, error: `token ${t.status}` }
    return { ok: true, url: callUrl(Deno.env.get('DAILY_DOMAIN')!, c.room, String(j.token)) }
  } catch (e) {
    return { ok: false, error: `unreachable ${String(e).slice(0, 80)}` }
  }
}
