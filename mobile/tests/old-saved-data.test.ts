import AsyncStorage from '@react-native-async-storage/async-storage'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LANGUAGES } from '../src/api/types'
import { getDb, loadDb } from '../src/store/db'
import { SESSION_MONEY } from '../src/lib/sessionMoney'

describe('data saved by an older version of the app', () => {
  it('gets everything added since filled in, so no screen finds a list missing', async () => {
    // What an earlier version saved: content without languages or the session money rules.
    await AsyncStorage.setItem('echo.demo.v1', JSON.stringify({ content: { topics: ['Anxiety'], limits: { graceDays: 3, penNameChangeDays: 30, deletionHoldDays: 14 }, plans: [] } }))
    await loadDb()
    const c = getDb().content
    expect(c.languages).toEqual([...DEFAULT_LANGUAGES])
    expect(c.sessionMoney.lateCancelFeePct).toBe(10)
    expect(c.topics).toEqual(['Anxiety'])
    expect(c.limits.graceDays).toBe(3)
    expect(SESSION_MONEY.lateCancelFeePct).toBe(10)
  })
})
