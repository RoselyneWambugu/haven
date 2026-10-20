import { View } from 'react-native'
import { api } from '@/api'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Panel, PortalPage, Stat, useWide } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { canJoin } from '@/lib/booking'
import { go } from '@/lib/nav'
import { licenceStatus } from '@/lib/portal'
import { clock, eat, isSameEatDay } from '@/lib/time'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'
import { colors } from '@/theme'

const MODE = { chat: 'Chat', voice: 'Voice', video: 'Video' } as const

/** The working home: what is next, who needs a reply, and what needs attention. Nothing is ranked or scored (THR-15). */
export default function Today() {
  const p = useDb((s) => s.portal)
  const wide = useWide()
  if (!p) return null
  const th = THERAPISTS.find((t) => t.id === p.therapistId)!
  const t = useNow()
  const today = p.sessions.filter((s) => s.status !== 'completed' && isSameEatDay(s.start, t)).sort((a, b) => a.start - b.start)
  const upcoming = p.sessions.filter((s) => s.status !== 'completed' && s.end > t).sort((a, b) => a.start - b.start)
  const unread = p.threads.reduce((n, x) => n + x.unread, 0)
  const licence = licenceStatus(p.licenceValidTo, t)
  const h = eat(t).hour
  const hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  const first = th.name.startsWith('Dr.') ? `Dr. ${th.name.split(' ').pop()}` : th.name.split(' ')[0]

  return (
    <PortalPage testID="portal-today" title={`${hello}, ${first}`} sub="Here is your day.">
      {licence.state !== 'ok' ? (
        <Banner tone="sun" icon="clock" title={licence.state === 'expired' ? 'Your licence has expired' : `Your licence expires in ${licence.days} days`}>
          {licence.state === 'expired' ? 'You’re hidden from booking until you upload a renewal.' : 'Upload your renewal to stay listed.'}
        </Banner>
      ) : null}
      {p.review ? (
        <Banner testID="review-notice" tone="sun" icon="shield" title={p.review.kind === 'paused' ? 'Paused by a clinical review' : 'A clinical reviewer has written to you'}>
          {p.review.text}
        </Banner>
      ) : null}
      {p.paused && p.review?.kind !== 'paused' ? (
        <Banner tone="sun" icon="lock" title="New clients are paused">
          Existing clients are unaffected. You can turn this off in Calendar.
        </Banner>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat value={String(today.length)} label="Sessions today" />
        <Stat value={String(unread)} label="Unread messages" tone={unread ? 'sun' : undefined} />
        <Stat value={String(p.threads.filter((x) => !x.closed && x.nextSession === null).length)} label="New requests" />
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <Panel title="Upcoming" style={{ flex: wide ? 2 : undefined, width: wide ? undefined : '100%' }}>
          {upcoming.length ? (
            upcoming.slice(0, 6).map((s) => {
              const open = canJoin(s.start, s.end, t) || s.status === 'in-progress'
              const mins = Math.max(0, Math.round((s.start - t) / 60000))
              return (
                <View key={s.id} testID={`today-${s.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, flexWrap: 'wrap' }}>
                  <Text variant="label" style={{ width: 54 }}>
                    {clock(s.start)}
                  </Text>
                  <Avatar kind={s.clientAvatar} size={34} ring={false} />
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Text variant="label">{s.clientName}</Text>
                    <Text variant="caption" muted>
                      {s.number === 1 ? 'First session' : `Session ${s.number}`} · {MODE[s.mode]}
                    </Text>
                  </View>
                  {open ? (
                    <Button testID={`join-${s.id}`} size="sm" label={s.status === 'in-progress' ? 'Rejoin' : 'Join'} onPress={() => { const r = api.portal.join(s.id); if (r.ok) go(`/portal/session/${s.id}`) }} />
                  ) : (
                    <Text variant="caption" muted>
                      {mins < 60 ? `Join in ${Math.max(0, mins - 10)} min` : isSameEatDay(s.start, t) ? 'Later today' : 'Upcoming'}
                    </Text>
                  )}
                </View>
              )
            })
          ) : (
            <Text variant="small" muted>
              No sessions booked. Add availability in Calendar so clients can book you.
            </Text>
          )}
        </Panel>
        <Panel title="Needs a reply" style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%' }}>
          {p.threads.filter((x) => x.unread > 0).length ? (
            p.threads.filter((x) => x.unread > 0).map((x) => (
              <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar kind={x.clientAvatar} size={30} ring={false} />
                <Text variant="small" style={{ flex: 1 }}>
                  {x.clientName}
                </Text>
                <Badge tone="sun" label={`${x.unread} new`} />
              </View>
            ))
          ) : (
            <Text variant="small" muted>
              You’re all caught up.
            </Text>
          )}
          <Button testID="open-inbox" variant="quiet" label="Open inbox" onPress={() => go('/portal/inbox')} />
        </Panel>
      </View>
      <Text variant="caption" color={colors.muted}>
        Clients are anonymous. You see a pen name and avatar only.
      </Text>
    </PortalPage>
  )
}
