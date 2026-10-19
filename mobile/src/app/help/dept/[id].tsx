import { useLocalSearchParams } from 'expo-router'
import { Button } from '@/components/Button'
import { Screen, TopBar } from '@/components/Layout'
import { Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { ARTICLES, DEPARTMENTS } from '@/data/help'
import { go } from '@/lib/nav'

export default function Department() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const d = DEPARTMENTS.find((x) => x.id === id)
  const list = ARTICLES.filter((a) => a.deptId === id)
  if (!d) return null
  return (
    <Screen testID="help-dept" header={<TopBar back />} footer={<Button label={`Ask the ${d.title.toLowerCase()} team`} variant="quiet" onPress={() => go(`/help/contact?dept=${d.id}`)} />}>
      <Text variant="title">{d.title}</Text>
      <Text variant="small" muted>
        {d.blurb}
      </Text>
      {list.length ? (
        list.map((a, i) => <Row key={a.id} testID={`article-${a.id}`} title={a.title} sub={a.intro} onPress={() => go(`/help/article/${a.id}`)} last={i === list.length - 1} />)
      ) : (
        <Text variant="body" muted>
          No articles here yet. Ask the team and we’ll help.
        </Text>
      )}
    </Screen>
  )
}
