import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { AppDownload } from '@/components/AppDownload'
import { Avatar, Face, LogoMark, type Mood } from '@/components/Art'
import { Bloom, Ornament } from '@/components/Bloom'
import { Button } from '@/components/Button'
import { Icon, type IconName } from '@/components/Icon'
import { useWide } from '@/components/Portal'
import { Text } from '@/components/Text'
import { go } from '@/lib/nav'
import { MEMBERS_ON_WEB } from '@/lib/webMembers'
import { colors, radius } from '@/theme'

const PROMISES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'eye', title: 'Anonymous by default', body: 'A pen name and an avatar. That is all anyone sees.' },
  { icon: 'check', title: 'Verified therapists', body: 'Checked before they can take clients.' },
  { icon: 'lock', title: 'Contact details blocked', body: 'No links, numbers or addresses in chats.' },
  { icon: 'shield', title: 'Block and report', body: 'Anyone, at any time, in one tap.' },
]

const SERVICES: { icon: IconName; title: string; body: string; band: string; ink: string }[] = [
  { icon: 'chats', title: 'Peer chat', body: 'Matched by age range and language with someone who understands.', band: colors.moss, ink: colors.paper },
  { icon: 'heart', title: 'Therapists', body: 'Verified therapists by chat, voice or video, at a time that suits you.', band: colors.fern, ink: colors.paper },
  { icon: 'forum', title: 'Community', body: 'Share and read posts under a pen name, in spaces for one issue each.', band: colors.sage, ink: colors.fern },
  { icon: 'help', title: 'Help centre', body: 'Plain answers to the questions people ask most.', band: colors.sunSoft, ink: colors.sunInk },
]

const STEPS: { title: string; body: string }[] = [
  { title: 'Join privately', body: 'Choose a pen name and an avatar. That is all anyone sees.' },
  { title: 'Connect', body: 'Get matched with a peer, or book a verified therapist.' },
  { title: 'Talk safely', body: 'Links, phone numbers and addresses are blocked, and you can report or block anyone.' },
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
  1: 'Thank you for saying so. You don’t have to carry it alone. Someone here will listen.',
}

function NavLink({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}>
      <Text variant="small" color={colors.fern}>
        {label}
      </Text>
    </Pressable>
  )
}

