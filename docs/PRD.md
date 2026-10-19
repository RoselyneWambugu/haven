# Echo — Product Requirements Document

> **"A space to speak. Someone to listen."**

| | |
|---|---|
| **Status** | Draft v0.2 — revised after the founder's explanation of the idea (auto-matching, public forum, therapist voice/video, anonymity model) |
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

- Voice/video **between members**, member-to-member file sharing, or group chat (the public forum is in scope; group chat is not).
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

### 6.2 Profiles and privacy (PRF)

| ID | Requirement | Phase |
|---|---|---|
| PRF-1 | Each member has a **pen name** (unique, moderated for impersonation/offensive content and for names that look like real names or contact details) and an avatar chosen from a curated set. Photo upload is not supported. | P2 |
| PRF-2 | A member's profile visible to others MAY show only: **pen name, avatar**, and (to matches) age band and shared language. No bio free-text in the MVP, to reduce leakage of identifying details **[OPEN D18]**. | P2 |
| PRF-3 | The bio and handle MUST be screened for contact details (phone, email, social handles, links) and rejected. | P2 |
| PRF-4 | Members MUST be able to change handle subject to rate limits, without losing conversations. | P2 |
| PRF-6 | **Therapist profiles are public** (real name, photo, qualifications, verification badge, specialisations, languages, ratings) and visible to non-logged-in visitors only to the extent counsel approves **[OPEN]**. | P3 |
| PRF-5 | Real name, phone, email, exact date of birth and location MUST never appear in any member-facing API response. | P2 |

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
| PRV-2 | Access to a member's real identity is allowed only (a) for billing/support to the minimum extent necessary, or (b) via a logged **break-glass** action for imminent-risk or legal process, requiring a second approver where practicable. | P2 |
| PRV-3 | Retention schedule MUST exist for: messages, snapshots in cases, flags, payments, audit logs, deleted accounts. Defaults **[OPEN D6]**. | P2 |
| PRV-4 | Case snapshots are retained for a limited period after case closure and then deleted; they are not a back door for long-term message storage. | P3 |
| PRV-5 | Data MUST be encrypted at rest; secrets and keys managed centrally; production data never used in development without anonymisation. | P2 |
| PRV-6 | Analytics MUST use pseudonymous IDs and MUST NOT include message content or health inferences in third-party SDKs. No third-party advertising SDKs. | P2 |
| PRV-7 | Cross-border processing (cloud regions, AI vendors, payment processors) MUST be inventoried and approved against Kenyan data-protection requirements before launch. | P2 |
| PRV-8 | If an external AI/ML provider is used for moderation, messages MUST be processed under a contract prohibiting retention/training on member content. | P3 |

### 6.10 Help centre, feedback and notifications (HLP / FDB / NTF)

| ID | Requirement | Phase |
|---|---|---|
| HLP-1 | Help centre covers: how Echo works, peer vs. therapist, safety, privacy, billing/refunds, community guidelines, account appeals, FAQs. Editable by Admin without a release. | P2 |
| HLP-2 | The help centre includes a directory of **volunteer psychologists and support resources**, curated and maintained by the Clinical Reviewer, with disclaimers about availability. | P3 |
| HLP-3 | Contact Support is available in-app; Support requests that mention risk are routed to the crisis queue. | P2 |
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
| **Resources** | Directory of volunteer psychologists, crisis lines, help articles | P3 |
| **Configuration** | Issue taxonomy, plans & entitlements, matching weights, feature flags | P2 |
| **Audit log** | Immutable record of every privileged action and content access; searchable and exportable for oversight | P2 |

| ID | Requirement | Phase |
|---|---|---|
| ADM-1 | Every case MUST have an owner, status, severity, SLA clock, and full decision history. | P2 |
| ADM-2 | Case view shows content **only** from the snapshot/within-case access scope. | P2 |
| ADM-3 | Bulk actions (e.g. mass suspend) require two-person approval. | P3 |
| ADM-4 | Admin exports of personal data MUST be logged and restricted by role. | P2 |
| ADM-5 | Moderator wellbeing tooling: content blurring by default, exposure limits, rotation, and access to support. | P3 |

---

## 7. Screen inventory

