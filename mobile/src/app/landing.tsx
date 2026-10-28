import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Avatar, Face, LogoMark, Scene, type Mood } from '@/components/Art'
import { Button } from '@/components/Button'
import { Icon, type IconName } from '@/components/Icon'
import { useWide } from '@/components/Portal'
import { Text } from '@/components/Text'
import { go } from '@/lib/nav'
import { colors, radius } from '@/theme'

const SERVICES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'chats', title: 'Peer chat', body: 'Matched by age range and language with someone who understands.' },
  { icon: 'heart', title: 'Therapists', body: 'Verified therapists by chat, voice or video.' },
  { icon: 'forum', title: 'Community', body: 'Share and read posts under a pen name.' },
  { icon: 'help', title: 'Help centre', body: 'Plain answers, and where to find urgent help.' },
  { icon: 'shield', title: 'Urgent help', body: 'Free crisis lines, open on every screen.' },
]

const STEPS: { title: string; body: string }[] = [
  { title: 'Join privately', body: 'Confirm your phone, then choose a pen name and an avatar. That is all anyone sees.' },
  { title: 'Connect', body: 'Get matched with a peer, or book a verified therapist.' },
  { title: 'Talk safely', body: 'Links, phone numbers and addresses are blocked, and you can report or block anyone.' },
]

const PROMISES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'eye', title: 'Anonymous by default', body: 'Pen name and avatar only' },
  { icon: 'check', title: 'Verified therapists', body: 'Checked before they can take clients' },
  { icon: 'lock', title: 'Contact details blocked', body: 'No links, numbers or addresses' },
  { icon: 'heart', title: 'Free urgent help', body: 'On every screen, signed in or not' },
]

const MOODS: { mood: Mood; label: string }[] = [
  { mood: 5, label: 'Great' },
  { mood: 4, label: 'Good' },
  { mood: 3, label: 'Okay' },
  { mood: 2, label: 'Low' },
  { mood: 1, label: 'Struggling' },
]

const MOOD_LINE: Record<Mood, string> = {
  5: 'Lovely to hear. Echo is here whenever you want company.',
  4: 'Glad things feel good. Echo is here when you want to talk.',
  3: 'Okay is a fine place to start. Someone here will listen.',
  2: 'That sounds hard. You don’t have to carry it alone.',
  1: 'Thank you for saying so. If it feels like too much, urgent help is free right now.',
}