/** The front door. On the live website it is for therapists and staff; members are pointed to the mobile app. */
export default function Landing() {
  const wide = useWide()
  const [mood, setMood] = useState<Mood | null>(null)
  const pad = wide ? 56 : 20
  const headline = wide ? { fontSize: 64, lineHeight: 68, letterSpacing: -1.2 } : { fontSize: 42, lineHeight: 46, letterSpacing: -0.8 }

  return (
    <ScrollView testID="landing" style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ paddingBottom: 0 }}>
      {/* Top bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: pad, paddingVertical: 16, backgroundColor: colors.milk, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <LogoMark size={46} />
          <View>
            <Text variant="h3" style={{ fontSize: 24, lineHeight: 26 }}>
              Echo
            </Text>
            <Text variant="caption" color={colors.muted}>
              Peer support and therapy
            </Text>
          </View>
        </View>
        <View style={{ flex: 1 }} />
        {wide ? <NavLink testID="nav-therapist" label="Therapist sign in" onPress={() => go('/portal')} /> : null}
        <Button testID="nav-download" label="Get the app" size="sm" variant="quiet" icon="phone" block={false} onPress={() => go('/mobile-app')} />
        {MEMBERS_ON_WEB ? (
          <Button testID="landing-signin" label="Sign in" size="sm" variant="ghost" block={false} onPress={() => go('/login')} />
        ) : (
          <Button testID="landing-staff" label="Staff sign in" size="sm" variant="ghost" block={false} onPress={() => go('/admin/sign-in')} />
        )}
      </View>

      {/* Hero */}
      <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'center', gap: wide ? 40 : 28, paddingHorizontal: pad, paddingTop: wide ? 48 : 28, paddingBottom: wide ? 56 : 32 }}>
        <View style={{ flex: wide ? 1.05 : undefined, gap: 18, width: wide ? undefined : '100%' }}>
          <Text variant="display" style={headline}>
            A space to speak.
          </Text>
          <Text variant="display" italic color={colors.moss} style={headline}>
            Someone to listen.
          </Text>
          <Ornament width={wide ? 150 : 110} />
          <Text variant="body" muted style={{ maxWidth: 480, fontSize: wide ? 18 : 16, lineHeight: wide ? 28 : 24 }}>
            Talk anonymously with people who understand, or with a verified therapist, at your own pace. Echo is made for people in Kenya.
          </Text>
          {MEMBERS_ON_WEB ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
              <Button testID="landing-start" label="Get started" block={false} onPress={() => go('/consent')} />
              <Button testID="landing-have-account" label="I already have an account" variant="ghost" block={false} onPress={() => go('/login')} />
            </View>
          ) : (
            <View testID="landing-app-note" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4, padding: 16, maxWidth: 480, borderRadius: radius.md, backgroundColor: colors.milk, borderWidth: 1, borderColor: colors.line }}>
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="phone" size={22} color={colors.paper} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label">Get the Echo mobile app</Text>
                <Text variant="small" muted>
                  Members sign up and log in on the app. This website is for therapists and Echo staff.
                </Text>
              </View>
            </View>
          )}
          <AppDownload variant={MEMBERS_ON_WEB ? 'ghost' : 'primary'} />
        </View>
        <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', height: wide ? 500 : 330 }}>
          <View style={{ flex: 1, borderTopLeftRadius: 260, borderTopRightRadius: 260, borderBottomLeftRadius: 48, borderBottomRightRadius: 48, overflow: 'hidden', backgroundColor: colors.fern }}>
            <Bloom />
          </View>
          <View style={{ position: 'absolute', left: wide ? -24 : 6, bottom: 28, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingRight: 18, borderRadius: radius.md, backgroundColor: colors.milk, borderWidth: 1, borderColor: colors.sun }}>
            <Avatar kind="moon" size={42} />
            <View>
              <Text variant="label">Your pen name</Text>
              <Text variant="caption" muted>
                The only thing anyone sees
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Promises: a dark strip, as the first thing under the hero */}
      <View style={{ marginHorizontal: pad, borderRadius: radius.lg, backgroundColor: colors.fern, flexDirection: 'row', flexWrap: 'wrap', paddingVertical: wide ? 10 : 6 }}>
        {PROMISES.map((p, i) => (
          <View key={p.title} style={{ flexGrow: 1, flexBasis: wide ? 240 : '100%', flexDirection: 'row', gap: 14, alignItems: 'center', padding: 20, borderLeftWidth: wide && i > 0 ? 1 : 0, borderLeftColor: 'rgba(176,138,79,0.4)' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: colors.sun, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={p.icon} size={22} color="#D9B672" />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label" color={colors.paper}>
                {p.title}
              </Text>
              <Text variant="caption" color="#BFCDB8">
                {p.body}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* How it works, and a check-in */}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 48 : 24, paddingHorizontal: pad, paddingTop: wide ? 72 : 44, alignItems: wide ? 'center' : 'stretch' }}>
        <View style={{ flex: 1, gap: 16 }}>
          <Text variant="title" style={wide ? { fontSize: 40, lineHeight: 44 } : undefined}>
            Your pace, your people
          </Text>
          <Ornament width={110} />
          <Text variant="body" muted style={{ maxWidth: 460 }}>
            Echo is built so that talking is easy and safe: you choose how much to share, who to talk to, and when to stop.
          </Text>
          {STEPS.map((s, i) => (
            <View key={s.title} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.lichen, borderWidth: 1.5, borderColor: colors.sage, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="label" color={colors.mossDeep}>
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
        <View style={{ flex: 1, padding: 6, borderRadius: radius.lg, backgroundColor: colors.lichen }}>
          <View testID="checkin" style={{ gap: 14, padding: 24, borderRadius: radius.lg - 6, backgroundColor: colors.milk, borderWidth: 1.5, borderColor: colors.sun, borderStyle: 'dashed' }}>
            <Text variant="h2">How are you feeling today?</Text>
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
                  <Button label="Talk to someone" size="sm" block={false} onPress={() => go(MEMBERS_ON_WEB ? '/consent' : '/mobile-app')} />
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* What is here */}
      <View style={{ paddingHorizontal: pad, paddingTop: wide ? 72 : 44, gap: 18, alignItems: 'center' }}>
        <Text variant="title" align="center" style={wide ? { fontSize: 40, lineHeight: 44 } : undefined}>
          What you’ll find in Echo
        </Text>
        <Ornament width={110} align="center" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignSelf: 'stretch' }}>
          {SERVICES.map((s) => (
            <View key={s.title} style={{ flexGrow: 1, flexBasis: wide ? 220 : 240, borderRadius: radius.md, backgroundColor: colors.milk, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
              <View style={{ height: 96, backgroundColor: s.band, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={s.icon} size={44} color={s.ink} stroke={1.4} />
              </View>
              <View style={{ gap: 6, padding: 18 }}>
                <Text variant="h3">{s.title}</Text>
                <Text variant="small" muted>
                  {s.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Footer */}
      <View style={{ marginTop: wide ? 80 : 48, backgroundColor: colors.fern, paddingHorizontal: pad, paddingTop: wide ? 48 : 32, paddingBottom: 28, gap: 28 }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 56 : 28 }}>
          <View style={{ flex: 1.4, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <LogoMark size={44} />
              <Text variant="h3" color={colors.paper} style={{ fontSize: 24 }}>
                Echo
              </Text>
            </View>
            <Text variant="small" color="#BFCDB8" style={{ maxWidth: 340 }}>
              Peer support and therapy for people in Kenya. Anonymous by default, and always one tap from help.
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="label" color="#D9B672">
              For the team
            </Text>
            <Pressable testID="therapist-link" accessibilityRole="link" accessibilityLabel="I’m a therapist" onPress={() => go('/portal')} style={{ minHeight: 40, justifyContent: 'center' }}>
              <Text variant="small" color={colors.paper}>
                I’m a therapist
              </Text>
            </Pressable>
            <Pressable testID="staff-link" accessibilityRole="link" accessibilityLabel="Echo staff sign-in" onPress={() => go('/admin/sign-in')} style={{ minHeight: 40, justifyContent: 'center' }}>
              <Text variant="small" color={colors.paper}>
                Echo staff
              </Text>
            </Pressable>
            <Pressable testID="footer-download" accessibilityRole="link" accessibilityLabel="Download the app" onPress={() => go('/mobile-app')} style={{ minHeight: 40, justifyContent: 'center' }}>
              <Text variant="small" color={colors.paper}>
                Download the app
              </Text>
            </Pressable>
            <Pressable testID="terms-link" accessibilityRole="link" accessibilityLabel="Terms and privacy" onPress={() => go('/about')} style={{ minHeight: 40, justifyContent: 'center' }}>
              <Text variant="small" color={colors.paper}>
                Terms and privacy
              </Text>
            </Pressable>
          </View>
          <View style={{ flex: 1.2, gap: 10 }}>
            <Text variant="label" color="#D9B672">
              Good to know
            </Text>
            <Text variant="small" color="#BFCDB8">
              Echo is peer support, not emergency care.
            </Text>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: 'rgba(176,138,79,0.35)' }} />
        <Text variant="caption" color="#8FA595">
          Echo. Not an emergency service.
        </Text>
      </View>
    </ScrollView>
  )
}
