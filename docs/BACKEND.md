# Echo backend

Six slices of the real backend are built on the existing Supabase project `haven` (ref `htsfkotheyrfyhqzeiny`, eu-west-1): **accounts and privacy** (slice 1), **peer matching and chat** (slice 2), **the community forum and support spaces** (slice 3), **plans and billing** (slice 4), **therapists and sessions, the member's side** (slice 5) and **the therapist portal** (slice 6). Group chats, the therapist application and appeals, and the admin dashboard still run on the mock on the device.

## What is built

| Part | Where |
|---|---|
| Schema, security rules and functions | `supabase/migrations/20261021000100_foundation.sql` (applied) |
| Slice 2 migration (run once from the SQL editor, safe to repeat) | `supabase/migrations/20261021000200_chats_and_matching.sql` |
| Slice 3 migration (run once from the SQL editor, safe to repeat) | `supabase/migrations/20261021000300_forum_and_spaces.sql` |
| Slice 4 migration (applied) | `supabase/migrations/20261021000400_billing.sql` |
| Slice 5 migration (applied) | `supabase/migrations/20261021000500_therapists_and_sessions.sql` |
| Slice 6 migration (applied) | `supabase/migrations/20261021000600_therapist_portal.sql` |
| Checks that roll back | `supabase/tests/foundation.sql`, `chats.sql`, `forum.sql`, `billing.sql`, `therapists.sql`, `portal.sql` |
| App connection | `mobile/src/backend/` (`client.ts`, `map.ts`, `remoteAuth.ts`) |
| Chat and matching connection | `mobile/src/backend/remoteChat.ts` |
| Forum and spaces connection | `mobile/src/backend/remoteForum.ts` |
| Billing connection | `mobile/src/backend/remoteBilling.ts` |
| Therapists and sessions connection | `mobile/src/backend/remoteTherapists.ts` |
| Therapist portal connection | `mobile/src/backend/remotePortal.ts` |
| Tests of the connections with a fake client | `mobile/tests/remote-auth.test.ts`, `remote-chat.test.ts`, `remote-forum.test.ts`, `remote-billing.test.ts`, `remote-therapists.test.ts`, `remote-portal.test.ts` |

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

## Therapists and sessions (slice 5, the member's side)

- **Who the therapists are.** The directory holds six sample therapists (`is_demo`) with no account behind them. They stand in for real, verified therapists until therapist onboarding is built. Nobody signs in as a therapist yet, so **nobody answers a therapist chat** and nobody marks attendance. The member's chat, booking and sessions all work; the therapist's side is the next slice.
- **Directory.** `therapist_directory()` returns each therapist's profile, weekly hours, price, real rating total and count, and the start times already booked by other members (no names). Browsing is free. The rating shows only once there are enough reviews, as before.
- **Booking.** A time can be booked only if it is inside the therapist's hours, in a session type they offer, at least two hours ahead (or within the hour if the therapist is on now), within 14 days, and clear of their other sessions. The server checks this when the checkout opens and again when the payment lands, so two people can't get the same time. If the time is lost during payment the order fails with "taken". If a provider had already taken money, `confirm_payment` answers `refund: true` so the webhook can refund it.
- **Rules kept on the server:** a plan is needed to book; one therapist at a time; a free change or cancel until 24 hours before, a late-change flag after; a session can be joined from 10 minutes before until it ends; a session can be finished only after it starts; a session is rated once it has finished, and the comment stays private.
- **Payment** uses the same orders and test-number path as plans (see Plans and billing). A paid session creates the session, and for a chat session the therapist chat.
- **Therapist chats** are conversations of kind `therapist`. They last a week from the start, or until a day after the latest booked or finished session, and get an "ends in about a day" note. They stay open after a plan lapses. Blocking and reporting a person are for peer chats; a concern about a therapist goes through `report_session`, which keeps the session details and the last messages, goes to the clinical queue, and keeps the chat for review.
- **Calls** are not on the server. Joining checks the time window; the call itself is still simulated on the device (backlog S-05).

## The therapist portal (slice 6)

- **Signing in.** A therapist signs in with a phone number and a code, like a member. Echo staff link the number to a therapist record. Until there is an admin screen for it, do it in the SQL editor, after that number has signed in once:
  `update private.therapists set account_id = (select id from auth.users where phone = '254712345678') where id = 't-amina';`
  A number that isn't linked is signed out again. A person can be a member or a therapist on one device at a time: signing in to the portal signs the member app out, and the other way round.
- **What a therapist sees.** `my_portal()` returns their schedule, sessions, inbox, concerns and payout setting in one reply. Clients appear only as a pen name and an avatar. The therapist's own account is never shown to members.
- **Schedule.** Weekly hours, pausing new clients, time off, and limits (sessions a day and a buffer between sessions) are enforced on the server when members book. Time off tells each member who has a session in it, in their therapist chat. "New clients a week" is stored but not enforced yet.
- **Sessions.** A therapist can join from 10 minutes before the start, keep private notes that only they can read, and wrap up with attended, late or no-show. A no-show is not paid. Earnings are worked out in the app from finished sessions at the placeholder 15% fee.
- **Inbox.** A therapist reads and answers their clients' chats. Messages go through the same contact-details filter. A therapist can close a thread or offer a time, which tells the client to book it from Echo.
- **Forum.** A therapist reads the community without a plan and replies under their own name. Replies can't invite people to book or make contact (checked on the server).
- **Concerns** a therapist raises about a client are stored for the on-call clinical lead. There is no screen for them yet.
- **Payout.** Changing it needs a code sent to the therapist's phone, checked on the server: the sign-in must be under five minutes old.
- **Still on the mock:** applying to join Echo and licence checks, appeals against a suspension or review, and the clinical reviewer's decisions.

