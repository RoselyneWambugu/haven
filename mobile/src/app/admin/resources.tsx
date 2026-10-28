import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { api, type ArticleCfg, type SupportOrgCfg } from '@/api'
import { Button } from '@/components/Button'
import { Badge, Chip, ToggleRow } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage, Stepper } from '@/components/Portal'
import { Sheet } from '@/components/Sheet'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { canEditDepartments, canEditDirectory, isOverdue, ownedBy, ownsDepartment, splitSteps, ticketDue, titleAdvice, verification } from '@/lib/content'
import { go } from '@/lib/nav'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'
import { colors } from '@/theme'

type Tab = 'tickets' | 'articles' | 'departments' | 'directory'
const STATUS = { open: 'Needs a reply', replied: 'Replied', resolved: 'Resolved' } as const

/**
 * Resources (PRD §6.10, §6.11): tickets for your team's departments, the help articles, the departments themselves, and the
 * crisis lines and support directory. Members see changes straight away, with no release. Each team edits its own areas.
 */
export default function Resources() {
  const a = useDb((s) => s.admin)
  const c = useDb((s) => s.content)
  const tickets = useDb((s) => s.tickets)
  const penName = useDb((s) => s.account?.public.penName)
  const t = useNow()
  const role = a?.role ?? 'moderator'
  const tabs: { key: Tab; label: string }[] = [
    { key: 'tickets', label: 'Tickets' },
    { key: 'articles', label: 'Articles' },
    ...(canEditDepartments(role) ? [{ key: 'departments' as const, label: 'Departments' }] : []),
    ...(canEditDirectory(role) ? [{ key: 'directory' as const, label: 'Crisis lines and directory' }] : []),
  ]
  const [tab, setTab] = useState<Tab>('tickets')
  const [filter, setFilter] = useState<'open' | 'replied' | 'resolved' | 'all'>('open')
  const [error, setError] = useState<string | null>(null)
  const [article, setArticle] = useState<{ id?: string; title: string; deptId: string; intro: string; steps: string } | null>(null)
  const [aError, setAError] = useState<string | null>(null)
  const [line, setLine] = useState<{ id?: string; name: string; phone: string; hours: string; languages: string } | null>(null)
  const [org, setOrg] = useState<(Omit<SupportOrgCfg, 'id' | 'archived'> & { id?: string }) | null>(null)
  const [dError, setDError] = useState<string | null>(null)
  if (!a) return null
  const mine = ownedBy(role, c.departments)
  const v = verification(c.crisisVerifiedAt, t)

  const visibleTickets = tickets.filter((x) => ownsDepartment(role, c.departments.find((d) => d.id === x.deptId)) && (filter === 'all' || x.status === filter))

  async function saveArticle() {
    const r = await api.resources.saveArticle({ id: article!.id, title: article!.title, intro: article!.intro, steps: splitSteps(article!.steps), deptId: article!.deptId })
    if (!r.ok) return setAError(r.error)
    setArticle(null)
  }

  return (
    <PortalPage testID="admin-resources" title="Resources" sub="Help content, tickets and the support directory. Changes reach members straight away.">
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {tabs.map((x) => (
          <Chip key={x.key} testID={`rs-${x.key}`} label={x.label} selected={tab === x.key} onPress={() => setTab(x.key)} />
        ))}
      </View>
      {error ? <Banner tone="clay">{error}</Banner> : null}

      {tab === 'tickets' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {(['open', 'replied', 'resolved', 'all'] as const).map((f) => (
              <Chip key={f} testID={`tf-${f}`} label={f === 'all' ? 'All' : STATUS[f]} selected={filter === f} onPress={() => setFilter(f)} />
            ))}
          </View>
          <Panel style={{ padding: 8, gap: 0 }}>
            {visibleTickets.length ? (
              visibleTickets.map((x) => {
                const d = c.departments.find((q) => q.id === x.deptId)
                const over = x.status === 'open' && isOverdue(x.createdAt, d?.slaHours ?? 24, t)
                return (
                  <Pressable key={x.id} testID={`ticket-${x.id}`} accessibilityRole="button" accessibilityLabel={`${x.subject}, ${d?.title}, ${STATUS[x.status]}`} onPress={() => go(`/admin/ticket/${x.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 56 }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="label" numberOfLines={1}>
                        {x.subject}
                      </Text>
                      <Text variant="caption" muted>
                        {penName ?? 'Member'} · {d?.title} · {x.status === 'open' ? (over ? 'overdue' : `due ${dayLong(ticketDue(x.createdAt, d?.slaHours ?? 24))}`) : STATUS[x.status]}
                      </Text>
                    </View>
                    {x.routedToCrisis ? <Badge tone="sun" icon="heart" label="Crisis" /> : null}
                    {over ? <Badge tone="clay" label="Overdue" /> : null}
                  </Pressable>
                )
              })
            ) : (
              <Text variant="small" muted style={{ padding: 14 }}>
                No tickets here. Tickets for your departments appear when members write in.
              </Text>
            )}
          </Panel>
          <Text variant="caption" muted>
            You see the member’s pen name only. Replies go out as “Echo staff”, never a named person.
          </Text>
        </>
      ) : null}

      {tab === 'articles' ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Button testID="new-article" size="sm" icon="plus" label="New article" disabled={!mine.length} onPress={() => { setAError(null); setArticle({ title: '', deptId: mine[0]?.id ?? '', intro: '', steps: '' }) }} />
          </View>
          {c.departments.map((d) => {
            const list = c.articles.filter((x) => x.deptId === d.id)
            const can = ownsDepartment(role, d)
            return (
              <Panel key={d.id} title={`${d.title}${d.enabled ? '' : ' (off)'}`}>
                <Text variant="caption" muted>
                  Owned by {d.owner}. {can ? 'You can edit these.' : 'Read only for your role.'}
                </Text>
                {list.map((x: ArticleCfg) => (
                  <View key={x.id} testID={`art-${x.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <View style={{ flex: 1, minWidth: 200 }}>
                      <Text variant="small">{x.title}</Text>
                      <Text variant="caption" muted>
                        Updated {dayLong(x.updatedAt)}
                        {x.published ? '' : ' · hidden from members'}
                      </Text>
                    </View>
                    {can ? (
                      <>
                        <Button testID={`pub-${x.id}`} size="sm" variant="ghost" label={x.published ? 'Hide' : 'Publish'} onPress={async () => { const r = await api.resources.setPublished(x.id, !x.published); setError(r.ok ? null : r.error) }} />
                        <Button testID={`edit-${x.id}`} size="sm" variant="quiet" label="Edit" onPress={() => { setAError(null); setArticle({ id: x.id, title: x.title, deptId: x.deptId, intro: x.intro, steps: x.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') }) }} />
                      </>
                    ) : null}
                  </View>
                ))}
                {!list.length ? (
                  <Text variant="small" muted>
                    No articles yet.
                  </Text>
                ) : null}
              </Panel>
            )
          })}
        </>
      ) : null}

      {tab === 'departments' ? (
        <Panel>
          {c.departments.map((d, i) => (
            <View key={d.id} testID={`dept-${d.id}`} style={{ gap: 6, paddingVertical: 8, borderBottomWidth: i === c.departments.length - 1 ? 0 : 1, borderBottomColor: colors.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text variant="label" style={{ flex: 1, minWidth: 160 }}>
                  {d.title}
                </Text>
                <Badge tone="plain" label={d.owner} />
                <Button size="sm" variant="ghost" label="Up" accessibilityHint={`Move ${d.title} up`} onPress={() => api.resources.moveDepartment(d.id, -1)} />
                <Button size="sm" variant="ghost" label="Down" accessibilityHint={`Move ${d.title} down`} onPress={() => api.resources.moveDepartment(d.id, 1)} />
              </View>
              <Stepper label="Reply within (hours)" value={d.slaHours} min={1} max={168} step={4} onChange={async (n) => { const r = await api.resources.saveDepartment(d.id, { slaHours: n }); setError(r.ok ? null : r.error) }} />
              <ToggleRow testID={`dept-on-${d.id}`} label="Show to members" on={d.enabled} onChange={async (on) => { const r = await api.resources.saveDepartment(d.id, { enabled: on }); setError(r.ok ? null : r.error) }} />
            </View>
          ))}
        </Panel>
      ) : null}

      {tab === 'directory' ? (
        <>
          {v.state === 'never' ? (
            <Banner tone="sun" icon="clock" title="Numbers not checked yet">
              Members are told the details are not final. Mark them as checked once a clinical reviewer has confirmed every number.
            </Banner>
          ) : (
            <Banner tone={v.state === 'stale' ? 'sun' : 'green'} icon={v.state === 'stale' ? 'clock' : 'check'} title={v.state === 'stale' ? 'Due another check' : 'Numbers checked'}>
              Last checked {dayLong(c.crisisVerifiedAt!)} ({v.days} days ago). Members see this date on Urgent help.
            </Banner>
          )}
          {dError ? <Banner tone="clay">{dError}</Banner> : null}
          <Panel title="Crisis lines">
            <Text variant="small" muted>
              Emergency services: {c.emergency.phone} (fixed). Editing any line clears the “checked” date.
            </Text>
            {c.crisisLines.map((l) => (
              <View key={l.id} testID={`line-${l.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text variant="label">{l.name}</Text>
                  <Text variant="caption" muted>
                    {l.phone || 'Number to be confirmed'} · {l.hours} · {l.languages}
                  </Text>
                </View>
                <Button testID={`edit-${l.id}`} size="sm" variant="quiet" label="Edit" onPress={() => { setDError(null); setLine({ ...l }) }} />
                <Button size="sm" variant="ghost" label="Remove" onPress={() => api.resources.removeCrisisLine(l.id)} />
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button testID="add-line" size="sm" variant="quiet" icon="plus" label="Add a line" onPress={() => { setDError(null); setLine({ name: '', phone: '', hours: '', languages: '' }) }} />
              <Button testID="mark-verified" size="sm" label="Mark all numbers as checked" onPress={async () => { const r = await api.resources.markVerified(); setDError(r.ok ? null : r.error) }} />
            </View>
          </Panel>
          <Panel title="Support directory">
            {c.supportOrgs.map((o) => (
              <View key={o.id} testID={`org-${o.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text variant="label">{o.name}</Text>
                  <Text variant="caption" muted>
                    {o.type} · {o.cost || 'cost to add'} · {o.archived ? 'not shown to members' : 'shown to members'}
                  </Text>
                </View>
                <Button size="sm" variant="quiet" label="Edit" onPress={() => { setDError(null); setOrg({ id: o.id, name: o.name, type: o.type, cost: o.cost, hours: o.hours, languages: o.languages, action: o.action, value: o.value }) }} />
                <Button size="sm" variant="ghost" label={o.archived ? 'Show' : 'Hide'} onPress={() => api.resources.archiveOrg(o.id, !o.archived)} />
              </View>
            ))}
            <Button size="sm" variant="quiet" icon="plus" label="Add an organisation" onPress={() => { setDError(null); setOrg({ name: '', type: 'Counselling', cost: '', hours: '', languages: '', action: 'contact', value: '' }) }} />
          </Panel>
          <Panel title="Suggested by members" testID="suggestions">
            {c.suggestions.filter((s) => s.status === 'new').length ? (
              c.suggestions
                .filter((s) => s.status === 'new')
                .map((s) => (
                  <View key={s.id} style={{ gap: 4 }}>
                    <Text variant="label">{s.name}</Text>
                    {s.note ? (
                      <Text variant="small" muted>
                        {s.note}
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button testID={`accept-${s.id}`} size="sm" label="Add to review" onPress={() => api.resources.decideSuggestion(s.id, true)} />
                      <Button size="sm" variant="ghost" label="Decline" onPress={() => api.resources.decideSuggestion(s.id, false)} />
                    </View>
                  </View>
                ))
            ) : (
              <Text variant="small" muted>
                No suggestions waiting.
              </Text>
            )}
          </Panel>
        </>
      ) : null}

      <Sheet visible={!!article} onClose={() => setArticle(null)} title={article?.id ? 'Edit article' : 'New article'} testID="article-sheet">
        {article ? (
          <>
            <Field testID="art-title" label="Title" value={article.title} onChangeText={(v) => { setArticle({ ...article, title: v }); setAError(null) }} />
            {titleAdvice(article.title) && article.title.length > 3 ? (
              <Text variant="caption" muted>
                {titleAdvice(article.title)}
              </Text>
            ) : null}
            <Text variant="small" muted>
              Department
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {mine.map((d) => (
                <Chip key={d.id} label={d.title} selected={article.deptId === d.id} onPress={() => setArticle({ ...article, deptId: d.id })} />
              ))}
            </View>
            <Field testID="art-intro" label="Introduction" value={article.intro} onChangeText={(v) => setArticle({ ...article, intro: v })} multiline minHeight={70} />
            <Field testID="art-steps" label="Steps, one per line" value={article.steps} onChangeText={(v) => setArticle({ ...article, steps: v })} multiline minHeight={120} />
            {aError ? <Banner tone="clay">{aError}</Banner> : null}
            <Button testID="art-save" label="Save article" onPress={saveArticle} />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={!!line} onClose={() => setLine(null)} title={line?.id ? 'Edit crisis line' : 'Add a crisis line'} testID="line-sheet">
        {line ? (
          <>
            <Field testID="line-name" label="Name" value={line.name} onChangeText={(v) => setLine({ ...line, name: v })} />
            <Field testID="line-phone" label="Phone number (leave blank until confirmed)" value={line.phone} onChangeText={(v) => setLine({ ...line, phone: v })} keyboardType="phone-pad" />
            <Field testID="line-hours" label="Open" value={line.hours} onChangeText={(v) => setLine({ ...line, hours: v })} />
            <Field testID="line-languages" label="Languages" value={line.languages} onChangeText={(v) => setLine({ ...line, languages: v })} />
            {dError ? <Banner tone="clay">{dError}</Banner> : null}
            <Button
              testID="line-save"
              label="Save"
              onPress={async () => {
                const r = await api.resources.saveCrisisLine(line)
                if (!r.ok) return setDError(r.error)
                setLine(null)
                setDError(null)
              }}
            />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={!!org} onClose={() => setOrg(null)} title={org?.id ? 'Edit organisation' : 'Add an organisation'}>
        {org ? (
          <>
            <Field label="Name" value={org.name} onChangeText={(v) => setOrg({ ...org, name: v })} />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {(['Counselling', 'Helpline', 'Legal'] as const).map((tp) => (
                <Chip key={tp} label={tp} selected={org.type === tp} onPress={() => setOrg({ ...org, type: tp })} />
              ))}
            </View>
            <Field label="Cost" value={org.cost} onChangeText={(v) => setOrg({ ...org, cost: v })} />
            <Field label="Hours" value={org.hours} onChangeText={(v) => setOrg({ ...org, hours: v })} />
            <Field label="Languages" value={org.languages} onChangeText={(v) => setOrg({ ...org, languages: v })} />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {(['call', 'web', 'contact'] as const).map((ac) => (
                <Chip key={ac} label={ac === 'call' ? 'Call' : ac === 'web' ? 'Website' : 'Contact'} selected={org.action === ac} onPress={() => setOrg({ ...org, action: ac })} />
              ))}
            </View>
            <Field label="Number or address" value={org.value} onChangeText={(v) => setOrg({ ...org, value: v })} />
            {dError ? <Banner tone="clay">{dError}</Banner> : null}
            <Button
              label="Save"
              onPress={async () => {
                const r = await api.resources.saveOrg(org)
                if (!r.ok) return setDError(r.error)
                setOrg(null)
                setDError(null)
              }}
            />
          </>
        ) : null}
      </Sheet>
    </PortalPage>
  )
}

