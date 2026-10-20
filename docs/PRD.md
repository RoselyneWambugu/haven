# Echo — Product Requirements Document

> **"A space to speak. Someone to listen."**

| | |
|---|---|
| **Status** | Draft v0.32 — the whole platform needs a paid plan; moderators can remove people from group chats; therapist chats are deleted weekly; v0.31 added a backlog of everything not built is in `docs/BACKLOG.md`; admin Group chats module, to schedule and cancel group chats; v0.30 added the Echo logo (a glowing lotus with a heart) in the app and on the web; v0.29 added timed group chats, 24-hour chats, chat limits, a dice for matching and therapist availability now; v0.28 added support spaces (groups for one issue each, such as domestic violence, PTSD and grief); v0.27 moved the app to Expo SDK 57 so it runs in the current Expo Go; v0.26 added replies to a member's own community post, with notifications; v0.25 put the navigation of both dashboards in a left sidebar; v0.24 added therapist appeals; v0.23 added a therapist roster with suspend and reinstate; v0.22 closed the loop on therapist concerns: clinical outcomes reach the therapist and the member; v0.21 added member concerns about a therapist session, routed to Clinical reviewers; v0.20 showed therapist ratings only once there are enough reviews (FDB-2); v0.19 added the member notification centre (SET-4, NTF-1, NTF-2); v0.18 captured the reported content in cases (SAF-3); v0.17 added the web landing page; v0.16 added the admin Feedback module; v0.15 added member feedback (the felt-heard rating and Settings feedback); v0.14 added the Roles and Wellbeing admin modules; the app is English only (D52); records the member-app technology decision (React Native with Expo) and the working builds of the member app, therapist portal and admin dashboard in `mobile/`. See Appendix C for what changed |
| **Date** | 2026-10-19 |
| **Source** | Echo product overview (concept, platform, safety, business model, roadmap) |
| **Market** | Kenya (pilot); regional expansion later |
| **Owner** | TBD |

---

## 0. How to read this document