/** The front door on a wide screen. Every button goes to the real sign-in or registration. */
export default function Landing() {
  const wide = useWide()
  const [mood, setMood] = useState<Mood | null>(null)
  const pad = wide ? 40 : 18

  return (
    <ScrollView testID="landing" style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Top bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: pad, paddingVertical: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LogoMark size={48} />
          <Text variant="h3">Echo</Text>
        </View>
        <View style={{ flex: 1 }} />
        {wide ? (
          <>
            <NavLink testID="nav-terms" label="Terms and privacy" onPress={() => go('/about')} />
            <NavLink testID="nav-therapist" label="Therapist sign in" onPress={() => go('/portal')} />
            <NavLink testID="nav-apply" label="Apply to join" onPress={() => go('/portal/apply')} />
          </>
        ) : null}
        <Button testID="landing-signin" label="Sign in" size="sm" variant="ghost" onPress={() => go('/login')} />
        <Button testID="landing-urgent" label="Urgent help" size="sm" variant="urgent" icon="phone" onPress={() => go('/urgent')} />
      </View>

      {/* Hero */}
      <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'center', gap: 28, paddingHorizontal: pad, paddingTop: wide ? 24 : 8 }}>
        <View style={{ flex: wide ? 1.1 : undefined, gap: 16, width: wide ? undefined : '100%' }}>
          <Text variant="display" style={wide ? { fontSize: 52, lineHeight: 58 } : undefined}>
            A space to speak.
          </Text>
          <Text variant="display" italic color={colors.mossDeep} style={wide ? { fontSize: 52, lineHeight: 58 } : undefined}>
            Someone to listen.
          </Text>
          <Text variant="body" muted style={{ maxWidth: 460 }}>
            Talk anonymously with people who understand, or with a verified therapist, at your own pace. Echo is made for people in Kenya.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
            <Button testID="landing-start" label="Get started" onPress={() => go('/consent')} />
            <Button testID="landing-have-account" label="I already have an account" variant="ghost" onPress={() => go('/login')} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 }}>
            {['Anonymous', 'Compassionate', 'Always one tap from help'].map((t) => (
              <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={16} color={colors.moss} stroke={2.4} />
                <Text variant="small" muted>
                  {t}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', height: wide ? 380 : 260 }}>
          <View style={{ flex: 1, borderTopLeftRadius: 200, borderTopRightRadius: 200, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: 'hidden', backgroundColor: colors.lichen }}>
            <Scene />
          </View>
          <View style={{ position: 'absolute', left: wide ? -18 : 8, bottom: 22, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingRight: 16, borderRadius: radius.md, backgroundColor: colors.milk, borderWidth: 1, borderColor: colors.line }}>
            <Avatar kind="moon" size={40} />
            <View>
              <Text variant="label">Your pen name</Text>
              <Text variant="caption" muted>
                The only thing anyone sees
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* What is here */}
      <View style={{ paddingHorizontal: pad, paddingTop: 40, gap: 14 }}>
        <Text variant="h2">What you’ll find in Echo</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {SERVICES.map((s) => (
            <View key={s.title} style={{ flexGrow: 1, flexBasis: wide ? 190 : 150, gap: 8, padding: 16, borderRadius: radius.md, backgroundColor: colors.lichen }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={s.icon} size={22} color={colors.mossDeep} />
              </View>
              <Text variant="label">{s.title}</Text>
              <Text variant="small" muted>
                {s.body}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* How it works, and a check-in */}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18, paddingHorizontal: pad, paddingTop: 32 }}>
        <View style={{ flex: wide ? 1.4 : undefined, gap: 14, padding: 20, borderRadius: radius.md, backgroundColor: colors.milk, borderWidth: 1, borderColor: colors.line }}>
          <Text variant="h2">How it works</Text>
          {STEPS.map((s, i) => (
            <View key={s.title} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="label" color={colors.white}>
                  {i + 1}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label">{s.title}</Text>
                <Text variant="small" muted>
                  {s.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <View testID="checkin" style={{ flex: wide ? 1 : undefined, gap: 12, padding: 20, borderRadius: radius.md, backgroundColor: colors.milk, borderWidth: 1, borderColor: colors.line }}>
          <Text variant="h3">How are you feeling today?</Text>
          <Text variant="small" muted>
            Nothing is saved until you join.
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {MOODS.map((m) => (
              <Pressable key={m.mood} testID={`mood-${m.mood}`} accessibilityRole="button" accessibilityLabel={m.label} accessibilityState={{ selected: mood === m.mood }} onPress={() => setMood(m.mood)} style={{ alignItems: 'center', gap: 4, minWidth: 48 }}>
                <Face mood={m.mood} selected={mood === m.mood} size={44} />
                <Text variant="caption" muted>
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {mood ? (
            <View testID="checkin-reply" style={{ gap: 10 }}>
              <Text variant="small">{MOOD_LINE[mood]}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button label="Talk to someone" size="sm" onPress={() => go('/consent')} />
                {mood <= 2 ? <Button label="Urgent help" size="sm" variant="urgent" onPress={() => go('/urgent')} /> : null}
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {/* Promises */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: pad, paddingTop: 32 }}>
        {PROMISES.map((p) => (
          <View key={p.title} style={{ flexGrow: 1, flexBasis: wide ? 220 : 240, flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: radius.md, backgroundColor: colors.lichen }}>
            <Icon name={p.icon} size={24} color={colors.mossDeep} />
            <View style={{ flex: 1 }}>
              <Text variant="label">{p.title}</Text>
              <Text variant="caption" muted>
                {p.body}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Footer */}
      <View style={{ marginTop: 32, marginHorizontal: pad, padding: 22, borderRadius: radius.md, backgroundColor: colors.fern, gap: 12 }}>
        <Text variant="h3" color={colors.paper}>
          Need help right now?
        </Text>
        <Text variant="small" color={colors.lichen}>
          If you or someone else is in danger, call a crisis line. They are free and open now. Echo is peer support, not emergency care.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <Button testID="footer-urgent" label="Talk to someone now" variant="light" size="sm" onPress={() => go('/urgent')} />
          <Pressable testID="therapist-link" accessibilityRole="link" accessibilityLabel="I’m a therapist" onPress={() => go('/portal')} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="small" color={colors.paper} style={{ textDecorationLine: 'underline' }}>
              I’m a therapist
            </Text>
          </Pressable>
          <Pressable testID="staff-link" accessibilityRole="link" accessibilityLabel="Echo staff sign-in" onPress={() => go('/admin/sign-in')} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="small" color={colors.lichen}>
              Echo staff
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  )
}

function NavLink({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text variant="small" color={colors.mossDeep}>
        {label}
      </Text>
    </Pressable>
  )
}
