import { useState } from 'react'
import { View } from 'react-native'
import { api, SPOKEN_LANGUAGES, type Mode } from '@/api'
import { Portrait } from '@/components/Art'
import { Button } from '@/components/Button'
import { Badge, Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { Panel, PortalPage, useWide } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { now } from '@/lib/clock'
import { liveStars, ratingLabel, summarise } from '@/lib/ratings'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'
import { useMoney } from '@/store/useMoney'
import { colors } from '@/theme'

const MODES: { value: Mode; label: string }[] = [{ value: 'chat', label: 'Chat' }, { value: 'voice', label: 'Voice' }, { value: 'video', label: 'Video' }]

/** The public profile (THR-4): what members see, with a live preview. Contact details and links are refused. */
export default function Profile() {
  const p = useDb((s) => s.portal)
  const sessions = useDb((s) => s.sessions)
  const TOPICS = useDb((s) => s.content.topics)
  const wide = useWide()
  const th = THERAPISTS.find((t) => t.id === p?.therapistId)
  const [bio, setBio] = useState(p?.profile.bio ?? '')
  const [specs, setSpecs] = useState<string[]>(p?.profile.specialisations ?? [])
  const [langs, setLangs] = useState<string[]>(p?.profile.languages ?? [])
  const [modes, setModes] = useState<Mode[]>(p?.profile.modes ?? [])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const money = useMoney()
  if (!p || !th) return null
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  function save() {
    const r = api.portal.saveProfile({ bio, specialisations: specs, languages: langs, modes, priceKes: p!.profile.priceKes })
    setSaved(r.ok)
    setError(r.ok ? null : r.error)
  }

  return (
    <PortalPage testID="portal-profile" title="Public profile" sub="Everyone can see this.">
      <Banner tone="sun" icon="eye" title="This profile is public">
        Don’t include contact details or links.
      </Banner>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <Panel style={{ flex: wide ? 3 : undefined, width: wide ? undefined : '100%' }}>
          <Field testID="profile-bio" label="Short bio" value={bio} onChangeText={(v) => { setBio(v); setSaved(false) }} multiline minHeight={110} maxLength={400} />
          <Text variant="small" muted>
            Specialisations
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TOPICS.map((t) => (
              <Chip key={t} label={t} selected={specs.includes(t)} onPress={() => { setSpecs(toggle(specs, t)); setSaved(false) }} />
            ))}
          </View>
          <Text variant="small" muted>
            Languages
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SPOKEN_LANGUAGES.slice(0, 4).map((l) => (
              <Chip key={l} label={l} selected={langs.includes(l)} onPress={() => { setLangs(toggle(langs, l)); setSaved(false) }} />
            ))}
          </View>
          <Text variant="small" muted>
            Session types · {money(p.profile.priceKes)} for 45 minutes
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {MODES.map((m) => (
              <Chip key={m.value} label={m.label} selected={modes.includes(m.value)} onPress={() => { setModes(toggle(modes, m.value)); setSaved(false) }} />
            ))}
          </View>
          {error ? (
            <Banner tone="clay" icon="shield">
              {error}
            </Banner>
          ) : null}
          {saved ? (
            <Banner tone="green" icon="check">
              Published. Members see these changes now.
            </Banner>
          ) : null}
          <Button testID="profile-save" label="Save and publish" onPress={save} />
        </Panel>
        <Panel title="What members see" tone="lichen" style={{ flex: wide ? 2 : undefined, width: wide ? undefined : '100%' }} testID="profile-preview">
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Portrait tone={th.tone} width={64} height={76} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="h3">{th.name}</Text>
              <Text variant="small" muted>
                {th.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="star" size={14} color={colors.sun} />
                <Text variant="caption">{ratingLabel(summarise(th, liveStars(sessions, th.id)))}</Text>
                <Badge icon="check" label="Verified" />
              </View>
            </View>
          </View>
          <Text variant="small">{bio || 'Your bio appears here.'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {specs.map((s) => (
              <Badge key={s} label={s} />
            ))}
          </View>
          <Text variant="caption" muted>
            Licence valid to {dayLong(Math.max(p.licenceValidTo, now()))}
          </Text>
        </Panel>
      </View>
    </PortalPage>
  )
}
