import type { CrisisLine, HelpArticle, HelpDepartment, PlanDef, SupportOrg } from '@/api/types'

const D = 24 * 3600_000
const base = Date.UTC(2026, 9, 2)

export const DEPARTMENTS: HelpDepartment[] = [
  { id: 'start', title: 'Getting started', blurb: 'How Echo works', icon: 'rocket' },
  { id: 'account', title: 'Account and profiles', blurb: 'Public and private', icon: 'person' },
  { id: 'privacy', title: 'Privacy and anonymity', blurb: 'What others can see', icon: 'lock' },
  { id: 'safety', title: 'Safety and reporting', blurb: 'Block, report, appeals', icon: 'shield' },
  { id: 'billing', title: 'Billing and plans', blurb: 'Payments and refunds', icon: 'wallet' },
  { id: 'therapists', title: 'Therapists and sessions', blurb: 'Booking and calls', icon: 'heart' },
  { id: 'forum', title: 'Community', blurb: 'Posts and comments', icon: 'forum' },
  { id: 'tech', title: 'Technical support', blurb: 'Something not working', icon: 'tool' },
  { id: 'feedback', title: 'Feedback', blurb: 'Tell us what to improve', icon: 'pencil' },
]

const a = (id: string, deptId: string, title: string, intro: string, steps: string[], related: string[] = [], days = 12): HelpArticle => ({
  id, deptId, title, intro, steps, related, updatedAt: base + days * D,
})

export const ARTICLES: HelpArticle[] = [
  a('how-echo-works', 'start', 'How does Echo work?', 'Echo is a private place to talk. You use a pen name, never your real name.', [
    'Sign up with your phone number and choose a pen name and avatar.',
    'We match you with someone in your age range who speaks your language.',
    'Chat with your match, share in the community, or book a verified therapist.',
  ], ['peer-vs-therapist', 'what-others-see']),
  a('peer-vs-therapist', 'start', 'What is the difference between peer support and therapy?', 'Peers listen and share. Therapists are licensed professionals.', [
    'Peer support is people talking to people. It is not treatment, and nobody is a counsellor.',
    'Therapy is with a verified, licensed therapist, by chat, voice or video, priced per session.',
    'If you are in danger, use Urgent help. Echo is not an emergency service.',
  ], ['how-echo-works']),
  a('what-others-see', 'privacy', 'What can other members see about me?', 'Only your pen name, your avatar and your age range.', [
    'Your real name, phone number, ID and date of birth are in your private profile. Nobody sees them.',
    'In chat and the community, others see your pen name and avatar only.',
    'You can check exactly what others see in Me, then My profiles, then Preview.',
  ], ['why-no-links', 'private-profile']),
  a('why-no-links', 'privacy', 'Why can’t I send links, phone numbers or addresses?', 'It keeps everyone anonymous and keeps Echo from becoming a dating site.', [
    'Phone numbers, links, email addresses, social handles and addresses are blocked before they are sent.',
    'Nothing is delivered and nobody is told. You will see a short explanation.',
    'If you need to share something urgent with a therapist, tell them in your session. They will follow the safety process.',
  ], ['what-others-see']),
  a('private-profile', 'account', 'How do I see my private profile?', 'Your private profile holds your real details. It needs a quick phone check to open.', [
    'Open Me, then My profiles, then Private.',
    'Choose Verify it’s you. We send a six-digit code to your phone.',
    'Enter the code to see your details. You can ask us to correct them.',
  ], ['what-others-see']),
  a('change-pen-name', 'account', 'How do I change my pen name?', 'You can change it, with a limit, and your chats keep working.', [
    'Open Me, then My profiles, then Public, then Edit.',
    'Choose a new name. We check it can’t be mistaken for a real name.',
    'You can change it again after 30 days.',
  ], ['what-others-see']),
  a('how-to-block', 'safety', 'How does blocking work?', 'Blocking is immediate and silent. They are not told.', [
    'Open the chat and choose the menu, then Block.',
    'You and the other person will never be matched or see each other again.',
    'You can unblock in Settings, then Privacy and data, then Blocked members.',
  ], ['how-to-report']),
  a('how-to-report', 'safety', 'How do I report someone?', 'Reports are private. They are never told it was you.', [
    'Choose Report on any message, post or comment.',
    'Pick what is happening. You can add a note.',
    'A trained reviewer looks at the reported messages and decides what to do.',
    'You will see an outcome. We can’t share details about the other person.',
  ], ['after-report', 'how-to-block']),
  a('after-report', 'safety', 'What happens after I report?', 'A person reviews every report.', [
    'We receive it. A trained reviewer looks at the reported messages.',
    'We decide. They may warn, restrict or suspend the person, or take no action.',
    'We let you know. You will see an outcome. We can’t share details about the other person.',
  ], ['how-to-report']),
  a('strikes', 'safety', 'What are notices and suspensions?', 'When the guidelines are broken you get a notice that explains the rule.', [
    'First notice: a warning with the rule explained.',
    'Second notice: a short restriction.',
    'Third notice: your account is paused while our team reviews it.',
    'You can appeal any notice. A different reviewer decides.',
  ], ['appeal']),
  a('appeal', 'safety', 'How do I appeal a decision?', 'Every notice can be appealed in the app.', [
    'Open Me, then Account standing.',
    'Choose Appeal this notice and tell us what happened in your own words.',
    'A different reviewer will look at it and reply in the app.',
  ], ['strikes']),
  a('refunds', 'billing', 'How do refunds work?', 'If you were charged by mistake we will put it right.', [
    'If you were charged twice or got no access, contact the Billing team from Help.',
    'A person checks your payment reference and replies in the app.',
    'Refunds go back to the same M-Pesa number or card.',
  ], ['payment-failed']),
  a('payment-failed', 'billing', 'Payment failed or charged twice', 'You have not been charged if the payment did not go through.', [
    'Check your M-Pesa messages. If money left your account, we refund it automatically within 24 hours.',
    'Try again, or choose another payment method.',
    'Still stuck? Contact the Billing team and include your payment reference. Never share your PIN.',
  ], ['refunds']),
  a('cancel-plan', 'billing', 'How do I cancel my plan?', 'Cancelling takes two taps and you keep access until the end of the period.', [
    'Open Me, then My plan.',
    'Choose Cancel plan and confirm.',
    'Your chats become read-only after the end date, and your history is kept.',
  ], ['refunds']),
  a('book-session', 'therapists', 'How do I book a therapist?', 'Choose how to talk, then a time.', [
    'Open Therapists and pick someone.',
    'Choose chat, voice or video, then a time.',
    'Pay for the session. You will get reminders one hour and ten minutes before.',
  ], ['change-session', 'camera-off']),
  a('change-session', 'therapists', 'Can I change or cancel a session?', 'Yes. It is free until 24 hours before the start.', [
    'Open Therapists, then My sessions.',
    'Choose Reschedule or Cancel on the session.',
    'After the free-change deadline, changes or no-shows may be charged.',
  ], ['book-session']),
  a('camera-off', 'therapists', 'Do I have to show my face on a video call?', 'No. Your camera is off by default.', [
    'You appear as your pen name and avatar.',
    'You can turn your camera on during the call if you want to.',
    'Sessions are never recorded.',
  ], ['book-session']),
  a('forum-rules', 'forum', 'What can I post in the community?', 'Anything that helps you or others, without identifying details.', [
    'Be kind. No links, phone numbers or addresses.',
    'Avoid names, workplaces and places that could identify you. We warn you before you post.',
    'Your first post is checked before it appears. After that, posts appear straight away.',
  ], ['why-no-links']),
  a('slow-app', 'tech', 'The app is slow or not loading', 'Echo is built for slow connections, but sometimes things go wrong.', [
    'Check your data or Wi-Fi. Voice and chat use much less data than video.',
    'Close and open the app again.',
    'If it still fails, send us a ticket from Help and say which screen it happens on.',
  ]),
]

