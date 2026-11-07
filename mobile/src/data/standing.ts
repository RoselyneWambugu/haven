/**
 * How account standing works, in the words the member sees. It follows the strike ladder (PRD §6.7): each notice is recorded,
 * strikes fade after a while with no further problems, and a restriction ends by itself. Numbers are left out on purpose, because staff
 * can change the policy; the notice itself always says when it ends.
 */
export interface StandingTier {
  key: 'good' | 'warning' | 'restricted' | 'paused'
  title: string
  body: string
}

export const STANDING_TIERS: StandingTier[] = [
  { key: 'good', title: 'In good standing', body: 'Nothing is limited. Everything on Echo works as normal.' },
  { key: 'warning', title: 'Warning', body: 'You broke a community guideline. The notice says which one. Nothing else changes, but it counts as a strike.' },
  { key: 'restricted', title: 'Restricted', body: 'For a short time you can’t send new messages. You can still read, use help and manage your plan. It ends on its own, and the notice says when.' },
  { key: 'paused', title: 'Paused', body: 'Your account is paused while our team reviews it. This happens after repeated notices, or straight away for the most serious harm. You can still reach urgent help.' },
]

export const STANDING_HOW = 'Each notice you receive is a strike. Strikes fade after a while if there are no more. A first one is a warning, a second is a restriction, and a third pauses the account for review. A very serious one can pause the account straight away. A different reviewer from the person who decided will read any appeal.'

export const IF_NOT_GOOD: string[] = [
  'Read the notice. It names the rule and says what it means for you.',
  'If you think it’s wrong, tap Appeal on the notice and tell us what happened in your own words. A different reviewer decides, and the outcome is written to you.',
  'You keep urgent help, the help centre, your plan and billing, and your data, whatever your standing.',
  'A restriction ends on its own. Warnings fade if you have no further notices.',
  'Read the community guidelines again in the help centre. If you need to talk to someone about a notice, open a help ticket and a person will reply.',
]
