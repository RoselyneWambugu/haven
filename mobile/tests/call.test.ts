import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { joinCall } from '../src/backend/remoteCall'
// The provider helpers used here have no network calls in them.
import { callUrl, dailyHost, roomProps, tokenProps, type CallCtx } from '../../supabase/functions/call-join/daily'

const fake = (reply: { data?: unknown; error?: unknown } | (() => never)) => {
  const calls: { name: string; body: unknown }[] = []
  setClient({
    functions: {
      invoke: async (name: string, o: { body: unknown }) => {
        calls.push({ name, body: o.body })
        if (typeof reply === 'function') return reply()
        return { data: reply.data ?? null, error: reply.error ?? null }
      },
    },
  } as unknown as SupabaseClient)
  return calls
}

describe('joining a call from the app', () => {
  it('asks the server for the session’s room and returns the address', async () => {
    const calls = fake({ data: { ok: true, url: 'https://echo.daily.co/echo-1?t=abc', mode: 'voice' } })
    expect(await joinCall('s-1')).toEqual({ ok: true, url: 'https://echo.daily.co/echo-1?t=abc' })
    expect(calls).toEqual([{ name: 'call-join', body: { session_id: 's-1' } }])
  })
  it('passes on the reason when the server says no', async () => {
    fake({ data: { ok: false, code: 'early', error: 'The session opens 10 minutes before it starts.' } })
    expect(await joinCall('s-1')).toEqual({ ok: false, code: 'early', error: 'The session opens 10 minutes before it starts.' })
    fake({ data: { ok: false, code: 'unavailable', error: 'Calls aren’t switched on yet.' } })
    expect(await joinCall('s-1')).toMatchObject({ ok: false, code: 'unavailable' })
  })
  it('says so plainly when the server can’t be reached', async () => {
    fake({ error: { message: 'boom' } })
    expect(await joinCall('s-1')).toMatchObject({ ok: false, code: 'network' })
    fake(() => {
      throw new Error('offline')
    })
    expect(await joinCall('s-1')).toMatchObject({ ok: false, code: 'network' })
  })
})

describe('the private room and the token', () => {
  const start = 1_800_000_000_000
  const ctx = (over: Partial<CallCtx> = {}): CallCtx => ({ room: 'echo-abc', mode: 'video', name: 'QuietPine', is_therapist: false, start, end: start + 45 * 60_000, ...over })
  it('is a private room for two that nobody can record or share a screen in, with the camera off', () => {
    const r = roomProps(ctx()) as { privacy: string; properties: Record<string, unknown> }
    expect(r).toMatchObject({ name: 'echo-abc', privacy: 'private' })
    expect(r.properties).toMatchObject({ max_participants: 2, enable_screenshare: false, enable_chat: false, start_video_off: true, eject_at_room_exp: true })
    expect(r.properties.enable_recording).toBeUndefined()
    expect(r.properties.exp).toBe(start / 1000 + 45 * 60 + 30 * 60)
  })
  it('opens 10 minutes before the start and closes 15 minutes after the end', () => {
    const t = (tokenProps(ctx(), 'u1') as { properties: Record<string, unknown> }).properties
    expect(t.nbf).toBe(start / 1000 - 600)
    expect(t.exp).toBe(start / 1000 + 45 * 60 + 900)
    expect(t).toMatchObject({ room_name: 'echo-abc', user_name: 'QuietPine', user_id: 'u1', start_video_off: true, eject_at_token_exp: true })
  })
  it('makes the therapist the owner and a member a guest', () => {
    expect((tokenProps(ctx({ is_therapist: true }), 'u') as { properties: { is_owner: boolean } }).properties.is_owner).toBe(true)
    expect((tokenProps(ctx(), 'u') as { properties: { is_owner: boolean } }).properties.is_owner).toBe(false)
  })
  it('lets a voice session send audio only, and a video session audio and video', () => {
    const can = (c: CallCtx) => ((tokenProps(c, 'u') as { properties: { permissions: { canSend: string[] } } }).properties.permissions.canSend)
    expect(can(ctx({ mode: 'voice' }))).toEqual(['audio'])
    expect(can(ctx({ mode: 'video' }))).toEqual(['audio', 'video'])
  })
  it('builds the address from a short or a full domain', () => {
    expect(dailyHost('echo')).toBe('echo.daily.co')
    expect(dailyHost('https://echo.daily.co/')).toBe('echo.daily.co')
    expect(callUrl('echo', 'echo-abc', 'a b')).toBe('https://echo.daily.co/echo-abc?t=a%20b')
  })
})
