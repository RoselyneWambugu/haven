import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Badge, Check } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Banner, Card, Divider, Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { now } from '@/lib/clock'
import { go, goBack } from '@/lib/nav'
import { relative } from '@/lib/time'
import { detectBlockedContent, explainBlock } from '@/lib/safety'
import { useDb } from '@/store/db'
import type { ReportReason } from '@/api'
import { colors } from '@/theme'

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'self-harm', label: 'Encourages self-harm' },
  { value: 'scam', label: 'Scam or asking for money' },
  { value: 'sexual', label: 'Sexual or unwanted content' },
  { value: 'other', label: 'Something else' },
]

const EDIT_MS = 15 * 60_000

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const post = useDb((s) => s.posts.find((p) => p.id === id))
  const forumOn = useDb((s) => s.content.flags.forum)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [reporting, setReporting] = useState<{ target: 'post' | 'comment'; id: string } | null>(null)
  const [reason, setReason] = useState<ReportReason>('harassment')
  const [editing, setEditing] = useState(false)
  const [eTitle, setETitle] = useState('')
  const [eBody, setEBody] = useState('')
  const [eError, setEError] = useState<string | null>(null)

  if (!post) {
    return (
      <Screen header={<TopBar back />} testID="post-gone">
        <Text variant="title">This post isn’t here</Text>
        <Button label="Back to Community" onPress={() => goBack('/forum')} />
      </Screen>
    )
  }

  const canEdit = post.mine && now() - post.createdAt <= EDIT_MS
  const draftBlock = detectBlockedContent(text)

  function sendComment() {
    const r = api.forum.comment(post!.id, text)
    if (!r.ok) return setError(r.error)
    setText('')
    setError(null)
  }

  return (
    <Screen
      testID="post-detail"
      keyboard
      header={
        <TopBar
          back
          right={
            <Pressable testID="post-menu" accessibilityRole="button" accessibilityLabel="Post options" onPress={() => setMenu(true)} hitSlop={8} style={{ padding: 8 }}>
              <Icon name="dots" size={22} color={colors.ink} />
            </Pressable>
          }
        />
      }
      footer={
        post.status === 'published' && forumOn ? (
          <View style={{ gap: 8 }}>
            {draftBlock.blocked ? (
              <Banner tone="clay" icon="shield">
                {explainBlock(draftBlock.reasons)}
              </Banner>
            ) : error ? (
              <Banner tone="clay">{error}</Banner>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Field testID="comment-input" label="Add a comment" hideLabel placeholder="Add a kind comment" value={text} onChangeText={(v) => { setText(v); setError(null) }} maxLength={600} />
              </View>
              <Button testID="comment-send" label="Send" size="sm" disabled={!text.trim() || draftBlock.blocked} onPress={sendComment} />
            </View>
          </View>
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar kind={post.authorAvatar} size={38} />
        <View style={{ flex: 1 }}>
          <Text variant="label">{post.authorName}</Text>
          <Text variant="caption" muted>
            {relative(post.createdAt, now())} · {post.topic}
          </Text>
        </View>
      </View>
      <Text variant="title">{post.title}</Text>
      <Text variant="body">{post.body}</Text>
      {post.status === 'pending' ? (
        <Banner tone="sun" icon="clock" title="Being checked">
          Only you can see this until it’s checked. Comments open once it’s live.
        </Banner>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          testID="support"
          accessibilityRole="button"
          accessibilityLabel={post.supportedByMe ? 'Remove your support' : 'Send support'}
          accessibilityState={{ selected: post.supportedByMe }}
          onPress={() => api.forum.toggleSupport(post.id)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: post.supportedByMe ? colors.moss : colors.lichen }}
        >
          <Icon name="heart" size={18} color={post.supportedByMe ? colors.white : colors.mossDeep} />
          <Text variant="label" color={post.supportedByMe ? colors.white : colors.mossDeep}>
            {post.supportedByMe ? 'You sent support' : 'Send support'} · {post.supports}
          </Text>
        </Pressable>
      </View>
      <Divider />
      <Text variant="h3">{post.comments.length ? `${post.comments.length} comment${post.comments.length === 1 ? '' : 's'}` : 'No comments yet'}</Text>
      {post.comments.map((c) => {
        const th = c.therapistId ? THERAPISTS.find((t) => t.id === c.therapistId) : null
        return (
          <Card key={c.id} tone={th ? 'lichen' : 'milk'}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {th ? <Icon name="shield" size={18} color={colors.mossDeep} /> : <Avatar kind={c.authorAvatar} size={26} ring={false} />}
              <Text variant="small" bold style={{ flexShrink: 1 }}>
                {c.authorName}
              </Text>
              {th ? <Badge icon="check" label="Verified therapist" /> : null}
              <View style={{ flex: 1 }} />
              <Text variant="caption" muted>
                {relative(c.at, now())}
              </Text>
            </View>
            {c.hiddenReason ? (
              <Text variant="small" muted italic style={{ marginTop: 6 }}>
                This comment was hidden because it shared contact details.
              </Text>
            ) : (
              <Text variant="small" style={{ marginTop: 6 }}>
                {c.text}
              </Text>
            )}
            {th ? (
              <View style={{ marginTop: 8, gap: 6 }}>
                <Text variant="caption" muted>
                  General information, not treatment or advice for you.
                </Text>
                <Pressable accessibilityRole="button" onPress={() => go(`/therapists/${th.id}`)} style={{ minHeight: 36, justifyContent: 'center' }}>
                  <Text variant="small" bold color={colors.mossDeep}>
                    View profile
                  </Text>
                </Pressable>
              </View>
            ) : !c.mine ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Report comment" onPress={() => setReporting({ target: 'comment', id: c.id })} style={{ minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' }}>
                <Text variant="caption" muted>
                  Report
                </Text>
              </Pressable>
            ) : null}
          </Card>
        )
      })}

      <Sheet visible={menu} onClose={() => setMenu(false)} title="Post options">
        <View>
          {post.mine ? (
            <>
              {canEdit ? (
                <Row testID="post-edit-open" icon="pencil" title="Edit" sub="You can edit for 15 minutes after posting." onPress={() => { setMenu(false); setETitle(post.title); setEBody(post.body); setEError(null); setEditing(true) }} />
              ) : null}
              <Row
                testID="post-delete"
                icon="trash"
                title="Delete"
                danger
                last
                onPress={() => {
                  setMenu(false)
                  api.forum.remove(post.id)
                  goBack('/forum')
                }}
              />
            </>
          ) : (
            <>
              <Row testID="post-report" icon="flag" title="Report" onPress={() => { setMenu(false); setReporting({ target: 'post', id: post.id }) }} />
              <Row icon="eye" title="Hide this post" onPress={() => { api.forum.hide(post.id); setMenu(false); goBack('/forum') }} />
              <Row icon="mute" title={`Mute ${post.authorName}`} sub="You won’t see their posts." last onPress={() => { api.forum.muteAuthor(post.authorKey); setMenu(false); goBack('/forum') }} />
            </>
          )}
        </View>
      </Sheet>

      <Sheet visible={!!reporting} onClose={() => setReporting(null)} title={reporting?.target === 'comment' ? 'Report this comment' : 'Report this post'}>
        <Text variant="small" muted>
          A person on our team reviews every report. They are not told who reported.
        </Text>
        {REASONS.map((r) => (
          <Check key={r.value} checked={reason === r.value} label={r.label} onPress={() => setReason(r.value)} />
        ))}
        <Button
          testID="report-submit"
          label="Send report"
          onPress={() => {
            if (reporting) api.report.submit({ target: reporting.target, targetId: reporting.id, reason, note: '', postId: post.id })
            setReporting(null)
          }}
        />
      </Sheet>

      <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit your post">
        <Field label="Title" value={eTitle} onChangeText={setETitle} />
        <Field label="Post" value={eBody} onChangeText={setEBody} multiline minHeight={140} />
        {eError ? <Banner tone="clay">{eError}</Banner> : null}
        <Button
          label="Save changes"
          onPress={() => {
            const r = api.forum.edit(post.id, { title: eTitle, body: eBody })
            if (!r.ok) return setEError(r.error)
            setEditing(false)
          }}
        />
      </Sheet>
    </Screen>
  )
}
