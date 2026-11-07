import { createElement } from 'react'

/** The call itself, in a browser: Daily's page in a frame that may use the camera and microphone. */
export function CallFrame({ url }: { url: string }) {
  return createElement('iframe', {
    src: url,
    title: 'Session call',
    allow: 'camera; microphone; autoplay; fullscreen; display-capture',
    'data-testid': 'call-frame',
    style: { border: 0, width: '100%', height: '100%', minHeight: 360, borderRadius: 16, backgroundColor: '#102F27' },
  })
}