- **MUST / SHOULD / MAY** follow RFC 2119 usage. MUST = required for the phase it is tagged with; SHOULD = expected unless there is a reason not to; MAY = optional.
- Requirements carry IDs (`ACC-1`, `MSG-4`, …) so they can be referenced in tickets, tests and reviews.
- Each requirement is tagged with the roadmap phase it ships in: **P2** (MVP), **P3** (professional services & safety), **P4** (pilot hardening), **P5** (growth).
- **[ASSUMPTION]** marks a decision I made to keep the document moving where the overview was silent. **[OPEN]** marks a decision that needs an owner before the phase it blocks. All of them are collected in [§14](#14-open-decisions-and-assumptions).
- **Design artefacts:** screen flows (`docs/screen-flows.md`), wireframes (`docs/wireframes*.html`), the **visual design** (`docs/visual-design.html`: colour, type, components, nine hi-fi member screens, landing page, therapist portal) and a combined viewer (`docs/echo-design.html`). Screen numbers 1–37 in §7 refer to those wireframes.
- Pricing, therapist pay, revenue share and the clinical escalation protocol are **deliberately not specified** — the overview says they still need to be established. This document defines the *mechanisms* that will carry those decisions.

---

## 1. Overview

### 1.1 Summary

Echo is an anonymous mental health and emotional-support platform with three surfaces: (1) **peer chat** with automatically matched members, (2) a **public forum** where members post and both members and therapists comment, and (3) **therapist sessions** by chat, voice call or video call. Members appear only as a pen name and avatar; therapists are publicly identified professionals. It is backed by subscription billing, AI-assisted moderation and human oversight.

**Core proposition:** anonymous peer connection + a supportive public community + access to identified, qualified professionals + a safer digital environment.

> **v0.2 change note:** earlier text said peer chat/forum/voice/video were out of scope and that matching used issue tags with connection requests. Per the founder: matching is automatic by age and language; there is a public forum; members can chat, call and video call therapists. Sections below are updated; items needing a decision are in §14.

### 1.2 Problem

People experience loneliness, distress, anxiety, grief and relationship or work difficulties without anyone they feel able to talk to. Barriers include cost of professional care, fear of judgement from family or community, lack of someone available at the moment of need, discomfort with calls or video, and no consistent source of support.

### 1.3 Positioning guardrails

These are product-level constraints that every feature must respect:

1. **Peer support is not treatment.** The product must never present peer conversations as therapy, diagnosis or a substitute for emergency services. Peer and clinical offerings are visibly distinct in the UI, pricing and legal terms.
2. **Members never share contact or location details with each other.** Between members, the system blocks videos, addresses, phone numbers and links (and, as a MUST-decide, other media — see D14). Voice/video exist only between a member and a verified therapist.
3. **Not a dating product.** Members are matched automatically (not browsed), have no photos, can't exchange contact details or links, and romantic/sexual solicitation is a moderated violation. This is the reason for the restrictions above.
4. **Members are anonymous; therapists are public.** Other users see only a pen name and avatar for a member. Real names and identifying details are never shown to other members. Therapist profiles are public by design.
5. **Safety content is never paywalled.** Crisis resources, the help centre, block and report are available to every account regardless of subscription status.

---

## 2. Goals, non-goals and success measures

### 2.1 Goals

| # | Goal |
|---|------|
| G1 | Let a new member go from sign-up to a first meaningful peer conversation quickly and without disclosing identity to anyone. |
| G2 | Give members a credible route to a verified, qualified therapist by chat, voice or video. |
| G7 | Provide a public forum where members can share and receive support from peers and therapists, anonymously. |
| G3 | Keep members safe: detect and act on abuse, harassment and crisis signals fast, with humans accountable for serious decisions. |
| G4 | Protect member privacy to the standard appropriate for sensitive health data. |
| G5 | Establish a subscription model clear enough that members know exactly what they are paying for (peer access vs. clinical services). |
| G6 | Give operators a dashboard sufficient to run the pilot safely: users, billing, therapists, reports, moderation. |

### 2.2 Non-goals (for the roadmap through Phase 4)

- Voice/video **between members**, member-to-member file sharing, or open-ended group chat (the public forum is in scope; **timed, facilitated group chats are in scope from v0.29**; open live group chat is not).
- Dating, romantic matching or social-network features (feeds, follows, public posts).
- Automated diagnosis, AI-generated therapy, or AI chatbots acting as a counsellor.
- Emergency dispatch. Echo signposts and escalates per protocol; it is not an emergency service.
- Operating outside Kenya (South Africa and others are Phase 5).

### 2.3 Success measures

Success is not downloads or subscriptions alone. Targets are to be set during pilot design **[OPEN]**; the metrics themselves are fixed here.

| Area | Metric |
|---|---|
| **Safety** | Median / p95 time-to-first-review for Severity-1 reports; % reports resolved within SLA; AI-flag precision (moderator-upheld %); appeal overturn rate; repeat-offender rate |
| **Support quality** | "I felt heard" post-conversation rating; % of conversations reaching ≥ N messages each way; therapist session rating |
| **Engagement** | Match request → accepted rate; D7 / D30 retention; weekly active conversations per active member |
| **Access to care** | % of members who book a therapist session; therapist utilisation; time-to-first-available session |
| **Commercial** | Free → paid conversion; plan mix (daily/monthly/yearly); churn; refund rate; willingness-to-pay findings from pilot |
| **Trust** | Block rate per 100 conversations; report rate; NPS / CSAT |

---

## 3. Users and roles

### 3.1 Personas

| Persona | Needs | Notes |
|---|---|---|
| **Seeker** | Someone to talk to without being known; low-friction start; to feel safe | May be lonely, grieving, stressed, anxious. Possibly vulnerable — design for that. |
| **Listener** | To support others within clear guidelines | Same account type as Seeker; every member can give and receive support. Also a forum commenter. |
| **Client** | Professional support via text | A member who books/chats with a therapist. |
| **Therapist** | Verified credential, manageable caseload, safe tools, fair pay | Needs to reach clients without taking on unmanaged risk. |
| **Moderator / Clinical reviewer** | Triage queue, evidence, clear policy, audit trail | Handles reports, AI flags, appeals, crisis escalations. |
| **Operator (Admin / Support / Billing)** | Run accounts, billing, refunds, analytics | Access to sensitive data is minimal and logged. |

### 3.2 Roles and permissions

| Capability | Member | Therapist | Moderator | Clinical Reviewer | Support / Billing | Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Use peer chat | ✔ | – | – | – | – | – |
| Chat with clients | – | ✔ | – | – | – | – |
| View a member's **pseudonymous** profile | ✔ | client only | ✔ | ✔ | ✔ | ✔ |
| View a member's **real identity** | – | break-glass only (§6.7) | break-glass | ✔ (crisis only) | limited (billing) | ✔ (logged) |
| Read conversation content | own only | own clients only | **only** within an open case | within an open case | – | – (via case only) |
| Suspend / restore accounts | – | – | ✔ | recommend | – | ✔ |
| Verify therapists | – | – | – | ✔ | – | ✔ |
| Issue refunds | – | – | – | – | ✔ | ✔ |
| Change roles / policy | – | – | – | – | – | ✔ |

**RBAC-1 (P2):** The system MUST enforce least-privilege role-based access with every operator action written to an immutable audit log (§6.11).
**RBAC-2 (P2):** Operator accounts MUST require multi-factor authentication.

---

## 4. Key user journeys

Each journey lists the intended happy path and the failure/safety branch that most needs designing.

### J1 — Onboarding (Member)
1. Download/open → welcome screen explaining what Echo is **and is not** (peer support ≠ therapy; not for emergencies).
2. Register with real details; verify phone (OTP) and, where required, identity **[OPEN]**.
3. Accept Terms, Privacy Notice and Community Guidelines — including explicit consent for AI-assisted moderation of messages.
4. Choose a pseudonymous handle and avatar (no photo upload).
5. Provide age (from date of birth) and spoken language(s); optionally select topics of interest for the forum.
6. Land on Home (active chats, forum feed) with a visible "Need urgent help?" entry. The system begins matching automatically.

*Safety branch:* if onboarding free-text or tag choices indicate crisis (e.g. self-harm), show the crisis resource card immediately and non-intrusively (§6.8).

### J2 — Automatic peer match and conversation
1. The system automatically pairs the member with another member of a compatible **age band** and shared **language** (§6.3).
2. Both see each other's pen name and avatar only, and a conversation opens. Either can **skip/end** the match without explanation shown to the other.
3. Messages are checked in real time against the sharing restrictions (§6.4).

*Safety branch:* either party can block/report at any point; blocked users never see each other again in matching.

### J3 — Ongoing conversation
- Chat with push notifications that never reveal message content on the lock screen by default.
- Optional **24-hour disappearing chat** (mutual opt-in, §6.4).
- Member can mute, block, report, end the conversation, or leave feedback.

### J4 — Report / block
1. From any message or profile: *Block* (immediate, silent) or *Report* (choose reason, optional note).
2. Reported messages, posts or comments are **snapshotted into a case** so they remain reviewable even if the chat expires or is deleted.
3. Reporter sees acknowledgement and, later, a non-detailed outcome notice.

### J5 — Crisis signal
1. Member message or onboarding input is flagged as possible self-harm / suicide / abuse risk.
2. Member receives a supportive, non-alarmist in-app card with crisis lines and the option to talk to a trained person.
3. A trained reviewer is alerted per protocol **[OPEN — clinical protocol]**. The flag never auto-bans or shames the member.

### J6 — Subscribe
1. Member picks Daily / Monthly / Yearly and a payment method (mobile money first — see §6.6).
2. Entitlements and renewal terms are shown before payment; explicit consent for auto-renewal.
3. On success, access updates immediately; failure leaves the member's safety features intact.

### J7 — Find a therapist and chat, call or video call
1. Member browses the public therapist directory (real name, photo, qualifications, verified badge, specialisations, languages, availability, price).
2. Chooses a mode — chat, voice call or video call — and books an available slot (or starts a chat if the therapist is available **[OPEN D4]**).
3. Session takes place in-app; the member may keep camera off and remain a pen name **[OPEN D15]**; the therapist can add a private note; the member can rate afterwards.

### J10 — Public forum
1. Member opens the forum, browses/filters by topic, and posts under their pen name.
2. Members and therapists comment. Therapist comments carry a verified-professional badge.
3. Posts and comments are screened before/after publishing; members can report any post or comment; a post with risk signals gets the crisis resource prompt shown to the author.

### J8 — Therapist onboarding
1. Therapist applies, uploads credentials and identity documents.
2. Clinical Reviewer verifies licence with the relevant regulator and approves/rejects with reason.
3. Therapist sets availability, profile, languages, specialisations, session rules.

### J9 — Moderator handles a case
1. Case appears in the queue with severity, source (user report / AI flag), snapshot of evidence and the parties' strike histories.
2. Moderator takes an action (dismiss, warn, restrict, suspend, escalate to Clinical Reviewer), records a reason, and the decision is logged.
3. If the user appeals, a *different* reviewer decides.

---

## 5. Product scope by phase

| Capability | P2 MVP | P3 | P4 Pilot | P5 |
|---|:--:|:--:|:--:|:--:|
| Registration, verification, private profiles | ✔ | | | |
| Automatic matching by age + language | ✔ | refine | | improve |
| Public forum (posts, comments, reports) | ✔ | therapist comments & badges | | |
| Peer text chat | ✔ | | | |
| Subscriptions (daily/monthly/yearly) | ✔ | | tune | |
| Block & report | ✔ | | | |
| Crisis resource card, help centre | ✔ | | | |
| Basic admin dashboard (users, reports, billing) | ✔ | extend | | |
| Home landing page and chat list (sections, row states, swipe actions) | ✔ | therapist section | | |
| Help centre: departments, search, articles, tickets | ✔ | | | |
| Support directory (outside organisations, volunteer psychologists) | | ✔ | | |
| Admin case queue, evidence view, break-glass, appeals, audit log | ✔ basic | full | | |
| Therapist portal: today, availability, live session, wrap-up, earnings | | ✔ | | |
| **Baseline safety: keyword flags + human review queue** | ✔ *(recommended — see §14)* | | | |
| AI-assisted moderation + strike engine | | ✔ | tune | |
| Therapist verification, availability, public directory, chat | | ✔ | | |
| Therapist voice & video calls | | ✔ | | |
| Escalation procedures / crisis protocol | | ✔ | validate | |
| 24-hour disappearing chats | | ✔ | | |
| Feedback & ratings | ✔ basic | ✔ | | |
| Kenya pilot with limited cohort | | | ✔ | |
| Matching improvements, retention tooling, new markets | | | | ✔ |

> **Note:** the overview places AI-assisted moderation in Phase 3 but peer chat in Phase 2. No external user should be exposed to peer chat without at least baseline moderation (keyword/pattern flagging plus a staffed human review queue and the crisis card). This PRD therefore tags that baseline as P2. See §14, decision D1.

---

## 6. Functional requirements

### 6.1 Accounts, registration and verification (ACC)

| ID | Requirement | Phase |
|---|---|---|
| ACC-1 | A user MUST register with real details (name, phone number, date of birth at minimum). Real details are stored but never displayed to other members. | P2 |
| ACC-2 | Phone number MUST be verified by OTP. One account per verified number. | P2 |
| ACC-3 | The system MUST enforce the minimum age **[ASSUMPTION: 18+]** using date of birth, and MUST NOT match or expose minors to adults under any circumstance. | P2 |
| ACC-4 | Stronger identity verification (e.g. national ID or selfie match) SHOULD be available as an escalation for suspended/repeat-offence accounts. | P3 **[OPEN]** |
| ACC-5 | Registration MUST capture explicit, separately recorded consent to: Terms, Privacy Notice, Community Guidelines, and AI-assisted moderation of messages. Consent versions and timestamps MUST be stored. | P2 |
| ACC-6 | Members MUST be able to view, correct, export and request deletion of their data. Deletion honours legal retention duties (e.g. billing, open safety cases). | P2 |
| ACC-7 | Sessions MUST be device-bound with ability to view and revoke active sessions. | P3 |
| ACC-8 | Banned/suspended users MUST NOT be able to trivially re-register (phone number and device signals). | P3 |
| ACC-9 | Date of birth under 18 ends sign-up with a kind, no-blame screen and youth support resources. Everything the person entered is deleted immediately and the screen says so **[D11]**. | P2 |
| ACC-10 | Stronger **ID verification** is not part of normal sign-up. It appears only on escalation (for example after a closed account or repeated violations) **[OPEN D33]**. ID images are encrypted, staff access needs a logged reason, and images are deleted after checking (period to be set). A person who can't continue is offered a route to Support. | P3 |
| ACC-11 | Sign-in is by **phone number and one-time code**, bound to the device, with no passwords; members see and can end active devices. Recovery after losing a phone is defined before launch **[OPEN D35]**. | P2 |
| ACC-12 | One-time codes are 6 digits with a resend countdown and attempt limits (for example 5 tries, then a 15-minute lock; placeholders). Changing a wrongly entered number is one tap. | P2 |
| ACC-13 | **App lock:** on opening, the app asks for the phone's own fingerprint or PIN (Echo never stores biometric data). The member chooses the delay before it asks again. The lock screen shows the avatar but **hides the pen name by default**. | P2 |
| ACC-14 | **Signing in on a new device** uses phone number plus one-time code. The next screen identifies the device and asks "Is this your own phone?": *mine* keeps the member signed in with app lock; *shared or borrowed* signs them out after a short session and clears local data when they leave **[OPEN D41]**. | P2 |
| ACC-15 | Sign-in screens MUST NOT reveal whether a phone number has an account (the wording is the same either way: "If this number has an account, a code is on its way"). | P2 |
| ACC-16 | **Code problems:** a clear error with tries left; options to resend, check or change the number, or get a voice call with the code; a temporary lock after repeated failures. | P2 |
| ACC-17 | **Lost phone or new number:** the member can approve the sign-in from another signed-in device, or prove identity with ID and a selfie reviewed by a person, or contact support. The account stays **locked and untouched** during review; every staff access is logged **[OPEN D42]**. | P2 |
| ACC-18 | **Signing in while paused, restricted or suspended** shows a plain status screen, not an error. Urgent help, the help centre, billing, data export and appeal remain available (SAF-15). | P3 |
| ACC-19 | **Active devices:** a list by device model, last activity and approximate town (visible only to the owner), with sign-out for one device or all other devices, and "Secure my account". | P2 |
| ACC-20 | **New-device alerts** go to the member's other devices and by SMS **[OPEN D44]**. "No, secure my account" signs out every device, locks the account and starts recovery; it never deletes anything. | P2 |
| ACC-21 | **Discreet features:** quick exit (for example triple-tap the logo to leave at once), neutral notification text, and, if feasible, a neutral app name or icon **[OPEN D43]**. | P3 |
| ACC-22 | **Urgent help is reachable without signing in.** The "Need urgent help?" control appears on every pre-login screen (see CRS-1). | P2 |

### 6.1a Navigation, home and chat list (NAV / CHL)

| ID | Requirement | Phase |
|---|---|---|
| NAV-1 | The member app has five bottom tabs: **Home · Chats · Forum · Therapists · Help**. **Me** (profiles, plans, settings, account standing) opens from the member's avatar at the top-left of every screen **[OPEN D22]**. | P2 |
| NAV-2 | A "Need urgent help?" control appears in the top bar of every screen and reaches urgent help in ≤ 2 taps (see CRS-1). | P2 |
| NAV-3 | **Home** is a calm landing page: greeting by pen name, optional mood check-in, the two most recent chats with unread counts, the next booked therapist session, and one forum highlight. It MUST NOT use streaks, rankings or "someone is waiting for you" pressure. | P2 |
| NAV-4 | While matching is in progress Home shows honest wait copy, lets the member pause matching or change languages, and links to the forum and therapists. | P2 |
| NAV-5 | The mood check-in is optional and private. It MUST NOT be shown to other members and MUST NOT feed matching or analytics until reviewed **[OPEN D25]**. | P2 |
| CHL-1 | The **chat list** groups conversations into **Therapists** (above) and **Peers**, with filters All / Peers / Therapists and a search that finds the member's own conversations by pen name only. It MUST NOT allow searching for other members. | P2 |
| CHL-2 | Row states: unread count, muted, disappearing chat with time left, and ended chats dimmed at the bottom. Therapist rows show the Verified badge. | P2 |
| CHL-3 | Row actions (swipe or long-press): mute, report, block, archive, end conversation, disappearing chat. Blocking asks "Also report?" before confirming and removes the chat from both lists. | P2 |
| CHL-4 | When a plan lapses, chats become read-only for a grace period **[OPEN D26]**, with a renewal banner. The forum, help centre, urgent help, block and report stay available (see BIL-6). | P2 |
| CHL-5 | Message previews appear only inside the app; push notifications stay content-free (MSG-5). | P2 |

### 6.2 Profiles and privacy (PRF)

Every account has two separate profiles, stored and permissioned separately.

| | **Public profile** | **Private profile** |
|---|---|---|
| **Contents (members)** | Pen name, avatar | Real name, national ID (if collected), date of birth/age, phone number, email, address/location if collected, consent records, verification status |
| **Who can see it** | Other members, therapists (as the member's identity in chat/forum/sessions), moderators | The account owner; staff only under the access rules in §6.9 (billing/support minimum, or logged break-glass) |
| **Shown to other members?** | Yes | **Never** |
| **Editable by user?** | Yes (pen name with rate limits; avatar from curated set) | Limited: corrections via verified request; ID and DOB changes need re-verification |
| **Therapists** | Public by design: real name, photo, credentials, badge, specialisations, languages, ratings | Licence documents, ID, payout and tax details, internal verification notes (staff only) |

| ID | Requirement | Phase |
|---|---|---|
| PRF-1 | Each member has a **pen name** (unique, moderated for impersonation, offensive content, and names that resemble real names or contact details) and an avatar chosen from a curated set. Photo upload is not supported. | P2 |
| PRF-2 | The **public profile** contains only pen name and avatar. To matched members, age band and shared language may also be shown. No free-text bio in the MVP **[OPEN D18]**. | P2 |
| PRF-3 | The **private profile** holds all identifiable data (name, ID, age/DOB, phone, etc.). It is a separate data store/schema with its own access controls and encryption keys, so a bug in a member-facing API cannot leak it. | P2 |
| PRF-4 | Members can change their pen name subject to rate limits without losing conversations; name history is retained for moderation. | P2 |
| PRF-5 | Identifiable data MUST never appear in any member-facing API response, notification, log, analytics event or forum/chat payload. This is verified by automated tests on every response schema. | P2 |
| PRF-6 | **Therapist profiles are public** (real name, photo, qualifications, verified badge, specialisations, languages, ratings) and visible to non-logged-in visitors only to the extent counsel approves **[OPEN]**. Their private profile holds licence documents, ID, payout and tax details. | P3 |
| PRF-7 | Users can view what their private profile holds and what is public, in a "what others see" preview. | P2 |
| PRF-8 | Age is collected in the private profile; the public side only ever exposes an age band to matches. | P2 |
| PRF-9 | While a pen name is typed it is checked live: names resembling a real name, phone number, email or link are refused with a friendly reason, and suggestions are offered. Avatars are chosen from a curated set; there is no photo upload. | P2 |
| PRF-10 | Pen-name changes are rate-limited, never break existing chats, and old names are kept for moderation **[OPEN D36]**. | P2 |
| PRF-11 | The private profile opens only after a fresh phone verification, even on a signed-in device. Members can request corrections; a change of ID or date of birth needs re-verification. | P2 |

### 6.2a Settings and account (SET)

| ID | Requirement | Phase |
|---|---|---|
| SET-1 | **Me** (opened from the top-left avatar) shows pen name and plan status, the "Open to new chats" switch, My profiles, My plan, Account standing, Settings, Help and Log out. | P2 |
| SET-2 | **Open to new chats** pauses matching in one tap, without leaving the app or affecting existing chats. | P2 |
| SET-3 | **Privacy and data** lists blocked members by pen name (unblocking never reveals identity), sets the default for disappearing chats to "ask each time", explains message screening in plain language, and offers "Download my data" at any time (ACC-6). | P2 |
| SET-4 | **Notifications:** message text on the lock screen is hidden by default; session reminders, forum replies and plan reminders are switchable; **safety and account notices cannot be switched off** (outcomes, strikes, appeals); quiet hours are supported; no re-engagement nudges (NTF-2). | P2 |
| SET-5 | **Delete account** explains what happens (plan ends, chats removed for both people, forum posts deleted or anonymised at the member's choice), what must be kept (payment records, open safety cases) and for how long, and offers a data download first. A holding period lets the member change their mind **[OPEN D34: 14 days placeholder]**. Phone verification confirms it. | P2 |
| SET-6 | **Account standing** shows each notice in plain language with the rule broken, its expiry and what comes next, and offers an appeal in one tap (SAF-14). Appeals are text only and are decided by a different reviewer (ADM-10). | P3 |
| SET-7 | The post-conversation **rating** ("Did you feel heard?") uses five faces and an optional comment, is private to the member and skippable without penalty (FDB-1). | P2 |

### 6.3 Automatic matching (MAT)

| ID | Requirement | Phase |
|---|---|---|
| MAT-1 | Members are matched **automatically** using **age band** and **spoken language(s)** as the required criteria. | P2 |
| MAT-2 | Age bands MUST be defined (e.g. 18–24, 25–34, …) **[OPEN D11]** and adults MUST NEVER be matched with minors. If minors are allowed, they match only with minors, in a separately governed experience. | P2 |
| MAT-3 | Language is a hard filter: both members must share at least one language; the shared language is shown. | P2 |
| MAT-4 | Matching MUST exclude blocked users (both directions), suspended users, and users with open Severity-1 cases, and MUST avoid re-matching a pair who previously ended a match unless both opt in. | P2 |
| MAT-5 | Members can skip, end a match, or pause matching ("not taking new conversations"); limits apply to rapid skipping/"shopping". | P2 |
| MAT-6 | Matching MUST NOT use or display appearance, relationship status, gender-seeking preferences or proximity. **[OPEN D16: whether gender is collected at all; collecting it raises dating risk]** | P2 |
| MAT-7 | Optional soft signals (forum topics, stated interests, issue tags) MAY be added later to improve match quality, as tie-breakers only. **[OPEN D17]** | P3 |
| MAT-8 | Match quality MUST be measurable: conversation depth, post-chat rating, skip rate, block rate per match. | P2 |

### 6.4 Messaging (MSG)

| ID | Requirement | Phase |
|---|---|---|
| MSG-1 | Member-to-member chat MUST block: **videos, addresses, phone numbers and links** (URLs, domains, social handles, emails). Detection MUST handle obfuscation (spaced digits, number words, "dot com", Sheng/Kiswahili digits). Blocked content is not delivered; the sender sees a friendly explanation. Whether **images/audio notes** are permitted is **[OPEN D14]**; default: not permitted. | P2 |
| MSG-2 | Chat supports real-time and asynchronous use, with delivery and read state; typing indicator is optional per member. | P2 |
| MSG-3 | Messages MUST be encrypted in transit and at rest. Whether end-to-end encryption is used is an architectural decision that **conflicts with server-side AI moderation** and MUST be decided explicitly **[OPEN D6]**. | P2 |
| MSG-4 | Members can mute, block, report, archive or end a conversation at any time. Ending a conversation does not notify with blame language. | P2 |
| MSG-5 | Push notifications MUST be content-free by default ("You have a new message") and configurable. | P2 |
| MSG-6 | Message length, send rate and burst limits MUST apply to prevent flooding. | P2 |
| MSG-7 | **Disappearing chats:** a conversation MAY be switched to 24-hour expiry only with consent from **both** parties; the setting and its state are visible in the thread. Messages are removed from member devices and servers after 24 hours **except** content snapshotted into a safety case (§6.9). | P3 |
| MSG-8 | Members MUST see an always-visible reminder, in the conversation header or an info sheet, that peer support is not professional treatment and how to reach urgent help. | P2 |
| MSG-9 | Local/offline behaviour: composing offline queues messages and sends on reconnect; the app MUST be usable on low-end Android devices and poor networks. | P2 |

### 6.4a Public forum (FRM)

| ID | Requirement | Phase |
|---|---|---|
| FRM-1 | Logged-in members can create posts (title, text, topic) and comment, always under their pen name and avatar. Read access for non-members **[OPEN D20]**. | P2 |
| FRM-2 | Therapists can comment on any post; their comments carry a verified-professional badge, real name and are visually distinct. Therapist comments in the forum are general information, not individual treatment, and the UI must say so. | P3 |
| FRM-3 | Posts and comments are **text only** and are subject to the same blocking as chat: no videos, addresses, phone numbers or links. Because the forum is public, they are also screened for identifying details (names, workplaces, schools, neighbourhoods) and the author is warned before publishing. | P2 |
| FRM-4 | Every post/comment has Report; reports create cases (§6.7). Authors can delete their own content; deletion does not erase snapshots held in an open case. | P2 |
| FRM-5 | Moderation approach (pre-moderation for new/low-trust accounts, post-moderation otherwise, or full pre-moderation) **[OPEN D21]**; self-harm or abuse disclosure posts trigger the crisis card for the author (CRS-3) and a priority review. | P2 |
| FRM-6 | Topic categories are admin-managed; pinned community guidelines; therapist-hosted topics or Q&A MAY be added. | P3 |
| FRM-7 | Anti-abuse: rate limits, new-account restrictions, brigading detection, ability to mute/block authors, hide specific threads. | P2 |
| FRM-8 | Comments from therapists MUST NOT solicit private clients through contact details; offering a session happens via the in-app profile link. | P3 |
| FRM-9 | The feed shows pinned community guidelines, admin-managed topic chips, a **My posts** entry and sort options: most recent, most supported, therapist replied, no replies yet. | P2 (therapist replied: P3) |
| FRM-10 | Posts have a single **Support** reaction. Members see counts only, never who reacted. There are no downvotes **[OPEN D32]**. | P2 |
| FRM-11 | Authors can delete their post at any time and edit it for 15 minutes **[OPEN D32]**. Edits are limited so a post can't be rewritten after people reply. | P2 |
| FRM-12 | A comment removed for sharing contact details appears as a neutral "Comment hidden: shared contact details" placeholder; the commenter is told why when they try to post it. | P2 |
| FRM-13 | New accounts' first posts are held for review; the author sees "Awaiting review" with an expected wait. Authors of posts that signal distress see a gentle "talk now" prompt (crisis card, FRM-5); other members see nothing different. | P2 |
| FRM-14 | Free accounts may read and post in the forum **[OPEN D24]**. | P2 |
| FRM-15 | There is no direct message, follow or "message this person" action from the forum. Tapping a pen name offers only mute and block. | P2 |

### 6.5 Therapist directory and sessions (THR)

| ID | Requirement | Phase |
|---|---|---|
| THR-1 | Therapists MUST apply with credentials; only approved therapists appear in the directory. | P3 |
| THR-2 | Verification MUST check licence/registration status with the competent Kenyan regulator and record: document, reviewer, date, result, expiry/renewal date **[verify regulator list with counsel]**. | P3 |
| THR-3 | Re-verification MUST occur at credential expiry; expired therapists are automatically hidden from booking. | P3 |
| THR-4 | Directory entries are **public** and show: real professional name, photo, qualification, verified badge, specialisations, languages, supported modes (chat/voice/video), availability, price, rating. | P3 |
| THR-5 | Therapists manage availability (recurring and one-off), set capacity limits and can pause intake. | P3 |
| THR-6 | A member can **chat, voice call and video call** a therapist. The platform MUST support in-app real-time voice and video (no phone numbers exchanged; calls are proxied through the app), scheduled and, if offered, on-demand. Scheduling model is **[OPEN D4]**. | P3 |
| THR-6a | Members MAY join calls with camera off and pen name/avatar shown; whether therapists may require camera-on or real identity for clinical reasons is **[OPEN D15]**. | P3 |
| THR-6b | Calls MUST NOT be recorded by default. Any recording requires explicit, per-session consent from both parties and a defined retention rule **[OPEN D19]**. | P3 |
| THR-6c | Therapists MUST NOT share personal phone numbers, addresses or off-platform contacts with members, and the same blocking applies to their chat. | P3 |
| THR-6d | Calls need a quality fallback (video → voice → chat) for poor networks, with minutes/data cost shown to the member. | P3 |
| THR-7 | Booking, rescheduling, cancellation, no-show and refund rules MUST be explicit in-app and enforced by the system. | P3 |
| THR-8 | Therapists have private session notes. Ownership, retention, access and export rules for clinical notes MUST be defined **[OPEN D7]**. | P3 |
| THR-9 | Professional-conduct rules apply to all modes; text moderation applies to therapist chat in both directions; call/video safety relies on reporting, session metadata and consented review since live media is not scanned **[OPEN D19]**. | P3 |
| THR-10 | Therapists MUST have a documented process for imminent-risk situations, including how and when a client's real identity/contact can be accessed (§6.9). | P3 |
| THR-11 | Therapist payouts, commission and invoicing are handled in Billing (§6.6). Rates and revenue-share are **[OPEN D3]**. | P3 |
| THR-12 | Ratings and reviews of therapists are moderated; clinical complaints route to Clinical Reviewer, not only Support. | P3 |
| THR-14 | The therapist portal is a **web application** first; a therapist mobile app is out of scope for now **[OPEN D23]**. Navigation: Today, Inbox, Calendar, Sessions, Forum, Earnings, Profile, Help. | P3 |
| THR-15 | **Today** shows sessions today with a Join control, unread messages, new requests and compliance alerts (e.g. licence expiring in 60 days). It MUST NOT rank therapists against each other. | P3 |
| THR-16 | **Availability:** recurring weekly blocks per mode, one-off time off, "Pause new clients", and caps for sessions per day, buffer between sessions and new clients per week **[OPEN D30]**. Clients with bookings are notified automatically when time off is added. | P3 |
| THR-17 | **Live session:** private notes beside the call (autosaved; only the therapist sees them), mode switching (video → voice → chat), a "Not recorded" indicator, and **Raise a concern** always visible. | P3 |
| THR-18 | **Raise a concern** first asks whether anyone is in immediate danger, collects the concern type and optional detail, and alerts the on-call clinical lead at once. Real identity and contact details are released **only** by the clinical lead under the approved protocol, and every access is logged **[OPEN D8, D31]**. | P3 |
| THR-19 | **Wrap-up:** attendance (attended / late / no-show), private session note, optional follow-up suggestion sent to the client as a booking offer, and a link to raise a concern. Attendance feeds billing and no-show rules. | P3 |
| THR-20 | **Earnings:** available, pending (hold period) and paid-out balances; per-session gross, fee and net; payout method and schedule with re-authentication to change; downloadable statements **[OPEN D3]**. | P3 |
| THR-21 | The **Therapists** tab has two views: **Find a therapist** and **My sessions**. Therapy is shown as separate from peer support, priced per session. | P3 |
| THR-22 | The **directory** offers search by name or topic, specialisation chips, and filters for specialisation, language, session type (chat / voice / video), price range, availability and an optional therapist-gender preference (default "No preference") **[OPEN D37]**. Active filters are counted on the filter button. | P3 |
| THR-23 | Default sort is **next available**; other sorts are highest rated, lowest price and soonest in my language. There is no paid placement and no "promoted" listing **[OPEN D38]**. | P3 |
| THR-24 | Each directory card shows verification badge, rating, specialisations, languages, session modes, next available slot and price per session. | P3 |
| THR-25 | When filters return no one, the screen suggests removing a filter, offers a **waitlist** for fully booked therapists, an optional short "Help me choose" questionnaire **[OPEN D37]**, and links to peer chat, the support directory and urgent help. | P3 |
| THR-26 | **Booking confirmation** shows therapist, mode, date and time (EAT), duration, automatic reminders (1 hour and 10 minutes before), add-to-calendar, a short preparation checklist, the anonymity and no-recording statement, and the free-change deadline. | P3 |
| THR-27 | **My sessions** lists upcoming and past sessions. Join opens 10 minutes before the start **[OPEN D40]**. Reschedule and cancel are one tap from the card. | P3 |
| THR-28 | **Changing a booking** shows the exact free-change deadline, states charges for late changes and no-shows, offers a new time or cancellation with an optional reason, and handles a therapist's own cancellation or lateness **[OPEN D39]**. | P3 |
| THR-29 | **Member-side call screens** (voice and video) show a timer, a quiet connection indicator, "Not recorded", mute / speaker / camera / switch mode / end, and a discreet "Something wrong? Report or get help" link. Camera is off by default and the member appears as an avatar and pen name (D15). | P3 |
| THR-30 | On a weak connection the app **offers** to switch from video to voice (and from voice to chat) before quality degrades; the member decides **[OPEN D40]**. Voice and chat are presented as the low-data options. | P3 |
| THR-31 | After a session the member is asked for a quick rating and an optional private comment (therapists see aggregates only, FDB-2), can book the therapist's suggested follow-up in one tap, and sees ways to talk to someone if things feel heavy. | P3 |

### 6.6 Subscriptions and billing (BIL)

| ID | Requirement | Phase |
|---|---|---|
| BIL-1 | Three billing periods MUST be supported: **daily, monthly, yearly**. Prices are configuration, not code, and are denominated in KES for the pilot **[ASSUMPTION]**. | P2 |
| BIL-2 | Each plan has an **entitlement set** (config): e.g. peer chat access, connection-request allowance, disappearing chats, therapist-session credits/discount. Exact entitlements **[OPEN D2]**. | P2 |
| BIL-3 | Peer subscriptions and paid clinical services MUST be separate line items on every price screen, receipt and invoice. | P2 |
| BIL-4 | Payment methods: mobile money (M-Pesa) as primary **[ASSUMPTION]**; cards secondary. Provider capabilities for recurring/auto-renew vary — the system MUST support both auto-renew and manual-renew-with-reminder. | P2 |
| BIL-5 | Auto-renew requires explicit opt-in. Renewal reminders MUST be sent before charge. Cancel is as easy as sign-up. | P2 |
| BIL-6 | On lapse or failure: conversations become read-only for a defined grace period; history is preserved; **safety features and crisis resources remain accessible**. Grace length **[OPEN]**. | P2 |
| BIL-7 | Payment events MUST be processed idempotently via provider webhooks, with reconciliation reporting. | P2 |
| BIL-8 | Refunds are issued by Support/Billing with reason codes and audit trail; policy (pro-rata, windows, abuse) **[OPEN D2]**. | P2 |
| BIL-9 | Receipts/invoices MUST be generated and emailed/SMS-linked; tax treatment **[OPEN, counsel]**. | P2 |
| BIL-10 | If distributed through app stores, store billing rules apply to digital subscriptions and MUST be reviewed before launch **[OPEN]**. | P2 |
| BIL-11 | Sponsored mental-wellness initiatives MAY be added but MUST NOT expose or use member data or place advertising inside conversations. | P5 |
| BIL-12 | A paywall screen on Chats explains what needs a plan and lists what always stays free (urgent help, help centre and tickets, block/report and data controls, and the forum **[OPEN D24]**). | P2 |
| BIL-13 | M-Pesa payments are confirmed asynchronously: the waiting screen is safe to leave, offers resend and "use another method", and any stray debit is refunded automatically within a stated time (placeholder: 24 h). | P2 |
| BIL-14 | Receipts show the plan and payment reference only, never the pen name or any chat content. They are sent by SMS and available in billing history. | P2 |
| BIL-15 | Cancelling takes two taps from My plan, states exactly when access ends, offers an optional reason and, if the member seems to be struggling, offers support. No guilt copy or dark patterns. | P2 |
| BIL-16 | Therapist-session checkout is a one-off payment on its own screen, labelled "not part of your plan", with any plan discount as a separate line, cancellation and no-show terms shown before paying, and no auto-renew. | P3 |

### 6.7 Safety: blocking, reporting, moderation and strikes (SAF)

#### Blocking and reporting

| ID | Requirement | Phase |
|---|---|---|
| SAF-1 | **Block** is immediate, silent, mutual-invisible (neither party sees the other in matching, requests or search), and reversible only by the blocker. | P2 |
| SAF-2 | **Report** (on messages, posts, comments, profiles) offers reason categories (harassment, threats, sexual content, scam/solicitation, self-harm concern, impersonation, hate, other) and optional free text. | P2 |
| SAF-3 | A report MUST create a **Case** that snapshots the reported message(s) with surrounding context, parties, timestamps and prior history. | P2 |
| SAF-4 | Reporters receive an acknowledgement and a generic outcome notice ("Action was taken" / "No violation found") without disclosing sanctions. | P2 |
| SAF-5 | Retaliation protection: repeated reports or blocks against the same reporter by a user escalate that user's case. | P3 |

#### AI-assisted moderation

| ID | Requirement | Phase |
|---|---|---|
| SAF-6 | **Baseline (P2):** pattern/keyword detection for abuse, solicitation, contact-detail sharing and self-harm language, feeding a staffed human review queue. | P2 |
| SAF-7 | **AI (P3):** model-based detection for harassment, threats, manipulation/grooming, sexual content, scams and self-harm risk. | P3 |
| SAF-8 | AI output is a **signal, not a verdict.** A flag creates or enriches a case; it MUST NOT permanently ban, delete an account or disclose message contents externally. Severe automated actions are limited to *temporary* protective measures (e.g. hold message for review) defined in policy. | P3 |
| SAF-9 | All flags record: model/version, category, score/confidence, message reference, outcome after review. Moderator decisions feed precision/false-positive metrics. | P3 |
| SAF-10 | Moderation covers peer and therapist chats, forum posts and comments, pen names, and is tuned for English, Kiswahili and Sheng/code-switching **[ASSUMPTION]**. | P3 |
| SAF-11 | Members MUST be told, in plain language, that messages are screened by automated systems and may be reviewed by trained staff when reported or flagged. | P2 |

#### Strike policy (draft — to be ratified)

Violations are classed by severity. Severity governs the response; strikes govern repetition.

| Severity | Examples | Response |
|---|---|---|
| **S1 – Critical** | Credible threats; sexual content involving minors; grooming; coercion; encouraging self-harm; sharing others' identities | Immediate protective suspension + urgent human review; may bypass strike count; legal escalation where required |
| **S2 – Serious** | Targeted harassment; sexual solicitation; scams/solicitation; hate speech | Strike + message removal; 72-hour messaging restriction on repeat |
| **S3 – Minor** | Rudeness, spam, off-platform contact-sharing | Warning → strike |

| Strike | Consequence |
|---|---|
| 1 | Warning with explanation, message removed/hidden if needed |
| 2 | Time-limited restriction (e.g. 24–72 h) and re-acknowledgement of Community Guidelines |
| 3 | **Temporary suspension pending moderator review** (per overview); account decisions after review: reinstate / extended restriction / permanent ban |

| ID | Requirement | Phase |
|---|---|---|
| SAF-12 | The strike engine MUST be configurable: severities, per-severity strike weight, strike expiry window, restriction durations. Defaults above; final values **[OPEN D5]**. | P3 |
| SAF-13 | Every sanction MUST be explained to the user in plain, non-judgemental language with the rule broken and how to appeal. | P3 |
| SAF-14 | **Appeals:** a member can appeal any strike/suspension in-app; a *different* reviewer decides within an SLA; outcomes are logged. | P3 |
| SAF-15 | Suspended members retain access to crisis resources, help centre, billing management and data export. | P3 |

### 6.8 Crisis and wellbeing safeguards (CRS)

| ID | Requirement | Phase |
|---|---|---|
| CRS-1 | A persistent "Need urgent help?" entry MUST be reachable in ≤ 2 taps from any screen, linking to locally appropriate crisis lines and emergency numbers, with tap-to-call. | P2 |
| CRS-2 | The crisis resource list MUST be curated and verified by a Clinical Reviewer before launch and re-verified on a schedule; stale numbers are a launch-blocking defect. (Candidates to verify: Kenya Red Cross toll-free line, Befrienders Kenya, emergency 999/112.) | P2 |
| CRS-3 | When self-harm/suicide risk signals appear (member's own messages or onboarding), the app shows a supportive resource card — never a punitive or blocking message. | P2 |
| CRS-4 | A crisis flag MUST route to a trained reviewer with a defined response-time SLA. The clinical protocol (what is said, when real identity/location can be accessed, when third parties are contacted) **must be authored and approved by qualified clinicians and counsel** before Phase 4. | P3 **[OPEN D8]** |
| CRS-5 | Listeners MUST see guidance on how to respond to someone in distress and how to hand over to professional help, and the UI MUST NOT encourage listeners to act as counsellors. | P2 |
| CRS-6 | The product MUST NOT present peer support as a replacement for professional treatment or emergency services anywhere in UI, marketing or store listings. | P2 |
| CRS-7 | Listener wellbeing: prompts to take breaks, limits on concurrent conversations, and a way to step back or report distressing content. | P3 |

### 6.9 Privacy, retention and break-glass access (PRV)

| ID | Requirement | Phase |
|---|---|---|
| PRV-1 | Access to conversation content by staff is **deny-by-default**. It is granted only inside an open case (report, flag, appeal or crisis), scoped to the relevant messages plus necessary context, and every access is audit-logged with reason. | P2 |
| PRV-2 | Access to a member's real identity is allowed only (a) for billing/support to the minimum extent necessary, or (b) via a logged **break-glass** action for imminent-risk, legal process or serious fraud. Break-glass MUST name a reason category plus a written justification, MUST be approved by a second person (the on-call clinical lead), MUST be time-limited **[OPEN D27: 30 min placeholder]**, and the member is not notified at the time. | P2 |
| PRV-3 | Retention schedule MUST exist for: messages, snapshots in cases, flags, payments, audit logs, deleted accounts. Defaults **[OPEN D6]**. | P2 |
| PRV-4 | Case snapshots are retained for a limited period after case closure and then deleted; they are not a back door for long-term message storage. | P3 |
| PRV-5 | Data MUST be encrypted at rest; secrets and keys managed centrally; production data never used in development without anonymisation. | P2 |
| PRV-6 | Analytics MUST use pseudonymous IDs and MUST NOT include message content or health inferences in third-party SDKs. No third-party advertising SDKs. | P2 |
| PRV-7 | Cross-border processing (cloud regions, AI vendors, payment processors) MUST be inventoried and approved against Kenyan data-protection requirements before launch. | P2 |
| PRV-8 | If an external AI/ML provider is used for moderation, messages MUST be processed under a contract prohibiting retention/training on member content. | P3 |

### 6.10 Help centre, feedback and notifications (HLP / FDB / NTF)

| ID | Requirement | Phase |
|---|---|---|
| HLP-1 | The Help tab is organised **by department**, each with its own articles, FAQs and contact route: **Getting started, Account and profiles (public vs. private), Privacy and anonymity, Safety and reporting (block, report, appeals, community guidelines), Billing and plans, Therapists and sessions, Forum, Technical support, Feedback, and My tickets**. **Urgent help** is the first and most prominent card on Help home. The department list is Admin-managed **[ASSUMPTION: "help departments" means support areas of the app; confirm]** and editable without a release. | P2 |
| HLP-1a | Each department has a clear owner on the operations side (Support, Billing, Moderation/Safety, Clinical Reviewer, Tech) and a response-time target. | P2 |
| HLP-1b | A member can open a ticket from a department; tickets are tied to the member's account but staff see only the public profile unless the department needs the private profile (e.g. Billing). | P2 |
| HLP-2 | The help centre includes a directory of **volunteer psychologists and support resources**, curated and maintained by the Clinical Reviewer, with disclaimers about availability. | P3 |
| HLP-3 | Contact Support is available in-app from every department; any request that mentions risk is routed to the crisis queue regardless of department. Urgent help is always visible and never paywalled. | P2 |
| HLP-4 | Help search covers help articles only and never indexes chats, forum posts or other private data. Results show the department; if nothing fits, one tap contacts the most likely department. | P2 |
| HLP-5 | Articles are titled as questions, written in plain numbered steps, show a last-updated date, collect a helpful / not-helpful vote and are written in English **[D52]**. | P2 |
| HLP-6 | The contact form prefills the topic, is **text only** **[OPEN D28]**, warns never to share an M-Pesa PIN, password or full card number, and shows a gentle urgent-help card (without blocking the send) when the message suggests distress. | P2 |
| HLP-7 | **Tickets** show status (open, replied, resolved) with an unread-reply marker. Staff replies are labelled "Echo staff", never a named individual. Members can close a ticket or reopen it by replying. | P2 |
| HLP-8 | The **urgent help page** leads with emergency services, then tap-to-call crisis lines (free where possible, with hours and languages), then Echo options (therapist, peer chat, support directory) and a short grounding exercise. It shows the date the numbers were last verified **[OPEN D29]**. | P2 |
| HLP-9 | The **support directory** (HLP-2) lists each organisation with type, cost, hours, languages and the right contact method (call, website, contact), with a disclaimer, and lets members suggest a service for the clinical team to review. | P3 |
| FDB-1 | After a conversation reaches a threshold, or a therapist session ends, prompt for a rating ("Did you feel heard?") with optional comment. Ratings are private, never shown to the other peer. | P2 |
| FDB-2 | Therapist ratings are shown in aggregate on their profile after a minimum review count. | P3 |
| FDB-3 | In-app feedback and bug report are available from Settings. | P2 |
| NTF-1 | Channels: push (primary), SMS (critical account/billing), email (receipts, policy). Members control categories except legally required notices. | P2 |
| NTF-2 | Quiet hours and frequency capping apply; no manipulative re-engagement nudges ("someone is waiting for you!") — copy is reviewed for wellbeing impact. | P2 |

### 6.11 Admin dashboard (ADM)

The dashboard is an internal web application with MFA, RBAC and a complete audit log.

#### Overview tiles

| Tile | Definition (to be finalised) |
|---|---|
| **Active users** | Distinct members with ≥ 1 session in the last 24 h / 7 d / 30 d (DAU / WAU / MAU) |
| **Paying users** | Members with an active, paid, non-refunded subscription at the time of query |
| **Active therapists** | Verified therapists with availability or a session in the last 30 d |
| **Reported cases** | Open cases awaiting resolution, broken down by severity and age vs. SLA |

> Per the overview, any figures in mock-ups are placeholders, not real statistics. Real tiles MUST be driven by live data, with a visible "last updated" timestamp.

#### Modules

| Module | Key capabilities | Phase |
|---|---|---|
| **Users** | Search (by handle / internal ID), view account standing, strikes, subscription status; suspend / restore; export data on request. Real identity hidden behind break-glass. | P2 |
| **Billing** | Subscriptions, transactions, failed payments, refunds with reason codes, revenue reports (daily/monthly/yearly), reconciliation | P2 |
| **Reports & cases** | Queue by severity and SLA, case detail with evidence snapshots, party history, actions, notes, assignments, escalation to Clinical Reviewer | P2 |
| **Moderation** | AI flags log, precision metrics, rule/keyword management, strike config, appeals queue | P3 |
| **Therapists** | Application queue, credential verification workflow, expiry tracking, availability overview, complaints, payouts | P3 |
| **Analytics** | Acquisition, activation (sign-up→first chat), retention cohorts, match quality, conversion, churn, safety metrics | P2 basic / P3 full |
| **Resources & Help** | Help departments, articles and tickets; directory of volunteer psychologists; crisis lines | P2 / P3 |
| **Configuration** | Issue taxonomy, plans & entitlements, matching weights, feature flags | P2 |
| **Audit log** | Immutable record of every privileged action and content access; searchable and exportable for oversight | P2 |

| ID | Requirement | Phase |
|---|---|---|
| ADM-1 | Every case MUST have an owner, status, severity, SLA clock, and full decision history. | P2 |
| ADM-2 | Case view shows content **only** from the snapshot/within-case access scope. | P2 |
| ADM-3 | Bulk actions (e.g. mass suspend) require two-person approval. | P3 |
| ADM-4 | Admin exports of personal data MUST be logged and restricted by role. | P2 |
| ADM-5 | Moderator wellbeing tooling: content blurring by default, exposure limits, rotation, and access to support. | P3 |
| ADM-6 | The Overview shows the four headline tiles (active users, paying users, active therapists, open cases) and a **Needs attention** list: unassigned S1 cases, cases near SLA breach, therapist licences expiring (60 days), unmatched payments. | P2 |
| ADM-7 | The case queue is sorted by severity then time left on the SLA clock, with quick filters (S1, crisis, appeals, mine, unassigned) and a red clock when the SLA is breached. | P2 |
| ADM-8 | Evidence in a case is **blurred by default** until revealed. Each reviewer sees a daily reveal counter and a limit **[OPEN D27: 20 / day placeholder]**. | P2 |
| ADM-9 | The **break-glass** request (PRV-2) states exactly what would be revealed (name, phone, location), for how long, that it is logged, and that approval by a second person is required. | P2 |
| ADM-10 | An appeal MUST be decided by a different reviewer than the original decision-maker. Outcomes: uphold, reduce, or overturn and restore, with an explanation sent to the member. | P3 |
| ADM-11 | Therapist verification uses a checklist (name matches ID, licence number checked with the regulator, expiry date, qualification) and one of: approve, request more information, or reject, each with a message to the applicant. | P3 |
| ADM-12 | Billing staff see the pen name and payment reference. A full name appears only on a payment record when needed to resolve a dispute, and that view is logged. | P2 |
| ADM-13 | The moderation module shows AI-flag precision, overturn rate and median review time. The flag log references messages by ID and never shows message text. Strike policy changes require approval by two admins. | P3 |
| ADM-14 | The audit log is read-only and append-only. Break-glass requests and approvals are separate entries. Exporting the log is limited to the Admin role. | P2 |

---

## 7. Screen inventory

Numbers refer to the wireframe sets (`docs/wireframes*.html`; viewer: `docs/echo-design.html`).

**Member app (mobile-first)**

| # | Screens |
|---|---|
| 1 | Welcome · Consents (separate message-screening consent) |
| 2 | Match found · Conversation (with blocked-message notice) · Conversation menu |
| 3 | Create post · Identifying-details warning · Distress prompt |
| 4 | Therapist public profile · Choose mode and time · Pre-session check |
| 5 | Report sheet (reason, details and block, confirmation) |
| 6 | Home (active member) · Home (waiting for a match) |
| 7 | Chat list · Plan lapsed (read-only) · Row actions |
| 8 | Forum feed · Filter and sort |
| 9 | Post detail · Post menu · Author's post awaiting review |
| 10 | Paywall on Chats · Plans · Review and terms |
| 11 | Payment method · Waiting for M-Pesa · Success |
| 12 | Payment failed · My plan · Cancel |
| 13 | Therapist session checkout |
| 24 | Help home · Search results · Urgent help |
| 25 | Department page · Article · Contact a team |
| 26 | My tickets · Ticket conversation · Support directory |
| 27 | Your details · Under 18 · Verify phone |
| 28 | ID check (only when needed) · Pen name and avatar · Languages, topics and preview |
| 29 | Me · Settings · My profiles |
| 30 | Privacy and data · Notifications · Delete account |
| 31 | Account standing · Appeal · "Did you feel heard?" rating |
| 32 | Therapist directory · Filters · No results (waitlist, help me choose) |
| 33 | Booking confirmed · My sessions · Reschedule or cancel |
| 34 | Voice call · Video call · After the session |
| 35 | Unlock (known device) · Log in with phone · Trust this device? |
| 36 | Code didn't work · Lost phone or new number · Account paused |
| 37 | Active devices · New sign-in alert · Security settings |
| Not yet drawn | (member app: none) |

**Therapist portal (desktop web)**

| # | Screens |
|---|---|
| 14 | Application · Application status |
| 15 | Today · Client inbox |
| 16 | Weekly availability · Public profile editor |
| 17 | Live session with private notes · Raise a concern |
| 18 | Session wrap-up · Earnings and payouts |

**Admin web**

| # | Screens |
|---|---|
| 19 | Overview · Cases queue |
| 20 | Case detail · Break-glass request |
| 21 | User (public view) · Appeal review |
| 22 | Verify a therapist · Billing and refunds |
| 23 | AI flags and strike policy · Audit log |
| Not yet drawn | Analytics · Help content and tickets · Configuration (plans, topics, matching weights) · Roles and permissions · Moderator wellbeing tools |

---

## 8. Core data model (conceptual)

| Entity | Notes |
|---|---|
| `User` | Real details, role(s), status, consent records, age band |
| `PublicProfile` | Pen name, avatar, language(s), age band, availability |
| `PrivateProfile` | Real name, ID, DOB/age, phone, email, location, verification status; separately stored and encrypted |
| `HelpDepartment`, `HelpArticle`, `SupportTicket` | Department owner, SLA, articles, tickets and status |
| `Topic` | Forum topic categories (admin-managed) |
| `Match` | Pair, shared language, age bands, status (active/ended/skipped), reason |
| `ForumPost`, `ForumComment` | Author, topic, text, status (published/hidden/removed), reports |
| `ForumReaction` | Post, member, type (Support); counts shown, reactors never shown |
| `MoodCheckin` | Member, mood, timestamp; private, only if D25 keeps it |
| `Concern` | Raised by a therapist during or after a session: type, immediate-danger flag, detail, owner, SLA |
| `SessionNote` | Therapist private note; ownership and retention per D7 |
| `CallSession` | Therapist, member, mode (voice/video), times, quality, consent flags |
| `Conversation`, `Message` | Participants, type (peer/therapist), disappearing flag, expiry, state |
| `Block` | Blocker, blocked, timestamp |
| `Report`, `Case`, `CaseEvidence` | Reason, severity, snapshot of messages, owner, SLA, decisions |
| `ModerationFlag` | Source (keyword/AI), category, confidence, model version, review outcome |
| `Strike`, `Sanction`, `Appeal` | Severity, weight, expiry, duration, reasoning, reviewer |
| `TherapistProfile`, `Credential`, `Verification` | Regulator, number, document, status, expiry, reviewer |
| `AvailabilitySlot`, `TherapySession` | Time, format, status, price, notes pointer |
| `Plan`, `Entitlement`, `Subscription` | Period, price, entitlements, status, renewal mode |
| `Payment`, `Refund`, `Payout` | Provider reference, amount, status, reason |
| `Feedback`, `Rating` | Target, score, comment, visibility |
| `Resource` | Crisis lines, volunteer directory, help articles; verified-on date |
| `AuditLog` | Actor, action, target, reason, timestamp (append-only) |
| `Notification`, `Preference` | Channel, category, schedule |

---

## 9. Non-functional requirements

| Area | Requirement |
|---|---|
| **Privacy & security** | Encryption in transit and at rest; least privilege; secret management; dependency and vulnerability scanning; penetration test before Phase 4; documented incident-response and breach-notification process; no production data in non-prod. |
| **Reliability** | Target availability and RPO/RTO **[OPEN]**; graceful degradation: if billing, matching or AI moderation is down, chat and **safety features keep working**. |
| **Performance** | Fast on low-end Android devices and unreliable networks; message send p95 < 2 s on 3G-class connection **[ASSUMPTION]**; lightweight payloads and small app size. |
| **Real-time media** | Voice/video needs low-latency infrastructure that works on mobile data; budget per-minute cost; encrypted media; graceful degradation to audio/chat. |
| **Platforms** | Mobile-first; Android is the priority in Kenya **[ASSUMPTION]**. The member app is one React Native + Expo codebase that runs on Android, iOS (when D9 allows) and the web **[D50]**. The therapist portal and Admin are web applications. |
| **Client technology** | **React Native with Expo (TypeScript), routed with expo-router [D50].** One codebase serves Android, iOS and web, and can be tried on a phone in Expo Go before any store release. Sensitive values (the signed-in flag) use the phone's secure storage; app lock uses the phone's own biometrics or PIN, and Echo never stores biometric data. The app talks to the backend only through one typed API layer, so a real service can replace the mock without changing screens. Expo's web export is a fallback for people who cannot install the app, not a replacement for it. |
| **Localisation** | **English only [D52].** The app, help content and staff tools are written in English; Kiswahili, Sheng and other languages are only what members say they speak, for matching, and what they may write in chat and the forum (moderation is tuned for them, SAF-10). KES currency; EAT time zone. A later translation would need all copy to be externalised first. |
| **Accessibility** | WCAG 2.1 AA target for UI; scalable text, sufficient contrast (green/white/orange palette must pass); screen-reader support; avoid colour-only signalling. |
| **Design/brand** | Primary green (calm), white (open, readable), subtle orange accents for key actions and positive moments. Chat is the centrepiece, with the forum as the community layer. Familiar, understated chat patterns; must not feel like a clinical system or a dating app. |
| **Auditability** | Immutable logs for staff access, sanctions, payments and consent changes. |
| **Observability** | Metrics, alerts and tracing that never record message content. |
| **Scalability** | Architecture must support pilot cohort sizes now and growth without redesign of the data model; multi-country support (currency, regulators, crisis resources) must not require a rewrite. |

---

## 10. Legal, regulatory and compliance (to be validated by Kenyan counsel)

This section lists areas that **must be reviewed by qualified legal counsel** before Phase 4. It is not legal advice.

- **Data protection:** Health and mental-health information is likely *sensitive personal data* under Kenya's Data Protection Act, 2019, implying explicit consent, data-protection impact assessment, registration of controller/processor with the Office of the Data Protection Commissioner, data-subject rights, breach notification, and restrictions on cross-border transfers.
- **Professional regulation:** Therapists must hold the appropriate registration/licence (Counsellors and Psychologists Board and other relevant bodies). Echo's role (platform vs. provider) affects liability and what it may claim.
- **Mental-health legislation and duty of care:** Obligations around risk disclosure, confidentiality limits and reporting.
- **Consumer protection and payments:** Subscription terms, auto-renewal disclosures, refunds, mobile-money regulations, taxes.
- **Terms/Privacy/Community Guidelines:** Plain-language and in the languages of the pilot; separate consents for moderation.
- **Safeguarding:** Age gating, handling of reports involving minors or abuse, mandatory reporting duties.
- **App store policies:** Health-app disclosures, user-generated-content moderation requirements, billing rules.
- **Future markets (e.g. South Africa):** Separate review (data protection law, professional bodies, crisis resources, payment rails).

---

## 11. Analytics and instrumentation

- Event taxonomy covering the funnel: install → register → verify → age/language → matched → first message → conversation depth → rating → subscribe → renew/churn; therapist: directory view → booking → session → rating.
- Safety instrumentation: report rate, block rate, flag volume, time-to-review, appeal outcomes, strikes issued, repeat offences.
- No message content or sensitive free-text in analytics events. Pseudonymous IDs only. Member consent respected for non-essential analytics.
- Dashboards for Product, Safety and Finance; weekly pilot review pack.

---

## 12. Delivery plan and exit criteria

| Phase | Scope | Exit criteria |
|---|---|---|
| **P1 — Foundation** | User journeys, subscription rules, privacy policy, community guidelines, peer vs. clinical distinction, strike policy, decisions D1–D9 | PRD v1.0 signed off; policy documents drafted; legal review scoped; open decisions assigned |
| **P2 — MVP** | §6 items tagged P2 | Internal/alpha cohort completes J1–J6 end-to-end; baseline moderation + crisis card live; block/report works; billing reconciles; audit log live; no S1/S2 defects open |
| **P3 — Professional & safety** | Therapist verification, availability, directory, chat; AI moderation; strikes & appeals; disappearing chats; escalation procedures | Moderation precision acceptable on test set; reviewers trained; crisis protocol approved by clinicians; therapist onboarding tested; security review passed |
| **P4 — Kenya pilot** | Limited users and qualified professionals | Legal/regulatory sign-off; DPIA complete; support & moderation staffed; pilot success criteria agreed beforehand; learnings on usability, safety, willingness to pay, support quality |
| **P5 — Growth** | Improved matching, retention, ops efficiency, new markets | Pilot targets met on safety **and** engagement; localisation and compliance plan per market |

**Launch gates (hard stops regardless of phase):** crisis resources verified; human moderation staffed for open hours; privacy/consent flows approved; audit logging working; no known path for staff to read messages outside a case; refund and cancellation functioning.

---

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Vulnerable users receive harmful or unqualified advice from peers | Harm; reputational/legal | Clear positioning, listener guidance, moderation, easy escalation, no clinical claims for peer support |
| Crisis situation missed or mishandled | Severe | Verified resources, crisis detection, trained reviewers, SLA, clinician-authored protocol, drills |
| Platform used for dating, grooming, scams or exploitation | Harm to members, particularly minors | 18+ gating, connection-request model, no photos, pattern detection, S1 policy, rapid suspension |
| AI false positives/negatives | Unfair sanctions or missed harm | Human-in-the-loop, appeals, precision tracking, conservative automated actions |
| Privacy breach of sensitive health data | Severe | Data minimisation, encryption, strict access control, audit, pen tests, incident plan |
| Disappearing chats undermine evidence and safety | Missed abuse | Snapshot-on-report, real-time scanning before expiry, mutual opt-in, retention policy |
| Staff over-access to conversations | Trust loss | Deny-by-default, case-scoped access, break-glass with audit |
| Moderator and listener burnout | Quality, retention | Exposure limits, content blurring, rotation, support, listener breaks |
| Pricing not aligned with willingness to pay in Kenya | Low conversion | Daily plan, mobile money, pilot price testing, free safety features |
| Therapist supply/availability uneven | Poor experience | Capacity management, waitlists, transparent availability, volunteer directory |
| Regulatory misalignment | Blocked launch | Early counsel engagement, regulator conversations, compliance gates |
| Unsustainable costs (moderation, therapists, AI) | Business failure | Cost modelling per active user in P1, tiered moderation, usage limits |

---

## 14. Open decisions and assumptions

### 14.1 Decisions needed

| ID | Decision | Needed by | Recommendation / default used here |
|---|---|---|---|
| **D1** | When does baseline moderation ship relative to peer chat? | P2 start | Ship keyword flagging + human review queue + crisis card in P2; add AI in P3 |
| **D2** | Plan entitlements, pricing, free tier, refund policy | P2 | Free registration and safety features; peer chat requires an active plan; therapist services priced separately; run price tests in pilot |
| **D3** | Therapist pay model and revenue share | P3 | Per-session fee with platform commission; define payout cadence and taxes |
| **D4** | Therapist service format: scheduled live text vs. asynchronous | P3 | Support both; pilot scheduled sessions first for clearer boundaries |
| **D5** | Strike thresholds, expiry windows, restriction durations | P3 | Defaults in §6.7; ratify with Clinical/Legal |
| **D6** | Encryption and retention model (E2EE vs. server-side moderation; expiry vs. evidence) | P2 | Server-side encryption with strict access controls, scan-then-expire, snapshot-on-report |
| **D7** | Therapist clinical notes: ownership, storage, retention | P3 | Therapist-owned records with defined platform custody |
| **D8** | Clinical crisis protocol and SLAs | P3 (blocking P4) | Authored by qualified clinicians with counsel |
| **D9** | Client platforms: Android only vs. iOS vs. web | P2 | Android first for pilot. The codebase is cross-platform (D50), so this decision is now about what is released and supported, not what is built |
| **D10** | Identity verification level (OTP only vs. national ID) | P2 | OTP at sign-up; stronger verification on escalation |
| **D11** | Minimum age and handling of minors | P2 | 18+ only for pilot |
| **D12** | Do all members listen, or is there a separate listener programme with training? | P2 | Everyone can listen; mandatory short guidelines; revisit with data |
| **D13** | Therapist display identity | P3 | Public: real professional name, photo and verified badge (founder decision) |
| **D14** | Are images or voice notes allowed between members? (Brief restricts videos, addresses, phone numbers and links) | P2 | No media of any kind at launch; revisit with data |
| **D15** | Can a member stay camera-off / pen-name only in therapist calls? Can therapists require identity? | P3 | Camera-off allowed; real identity held by platform and released only under crisis protocol |
| **D16** | Is gender collected or used in matching? | P2 | Do not collect or use; reduces dating risk |
| **D17** | Add topic/issue signals to matching later? | P3 | Soft tie-breaker only, after pilot data |
| **D18** | Allow member bios? | P2 | No free-text bio at launch |
| **D19** | Recording and review of calls; moderation of live voice/video | P3 | No recording by default; consent-based review for reported sessions |
| **D20** | Is the forum readable by non-members/search engines? | P2 | Members only, not indexed |
| **D21** | Forum moderation mode (pre vs post) | P2 | Pre-moderate new accounts, post-moderate trusted |
| **D22** | Member app tab layout: Home · Chats · Forum · Therapists · Help, with Me at the top-left avatar | P2 | Adopt (keeps five tabs and separates the calm landing page from the chat list) |
| **D23** | Therapist portal: web only, or also a mobile app? | P3 | Web first; mobile later |
| **D24** | Can free accounts read and post in the forum? | P2 | **Superseded at v0.32:** the whole platform needs a paid plan, so reading and posting in the community need a plan too |
| **D25** | Keep the Home mood check-in? If so, may it feed matching or analytics? | P2 | Optional and private; not used for matching or analytics until reviewed |
| **D26** | Grace period after a plan lapses (chats read-only) | P2 | 7 days (placeholder) |
| **D27** | Break-glass window, second approver and reviewer reveal limits | P2 | 30 minutes; on-call clinical lead; 20 reveals per reviewer per day (placeholders) |
| **D28** | Help: live chat support or tickets only? Screenshots in tickets? | P2 | Tickets only, text only; revisit for technical support |
| **D29** | Who curates and re-verifies crisis lines and the support directory, and how often? | P2 | Clinical Reviewer; re-verify on a schedule and show the last-verified date |
| **D30** | Therapist caseload caps and minimum gaps | P3 | Therapist-set caps within a platform maximum |
| **D31** | On-call clinical lead: hours, staffing and response targets for crisis cases | P3 (blocking P4) | Defined with clinicians before the pilot |
| **D32** | Forum reactions (Support only?), edit window (15 min?), content-note veil for sensitive posts | P2 | Support only; 15 minutes; veil decided with the clinical lead |
| **D33** | When is ID verification required, and with which provider? | P3 | Escalation only (closed account, repeated violations); OTP is the baseline (D10) |
| **D34** | Account deletion: holding period, what must be retained, for how long | P2 | 14-day holding period (placeholder); payment and open-case records kept for the legal period; counsel to confirm |
| **D35** | Sign-in method and recovery: phone + one-time code only, device-bound, no passwords; how to recover after a lost phone | P2 | Adopt; recovery via support with ID check |
| **D36** | Pen-name change limits and whether old names are kept | P2 | Limited changes (for example once per 30 days); old names retained for moderation |
| **D37** | Therapist gender and other preference filters; the optional "Help me choose" questionnaire | P3 | Offer the gender filter with "No preference" as default; questionnaire optional |
| **D38** | Directory ranking and fairness: default "next available", no paid placement, treatment of new therapists and ties | P3 | No paid placement; next available by default |
| **D39** | Cancellation window, late-change and no-show charges, therapist cancellation or lateness | P3 | Free until 24 hours before (placeholder); late changes may be charged; therapist cancellations always refunded and rebooked first |
| **D40** | Call technology and join window; fallback rules; data use | P3 | Provider that works on mobile data in Kenya; join 10 minutes before; video → voice → chat offered, member decides |
| **D41** | Shared-device behaviour: session length, what is cleared, whether it can be a default | P2 | 24-hour session; clear local data on exit |
| **D42** | Lost-phone recovery: accepted proofs, reviewers, time, protection against attackers using the recovery route | P2 | ID + selfie reviewed by a person; account stays locked meanwhile |
| **D43** | Discreet features: quick exit, neutral notifications, neutral app name or icon | P3 | Quick exit and neutral notifications at launch; icon later if feasible |
| **D44** | New-device alerts by SMS as well as in-app, and SMS cost | P2 | Both; SMS only for new devices |
| **D45** | Landing page imagery: drawn scenes or real photography (consent and licensing needed) | P4 | Drawn scenes at launch; photography only with explicit consent |
| **D46** | Dark mode | P4 | Supported by the palette; ship after launch |
| **D47** | Logo: the wordmark and ripple mark in the visual design are a sketch | P2 | Commission a proper identity using the ripple as the idea |
| **D48** | Whether the Home mood check-in stays in the visual design (see D25) | P2 | Keep, optional and private |
| **D49** | How real therapist photographs are framed, and what happens if a therapist prefers no photo | P3 | Arch frame; illustrated placeholder if none |
| **D50** | Member-app technology: React Native with Expo, or a web app (PWA), or separate native apps | P2 | **Decided for the build: React Native with Expo (TypeScript).** Reasons: one codebase for Android, iOS and web; runs in Expo Go for quick testing with partners; good access to secure storage, biometrics, push notifications and calls; small-team friendly. A PWA was tried first and set aside because installing, push notifications, app lock and background behaviour are weaker on the phones that matter most. To confirm: bundle size and speed on low-end Android devices, and the app-store billing rules in BIL-10 |
| **D51** | Which providers sit behind the mock backend: SMS one-time codes, M-Pesa, push notifications, voice and video | P2 (calls P3) | Not chosen. The app's API layer (`mobile/src/api`) lists exactly what each provider must do. Calls need a provider that works on mobile data (D40) |
| **D52** | Languages of the app: English only, or English plus Kiswahili | P2 | **Decided: English only.** The app, help articles, crisis lines and staff tools are in English. Kiswahili stays as a language members can say they speak, for matching (MAT-3), and moderation stays tuned for Kiswahili and Sheng in what members write (SAF-10). A draft Kiswahili dictionary was started and removed. If translation returns later, copy must be externalised first |

### 14.2 Assumptions made

1. Members must be 18+ at launch.
2. Phone OTP is the baseline verification.
3. Mobile-first; Android-first; the app is in English only for the pilot (D52).
4. Currency is KES; mobile money is the primary payment method.
5. Any member can both give and receive support in peer chat; there is no separate listener role.
6. Matches open directly and automatically; either party can skip or end.
7. Pen names and avatars only; no photos and no bio.
8. **The whole platform requires an active paid plan** (v0.32): peer chat, the community, support spaces, group chats and booking a therapist. Urgent help, crisis resources, the help centre, settings and billing are always free.
9. The forum needs a plan to read or post (D24, superseded at v0.32).
10. Member app navigation is Home · Chats · Forum · Therapists · Help, with Me at the top-left avatar (D22).
11. The therapist portal and admin are desktop web applications (D23).
12. Chats stay read-only for a 7-day grace period after a plan lapses (D26).
13. Sign-in is phone + one-time code with no passwords (D35); ID verification is escalation-only (D33).
14. The member app is built once in React Native with Expo and released to Android first (D9, D50).

---

## Appendix A — Glossary

| Term | Meaning |
|---|---|
| **Member** | Registered user who uses peer support |
| **Seeker / Listener** | Informal roles a member can take in a conversation; not separate account types |
| **Pen name** | The only name other members see for a member |
| **Peer support** | Non-clinical, mutual emotional support between members |
| **Clinical / therapist service** | Professional support from a verified, qualified therapist |
| **Case** | A record opened by a report, flag, appeal or crisis signal, containing evidence, decisions and audit trail |
| **Snapshot** | Preserved copy of reported messages and context, retained under policy even if the chat expires |
| **Break-glass** | Exceptional, logged, justified access to restricted data |
| **S1 / S2 / S3** | Violation severity levels |
| **Clinical Reviewer** | Trained professional responsible for verification, crisis review and resource curation |

## Appendix B — Suggested next documents

1. **Wireframes** for the screens marked "not yet drawn" in §7 (registration, OTP, profiles, calls, settings, admin analytics and configuration), then an interactive prototype for user testing.
2. **Community Guidelines, Privacy Notice, Terms** (plain-language drafts).
3. **Moderation policy handbook** (examples per category, severity guide, SLA).
4. **Clinical crisis protocol** (authored by clinicians), including the on-call clinical lead model (D8, D31).
5. **Technical architecture and threat model** (including the D6 decision and the public / private profile split).
6. **Unit economics model** (moderation, therapist, payments, AI cost per active member).
7. **Pilot plan** (cohort size, therapist panel, success criteria, evaluation design).
8. **Help content set** (articles in English, verified crisis lines, support directory).

## Appendix C — Revision history

| Version | Change |
|---|---|
| v0.1 | First draft from the product overview: text-only peer chat, issue tags, connection requests |
| v0.2 | Auto-matching by age and language, public forum, therapist chat / voice / video, anonymity model (public and private profiles), departmental help section |
| v0.3 | Aligned with the 26 wireframed screens (first batch): navigation (D22), Home and chat list (NAV, CHL), forum details (FRM-9 to FRM-15), billing screens (BIL-12 to BIL-16), help centre (HLP-4 to HLP-9), therapist portal (THR-14 to THR-20), admin (ADM-6 to ADM-14), stricter break-glass (PRV-2), new decisions D22 to D32, rewritten screen inventory |
| v0.4 | Adds registration, profile setup, settings and account screens (27–31): ACC-9 to ACC-12, PRF-9 to PRF-11, SET-1 to SET-7, new decisions D33 to D36 |
| v0.5 | Adds the therapist directory, booking and member-side session screens (32–34): THR-21 to THR-31, new decisions D37 to D40 |
| v0.6 | Adds returning-user login and account security screens (35–37): ACC-13 to ACC-22, new decisions D41 to D44 |
| v0.7 | Adds the visual design direction (colour, type, ripple motif, components, hi-fi screens, landing page, therapist portal) and decisions D45 to D49 |
| v0.8 | Records the technology decision for the member app: React Native with Expo (D50), plus D51 for the providers behind the mock. Updates Platforms and adds a Client technology row in §9, narrows D9, and adds assumption 14. Notes the first working build (see below) |
| v0.9 | Builds the therapist portal (THR-14 to THR-20) and records the decisions taken while building it. See the build status below |
| v0.10 | Builds the admin dashboard (ADM-1 to ADM-14) and records the decisions taken while building it. See the build status at the end |
| v0.11 | Builds the admin Analytics module (§2.3, §6.11, §11) and records the decisions taken while building it. See the build status at the end |
| v0.12 | Builds the admin Resources and Configuration modules (§6.10, §6.11) and makes the member app read the content and settings they edit. See the build status at the end |
| v0.13 | The app is English only: adds D52, and updates HLP-5, the Localisation row, assumption 3, Appendix B and the build notes |
| v0.14 | Builds the admin Roles and Wellbeing modules (§3.2, RBAC-1, RBAC-2, ADM-5), enforces the permission table in the admin API, and records the decisions taken. See the build status at the end |
| v0.15 | Builds member feedback: the private "Did you feel heard?" rating after a peer chat ends (FDB-1, SET-7) and feedback and bug reports from Settings (FDB-3) |
| v0.16 | Builds the admin Feedback module: staff read Settings notes and see the felt-heard results as shares of a large enough group |
| v0.17 | Builds a landing page for wide browser windows, connected to registration and sign-in |
| v0.18 | A report now keeps a snapshot of what was reported, so cases show the real content (SAF-3) |
| v0.19 | Builds the member notification centre, with quiet hours, an hourly cap, lock-screen privacy and a wording check (SET-4, NTF-1, NTF-2) |
| v0.20 | Therapist ratings are shown only after a minimum review count, and new ratings count towards them (FDB-2) |
| v0.21 | A member can report a concern about a therapist session; it becomes a case in the clinical queue that moderators cannot see |
| v0.22 | Clinical reviewers decide therapist concerns (no action, warn, pause new clients, escalate); the therapist and the member are told, and a pause is lifted only by a clinical reviewer |
| v0.23 | Adds a therapist roster in the Therapists module, with suspend and reinstate, and staff-side ratings and concern counts |
| v0.24 | A therapist can appeal a warning, a pause or a suspension; a different clinical reviewer decides it |
| v0.25 | The therapist portal and the admin dashboard use a left sidebar for navigation on wide windows |
| v0.26 | A member's own post now gets a peer reply and a verified therapist's general reply, and each sends a notification (FRM, SET-4) |
| v0.27 | The app moves from Expo SDK 58 to SDK 57 so it opens in the store version of Expo Go |
| v0.28 | Adds support spaces: groups for one issue each, led by a verified therapist, built on the community forum. Live group chat stays out of scope |
| v0.29 | Adds timed group chats, chats that end and are deleted after 24 hours, limits of five open peer chats and one therapist at a time, a rolling-dice matching animation, and therapist availability now or within the hour |
| v0.30 | The Echo logo: a glowing lotus with a heart at its centre, used as the app icon, splash, header mark and web favicon |
| v0.31 | Adds the admin Group chats module: staff schedule and cancel timed group chats |
| v0.32 | Decisions from the product owner: a paid plan for the whole platform; moderators can remove people from group chats but not cancel them; therapist chats are deleted weekly and peer chats daily |

**Build status at v0.8.** `mobile/` holds a working member-app front-end that runs against a mock backend saved on the device: onboarding and sign-in, Home, matching, chat with blocked-content handling, the community forum, the therapist directory, booking and simulated calls, plans and simulated M-Pesa checkout, the help centre and urgent help, and Me, settings, security, account standing and demo tools. It has 139 unit tests and six browser flows. Not built: the admin dashboard (built later, see v0.10). Still placeholders: prices (D2, D3), crisis numbers and organisations (D29), and real SMS, payment and call providers (D51).

**Build status at v0.9.** The therapist portal is now built in the same project (`mobile/src/app/portal`) as a desktop-style web app, following THR-14 to THR-20: application and status, Today, Inbox, weekly availability with time off and caps, Sessions, a live session with autosaved private notes and "Not recorded", wrap-up with attendance and a follow-up suggestion, raising a concern, Forum, Earnings with a re-authenticated payout change, and the public profile editor with a live preview. Publishing availability or the profile updates what members see in the directory. Decisions made while building, each open to change: the fee shown in earnings is a 15% placeholder (D3); a no-show is not paid until the late-change rule is applied (D39); therapist forum replies are refused if they invite people to book or make contact; the portal sits inside the one Expo project for now, and could become its own web app later (D23). The mock has 166 unit tests and seven browser flows. Not built: a real therapist sign-in, document upload, the on-call clinical lead's side of a concern, and statements as PDF.

**Build status at v0.10.** The admin dashboard is built in the same project (`mobile/src/app/admin`) as a desktop-style web app with a second-factor sign-in, four roles and role-based modules. Built: Overview with "Needs attention" (ADM-6), the case queue with filters and SLA clocks (ADM-7), case detail with blurred evidence and a daily reveal counter (ADM-2, ADM-8), break-glass with a second approver (PRV-2, ADM-9), Users with strikes and actions, Appeals decided by someone other than the original reviewer (ADM-10), therapist verification with a checklist (ADM-11), Billing with refunds (ADM-12), Moderation with AI-flag metrics and a strike policy that needs two admins (ADM-13), and the append-only audit log with Admin-only export (ADM-14). It is connected to the other builds: a member's report becomes a case; suspending, restoring or deciding an appeal for the member changes the member app; a portal application can be approved, returned or rejected. The mock now has 196 unit tests and eight browser flows.

Decisions made while building, each open to change: reveal limit 20 a day and break-glass 30 minutes (D27 placeholders, unchanged); a member-report case is severity-rated from the reason chosen (threats and self-harm S1, sexual, hate, harassment and scam S2, others S3) with SLAs of 1, 4 and 12 hours; the second-factor code and staff identities are demo values; the overview's user and revenue figures are visibly marked as sample data; a case snapshot of the actual conversation is not captured by the member app yet (SAF-3), so member-report cases show a placeholder. Not built, because they have no wireframes yet: Analytics, Resources and Help tickets, Configuration, roles and permissions screens, and moderator wellbeing tools beyond the reveal limit (ADM-5).

**Build status at v0.11.** The admin Analytics module is built (`mobile/src/app/admin/analytics.tsx`). It has four sections following §2.3 and §11: **Product** (the install-to-subscriber funnel, registrations, weekly retention cohorts at day 1, 7 and 30, who is using Echo by age range and language, match acceptance and conversation depth), **Care** (the directory-to-rated-session funnel, sessions, utilisation, rating, time to first available), **Commercial** (new subscribers, free-to-paid, churn, refund rate, plan mix, with no amounts while prices are open, D2) and **Safety** (reports per 1,000 conversations, blocks per 100, S1 time to first review at the median and 95th percentile, resolved within SLA, AI-flag precision and overturn, appeal overturn, repeat offenders). Every chart has a table view, and the last-7, 30 and 90 day range compares with the period before.

Decisions made while building, each open to change: sections follow role (Product for Admin only; Care for Admin and Clinical reviewer; Commercial for Admin and Support / Billing; Safety for Admin, Moderator and Clinical reviewer), and only an Admin can export, which is logged; groups under 10 people are hidden in any breakdown, so a cell can't point at a handful of members (PRV-6); a retention cell is blank, not zero, until enough days have passed; the figures are generated, the same every time, and the page says so, except the AI-flag and appeal figures, which come from the live demo data; charts use one green ramp, checked as an ordinal ramp on the card surface, and orange stays reserved for "needs attention". Not built: Resources and Configuration, willingness-to-pay findings, NPS and CSAT (no source yet), a "felt heard" rating beyond a sample figure, the weekly pilot review pack, and consent controls for non-essential analytics. The mock now has 213 unit tests and nine browser flows.

**Build status at v0.12.** The admin Resources and Configuration modules are built (`mobile/src/app/admin/resources.tsx`, `configuration.tsx`), and the member app now reads the content and settings they edit, so a change reaches members straight away with no release (HLP-1).

*Resources:* tickets filtered to the departments a staff role owns, with replies sent as "Echo staff" and a response-time target per department (HLP-1a, HLP-7); help articles edited by the team that owns the department, with a last-updated date, publish or hide, and advice that titles read best as questions (HLP-5); departments with an owner, response target, order and on or off, managed by Admin; and the crisis lines and support directory, edited by a Clinical Reviewer, with a "last checked" date shown to members on Urgent help (CRS-2, HLP-8) and a queue of services suggested by members (HLP-9).

*Configuration (Admin only):* plans and entitlements, the community topics, matching settings, feature flags and limits.

Decisions made while building, each open to change: Safety and reporting can't be switched off as a department, and the safety features (urgent help, contact-detail blocking, the distress card, reporting and blocking) are shown as always on and are not flags; the age-range and language matching rules, and the exclusion of blocked, suspended and open Severity-1 members, are rules rather than settings (MAT-1, MAT-3, MAT-4); the matching settings are neighbouring age ranges on or off, using shared topics only to break ties (0 means never, D17), and the days before two people who ended a match can be matched again; the feature flags are community posting, the Home mood check-in, disappearing chats and video sessions; plan changes need a second admin because they involve money, and prices stay blank until decided (D2); crisis numbers can't be marked as checked while one is blank, editing any line clears the checked date, and numbers are "due another check" after 90 days; renaming a topic carries existing posts and members' chosen topics with it, retiring hides it from new posts, and at least three topics must stay; the limits that can be changed are the read-only grace period (D26), pen-name change interval (D36) and deletion holding period (D34), and they apply at once; an accepted service suggestion is added hidden, for the clinical team to complete before it is shown. Not built: a reviewer rota for the support directory, department-level staff accounts, and screens for roles and permissions. The mock now has 250 unit tests and ten browser flows.

**Build status at v0.14.** The last two admin screens that had no wireframes are built: **Roles and permissions** (`mobile/src/app/admin/roles.tsx`) and **Wellbeing** (`wellbeing.tsx`).

*Roles:* the team with role, status, second-factor and last sign-in; the permission table from §3.2 and a grid of which modules each role sees; and changes to the team. Adding a person, changing a role or deactivating an account is proposed by one Admin and approved by a second (the same two-person rule as the strike policy and plans). You can't change your own account, and at least two Admins must stay active so every sensitive change can have a second approver. The second factor is required for every account and cannot be turned off (RBAC-2). A deactivated person cannot sign in, and a role change applies at their next sign-in. The permission table is now the one the admin API enforces: only moderators and Admins suspend, restrict or strike; clinical reviewers recommend by escalating; only clinical reviewers and Admins verify therapists; only billing staff and Admins decide refunds; and tests check the table against the checks elsewhere so they cannot drift apart.

*Wellbeing (ADM-5):* each reviewer has their own daily reveal count and limit (20 a day is the D27 placeholder, now Admin-adjustable); a break is suggested after a run of reveals (8 by default) and a break pauses revealing for its length (10 minutes by default), suggested and never forced; Severity-1 and crisis cases can only be taken by moderators on that week's heavy-queue rota, with clinical reviewers and Admins always able to, and the rota moves on each week so the same people don't carry it two weeks running; anyone can hand a case they own on to a colleague, and ask for support, with no reason recorded. Every action is in the audit log. Not built: a staff wellbeing line (shown as a placeholder), shift scheduling beyond the weekly rota, single sign-on, and a real second-factor enrolment (the code is a demo value). The mock now has 275 unit tests and eleven browser flows.

**Build status at v0.15.** Member feedback is built. When a peer conversation ends after each person has written at least once, the chat offers *Did you feel heard?* with five labelled answers and an optional comment (FDB-1, SET-7). It is asked once, can be skipped without penalty, and the answer stays on the member's own side and is never shown to the other person. **Settings, then Send feedback** takes an idea, a bug report or another note, with an option to include the app version and platform (FDB-3). *Not built:* therapist session ratings already existed; the aggregate shown on a therapist's profile after a minimum review count (FDB-2) is not new; there is no admin screen to read feedback yet, and the notification categories (NTF) are unchanged.

**Build status at v0.16.** The admin **Feedback** module (`mobile/src/app/admin/feedback.tsx`) is built, for Support / Billing and Admin. It lists the notes members send from Settings, unread first, each with its kind and whether app details were included, and no name or account. Staff mark a note as read, which is written to the audit log. It also shows the *Did you feel heard?* results as shares of each face and the share answering 4 or 5. Those are hidden until at least 10 people have answered, like the Analytics cells, and the comments members add to an answer are never shown. Moderators and Clinical reviewers do not see the module. *Not built:* replying to a note, tagging or assigning notes, feedback from therapist sessions (the existing session rating is separate), and the therapist-profile aggregate (FDB-2).

**Build status at v0.17.** A **landing page** (`mobile/src/app/landing.tsx`) is the front door in a browser window 900 px or wider. It has a top bar with Sign in and Urgent help, the headline *A space to speak. Someone to listen.*, the pen-name promise, what Echo offers, how it works in three steps, a "How are you feeling today?" check-in, four plain promises and an urgent-help footer. **Get started** goes to registration (consent first), **Sign in** and **I already have an account** go to login, and the therapist and staff links go to their own sign-ins. A signed-in member who opens it is sent to Home. Phones and narrow windows keep the existing Welcome screen. The check-in saves nothing and only offers a next step, with urgent help alongside a low answer. *Not built:* a Help centre link before sign-in (the help centre needs an account, only urgent help is open signed out), pricing, and any marketing claims about outcomes or numbers, which the PRD has not approved.

**Build status at v0.18.** SAF-3 is built in the member app, so the placeholder noted at v0.12 is gone. When a member reports a chat, the report keeps the last 10 messages as they stood at that moment, with the other person's latest 3 flagged as the reported content. A reported post is kept whole, and a reported comment is kept with its post and the comment before it. Block and report keeps the snapshot even though the chat is then removed. The snapshot is frozen with the report, so later edits, deletions or disappearing messages cannot change it. The case shows the person's pen name, the snapshot time, and the number of earlier reports against the same person (prior history). It reaches reviewers through the same blurred, counted reveal as other evidence. *Not built:* a snapshot for therapist-session reports, the person's strike history beyond the earlier-report count, and reporting a single chosen message instead of the latest ones.

**Build status at v0.19.** The member **notification centre** is built (`mobile/src/app/notifications.tsx`), opened from a bell with a count of new notes at the top of every tab. It lists what would have been pushed: new messages while a chat is not open (not for muted chats), session reminders an hour and ten minutes before, a plan about to end or ended, your post going live, an account notice, and a receipt for a report you sent. Each opens the right screen. The rules follow SET-4 and NTF-2 and are tested. Message, session, community and plan categories can be switched off, but **safety and account notices cannot** and are never held back. With quiet hours on, other notes made between 10pm and 7am East Africa Time wait and appear at 7am. More than five an hour are kept in the list but not counted as new. **Settings, then Notifications** shows a preview of the lock screen: *Hide message text* hides the words, and *Neutral notifications* shows only "You have a new update". A test checks that the wording has no pressure phrases such as "someone is waiting for you". *Not built:* real push, SMS or email delivery (NTF-1 channels), community-reply notifications (the mock has no replies to a member's post), booking confirmations and receipts by email, and notification settings that apply per conversation.

**Build status at v0.20.** Therapist ratings follow FDB-2. A rating shows in the directory, on the therapist's profile and in the portal only once at least 10 people have rated (a placeholder minimum, `MIN_REVIEWS`); before that members see "New to Echo" or "3 reviews so far" and no number. Ratings that members give after a session count towards the average straight away, and "Top rated" puts rated therapists before those with too few reviews. The portal shows the aggregate only, never a member's comment. *Not built:* a decision on the minimum (open), a staff view of ratings per therapist, and hiding a rating that falls below a quality threshold.

**Build status at v0.21.** A member can now **report a concern about a therapist session**, from a completed session (`mobile/src/app/sessions/[id].tsx`). They choose unprofessional or disrespectful, crossed a personal or sexual boundary, or shared or asked for private details, and describe what happened. Calls are not recorded, so the case keeps the member's own words, the session details and the last messages of the chat with that therapist. It becomes a case in a separate **clinical queue**: Severity 1 for a boundary concern, Severity 2 for the others, naming the therapist. Only Clinical reviewers and Admins see it in Cases and Overview. Moderators and Support / Billing do not, and cannot take, read or decide it even by case number. The member is told it was received and that the therapist is not told who raised it, and gets a notification receipt. *Not built:* a sanction or review outcome for the therapist (suspension and licence checks stay in the Therapists module), telling the member the outcome, and reporting a therapist from a chat without a session.

**Build status at v0.22.** Therapist concerns now have an outcome. In the clinical queue a reviewer chooses **no action, warn, pause new clients, or escalate**, with a required reason; member sanctions (strike, restrict, suspend) are refused on these cases, and therapist outcomes are refused on member cases. A **warning** shows the therapist a note in the portal that says it is not a suspension. A **pause** stops new clients (the directory stops offering them, existing clients are unaffected), shows the therapist why, and the therapist cannot switch it off. Only a Clinical reviewer or Admin lifts it, from the case, with a reason, and the lift is written to the audit log. The member who raised the concern gets a plain update in their notifications: that action was taken, or that no breach was found, and never what the action was. Escalating tells nobody yet. Neither the therapist's note nor the member's update names the other party. *Not built:* suspension or removal of a therapist from here (that stays in the Therapists module, with licence checks), appeals by a therapist, and a time limit that lifts a pause on its own.

**Build status at v0.23.** The **Therapists** module has a **roster** of every therapist, with their rating (shown only once there are enough reviews, as for members), how many concerns have been raised about them, a licence warning when it is expiring or has expired, and their standing: Active, Paused or Suspended. A Clinical reviewer or Admin can **suspend** a therapist with a required reason. A suspended therapist leaves the directory, cannot be booked or reached by a direct link, and sees "Your account is suspended" in the portal. Sessions already booked with them are cancelled with no charge and each member is told in their notifications. **Reinstating** needs a reason and puts them back, and a suspension survives the therapist editing their profile or availability. Both actions are written to the audit log, and other roles are refused. *Not built:* a suspension that ends on a date, telling the therapist the reason by message, therapist appeals, moving a suspended therapist's existing clients to someone else, and hiding their forum replies.

**Build status at v0.24.** A therapist can **appeal** a clinical decision about them: a warning, a pause on new clients, or a suspension (`mobile/src/app/portal/appeal.tsx`, linked from the notice on Today). They write their side (at least 20 characters), have one open appeal at a time, and see the outcome and the reviewer's explanation on the same page. It appears in the admin **Appeals** queue, labelled as a therapist appeal, for **Clinical reviewers and Admins only**; moderators and Support / Billing do not see it and cannot decide it. **Whoever made the original decision cannot decide the appeal**, the same rule as for members. The reviewer can **uphold** it (nothing changes), **reduce one step** (a suspension becomes a pause on new clients, a pause becomes a warning, a warning is removed) or **overturn** it (the decision is removed and the therapist is back in the directory). The aim is a reply within 72 hours (a placeholder). *Not built:* appealing a licence-verification rejection, a second appeal after an outcome, telling the therapist by message when the outcome arrives, and an independent panel for suspensions.

**Build status at v0.25.** On both dashboards, the therapist portal and the admin dashboard, the navigation is now a **sidebar on the left** in a window 900 px or wider, with the person's details (role or verified badge, name, sign out) at its foot. The admin sidebar is dark and shows only the modules the role can open. On a narrow window it folds back into a header with a scrolling tab row. Pages without navigation, such as sign-in, the application and a live session, keep a header only. Both dashboards share one frame (`mobile/src/components/Frame.tsx`), and the browser flows check that the sidebar sits to the left of the page content.

**Build status at v0.26.** A member's own community post now receives replies in the demo, which fills the gap noted at v0.19. About 20 seconds after the post is live a **peer** replies, and about 25 seconds later a **verified therapist** adds general information. Each sends a **New reply to your post** notification that opens the post (the community-replies switch in Settings controls it, and quiet hours apply). Replies are written to follow the community rules: they never share contact details or invite anyone to book, a hard post is met with *Urgent help is free and open any time* rather than tips, and a therapist's reply says it is general information and not advice for the member. Each post gets at most one peer reply and one therapist reply. Replies are scripted stand-ins; a real service has real people, and a therapist reply there is written by the therapist. *Not built:* replies to a member's comments, replies from several different people to one post, and a setting to turn replies off for a single post.

**Build status at v0.27.** The member app, portal and dashboard now run on **Expo SDK 57** (React Native 0.86), down from SDK 58, because the Expo Go in the app stores supports SDK 57 and said the project was incompatible. Nothing about how the app looks or behaves changes. Two small code changes follow from the older navigation library (the tab bar's navigation call and the type of the code-entry box). The unit tests, the 14 browser flows and Android and iOS bundles all pass. The move can be reversed to SDK 58 once the store Expo Go supports it, and a real release build (which does not use Expo Go) is not tied to this choice.

**Build status at v0.28.** **Support spaces** are built (`mobile/src/app/spaces/`), opened from a card at the top of the Community tab. A space is a group for one issue, and there are six: **Domestic violence and abuse, PTSD and trauma, Grief and loss, Anxiety and panic, Depression and low mood, and Addiction and recovery**. This is a decision to read alongside §2: **live group chat is still out of scope**; a space is a topic-scoped version of the community forum, with posts and comments under pen names, so it uses the same moderation, reporting, blocked-content rules and the identify-yourself warning. Each space has a **verified therapist who leads it**, who posts a welcome and adds general information when a member posts there. Each has a pinned welcome and its own rules, and a button to Urgent help; the pinned text carries no phone numbers, since crisis numbers stay in the checked list (D29). **Domestic violence and PTSD are sensitive**: a member must join to read them, every post in them is checked before it goes live (not only the first), and the page has a **Quick exit** button that locks Echo straight away. Joining and leaving are private. **Posts in a space never appear in the general community feed or on Home**, so what is said there stays there. Starter posts from each space's therapist are added so a space is never empty. *Not built:* admin screens to create or edit spaces (they are defined in code), a facilitator view of a space's reports, member counts (held back so a small space can't point at a few people), pinned posts the therapist can edit, and any live chat. *Open decisions:* whether spaces need a paid plan (they are free in the demo), whether a therapist leads each space in the real service, and the content-note wording for trauma spaces.

**Build status at v0.29.** Several changes from the pilot feedback, which **change decisions earlier in this document**. §2 listed group chat as out of scope; **timed, facilitated group chats are now in scope**. Open-ended live group chat is still not.

*Chats end after 24 hours.* Every chat ends and is **deleted 24 hours after it starts, unless it was reported**. A peer chat counts from the match. A therapist chat counts from the start or from 24 hours after the end of the latest booked or finished session, whichever is later, so a session booked for next week never loses its chat. The chat shows a countdown, adds a note an hour before it ends, and the Chats list shows time left. A reported chat is moved out of the member's view and kept for the safety review. This changes the earlier choice for chats to stay until a member deletes them.

*Limits.* A member can have **five open peer chats** at once, and meeting someone new waits until one ends or expires. A member can work with **one therapist at a time**: while a session is booked or a therapist chat is open, booking a different therapist is refused with a plain reason, and the profile says so. Group chats do not count towards the five.

*Matching.* The search screen shows a **rolling die** that tumbles and changes faces while Echo looks for someone, and settles when matched. It stays still for anyone who prefers reduced motion.

*Therapist availability.* The Therapists tab has **Available now** and **Within the hour** chips and filters, and cards say "Available now" or "Available in 40 min". "Now" means a session could start within 15 minutes, inside a therapist's weekly availability with a full session left, and a booking time is offered straight away, without the usual two-hour lead.

*Timed group chats.* Under **Chats, Upcoming group chats** lists facilitated chats on one topic at a set time in East Africa Time, for example **Surviving grief when everyone has moved on, tomorrow at 14:00 EAT**. Each has a verified therapist who leads it, a length, a limited number of places and rules. A member signs up (or gives up the place), is reminded an hour and ten minutes before, and can go in 10 minutes early. The room opens at the start time, the facilitator welcomes everyone, and members write with the same content rules as any chat. Any message can be reported; the conversation so far is kept with the report. The room ends after its length with a closing note, and is **deleted 24 hours later unless a message was reported**. There are four topics: grief, Sunday-night anxiety, recovery, and burnout. In the demo, other members and the facilitator are scripted, and Demo tools has *Start the next group chat now*. *Not built:* facilitator controls (removing a message or a person), a waiting list, recurring series, group chats for the sensitive spaces such as domestic violence, and any count of group chats against a plan. *Open decisions:* whether group chats need a paid plan, the number of places, how many facilitators the real service has, and whether therapist chats should really be deleted at 24 hours.

**Build status at v0.30.** The Echo logo is now a **glowing lotus with a heart at its centre**, with seven translucent leaves, fine veins, a looped stem beneath, and a soft mint glow on deep teal. It replaces the earlier ripple mark and is used as the **app icon** (iOS and Android, including the Android themed one-colour icon), the **splash screen** (now on teal), the **mark in every header** (member app, landing page, therapist portal and admin dashboard) and the **web favicon and theme colour**. The mark sits on its deep teal tile so it reads on both light and dark pages. At small sizes the veins and glow are left out so it stays crisp. It is drawn once, as shapes (`mobile/src/data/lotus.ts`), so every use is identical, and the brand files are in `docs/brand/` as SVG (logo on its tile, without the tile, one colour, and the app icon). *Note:* this is a **vector redraw of the supplied logo image** from the picture, because the original file was not available to the build; replace `mobile/src/data/lotus.ts` or send the original file if an exact match is needed. *Not built:* a wordmark lockup with the word "echo" in the logo files, and print and store-listing artwork.

**Build status at v0.31.** The admin **Group chats** module is built (`mobile/src/app/admin/groups.tsx`), for **Clinical reviewers and Admins**. It lists what is scheduled, what is open now and recent ones, with places taken and any message reports on a chat. A reviewer can **schedule** a group chat: a topic, a description, a verified therapist to lead it, a day and start time in East Africa Time, a length (30 to 90 minutes) and the number of places (4 to 20). It is refused with a plain reason if the topic or description is too short, it starts less than an hour ahead, the therapist is suspended, or the therapist is already leading another chat at that time. A staff-scheduled chat runs like the standing ones, with the leader's welcome and a closing note, and the same 24-hour deletion rule. A reviewer can also **cancel** a chat before it starts, with a required reason; anyone signed up is told it was cancelled and the chat shows as cancelled. A chat that has started cannot be cancelled. Scheduling and cancelling are written to the audit log, and moderators and Support / Billing do not see the module. *Not built:* removing a message or a person from a live chat, editing a scheduled chat (cancel and reschedule instead), repeating weekly series, a staff view of who signed up (the count only), and a script for staff-scheduled chats beyond the leader's welcome. *Decisions (v0.31, from the product owner):* **any verified therapist may lead a group chat**, and **there is no weekly limit** on how many one therapist leads (the only check is that they are not leading two at the same time). *Still open:* whether moderators may cancel a group chat in an emergency. Until that is decided, only Clinical reviewers and Admins can.

**Backlog.** Everything not built, every placeholder and every decision still open is now collected in [`docs/BACKLOG.md`](BACKLOG.md), grouped by area, for regular review. The *Not built* and *Open decisions* notes in the build statuses above are the source; the backlog is the working list, and it is updated whenever a module is built.

**Build status at v0.32.** Three decisions from the product owner, built.

*The whole platform needs a paid plan.* Peer chat already did. Now the **community** (reading, posting, commenting and sending support), **support spaces**, **group chats** (signing up and writing) and **booking a therapist** all need an active plan, in the app's rules as well as the screens: without one, those actions are refused with *needs an active plan* and the screens show *A plan unlocks this* with a button to see plans. What stays free: **Urgent help, crisis resources, the help centre, settings, account and billing**, and **looking at the therapist directory** (the Book button reads *Get a plan to book*). A cancelled plan keeps everything until its paid period ends; once it lapses, existing chats are read-only for the grace period and the rest locks. This replaces the earlier rule that the community was free (D24). *Not built:* a free trial or free taste, and any difference between plans (every plan unlocks everything). *Note:* in the demo, reading community posts is locked by the screens only, because the mock backend lives on the device; a real backend must enforce it.

*Moderators and group chats.* **Moderators cannot cancel or schedule a group chat, but they can remove people from one that is open.** Moderators, clinical reviewers and Admins see the Group chats module's *People in open chats* panel: it lists who has written, with a Remove button and a required reason. A removed person is told, their messages show as *Message removed by a moderator*, they cannot write or sign up again, and a scripted participant stops speaking; the leader cannot be removed. It is logged and is not a sanction (strikes and restrictions stay in Moderation). Scheduling and cancelling stay with clinical reviewers and Admins, and the decision on emergency cancels is closed: **no**.

*Chat lifetimes.* **Peer chats are deleted every 24 hours and therapist chats every week**, unless reported, in which case they are kept for the safety review and hidden from the member. A therapist chat lasts a week from its start, or until 24 hours after the latest booked or finished session with that therapist, whichever is later, so a session never loses its chat. A peer chat warns an hour before it ends, and a therapist chat a day before. Group chats are deleted 24 hours after they end. *Open:* whether deletion should run on a rolling clock from the start (as built) or on a fixed weekly day.
