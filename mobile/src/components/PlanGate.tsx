import { Button } from '@/components/Button'
import { Banner } from '@/components/Surfaces'
import { now } from '@/lib/clock'
import { go } from '@/lib/nav'
import { canChat, planState } from '@/lib/plan'
import { useDb } from '@/store/db'

/** Whether the member has an active plan. The whole platform needs one, except urgent help, the help centre, settings and billing. */
export function usePlan(): boolean {
  const sub = useDb((s) => s.subscription)
  return canChat(planState(sub, now()))
}

/** Shown where a feature needs a plan: what is locked, why, and a way to get one. */
export function PlanGate({ what = 'This part of Echo', testID = 'plan-gate' }: { what?: string; testID?: string }) {
  return (
    <>
      <Banner testID={testID} tone="sun" icon="lock" title="A plan unlocks this">
        {what} is for members with an active plan. Urgent help, the help centre and your settings are always free.
      </Banner>
      <Button testID={`${testID}-plans`} label="See plans" onPress={() => go('/plans')} />
    </>
  )
}
