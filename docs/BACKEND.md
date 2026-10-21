# Echo backend

Four slices of the real backend are built on the existing Supabase project `haven` (ref `htsfkotheyrfyhqzeiny`, eu-west-1): **accounts and privacy** (slice 1), **peer matching and chat** (slice 2), **the community forum and support spaces** (slice 3) and **plans and billing** (slice 4). Therapists, sessions, group chats and staff still run on the mock on the device.

## What is built

| Part | Where |
|---|---|
| Schema, security rules and functions | `supabase/migrations/20261021000100_foundation.sql` (applied) |
| Slice 2 migration (run once from the SQL editor, safe to repeat) | `supabase/migrations/20261021000200_chats_and_matching.sql` |
| Slice 3 migration (run once from the SQL editor, safe to repeat) | `supabase/migrations/20261021000300_forum_and_spaces.sql` |
| Slice 4 migration (applied) | `supabase/migrations/20261021000400_billing.sql` |
| Checks that roll back | `supabase/tests/foundation.sql`, `chats.sql`, `forum.sql`, `billing.sql` |
| App connection | `mobile/src/backend/` (`client.ts`, `map.ts`, `remoteAuth.ts`) |
| Chat and matching connection | `mobile/src/backend/remoteChat.ts` |
| Forum and spaces connection | `mobile/src/backend/remoteForum.ts` |
| Billing connection | `mobile/src/backend/remoteBilling.ts` |
| Tests of the connections with a fake client | `mobile/tests/remote-auth.test.ts`, `remote-chat.test.ts`, `remote-forum.test.ts`, `remote-billing.test.ts` |

## How privacy is kept

- **Two sides.** Anything others may see (pen name, avatar, languages, topics, age range) is in `public.profiles`. Anything private (full name, phone, email, date of birth, ID check) is in `private.identities`, in a schema the app's API cannot reach at all. Old pen names are kept in `private.pen_name_history`.
- **The app never writes tables.** Every change goes through a function that checks the rules on the server (age 18+, pen-name rules, 30-day pen-name limit, allowed settings) and answers `{ ok, code, error }`. Rules hold even if the app is modified.
- **Row-level security on every table.** A member can read only their own rows. Signed-out visitors can read and call nothing.
- **One call to load everything.** `my_account()` returns the member's account in one reply. The app keeps it as a cache and clears it on sign-out.
- Pen names are unique ignoring case. A pen name containing a part (3+ letters) of the member's own full name is refused, server side.

## Functions

`check_pen_name`, `register_member`, `change_pen_name`, `update_profile`, `update_settings`, `set_mood`, `trust_device`, `revoke_device`, `request_account_deletion`, `cancel_account_deletion`, `my_account`. All are callable by signed-in members only.

## Peer matching and chat (slice 2)

- **Matching** is on the server. Someone who asks for a match joins a private waiting list; the next person who fits is paired with them. Fit means: shared language, the same age range (a neighbouring one if nobody fits), not blocked either way, under five open chats, and not paired with each other in the last 30 days. The app asks again every 3 seconds while searching.
- **Chats** live in `conversations`, `conversation_members` and `messages`. A member can read only their own chats. The other person is shown by pen name and avatar only; the app never sees their account id, only a per-chat alias.
- **Messages** are written only by `send_message`, which checks the plan hook, length and the contact-details filter. The filter is a port of the app's `detectBlockedContent`; `supabase/tests/chats.sql` checks both agree on 38 sample messages.
- **Chats end after 24 hours** and are deleted by a job that runs every minute (pg_cron), whether or not anyone opens the app. A note is added an hour before. A **reported** chat is not deleted: it is hidden from both people and kept for the safety review.
- **Reports** are written by `report_chat` to a table the app cannot read (`private.reports`). The server keeps the last 10 messages as they were, with the other person's last 3 marked, so editing or deleting afterwards changes nothing.
- **Blocking** ends the chat for both, hides it for the blocker, stops future pairing, and keeps the blocked person's pen name and avatar so they can be shown in the blocked list.
- The app polls every 3 seconds for new messages and matches (Realtime would be the next step). New messages from others create a notification, as in the mock.

## Forum and support spaces (slice 3)

