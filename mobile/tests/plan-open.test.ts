import { afterEach, describe, expect, it } from 'vitest'
import { canChat, planState, setOpenPlans } from '../src/lib/plan'

describe('the testing switch that opens everything that needs a plan', () => {
  afterEach(() => setOpenPlans(false))
  it('is off by default: no plan, no access', () => {
    expect(canChat(planState(null, 0))).toBe(false)
  })
  it('opens access for someone with no plan while on, and closes again', () => {
    setOpenPlans(true)
    expect(canChat(planState(null, 0))).toBe(true)
    setOpenPlans(false)
    expect(canChat(planState(null, 0))).toBe(false)
  })
})
