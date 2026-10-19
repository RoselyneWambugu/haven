# Echo — Product Requirements Document

> **"A space to speak. Someone to listen."**

| | |
|---|---|
| **Status** | Draft v0.1 — for product, design, engineering and clinical review |
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

Echo is a text-only mental health and emotional-support platform. It connects members with supportive peers and with qualified therapists through private, identity-protected conversations, backed by subscription billing, AI-assisted moderation and human oversight.

**Core proposition:** private peer connection + access to professional support + a safer digital environment.

### 1.2 Problem

People experience loneliness, distress, anxiety, grief and relationship or work difficulties without anyone they feel able to talk to. Barriers include cost of professional care, fear of judgement from family or community, lack of someone available at the moment of need, discomfort with calls or video, and no consistent source of support.

### 1.3 Positioning guardrails

These are product-level constraints that every feature must respect:

1. **Peer support is not treatment.** The product must never present peer conversations as therapy, diagnosis or a substitute for emergency services. Peer and clinical offerings are visibly distinct in the UI, pricing and legal terms.
2. **Text only.** No voice calls, video calls, photo/file sharing or location sharing between users.
3. **Not a dating product.** No browsing-by-attractiveness, no photos, no "swipe" mechanics, no features that reward romantic or sexual interaction.
4. **Identity privacy between users.** Real names and identifying details are never shown to other members.
5. **Safety content is never paywalled.** Crisis resources, the help centre, block and report are available to every account regardless of subscription status.

---

## 2. Goals, non-goals and success measures

### 2.1 Goals

| # | Goal |
|---|------|
| G1 | Let a new member go from sign-up to a first meaningful peer conversation quickly and without disclosing identity to anyone. |
| G2 | Give members a credible route to a verified, qualified therapist over text. |
| G3 | Keep members safe: detect and act on abuse, harassment and crisis signals fast, with humans accountable for serious decisions. |
| G4 | Protect member privacy to the standard appropriate for sensitive health data. |
| G5 | Establish a subscription model clear enough that members know exactly what they are paying for (peer access vs. clinical services). |
| G6 | Give operators a dashboard sufficient to run the pilot safely: users, billing, therapists, reports, moderation. |

### 2.2 Non-goals (for the roadmap through Phase 4)

- Voice, video, photo/file sharing, group chat or public forums.
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
| **Listener** | To support others within clear guidelines | Same account type as Seeker; a member can be either or both. |
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
5. Select issue tags (1–3 primary), age band, language(s), and whether they want to **talk, listen, or both**.
6. Land on Home with recommended connections and a visible "Need urgent help?" entry.

*Safety branch:* if onboarding free-text or tag choices indicate crisis (e.g. self-harm), show the crisis resource card immediately and non-intrusively (§6.8).

### J2 — Find and start a peer conversation
1. Home shows a short ranked list of compatible members (pseudonymous cards: handle, avatar, shared issue tags, age band, listener/seeker mode).
2. Member sends a **connection request** with an optional short intro.
3. Recipient sees the request and can **accept, decline or ignore** without revealing why; declines are not shown as rejections.
4. On acceptance a private text conversation opens.

*Safety branch:* either party can block/report at any point; blocked users never see each other again in matching.

### J3 — Ongoing conversation
- Asynchronous text chat with push notifications that never reveal message content on the lock screen by default.
- Optional **24-hour disappearing chat** (mutual opt-in, §6.4).
- Member can mute, block, report, end the conversation, or leave feedback.

### J4 — Report / block
1. From any message or profile: *Block* (immediate, silent) or *Report* (choose reason, optional note).
2. Reported messages are **snapshotted into a case** so they remain reviewable even if the chat expires or is deleted.
3. Reporter sees acknowledgement and, later, a non-detailed outcome notice.

### J5 — Crisis signal
1. Member message or onboarding input is flagged as possible self-harm / suicide / abuse risk.
2. Member receives a supportive, non-alarmist in-app card with crisis lines and the option to talk to a trained person.
3. A trained reviewer is alerted per protocol **[OPEN — clinical protocol]**. The flag never auto-bans or shames the member.

### J6 — Subscribe
1. Member picks Daily / Monthly / Yearly and a payment method (mobile money first — see §6.6).
2. Entitlements and renewal terms are shown before payment; explicit consent for auto-renewal.
3. On success, access updates immediately; failure leaves the member's safety features intact.

