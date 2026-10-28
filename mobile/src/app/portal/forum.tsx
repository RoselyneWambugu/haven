import { useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { relative } from '@/lib/time'
import { useDb } from '@/store/db'

/** The community, with a therapist's view. Replies give general information and never invite clients to book or make contact (PRD FRM-2, FRM-8). */
export default function PortalForum() {
  const all = useDb((s) => s.posts)
  const posts = all.filter((p) => p.status === 'published' && !p.mine)
  const [replying, setReplying] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <PortalPage testID="portal-forum" title="Forum" sub="Reply with general information. This is not treatment, and it can’t be used to find clients.">
      {posts.map((p) => {
        const mine = p.comments.filter((c) => c.therapistId)
        return (
          <Panel key={p.id} testID={`fpost-${p.id}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Avatar kind={p.authorAvatar} size={28} ring={false} />
              <Text variant="small" bold>
                {p.authorName}
              </Text>
              <Text variant="caption" muted>
                {relative(p.createdAt, now())}
              </Text>
              <View style={{ flex: 1 }} />
              <Badge label={p.topic} tone="plain" />
            </View>
            <Text variant="h3">{p.title}</Text>
            <Text variant="small" muted>
              {p.body}
            </Text>
            <Text variant="caption" muted>
              {p.comments.length} comments{mine.length ? ` · ${mine.length} from therapists` : ''}
            </Text>
            {replying === p.id ? (
              <View style={{ gap: 8 }}>
                <Field testID="fpost-reply" label="Your reply" hideLabel multiline minHeight={90} placeholder="General information only…" value={text} onChangeText={(v) => { setText(v); setError(null) }} />
                {error ? (
                  <Banner tone="clay" icon="shield">
                    {error}
                  </Banner>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    testID="fpost-send"
                    label="Reply as therapist"
                    onPress={async () => {
                      const r = await api.portal.forumReply(p.id, text)
                      if (!r.ok) return setError(r.error)
                      setText('')
                      setReplying(null)
                    }}
                  />
                  <Button variant="ghost" label="Cancel" onPress={() => setReplying(null)} />
                </View>
              </View>
            ) : (
              <Button testID={`reply-${p.id}`} size="sm" variant="quiet" label="Reply" onPress={() => { setReplying(p.id); setText(''); setError(null) }} />
            )}
          </Panel>
        )
      })}
    </PortalPage>
  )
}
