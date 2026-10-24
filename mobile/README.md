# Echo member app

The member app for Echo, an anonymous peer-support and therapy platform for Kenya. Built with React Native and Expo (TypeScript), so it runs in Expo Go on a phone and in a browser.

The backend is a **mock** that lives on the device by default, so the app runs with nothing set up and nothing here talks to a server, sends a real SMS, or takes a real payment. Set `EXPO_PUBLIC_BACKEND=supabase` (copy `.env.example` to `.env`) and the same screens run on the real Supabase backend: accounts, chats, the community, billing and M-Pesa, therapists and sessions, the therapist portal, the staff dashboard and its modules, group chats, SMS and payouts. `docs/BACKEND.md` has the setup and `docs/LAUNCH.md` is the runbook for going live. Everything a screen needs goes through `src/api`, which picks the mock or the real service, so screens do not change.

## Run it

The app is on **Expo SDK 57**, so it opens in the current Expo Go from the app stores. Check the version in Expo Go before you scan: if yours is for a different SDK, it will say the project is incompatible.

```sh
npm install
npx expo start          # press w for web, or scan the QR code with Expo Go
```

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm run typecheck` | TypeScript, strict |
| `npm test` | Unit and mock-API tests (Vitest) |
| `npm run web:build` | Static web export into `dist/` |
| `npm run e2e [webroot] [outdir]` | Every browser flow, with screenshots (Playwright + Chromium). Run `web:build` first |

In a browser window 900 px or wider, `/` opens a landing page. Its buttons go to registration, sign-in, urgent help and the therapist and staff sign-ins. Narrower windows and phones open the Welcome screen.

Browser flows: `onboarding`, `chat`, `forum`, `book`, `help`, `me`, `portal`, `admin`, `analytics`, `config`, `team`, `feedback`, `landing`, `concern`, `spaces`, `groups`, `groupadmin`. Build the web export first, then pass its folder.

## Trying the app

1. Register with any adult date of birth. The one-time code is shown on screen in demo mode.
2. With the mock backend, open **Me, then Demo tools** to grant a plan, end it, fail the next payment, add a notice, show a new-device alert, move the clock forward, or show sample prices.
3. Prices are an open decision (PRD D2, D3), so they show as `KES ___` until **Show sample prices** is on.

## How it is organised

```
src/app/         Screens. Folders and file names are the routes (expo-router).
src/api/         The contract with the backend, and the mock that implements it.
src/lib/         Pure rules with no UI: safety checks, age, booking, plan state, time.
src/store/       A small reactive store, saved on the device. Secure storage holds the signed-in flag.
src/components/  The design system: text, buttons, controls, cards, sheets, art.
src/data/        Seed content, help articles, plans, and the config flags for open decisions.
src/i18n/        A small helper for filling {placeholders} in text. The app is in English only.
tests/           Unit tests. e2e/ holds the browser flows.
```

## The therapist portal

A desktop-style web app inside the same project, at `/portal`. From the welcome screen choose **I'm a therapist**, then continue as the demo therapist, or try **Apply to join Echo**. It has Today, Inbox, Calendar (weekly availability, time off, caps), Sessions, a live session with private notes, wrap-up, raising a concern, Forum, Earnings with payouts, and the public profile editor. Publishing the profile or availability changes what members see in the directory. Open it in a browser window wider than about 900 px to see the left sidebar and the two-column layout. The admin dashboard uses the same left sidebar. On narrower windows both fold the navigation into a row of tabs at the top.

## The admin dashboard

An internal desktop-style web app at `/admin`, reached from **Echo staff** on the welcome screen. Pick a staff member, then enter the demo second-factor code shown on the page. There are four roles, and each sees only its own modules:

| Role | Modules |
| --- | --- |
| Moderator | Overview, Cases, Users, Moderation, Appeals, Analytics (Safety), Resources (Safety tickets and articles), Wellbeing, Group chats (remove people only) |
| Clinical reviewer | Overview, Cases, Appeals, Therapists, Analytics (Care and Safety), Resources (Therapist tickets and articles, crisis lines and the support directory), Wellbeing, Group chats, Audit log |
| Support / Billing | Overview, Users, Billing, Analytics (Commercial), Resources (Support and Billing tickets and articles), Feedback |
| Admin | Everything including Feedback, plus Config, Roles, departments, audit and analytics export, and strike-policy changes |

It is connected to the rest of the demo. A concern a member raises about a therapist session becomes a case in a clinical queue that only Clinical reviewers and Admins can see. A therapist can appeal any of these from the portal; a different clinical reviewer decides it. They also keep a roster of therapists in the Therapists module and can suspend or reinstate one (booked sessions are cancelled with no charge). They decide it with no action, a warning, a pause on new clients (which only they can lift), or escalation. The therapist sees a note in the portal and the member gets a plain update. A report made in the member app becomes a case that holds a frozen snapshot of what was reported (the last 10 messages of a chat with the latest 3 flagged, or the post or comment with its context) and the count of earlier reports against the same person. Suspending or restoring the member in Users, and deciding their appeal, change what they see in the member app. A portal application can be approved, sent back or rejected in Therapists, and the portal follows. Every content view, reveal, decision, export and approval is written to the audit log.

**Analytics** has four sections: Product (funnel, retention cohorts, who is using Echo), Care, Commercial and Safety, each shown only to the roles that need it. Everything is a count or a rate, never message text or identities, and groups under 10 people are hidden. Each chart has a table view. The figures are generated sample data and the page says so, except the AI-flag and appeal figures in Safety, which come from the live demo data.

**Resources** holds the member help content. Tickets are filtered to your team's departments, and replies go out as "Echo staff". Articles are edited by the team that owns the department. Admin manages the departments and their response targets. A Clinical Reviewer edits the crisis lines and support directory, and marks the numbers as checked, which members see as a date on Urgent help. A number can't be marked checked while one is blank, and editing a line clears the date. Members can suggest a service for review.

**Config** (Admin only) holds the plans and entitlements, the community topics, matching settings, feature flags and limits. Plan changes involve money, so a second admin has to approve them. Matching's age-range and language rules, and the safety features, are shown as always on and are not settings. Everything staff change here is read by the member app straight away, with no release.

**Roles** (Admin only) shows the team, the permission table from the PRD and which modules each role sees. Adding someone, changing a role or deactivating an account is proposed by one Admin and approved by a second, you can't change your own account, and at least two Admins stay active. The permission table is the one the API enforces, and tests check the two agree. A deactivated person can't sign in, and role changes apply at the next sign-in.

**Group chats** (Clinical reviewer and Admin) schedules and cancels timed group chats: topic, leader, day and time in East Africa Time, length and places. Anyone signed up is told when one is cancelled, and both actions are logged. Moderators see the same module but can only remove people from a chat that is open, with a reason.

**Wellbeing** protects reviewers. Each reviewer has their own daily reveal count and limit, a break is suggested after a run of reveals and pauses revealing while it lasts, the heaviest cases (Severity-1 and crisis) can only be taken by moderators on that week's rota, which moves on each week, and anyone can hand a case on or ask for support without giving a reason.

## Chats, limits and group chats

- **Chats end on a clock.** A peer chat is deleted 24 hours after it starts and a therapist chat a week after, unless reported. Each chat shows a countdown.
- **A plan unlocks everything** except urgent help, the help centre, settings and billing: peer chat, the community, support spaces, group chats and booking a therapist. In Demo tools, *Give me a monthly plan* unlocks it.
- **Limits.** Five open peer chats at a time, and one therapist at a time.
- **Matching** shows a rolling die while it looks for someone.
- **Therapists** can be filtered by *Available now* or *Within the hour*.
- **Upcoming group chats** (under Chats) are timed, facilitated chats on one topic. Sign up, go in when it opens, and it is deleted 24 hours after it ends unless a message was reported. In Demo tools, *Start the next group chat now* opens one so you can see the room.

## Support spaces

The Community tab opens **Support spaces**: groups for one issue each (domestic violence, PTSD, grief, anxiety, depression, addiction and recovery). A space is a topic-scoped forum, not live chat. Each has a verified therapist who leads it, a pinned welcome, its own rules and a link to Urgent help. Domestic violence and PTSD are sensitive: you join to read them, every post is checked before it goes live, and there is a Quick exit button. Posts in a space stay out of the general feed and Home.

## Notifications

A bell at the top of each tab opens the notification centre, a stand-in for push. It lists new messages, replies to your community post (a peer and a verified therapist reply a short while after it goes live), session reminders (an hour and ten minutes before), plan reminders, account notices and receipts for reports. Safety and account notices can't be switched off. Quiet hours (10pm to 7am) hold other notes until morning, and more than five an hour are kept in the list but not counted as new. Settings has a lock-screen preview for the privacy options. Nothing is really pushed, texted or emailed yet.

## Feedback

When a peer chat ends after both people have written, the chat asks *Did you feel heard?* with five faces and an optional comment. It is asked once, can be skipped, and is private to the member. **Settings, then Send feedback** sends an idea or a bug report, with the app details optional. Support / Billing and Admin read the notes in the **Feedback** module, which shows no name or account and lets staff mark a note as read (logged). The felt-heard results appear only as shares once at least 10 people have answered, and members' comments are never shown.

## The logo

The Echo logo is a glowing lotus with a heart. It is drawn as shapes in `src/data/lotus.ts`, so the app, the icons and the web all use the same drawing. `node --experimental-strip-types e2e/make-icons.mjs` rewrites the icon and splash images in `assets/` and the SVG brand files in `docs/brand/`.

## Rules the app enforces

- Messages, posts and comments with a link, phone number, email, social handle or address are blocked before they are sent, with a plain reason. The mock backend checks again, so the rule holds even if the app is changed.
- Members are shown only as a pen name, an avatar and an age range. Real details sit in a private profile that needs a phone code to open.
- Under-18s are turned away at registration.
- The whole platform needs an active plan, except urgent help, the help centre, settings and billing. When a plan ends, existing chats become read-only for a grace period.
- Signs of distress offer urgent help. They never block or punish.
- In the portal, clients are only a pen name and avatar. Inbox messages follow the same sharing limits, therapist forum replies can't invite people to book or make contact, and changing a payout needs a fresh code.
- In the dashboard, evidence stays blurred until revealed and reveals are limited each day. Identity needs a break-glass request approved by a second person, the clinical lead, and lasts 30 minutes. An appeal can't be decided by whoever made the original decision, and strike-policy changes need two different admins.
- Urgent help is on every screen and works signed out.

## Not finished, on purpose

The full list of what is not built, every placeholder and every open decision is in [`docs/BACKLOG.md`](../docs/BACKLOG.md), for regular review. In short:

- **Placeholders for open decisions.** Crisis numbers and support organisations are marked as unverified (D29). Prices are blank (D2, D3). See `src/data/config.ts` and the PRD section on decisions.
- **Calls, card payments, push and email are simulated.** M-Pesa payments and SMS are built for the real backend, and need your Daraja and Africa's Talking secrets in the Supabase dashboard. Card payments, payouts to therapists by B2C and push notifications are not built.
- **Analytics runs on generated sample data**, except the AI-flag and appeal figures.
- **The app is in English only.** Kiswahili is still a language members can say they speak, for matching.

## Web build note

With the mock backend on web, the API is exposed as `globalThis.__echo` so browser tests can drive it. With `EXPO_PUBLIC_BACKEND=supabase` that hook is not set, and the Demo tools row and screen are hidden.