### J7 — Book and attend therapist chat
1. Member browses the therapist directory (verified badge, specialisations, languages, availability, price).
2. Books an available slot (or opens an async thread, depending on service model **[OPEN]**).
3. Text session takes place; the therapist can add a private note; the member can rate afterwards.

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
| Issue-tag matching & connection requests | ✔ | refine | | improve |
| Peer text chat | ✔ | | | |
| Subscriptions (daily/monthly/yearly) | ✔ | | tune | |
| Block & report | ✔ | | | |
| Crisis resource card, help centre | ✔ | | | |
| Basic admin dashboard (users, reports, billing) | ✔ | extend | | |
| **Baseline safety: keyword flags + human review queue** | ✔ *(recommended — see §14)* | | | |
| AI-assisted moderation + strike engine | | ✔ | tune | |
| Therapist verification, availability, directory, chat | | ✔ | | |
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
| PRF-1 | Each member has a **pseudonymous handle** (unique, moderated for impersonation/offensive content) and an avatar chosen from a curated set. Photo upload is not supported. | P2 |
| PRF-2 | The public profile MAY show: handle, avatar, issue tags, age band (not exact age), language(s), listener/seeker mode, optional short bio. | P2 |
| PRF-3 | The bio and handle MUST be screened for contact details (phone, email, social handles, links) and rejected. | P2 |
| PRF-4 | Members MUST be able to change handle subject to rate limits, without losing conversations. | P2 |
| PRF-5 | Real name, phone, email, exact date of birth and location MUST never appear in any member-facing API response. | P2 |

### 6.3 Issue tags and matching (MAT)

| ID | Requirement | Phase |
|---|---|---|
| MAT-1 | The platform ships with a curated, versioned issue-tag taxonomy (e.g. loneliness, grief, stress, relationships, family, work, anxiety, life change, personal development). Taxonomy is editable by Admin. | P2 |
| MAT-2 | A member selects 1–3 primary tags and MAY add secondary tags. | P2 |
| MAT-3 | Recommendations MUST be ranked using: shared tags, compatible age band, language, listener/seeker complement, recent activity. Weights are configurable. | P2 |
| MAT-4 | Matching MUST exclude: blocked users (both directions), suspended users, users with open Severity-1 cases, and any age-band mismatch with minors. | P2 |
| MAT-5 | Conversations MUST begin with a **connection request that the recipient accepts** — no unsolicited direct messages. Intro text is length-limited and moderated. | P2 |
| MAT-6 | Daily limits MUST apply to outbound connection requests and to recommendations, to prevent spam and to reduce "shopping" behaviour. | P2 |
| MAT-7 | Matching MUST NOT use or display attributes that encourage dating dynamics (appearance, relationship-seeking status, proximity). | P2 |
| MAT-8 | Members MUST be able to pause availability ("not taking new conversations") without leaving the platform. | P2 |
| MAT-9 | Match quality MUST be measurable: request→accept rate, conversation depth, post-chat rating, block rate per match. | P3 |

### 6.4 Messaging (MSG)

| ID | Requirement | Phase |
|---|---|---|
| MSG-1 | Conversations are **text only**. The system MUST reject attachments, images, audio, video, and location. Links SHOULD be blocked or neutralised by default. | P2 |
| MSG-2 | Messaging is asynchronous with delivery and read state; typing indicator is optional per member. | P2 |
| MSG-3 | Messages MUST be encrypted in transit and at rest. Whether end-to-end encryption is used is an architectural decision that **conflicts with server-side AI moderation** and MUST be decided explicitly **[OPEN D6]**. | P2 |
| MSG-4 | Members can mute, block, report, archive or end a conversation at any time. Ending a conversation does not notify with blame language. | P2 |
| MSG-5 | Push notifications MUST be content-free by default ("You have a new message") and configurable. | P2 |
| MSG-6 | Message length, send rate and burst limits MUST apply to prevent flooding. | P2 |
| MSG-7 | **Disappearing chats:** a conversation MAY be switched to 24-hour expiry only with consent from **both** parties; the setting and its state are visible in the thread. Messages are removed from member devices and servers after 24 hours **except** content snapshotted into a safety case (§6.9). | P3 |
| MSG-8 | Members MUST see an always-visible reminder, in the conversation header or an info sheet, that peer support is not professional treatment and how to reach urgent help. | P2 |
| MSG-9 | Local/offline behaviour: composing offline queues messages and sends on reconnect; the app MUST be usable on low-end Android devices and poor networks. | P2 |

