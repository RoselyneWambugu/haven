import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { loadLaunch, signOff, type Launch } from '@/backend/remoteLaunch'

/** What stands between the system and a safe launch. Some items are read from the live system; the rest an Admin confirms by hand. */
export function LaunchChecklist() {
  const [l, setL] = useState<Launch | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await loadLaunch()
    if (d) setL(d)
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  if (!l) return null

  async function confirm(id: string, done: boolean) {
    const r = await signOff(id, done, note)
    if (!r.ok) return setError(r.error)
    setOpen(null)
    setNote('')
    setError(null)
    await load()
  }

  const groups = [...new Set(l.items.map((i) => i.group))]
  const todo = l.items.filter((i) => i.state !== 'ok').length
  return (
    <Panel title="Launch checklist" testID="launch-checklist">
      <Banner tone={l.ready ? 'green' : 'sun'} icon={l.ready ? 'check' : 'clock'} title={l.ready ? 'Everything is in place' : `${todo} ${todo === 1 ? 'thing' : 'things'} still to do before launch`}>
        {l.ready ? 'Every check passes and every hand-confirmed item is signed off.' : 'Fix what is marked, or confirm the items only a person can check.'}
      </Banner>
      {groups.map((g) => (
        <View key={g} style={{ gap: 8 }}>
          <Text variant="h3">{g}</Text>
          {l.items.filter((i) => i.group === g).map((i) => (
            <View key={i.id} testID={`launch-${i.id}`} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Badge tone={i.state === 'ok' ? 'green' : 'sun'} label={i.state === 'ok' ? 'Done' : 'To do'} />
                <Text variant="small" style={{ flex: 1, minWidth: 220 }}>{i.label}</Text>
                {i.manual && open !== i.id ? (
                  <Button testID={`launch-open-${i.id}`} size="sm" variant="quiet" label={i.state === 'ok' ? 'Reopen' : 'Confirm'} onPress={() => { if (i.state === 'ok') void confirm(i.id, false); else { setOpen(i.id); setNote(''); setError(null) } }} />
                ) : null}
              </View>
              {i.detail ? <Text variant="caption" muted>{i.detail}</Text> : null}
              {open === i.id ? (
                <View style={{ gap: 8 }}>
                  <Field testID="launch-note" label="How did you check it?" value={note} onChangeText={(v) => { setNote(v); setError(null) }} error={error} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button testID="launch-confirm" size="sm" label="Confirm" onPress={() => confirm(i.id, true)} />
                    <Button size="sm" variant="ghost" label="Cancel" onPress={() => setOpen(null)} />
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </Panel>
  )
}
