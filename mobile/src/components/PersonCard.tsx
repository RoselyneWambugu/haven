import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { api } from '@/api'
import type { AvatarKind } from '@/api'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { sinceLabel } from '@/lib/personCard'
import { useDb } from '@/store/db'

/**
 * Wraps a pen name or avatar so a tap opens a light card: avatar, pen name, how long they have been here (to the month), and Mute or Report.
 * It never shows posts, gossip or chats, so nobody can be profiled. Not shown for your own name, a therapist, or anything in Gossip.
 */
export function PersonTap({ name, avatar, authorKey, onReport, onMuted, children, disabled }: {
  name: string
  avatar: AvatarKind
  authorKey?: string
  onReport?: () => void
  onMuted?: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [since, setSince] = useState<number | null>(null)
  const muted = useDb((s) => !!authorKey && s.mutedAuthors.includes(authorKey))
  const off = disabled || !authorKey || authorKey === 'me'

  useEffect(() => {
    if (!open || !authorKey || since !== null) return
    let live = true
    void api.forum.memberCard(authorKey).then((c) => live && c && setSince(c.since))
    return () => {
      live = false
    }
  }, [open, authorKey, since])

  if (off) return <>{children}</>
  return (
    <>
      <Pressable testID="person-tap" accessibilityRole="button" accessibilityLabel={`${name}. See their card`} onPress={() => setOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        {children}
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} testID="person-card">
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Avatar kind={avatar} size={72} />
          <Text variant="h3">{name}</Text>
          {since !== null ? <Text variant="small" muted>{sinceLabel(since, now())}</Text> : null}
          <Text variant="caption" muted style={{ textAlign: 'center' }}>
            Echo keeps people unlinked, so you can’t see someone’s posts, gossip or chats here.
          </Text>
        </View>
        <Button
          testID="person-mute"
          variant="quiet"
          label={muted ? `Unmute ${name}` : `Mute ${name}`}
          onPress={() => {
            if (muted) api.forum.unmuteAuthor(authorKey!)
            else {
              api.forum.muteAuthor(authorKey!)
              onMuted?.()
            }
            setOpen(false)
          }}
        />
        {onReport ? <Button testID="person-report" variant="dangerGhost" label="Report" onPress={() => { setOpen(false); onReport() }} /> : null}
      </Sheet>
    </>
  )
}
