import { Button } from '@/components/Button'
import { Screen, TopBar } from '@/components/Layout'
import { PostCard } from '@/components/PostCard'
import { Banner, EmptyState } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { go } from '@/lib/nav'
import { useDb } from '@/store/db'

export default function MyPosts() {
  const posts = useDb((s) => s.posts)
  const mine = posts.filter((p) => p.mine)
  const pending = mine.some((p) => p.status === 'pending')
  return (
    <Screen testID="my-posts" header={<TopBar back title="My posts" />}>
      <Text variant="title">My posts</Text>
      {pending ? (
        <Banner tone="sun" icon="clock" title="Your post is being checked">
          It goes live in a few minutes. You’ll see a message here when it does.
        </Banner>
      ) : null}
      {mine.length ? (
        mine.map((p) => <PostCard key={p.id} post={p} />)
      ) : (
        <EmptyState icon="forum" title="You haven’t posted yet" body="Share what’s on your mind. Others will see only your pen name.">
          <Button label="Write a post" onPress={() => go('/forum/new')} />
        </EmptyState>
      )}
    </Screen>
  )
}
