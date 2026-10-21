# Echo: backlog for review

Everything that has not been built, every placeholder, and every decision still open, gathered in one place from the PRD build notes and the README. It is for a regular review: for each item, choose **Build**, **Defer** or **Drop**, and give it a priority.

Last updated at PRD v0.38 (backend slices 1 to 6, accounts and privacy, peer matching and chat, the forum and support spaces, plans and billing, the member's side of therapists and sessions, and the therapist portal, are built on Supabase; the rest of the mobile app, therapist portal and admin dashboard are built on a mock backend that lives on the device).

**How to read it.** *Source* is the PRD version whose build notes mention it, and a requirement ID where there is one. *Needs* says what blocks it: a decision, a provider, or just build time.

---

## 1. Needs a real service (the demo simulates these)

| # | Item | Source | Needs |
|---|---|---|---|
| S-01 | The rest of the real backend. **Accounts and privacy (v0.33), peer matching and chat (v0.34), and the forum and support spaces (v0.35) are built** (`docs/BACKEND.md`). Still on the device mock: group chats, therapist applications and appeals, and admin data | v0.8 | Next slices; decision D6 (encryption and retention) |
| S-02 | Real SMS one-time codes for sign-up and sign-in (the backend is ready; it uses test numbers with fixed codes until a provider is chosen) | v0.8, D51 | SMS provider; D44 (SMS cost) |
| S-03 | Real M-Pesa and card payments, refunds, reconciliation. The server side is ready (orders, plan, `confirm_payment` for a provider's webhook); no provider is connected, and payments work only for listed test numbers | v0.8, D51 | Payment provider and an edge function for its webhook; D2, D3 |
| S-04 | Real push notifications, and SMS and email delivery (NTF-1) | v0.19 | Push, SMS and email providers |
| S-05 | Real voice and video calls | v0.8, D40, D51 | Call provider that works on mobile data in Kenya |
| S-06 | Real therapist sign-in and document upload (licence, ID, certificate) | v0.9 | Backend; secure document storage; D33 |
| S-07 | Single sign-on and a real second-factor enrolment for staff | v0.14 | Identity provider |
| S-08 | Booking confirmations and receipts by email | v0.19 | Email provider |
| S-09 | Statements and receipts as PDF (therapist earnings) | v0.9 | Build time |
| S-10 | Real release builds, app-store listing and billing-rule check (BIL-10) | D50 | Store accounts; D9 |

## 2. Placeholders waiting for a decision

| # | Item | Source | Needs |
|---|---|---|---|
| P-01 | Plan prices and entitlements show blank until "sample prices" is on | v0.8 | D2 |
| P-02 | Therapist fee is a 15% placeholder | v0.9 | D3 |
| P-03 | Crisis numbers and support organisations are unverified | v0.8 | D29 (who verifies, how often) |
| P-04 | Reveal limit of 20 a day and a 30-minute break-glass window | v0.10 | D27 |
| P-05 | Minimum of 10 reviews before a therapist rating shows | v0.20 | Decision |
| P-06 | Grace period of 7 days after a plan lapses | D26 | Decision |
| P-07 | Account deletion holding period of 14 days | D34 | Counsel |
| P-08 | A reply to a therapist appeal within 72 hours | v0.24 | Decision |
| P-09 | Staff wellbeing line number is a placeholder | v0.14 | Number |
| P-10 | Number of places in group chats | v0.29, v0.31 | Decision |
| P-11 | Real therapist photographs (illustrated placeholders today) | D49 | Consent and licensing |

## 3. Member app

| # | Item | Source |
|---|---|---|
| M-01 | Reporting one chosen message instead of the latest few | v0.18 |
| M-02 | Reporting a therapist from a chat when there is no session | v0.21 |
| M-03 | Telling a member the outcome of a concern in more detail than "action was taken" (a deliberate limit; confirm it) | v0.22 |
| M-04 | Notification settings per conversation | v0.19 |
| M-05 | A Help centre link before sign-in (it needs an account; only urgent help is open signed out) | v0.17 |
| M-06 | Dark mode | D46 |
| M-07 | Neutral app name or icon (discreet mode) | D43 |
| M-08 | A "help me choose a therapist" questionnaire | D37 |
| M-09 | Per-post setting to turn replies off | v0.26 |
| M-10 | Replies to a member's comments, and replies from several different people to one post | v0.26 |
| M-11 | Pricing and outcome claims on the landing page (not approved) | v0.17 |
| M-12 | A free trial or free taste, since the whole platform needs a plan (decide; none built) | v0.32 |
| M-13 | Different plans unlocking different things (every plan unlocks everything today) | v0.32 |
| M-14 | A real backend must enforce the plan check for reading the community. **Done at v0.36**: the server enforces the plan for matching, chat, the community and spaces | v0.32 |

## 4. Community: forum and support spaces

| # | Item | Source |
|---|---|---|
| C-01 | Admin screens to create or edit spaces (they are defined in code) | v0.28 |
| C-02 | A therapist's view of a space's reports | v0.28 |
| C-03 | Pinned posts that the leading therapist can edit | v0.28 |
| C-04 | Member counts for spaces (held back so a small space cannot point at a few people) | v0.28 |
| C-05 | Content-note wording for trauma spaces | v0.28, D32 |
| C-06 | Hiding a therapist's forum replies when they are suspended | v0.23 |

## 5. Group chats and chat rules

| # | Item | Source |
|---|---|---|
| G-01 | Facilitator controls inside a live group chat: removing a message or a person from the leader's own screen. (Moderators can already remove a person, v0.32; removing a single message is not built) | v0.31 |
| G-02 | Editing a scheduled group chat (today: cancel and reschedule) | v0.31 |
| G-03 | Repeating weekly series | v0.29 |
| G-04 | A waiting list when a group chat is full | v0.29 |
| G-05 | A staff list of who signed up (only the count shows) | v0.31 |
| G-06 | A script beyond the leader's welcome for staff-scheduled chats (a real service has real people) | v0.31 |
| G-07 | Group chats for sensitive spaces such as domestic violence | v0.29 |
| G-08 | Whether group chats count towards the five open chats (they do not today) | v0.29 |
| G-09 | A way for someone removed from a group chat to ask for a review | v0.32 |

## 6. Therapist portal

| # | Item | Source |
|---|---|---|
| T-01 | The on-call clinical lead's own side of a concern a therapist raises | v0.9 |
| T-02 | A page for a therapist to see their own ratings (aggregate only) | v0.20 |
| T-03 | Appealing a licence-verification rejection | v0.24 |
| T-04 | A second appeal after an outcome | v0.24 |
| T-05 | Telling a therapist by message when an outcome or a reason arrives | v0.23, v0.24 |
| T-06 | Moving a suspended therapist's existing clients to someone else | v0.23 |
| T-07 | A suspension that ends on a date, and a pause that lifts on its own | v0.22, v0.23 |
| T-08 | An independent panel for suspensions | v0.24 |
| T-09 | A mobile app for therapists (web first) | D23 |

## 7. Admin dashboard

| # | Item | Source |
|---|---|---|
| A-01 | Replying to, tagging or assigning member feedback notes | v0.16 |
| A-02 | A staff view of ratings per therapist beyond the roster summary | v0.20 |
| A-03 | Hiding a rating that falls below a quality threshold | v0.20 |
| A-04 | A therapist's full strike and report history beyond the earlier-report count | v0.18 |
| A-05 | A reviewer rota for the support directory, and department-level staff accounts | v0.12 |
| A-06 | Shift scheduling beyond the weekly heavy-queue rota | v0.14 |
| A-07 | The weekly pilot review pack, and consent controls for non-essential analytics | v0.10 |
| A-08 | Real data behind Analytics (the figures are generated, except AI-flag and appeal figures) | v0.10 |
| A-09 | NPS and CSAT, and willingness-to-pay findings (no source yet) | v0.10 |
| A-10 | Staff accounts and permissions: roles are demo identities | v0.14 |

## 8. Safety and moderation

| # | Item | Source |
|---|---|---|
| X-01 | AI moderation (the demo uses keyword rules; the AI flags are sample data) | D1 |
| X-02 | Clinical crisis protocol, SLAs and on-call lead staffing | D8, D31 |
| X-03 | Moderation tuned and tested for Kiswahili and Sheng | SAF-10, D52 |
| X-04 | A real snapshot store and retention rules (the demo keeps snapshots on the device) | D6 |
| X-05 | Live moderation of voice and video, and consent-based review of reported calls | D19 |

## 9. Brand and web

| # | Item | Source |
|---|---|---|
| B-01 | Replace the redrawn logo with the original file if an exact match is needed | v0.30 |
| B-02 | A wordmark lockup with the word "echo" in the logo files | v0.30 |
| B-03 | Print and app-store listing artwork | v0.30 |
| B-04 | Real photography on the landing page (drawn scenes today) | D45 |
| B-05 | Kiswahili translation of the app (removed; English only) | D52 |

## 10. Quality and engineering

| # | Item | Source |
|---|---|---|
| Q-01 | Test on real phones and in Expo Go beyond a first look: keyboard, scroll, low-end Android, performance | v0.27 |
| Q-02 | The app runs on Expo SDK 57 so it opens in the store Expo Go; move back to SDK 58 when the store version supports it | v0.27 |
| Q-03 | Accessibility review with real users (screen reader, large text, reduced motion) | all |
| Q-04 | Security review before any real data: the mock backend, device storage and demo hooks are not safe for real use | v0.8 |
| Q-06 | Server list of common names for pen names (the server checks only the member's own name; the app has a names list) | v0.33 |
| Q-07 | Account deletion after the holding period, and "sign out everywhere" on the server (both are only recorded today) | v0.33 |
| Q-08 | Break-glass staff access to private identities (D27) | v0.33 |
| Q-09 | Real-time delivery of messages (the app asks every 3 seconds today) | v0.34 |
| Q-10 | Staff screens that read reports from the server (`private.reports`) and the "felt heard" answer saved on the server | v0.34 |
| Q-11 | Server check of the plan for matching, chat and community (M-14), once billing is on the server | v0.34 |
| Q-12 | A staff review queue for held posts. Until it exists, held posts go live after 15 seconds on the server, which is not a real check | v0.35 |
| Q-13 | Therapist replies in the forum and spaces, and the leading therapist's view of a space, once therapist accounts are on the server | v0.35 |
| Q-14 | Hiding or removing posts and comments after a report (staff action), and a ban on a member from posting | v0.35 |
| Q-15 | Automatic renewal (charging again at the end of a period) and a reminder before it, once a provider is connected | v0.36 |
| Q-16 | Remove the test-payment list (`private.payment_test_phones`) and the simulated payment before real members are charged | v0.36 |
| Q-17 | Therapist session payments through the server. **Done at v0.37** (same orders as plans; a provider is still needed) | v0.36 |
| Q-18 | Therapist accounts and the portal on the server. **Done at v0.38** (sign-in by phone, inbox, sessions, notes, hours, time off, forum replies, concerns, payout) | v0.37 |
| Q-19 | Real therapist onboarding and verification in place of the six sample therapists (`is_demo`) | v0.37 |
| Q-20 | Pause and time off are on the server (v0.38). Still to do: moving a suspended therapist's clients to someone else | v0.37 |
| Q-21 | Reporting a therapist from a chat when there is no session (M-02) on the server | v0.37 |
| Q-22 | Late-change charges and refunds for cancelled sessions (the flag is kept; nothing is charged or refunded yet) | v0.37 |
| Q-23 | Remove the old unused function `private.apply_paid_order` (replaced by `settle_order`) | v0.37 |
| Q-24 | ~~An admin screen to link a therapist to a phone number~~ done in v0.40 (Therapists module). Approving a new therapist is still to do | v0.38 |
| Q-25 | The clinical lead's side of a concern a therapist raises, and the clinical reviewers' queue for session reports (both are stored; nothing reads them) | v0.38 |
| Q-26 | Enforce "new clients a week" for a therapist (it is stored, not enforced) | v0.38 |
| Q-27 | Therapist applications, licence upload and checks, and appeals on the server (still mock) | v0.38 |
| Q-29 | ~~An Admin screen to add and link staff~~ done in v0.41. Two-person approval is done for staff changes (v0.43), strike-policy changes and break-glass (v0.44). The first Admin is created with a setup code (v0.42) | v0.39 |
| Q-30 | Dashboard modules still on the mock: analytics, resources, configuration, wellbeing and rota, billing and refunds, feedback, group chats, AI flags, therapist applications | v0.39 |
| Q-31 | ~~Break-glass access to a private profile on the server~~ done in v0.44. The member is not told; a notice after the fact is not built | v0.39 |
| Q-32 | Hide a reported comment, and tell the reporter the outcome of a report | v0.39 |
| Q-36 | Notify the member when staff reply to a ticket (the unread mark shows; no push or in-app notification yet) | v0.46 |
| Q-37 | Let staff see closed tickets and search them; today only open and replied ones are listed | v0.46 |
| Q-34 | A refund request screen in the member app (the server accepts requests; nothing in the app sends one) | v0.45 |
| Q-35 | Track installs and directory views for analytics, and history for events before v0.45 | v0.45 |
| Q-33 | A break from reviewing (the 20 a day limit is enforced; breaks are not), and heavy-queue rota that rotates by itself | v0.39 |
| Q-28 | Pay therapists: statements and payouts are worked out in the app from finished sessions; nothing is paid out | v0.38 |
| Q-05 | Remove demo hooks (`window.__echo`, Demo tools, scripted replies) when a real backend is connected | v0.8 |

---

## 11. Decisions still open

The full list of numbered decisions is in PRD section 14.1. These are the ones raised while building that are still open:

1. Should there be a free trial or a free taste before the plan is needed? (M-12)
2. Should deletion run on a rolling clock from the start of a chat (as built), or on a fixed day, such as every Monday for therapist chats?
3. Is the minimum number of reviews before a therapist rating shows right at 10? (P-05)
4. What does "available now" mean for therapists: today a session could start within 15 minutes, and "within the hour" means 60 minutes.
5. How many places per group chat, and should a therapist have a daily cap even though there is no weekly limit? (P-10)
6. Who verifies crisis lines and how often? (D29, P-03)
7. Content-note wording and veil for sensitive posts. (C-05, D32)
8. Can a person removed from a group chat appeal? (G-09)

## 12. Decided, for the record

- The backend is the Supabase project `haven`; the first slice is accounts and privacy; SMS uses test numbers until a provider is chosen (v0.33).

- The app is in English only (D52).
- Member app technology is React Native with Expo (D50).
- Support spaces are topic-scoped forums, not live chat (v0.28).
- Timed, facilitated group chats are in scope; open-ended live group chat is not (v0.29).
- Any verified therapist may lead a group chat, and there is no weekly limit (v0.31).
- Chats are deleted 24 hours after they start unless reported; five open peer chats and one therapist at a time (v0.29).
- The whole platform needs a paid plan: the community, support spaces, group chats and booking, as well as peer chat. Urgent help, the help centre, settings, billing and browsing the therapist directory stay free (v0.32).
- Moderators can remove people from a group chat but cannot schedule or cancel one; no emergency cancel (v0.32).
- Peer chats are deleted daily and therapist chats weekly, unless reported (v0.32).
