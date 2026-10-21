import type { Account, AvatarKind, Device, StandingState } from '@/api/types'
import type { AgeBand } from '@/lib/identity'
import { DEFAULT_SETTINGS } from '@/api/auth'

/** What `my_account()` returns. Snake_case, with times as ISO strings. */
export interface RemoteAccount {
  id: string
  standing: StandingState
  has_posted_before: boolean
  deletion_requested_at: string | null
  trusted_device: boolean
  shared_device: boolean
  mood: { value: number; at: string } | null
  settings: Partial<Account['settings']>
  created_at: string
  public: { pen_name: string; avatar: AvatarKind; languages: string[]; topics: string[]; age_band: AgeBand; open_to_chats: boolean; pen_name_changed_at: string | null }
  private: { full_name: string; phone: string; email: string; date_of_birth: string; id_verified: boolean }
  consents: { version: string; terms: boolean; privacy: boolean; guidelines: boolean; moderation: boolean; at: string } | null
  devices: { id: string; name: string; kind: 'phone' | 'web'; approx_place: string; last_active_at: string }[]
}

const ms = (iso: string | null | undefined): number | null => (iso ? new Date(iso).getTime() : null)

/** Turns the server's account into the app's `Account`. Things the server doesn't own yet (notices, blocked people) are kept from `prev`. */
export function toAccount(r: RemoteAccount, prev: Account | null, currentDeviceId: string | null): Account {
  const devices: Device[] = r.devices.map((d) => ({
    id: d.id,
    name: d.name,
    kind: d.kind,
    approxPlace: d.approx_place,
    lastActiveAt: ms(d.last_active_at) ?? 0,
    current: d.id === currentDeviceId,
  }))
  const mood = r.mood && r.mood.value >= 1 && r.mood.value <= 5 ? { value: r.mood.value as 1 | 2 | 3 | 4 | 5, at: ms(r.mood.at) ?? 0 } : null
  const c = r.consents
  return {
    id: r.id,
    public: {
      penName: r.public.pen_name,
      avatar: r.public.avatar,
      languages: r.public.languages,
      ageBand: r.public.age_band,
      topics: r.public.topics,
      openToChats: r.public.open_to_chats,
      penNameChangedAt: ms(r.public.pen_name_changed_at),
    },
    private: { fullName: r.private.full_name, phone: r.private.phone, email: r.private.email, dob: r.private.date_of_birth, idVerified: r.private.id_verified },
    consents: c
      ? { terms: c.terms, privacy: c.privacy, guidelines: c.guidelines, moderation: c.moderation, version: c.version, at: ms(c.at) ?? 0 }
      : { terms: true, privacy: true, guidelines: true, moderation: true, version: '', at: 0 },
    createdAt: ms(r.created_at) ?? 0,
    settings: { ...DEFAULT_SETTINGS, ...r.settings },
    notices: prev?.notices ?? [],
    standing: r.standing,
    devices,
    trustedDevice: r.trusted_device,
    sharedDevice: r.shared_device,
    blocked: prev?.blocked ?? [],
    deletionRequestedAt: ms(r.deletion_requested_at),
    mood,
    hasPostedBefore: r.has_posted_before,
  }
}