### 6.5 Therapist directory and sessions (THR)

| ID | Requirement | Phase |
|---|---|---|
| THR-1 | Therapists MUST apply with credentials; only approved therapists appear in the directory. | P3 |
| THR-2 | Verification MUST check licence/registration status with the competent Kenyan regulator and record: document, reviewer, date, result, expiry/renewal date **[verify regulator list with counsel]**. | P3 |
| THR-3 | Re-verification MUST occur at credential expiry; expired therapists are automatically hidden from booking. | P3 |
| THR-4 | Directory entries show: pseudonymous display name or professional name **[OPEN]**, photo (therapists only, optional), qualification, specialisations, languages, session format, availability, price, rating. | P3 |
| THR-5 | Therapists manage availability (recurring and one-off), set capacity limits and can pause intake. | P3 |
| THR-6 | Service model MUST support at least one of: (a) scheduled live text sessions, (b) asynchronous threads with response-time commitments. Final model is **[OPEN D4]**. | P3 |
| THR-7 | Booking, rescheduling, cancellation, no-show and refund rules MUST be explicit in-app and enforced by the system. | P3 |
| THR-8 | Therapists have private session notes. Ownership, retention, access and export rules for clinical notes MUST be defined **[OPEN D7]**. | P3 |
| THR-9 | Therapist chat uses the same text-only constraints plus professional-conduct rules; moderation applies to both directions. | P3 |
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
| SAF-2 | **Report** offers reason categories (harassment, threats, sexual content, scam/solicitation, self-harm concern, impersonation, hate, other) and optional free text. | P2 |
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
| SAF-10 | Moderation covers peer and therapist chats, handles, bios and intro messages, and is tuned for English, Kiswahili and Sheng/code-switching **[ASSUMPTION]**. | P3 |
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
Welcome · Register · OTP verification · Identity verification (conditional) · Consents · Handle & avatar · Issue tags & preferences · Home (recommendations + active chats) · Member card detail · Send connection request · Incoming requests · Chat list · Conversation · Conversation settings (mute, disappearing, block, report) · Report flow · Therapist directory · Therapist profile · Booking / availability · Therapist chat · Plans & pricing · Checkout · Subscription management & billing history · Help centre · Crisis resources (global) · Account standing & strikes · Appeal · Feedback / rating · Settings (profile, privacy, notifications, language, data export, delete account)

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
| `IssueTag`, `UserIssueTag` | Versioned taxonomy; primary vs. secondary |
| `ConnectionRequest` | Sender, recipient, intro, status, expiry |
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
| **Platforms** | Mobile-first; Android is the priority in Kenya **[ASSUMPTION]**; iOS/web member clients **[OPEN D9]**; Admin is a web app. |
| **Localisation** | English at launch; Kiswahili strongly recommended for pilot **[ASSUMPTION]**; all copy externalised for translation; KES currency; EAT time zone. |
| **Accessibility** | WCAG 2.1 AA target for UI; scalable text, sufficient contrast (green/white/orange palette must pass); screen-reader support; avoid colour-only signalling. |
| **Design/brand** | Primary green (calm), white (open, readable), subtle orange accents for key actions and positive moments. Messaging is the centrepiece. Familiar, understated chat patterns; must not feel like a clinical system or a dating app. |
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

- Event taxonomy covering the funnel: install → register → verify → tags → first recommendation viewed → request sent → accepted → first message → conversation depth → rating → subscribe → renew/churn; therapist: directory view → booking → session → rating.
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
| **D13** | Therapist display identity (pseudonym vs. professional name) | P3 | Professional name and verified badge |

### 14.2 Assumptions made

1. Members must be 18+ at launch.
2. Phone OTP is the baseline verification.
3. Mobile-first; Android-first; English plus Kiswahili for the pilot.
4. Currency is KES; mobile money is the primary payment method.
5. All members can be seekers, listeners or both.
6. Chats begin with an accepted connection request.
7. Handles and avatars are pseudonymous; no photo upload.
8. Peer chat requires an active paid plan; safety features and crisis resources are always free.

---

## Appendix A — Glossary

| Term | Meaning |
|---|---|
| **Member** | Registered user who uses peer support |
| **Seeker / Listener** | Roles a member can take in a conversation |
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