## The admin dashboard (slice 7)

Migration `20261021000700_admin.sql`, checks in `supabase/tests/admin.sql`.

- **Staff sign in with their phone**, like everyone else, but only a number linked to a row in `private.staff` gets in. An Admin links a number with SQL for now (insert the staff member's auth account, a name of 3 to 30 characters, and a role: moderator, clinical, billing or admin). A member signed in on the same device is signed out, and the other way round.
- **Cases** are the member reports and the therapist concerns already stored. `admin_state()` returns what the role may see: moderators see member reports, clinical reviewers and Admins also see therapist concerns, billing sees neither. Content is only returned to staff, and opening a case is written to the audit log.
- **Rules enforced on the server.** A decision needs a reason. Strikes follow the ladder (warning, restriction, suspension; Severity 1 goes straight to suspension). Only moderators and Admins apply sanctions; clinical reviewers recommend, and escalate. A therapist concern can only be closed with no action, a warning, a pause on new clients, or escalation. Severity-1 cases can be taken by clinical reviewers, Admins and moderators flagged `heavy` (the heavy-queue rota). Revealing a flagged message is limited to 20 a day per person. A closed case can't be decided again.
- **What a sanction does.** The member gets a notice (`my_notices()`) and their standing changes: a restriction lasts a day and lifts itself (a job every 5 minutes), a suspension pauses the account until a staff member restores it or an appeal succeeds. A reported post is hidden when a sanction is applied.
- **Appeals.** A member appeals a notice from Account standing. The reviewer must be someone other than the person who decided. Upheld keeps it, reduced takes it one step down, overturned removes it.
- **Therapists.** Clinical reviewers and Admins suspend (booked sessions are cancelled), reinstate and lift a pause. A pause is applied by deciding a therapist concern.
- **Held posts.** Posts held for review wait in the Moderation module for a moderator or Admin to approve or remove. If nobody gets to one it goes live after a day (it was 15 seconds before there was a queue).
- **Linking a therapist** is done in the Therapists module (clinical reviewers and Admins): enter the therapist's phone number. If that number has already signed in to Echo it is linked at once; if not, it is remembered and linked the first time it signs in. A number can belong to one therapist, never a staff member. Unlinking needs a reason and cuts off portal access. Both are logged, showing only the last three digits. Migration `20261021000800_link_therapists.sql`, checks in `supabase/tests/link_therapists.sql`.
- **Managing the team** is done in the Roles module, by Admins only. Add a person with a name, a role and a phone number: if the number has already signed in to Echo they become staff at once, otherwise they are listed as waiting and become staff the first time it signs in at the staff sign-in page. Admins can change a role, deactivate or reactivate someone, put a moderator on or off the heavy queue, and cancel an invitation. Nobody can change their own account, and at least 2 Admins must stay active. Changes take effect at once: approval by a second Admin is not built yet. Migration `20261021000900_staff_linking.sql`, checks in `supabase/tests/staff_linking.sql`. The very first Admin still has to be created in SQL.
- **Audit.** Every action above writes who, when, what, the target and the reason, in the same transaction as the action. Clinical reviewers and Admins read it; Admins export it.
- **Still on the mock** (the dashboard says so at the top): analytics, resources, configuration, wellbeing and the heavy-queue rota screens, billing and refunds, feedback, group chats, roles with two-person approval, break-glass access to a private profile, AI flags and therapist applications.

## Setup

1. In the Supabase dashboard open **Authentication → Providers → Phone** and turn it on. Under **Test phone numbers** add the numbers you will try, for example `254712345678=123456`. Test numbers send no text and always accept their fixed code. (A real SMS provider comes later.)
2. In `mobile/`, copy `.env.example` to `.env`. It points at this project and holds the public key, which is meant to be public.
3. `npx expo start`. With `EXPO_PUBLIC_BACKEND=supabase` the app signs up and in against the real backend. With it unset the app uses the on-device mock, which is what the unit tests and browser flows use.

## Re-running the checks

Paste `supabase/tests/foundation.sql` into the SQL editor (or run it through the MCP `execute_sql`). It always rolls back. The message `ALL FOUNDATION CHECKS PASSED` means success; anything else lists the failures.

## What is not built yet

- Group chats and the remaining dashboard modules still use the mock. See the backlog (S-01).
- Replies from therapists and the therapist's view of a space need therapist accounts (a later slice). Until then only members reply, and the leading therapist of a space is only shown in the app.
- Hiding a reported comment (only posts are hidden), and pinned posts.
- A real payment provider (M-Pesa and card), automatic renewal, refunds and receipts by email. See backlog S-03 and S-08.
- Therapist chats, the felt-heard rating, real-time delivery (the app polls), and a server-side disappearing-message timer (peer chats are gone in 24 hours anyway).
- Real SMS delivery (S-02). Test numbers only for now.
- A server-side list of common names for pen names. The app still checks a names list on the device; the server checks only the member's own name.
- Break-glass staff access to `private.identities` (D27) and the 14-day deletion job: the request is recorded but nothing deletes the account yet.
- A device list from the server for "sign out other devices": revoking one device is recorded; signing out everywhere is not.