**Member app (mobile-first)**
Welcome · Register · OTP verification · Identity verification (conditional) · Consents · Pen name & avatar · Age & language · Home (active chats + forum feed) · Match found / matching status · Chat list · Conversation · Conversation settings (mute, disappearing, skip, block, report) · Report flow · Forum feed · Topic page · Post detail & comments · Create post · Therapist directory · Therapist profile (public) · Booking / availability · Therapist chat · Voice call · Video call · Pre-call check · Plans & pricing · Checkout · Subscription management & billing history · Help centre · Crisis resources (global) · Account standing & strikes · Appeal · Feedback / rating · Settings (profile, privacy, notifications, language, data export, delete account)

**Therapist app / portal**
Application & credential upload · Verification status · Profile · Availability calendar · Client inbox · Client conversation · Session notes · Earnings & payouts · Settings

**Admin web**
Login + MFA · Overview · Users list / detail · Cases queue / detail · AI flags · Appeals · Therapist verification queue · Therapist directory management · Subscriptions · Transactions & refunds · Revenue reports · Analytics · Resource directory · Content (help centre / guidelines) · Configuration (tags, plans, weights, strikes) · Audit log · Roles & permissions

---

## 8. Core data model (conceptual)

| Entity | Notes |
|---|---|
| `User` | Real details, role(s), status, consent records, age band |
| `Profile` | Handle, avatar, bio, language(s), mode (talk/listen/both), availability |
| `Topic` | Forum topic categories (admin-managed) |
| `Match` | Pair, shared language, age bands, status (active/ended/skipped), reason |
| `ForumPost`, `ForumComment` | Author, topic, text, status (published/hidden/removed), reports |
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
| **Platforms** | Mobile-first; Android is the priority in Kenya **[ASSUMPTION]**; iOS/web member clients **[OPEN D9]**; Admin is a web app. |
| **Localisation** | English at launch; Kiswahili strongly recommended for pilot **[ASSUMPTION]**; all copy externalised for translation; KES currency; EAT time zone. |
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
| **D9** | Client platforms: Android only vs. iOS vs. web | P2 | Android first for pilot |
| **D10** | Identity verification level (OTP only vs. national ID) | P2 | OTP at sign-up; stronger verification on escalation |
| **D11** | Minimum age and handling of minors | P2 | 18+ only for pilot |
| **D12** | Do all members listen, or is there a separate listener programme with training? | P2 | Everyone can listen; mandatory short guidelines; revisit with data |
| **D14** | Are images or voice notes allowed between members? (Brief restricts videos, addresses, phone numbers and links) | P2 | No media of any kind at launch; revisit with data |
| **D15** | Can a member stay camera-off / pen-name only in therapist calls? Can therapists require identity? | P3 | Camera-off allowed; real identity held by platform and released only under crisis protocol |
| **D16** | Is gender collected or used in matching? | P2 | Do not collect or use; reduces dating risk |
| **D17** | Add topic/issue signals to matching later? | P3 | Soft tie-breaker only, after pilot data |
| **D18** | Allow member bios? | P2 | No free-text bio at launch |
| **D19** | Recording and review of calls; moderation of live voice/video | P3 | No recording by default; consent-based review for reported sessions |
| **D20** | Is the forum readable by non-members/search engines? | P2 | Members only, not indexed |
| **D21** | Forum moderation mode (pre vs post) | P2 | Pre-moderate new accounts, post-moderate trusted |
| **D13** | Therapist display identity | P3 | Public: real professional name, photo and verified badge (founder decision) |

### 14.2 Assumptions made

1. Members must be 18+ at launch.
2. Phone OTP is the baseline verification.
3. Mobile-first; Android-first; English plus Kiswahili for the pilot.
4. Currency is KES; mobile money is the primary payment method.
5. Any member can both give and receive support in peer chat; there is no separate listener role.
6. Matches open directly and automatically; either party can skip or end.
7. Pen names and avatars only; no photos and no bio.
8. Peer chat requires an active paid plan; safety features and crisis resources are always free.

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

1. **Information architecture and wireframes** for the screens in §7.
2. **Community Guidelines, Privacy Notice, Terms** (plain-language drafts).
3. **Moderation policy handbook** (examples per category, severity guide, SLA).
4. **Clinical crisis protocol** (authored by clinicians).
5. **Technical architecture and threat model** (including the D6 decision).
6. **Unit economics model** (moderation, therapist, payments, AI cost per active member).
7. **Pilot plan** (cohort size, therapist panel, success criteria, evaluation design).
