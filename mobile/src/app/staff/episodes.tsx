import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import type { StaffEpisode } from '@/api/types'
import type { PickedFile } from '@/backend/remoteDocuments'
import { REMOTE } from '@/backend/client'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { durationLabel, sizeLabel } from '@/lib/episodes'
import { pickPoster, pickVideo, videoDuration } from '@/lib/pickMedia'
import { dayLong } from '@/lib/time'

/** Episodes for the Watch tab: upload a video, add its words, publish it. Admins and clinical reviewers. */
export default function Episodes() {
  const [list, setList] = useState<StaffEpisode[] | null>(null)
  const [title, setTitle] = useState('')
  const [blurb, setBlurb] = useState('')
  const [video, setVideo] = useState<PickedFile | null>(null)
  const [poster, setPoster] = useState<PickedFile | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [eTitle, setETitle] = useState('')
  const [eBlurb, setEBlurb] = useState('')
  const [eError, setEError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await api.episodes.staffList()
    if (r.ok) setList(r.value)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function chooseVideo() {
    const f = await pickVideo()
    if (!f) return
    setVideo(f)
    setError(null)
    setDuration(await videoDuration(f))
  }

  async function add() {
    if (!video) return setError('Choose the video file first.')
    setBusy(true)
    setDone(null)
    const r = await api.episodes.add({ title, blurb, video, poster, durationSec: duration })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError(null)
    setDone('Uploaded as a draft. Publish it when you are ready for members to see it.')
    setTitle('')
    setBlurb('')
    setVideo(null)
    setPoster(null)
    setDuration(null)
    await load()
  }

  async function toggle(e: StaffEpisode) {
    const r = await api.episodes.setPublished(e.id, e.status !== 'published')
    if (!r.ok) setError(r.error)
    else setError(null)
    await load()
  }

  async function saveEdit(id: string) {
    const r = await api.episodes.edit(id, eTitle, eBlurb)
    if (!r.ok) return setEError(r.error)
    setEditing(null)
    await load()
  }

  return (
    <PortalPage testID="admin-episodes" title="Episodes" sub="Podcast videos for the Watch tab. Members with an active plan can watch what you publish.">
      {!REMOTE ? <Banner tone="green">In this demo the sample episodes can’t be changed. With the live service you upload your own videos here.</Banner> : null}
      {REMOTE ? (
        <Panel title="Add an episode" testID="add-episode">
          <Field testID="ep-title" label="Title" placeholder="Talking to your parents about money and mood" value={title} onChangeText={(v) => { setTitle(v); setError(null) }} maxLength={90} />
          <Field testID="ep-blurb" label="What it is about" value={blurb} onChangeText={(v) => { setBlurb(v); setError(null) }} multiline minHeight={90} maxLength={400} />
          <View style={{ gap: 6 }}>
            <Text variant="label">Video file</Text>
            <Text variant="caption" muted>MP4, MOV or WebM, up to 5 GB. Keep this page open while it uploads.</Text>
            {video ? <Text testID="ep-video-name" variant="small">{video.name} · {sizeLabel(video.size)}{durationLabel(duration) ? ` · ${durationLabel(duration)}` : ''}</Text> : null}
            <View style={{ flexDirection: 'row' }}>
              <Button testID="ep-choose-video" size="sm" variant="quiet" label={video ? 'Choose a different video' : 'Choose a video'} disabled={busy} onPress={chooseVideo} />
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Text variant="label">Picture (optional)</Text>
            <Text variant="caption" muted>A JPEG, PNG or WebP image shown on the Watch tab.</Text>
            {poster ? <Text variant="small">{poster.name}</Text> : null}
            <View style={{ flexDirection: 'row' }}>
              <Button testID="ep-choose-poster" size="sm" variant="quiet" label={poster ? 'Choose a different picture' : 'Choose a picture'} disabled={busy} onPress={async () => { const f = await pickPoster(); if (f) setPoster(f) }} />
            </View>
          </View>
          {error ? <Banner tone="clay">{error}</Banner> : null}
          {busy ? <Banner tone="sun" icon="clock">Uploading. A long video can take several minutes. Keep this page open.</Banner> : null}
          {done ? <Banner tone="green" icon="check">{done}</Banner> : null}
          <Button testID="ep-upload" label={busy ? 'Uploading…' : 'Upload as a draft'} disabled={busy} onPress={add} />
        </Panel>
      ) : null}
      <Panel title="Episodes" style={{ gap: 0 }} testID="episode-list">
        {list && list.length === 0 ? <Text variant="small" muted>No episodes yet.</Text> : null}
        {(list ?? []).map((e) => (
          <View key={e.id} testID={`aep-${e.id}`} style={{ paddingVertical: 10, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text variant="label" style={{ flex: 1, minWidth: 220 }}>{e.title}</Text>
              <Badge label={e.status === 'published' ? 'Published' : 'Draft'} tone={e.status === 'published' ? 'green' : 'plain'} />
            </View>
            <Text variant="small" muted>
              {[durationLabel(e.durationSec), sizeLabel(e.sizeBytes), e.publishedAt ? `published ${dayLong(e.publishedAt)}` : `added ${dayLong(e.createdAt)}`, `by ${e.createdBy}`, `${e.likes} likes, ${e.dislikes} dislikes, ${e.comments} comments`].filter(Boolean).join(' · ')}
            </Text>
            {editing === e.id ? (
              <View style={{ gap: 8 }}>
                <Field testID="ep-edit-title" label="Title" value={eTitle} onChangeText={(v) => { setETitle(v); setEError(null) }} maxLength={90} />
                <Field testID="ep-edit-blurb" label="What it is about" value={eBlurb} onChangeText={(v) => { setEBlurb(v); setEError(null) }} multiline minHeight={80} maxLength={400} error={eError} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button testID="ep-edit-save" size="sm" label="Save" onPress={() => saveEdit(e.id)} />
                  <Button size="sm" variant="ghost" label="Close" onPress={() => setEditing(null)} />
                </View>
              </View>
            ) : REMOTE ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button testID={`ep-toggle-${e.id}`} size="sm" variant="quiet" label={e.status === 'published' ? 'Unpublish' : 'Publish'} onPress={() => toggle(e)} />
                <Button testID={`ep-edit-${e.id}`} size="sm" variant="quiet" label="Edit" onPress={() => { setEditing(e.id); setETitle(e.title); setEBlurb(e.blurb); setEError(null) }} />
              </View>
            ) : null}
          </View>
        ))}
      </Panel>
    </PortalPage>
  )
}