- **Nothing is readable directly.** The posts, comments, supports and space memberships sit in the `private` schema. The app reads through `forum_feed()` and writes through functions, so the plan check and the space rules apply to every read.
- **Who sees what.** Live posts in the general community and in open spaces are visible to signed-in members. A **sensitive** space (domestic violence, PTSD) is visible only to members who joined; leaving removes it from view at once and keeps no record. A member's own post that is still being checked is visible to them alone.
- **Checking before it goes live.** A member's first post, and every post in a sensitive space, is held. Until staff have a review queue, a held post goes live after 15 seconds (`private.auto_approve_after()`). That stands in for a person checking it and must be replaced before real use.
- **Rules on the server:** the contact-details filter on posts and comments, title and body length, topic from the list, joined-space for space posts, 15-minute edit window, at most 10 posts and 60 comments an hour, no commenting on a post that isn't live, paused accounts can't post.
- **Authors** are shown by pen name and avatar. Each author has an opaque key (`profiles.public_key`) so a member can mute them; it is not the account id.
- **Reports** of posts and comments go to `private.reports` with a snapshot of the post, or of the comment with the one before it.
- **Removing a post** deletes it and its comments for good. Deleting an account removes everything that member wrote.
- No starter posts: the real community begins empty. The app asks for the feed every 9 seconds.

## Plans and billing (slice 4)

- **The server now decides who has a plan.** Matching, chat messages, the community and support spaces all check it. A member whose plan has ended can still read their chats (read-only) but nothing else paid. The earlier "plan check on the device only" gap is closed for everything built so far.
- **Plans** (`private.plans`): daily, monthly and yearly, with the same sample prices the app shows (KES 100, 1,500, 12,000). The real prices are still to be decided; changing them is one update to that table and the app picks it up.
- **Checkout** creates a pending order. Paying adds to a plan the member already has, so a second purchase starts when the first ends. A new checkout cancels the previous open one. Cancelling a plan stops renewal but keeps what was paid for.
- **No payment provider is connected.** Two ways in:
  - `confirm_payment(order, provider_ref, method)` is for the provider's webhook. It can only be called with the service role (from an edge function, later), never by the app, and confirming twice changes nothing.
  - `simulate_payment(...)` completes a payment without money, and only for phone numbers in `private.payment_test_phones`. Add a test number like this in the SQL editor: `insert into private.payment_test_phones (phone) values ('+254712345678');`. Everyone else sees "Payments aren't switched on yet." Empty this table before real use.
- **Renewal is a flag only.** Nothing charges a member again automatically; that needs the provider (M-Pesa has no standing pull payments without extra setup).
- **Therapist sessions** are still paid through the mock. They come with the therapists slice.

## Setup

1. In the Supabase dashboard open **Authentication → Providers → Phone** and turn it on. Under **Test phone numbers** add the numbers you will try, for example `254712345678=123456`. Test numbers send no text and always accept their fixed code. (A real SMS provider comes later.)
2. In `mobile/`, copy `.env.example` to `.env`. It points at this project and holds the public key, which is meant to be public.
3. `npx expo start`. With `EXPO_PUBLIC_BACKEND=supabase` the app signs up and in against the real backend. With it unset the app uses the on-device mock, which is what the unit tests and browser flows use.

## Re-running the checks

Paste `supabase/tests/foundation.sql` into the SQL editor (or run it through the MCP `execute_sql`). It always rolls back. The message `ALL FOUNDATION CHECKS PASSED` means success; anything else lists the failures.

## What is not built yet

- The rest of the app (therapists and sessions, group chats, billing, staff) still uses the mock. See the backlog (S-01).
- Replies from therapists and the therapist's view of a space need therapist accounts (a later slice). Until then only members reply, and the leading therapist of a space is only shown in the app.
- Moderation of held posts by staff, hiding posts after reports, and pinned posts.
- A real payment provider (M-Pesa and card), automatic renewal, refunds and receipts by email. See backlog S-03 and S-08.
- Therapist chats, the felt-heard rating, real-time delivery (the app polls), a server-side disappearing-message timer (peer chats are gone in 24 hours anyway) and staff review of reports (no screen reads `private.reports` yet).
- Real SMS delivery (S-02). Test numbers only for now.
- A server-side list of common names for pen names. The app still checks a names list on the device; the server checks only the member's own name.
- Break-glass staff access to `private.identities` (D27) and the 14-day deletion job: the request is recorded but nothing deletes the account yet.
- A device list from the server for "sign out other devices": revoking one device is recorded; signing out everywhere is not.
