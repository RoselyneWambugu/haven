import { detectDistress } from '@/lib/safety'

/**
 * A stand-in for the person on the other end, so the demo has something to talk to.
 * Replies are gentle and never give advice. A real backend replaces this entirely.
 */
const GENERAL = [
  'That sounds really hard. Thank you for telling me.',
  'I’m here. Take your time.',
  'That makes sense. How are you feeling about it now?',
  'What has been the heaviest part of it?',
  'I’ve felt something like that too. What helps you get through a day like this?',
  'I hear you. You don’t have to explain it perfectly.',
]
const QUESTION = ['That’s a good question. I’m not sure. What do you think?', 'I don’t have the answer, but I’m glad you asked. What feels true for you?']
const THANKS = ['You’re welcome. I’m glad it helped.', 'Of course. I’m here whenever you want to talk.']

let i = 0
export function peerReply(text: string): string {
  const d = detectDistress(text)
  if (d.level === 'high') {
    return 'I’m really glad you told me. I’m not a professional, but there are people who can help right now. The Urgent help button at the top is always there. Would you like to talk to a therapist?'
  }
  if (d.level === 'possible') return 'That sounds exhausting. Have you been able to talk to anyone else about it? A therapist on Echo could help too.'
  i += 1
  if (/thank/i.test(text)) return THANKS[i % THANKS.length]
  if (text.includes('?')) return QUESTION[i % QUESTION.length]
  return GENERAL[i % GENERAL.length]
}

export function therapistThreadReply(): string {
  return 'Thank you for your message. I’ll read it before our session. If it is urgent, please use Urgent help.'
}

export const STAFF_REPLIES: Record<string, string> = {
  billing: 'Thanks for flagging this. We’ve checked your payment reference and approved a refund. It should reach you in 1 to 3 working days.',
  tech: 'Thanks for telling us. Could you tell us which screen it happens on? We’re looking into it.',
  safety: 'Thank you for contacting us. A member of the safety team will look at this today.',
  default: 'Thanks for getting in touch. We’ve read your message and someone will follow up here in the app.',
}

export const CRISIS_STAFF_REPLY =
  'We’re really glad you wrote. A trained member of our team has seen your message and will reply shortly. If you are in danger right now, please call emergency services or use Urgent help in the app.'