export const POPULAR = ['how-echo-works', 'why-no-links', 'refunds', 'change-session']

export function searchArticles(q: string): HelpArticle[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return ARTICLES.filter((x) => {
    const hay = `${x.title} ${x.intro} ${x.steps.join(' ')}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

/** Placeholder numbers. They MUST be verified by the clinical team before launch (D29). */
export const EMERGENCY: CrisisLine = { name: 'Emergency services', phone: '112', hours: 'Always open', languages: 'Any language' }

export const CRISIS_LINES: CrisisLine[] = [
  { name: 'Crisis line name ___', phone: '', hours: 'Free, 24 hours', languages: 'English and Kiswahili' },
  { name: 'Helpline name ___', phone: '', hours: 'Free, 8am to 10pm', languages: 'English' },
]

export const SUPPORT_ORGS: SupportOrg[] = [
  { id: 'o1', name: 'Organisation name ___', type: 'Counselling', cost: 'Free', hours: 'Mon to Fri', languages: 'English, Kiswahili', action: 'contact', value: '' },
  { id: 'o2', name: 'Helpline name ___', type: 'Helpline', cost: 'Free', hours: '24 hours', languages: 'English', action: 'call', value: '' },
  { id: 'o3', name: 'Legal aid for abuse ___', type: 'Legal', cost: 'Free', hours: 'Mon to Fri, Nairobi', languages: 'English, Kiswahili', action: 'web', value: '' },
]

/** Prices are placeholders until D2 is decided. The amounts are only shown in demo mode. */
export const PLANS: PlanDef[] = [
  { id: 'daily', label: 'Daily', period: 'per day', blurb: 'Try it for a day', priceKes: 100, days: 1 },
  { id: 'monthly', label: 'Monthly', period: 'per month', blurb: 'Renews each month', priceKes: 1500, days: 30 },
  { id: 'yearly', label: 'Yearly', period: 'per year', blurb: 'Best value', priceKes: 12000, days: 365 },
]

export const ALWAYS_FREE = ['Urgent help and crisis lines', 'Help centre and support tickets', 'Block, report and your data', 'The community, to read and post']
export const PLAN_INCLUDES = ['Automatic matching and unlimited peer chat', 'Disappearing chats', 'Posting and commenting in the community', 'Discount on therapy sessions']
