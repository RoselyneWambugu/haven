# Echo backend

Slice 1 of the real backend: **accounts and privacy**, on the existing Supabase project `haven` (ref `htsfkotheyrfyhqzeiny`, eu-west-1). Everything else (chats, forum, billing, staff) still runs on the mock on the device.

## What is built

| Part | Where |
|---|---|
| Schema, security rules and functions | `supabase/migrations/20261021000100_foundation.sql` (applied) |
| Checks that roll back | `supabase/tests/foundation.sql` |
| App connection | `mobile/src/backend/` (`client.ts`, `map.ts`, `remoteAuth.ts`) |
| Tests of the connection with a fake client | `mobile/tests/remote-auth.test.ts` |

## How privacy is kept

- **Two sides.** Anything others may see (pen name, avatar, languages, topics, age range) is in `public.profiles`. Anything private (full name, phone, email, date of birth, ID check) is in `private.identities`, in a schema the app's API cannot reach at all. Old pen names are kept in `private.pen_name_history`.
- **The app never writes tables.** Every change goes through a function that checks the rules on the server (age 18+, pen-name rules, 30-day pen-name limit, allowed settings) and answers `{ ok, code, error }`. Rules hold even if the app is modified.
- **Row-level security on every table.** A member can read only their own rows. Signed-out visitors can read and call nothing.
- **One call to load everything.** `my_account()` returns the member's account in one reply. The app keeps it as a cache and clears it on sign-out.
- Pen names are unique ignoring case. A pen name containing a part (3+ letters) of the member's own full name is refused, server side.

## Functions

`check_pen_name`, `register_member`, `change_pen_name`, `update_profile`, `update_settings`, `set_mood`, `trust_device`, `revoke_device`, `request_account_deletion`, `cancel_account_deletion`, `my_account`. All are callable by signed-in members only.

## Setup

1. In the Supabase dashboard open **Authentication → Providers → Phone** and turn it on. Under **Test phone numbers** add the numbers you will try, for example `254712345678=123456`. Test numbers send no text and always accept their fixed code. (A real SMS provider comes later.)
2. In `mobile/`, copy `.env.example` to `.env`. It points at this project and holds the public key, which is meant to be public.
3. `npx expo start`. With `EXPO_PUBLIC_BACKEND=supabase` the app signs up and in against the real backend. With it unset the app uses the on-device mock, which is what the unit tests and browser flows use.

## Re-running the checks

Paste `supabase/tests/foundation.sql` into the SQL editor (or run it through the MCP `execute_sql`). It always rolls back. The message `ALL FOUNDATION CHECKS PASSED` means success; anything else lists the failures.

## What is not built yet

- The browser flows and the rest of the app (chats, matching, forum, billing, staff) still use the mock. See the backlog (S-01).
- Real SMS delivery (S-02). Test numbers only for now.
- A server-side list of common names for pen names. The app still checks a names list on the device; the server checks only the member's own name.
- Break-glass staff access to `private.identities` (D27) and the 14-day deletion job: the request is recorded but nothing deletes the account yet.
- A device list from the server for "sign out other devices": revoking one device is recorded; signing out everywhere is not.
