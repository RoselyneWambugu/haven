# Echo — Screen Flows (draft v0.2, not committed)

Companion to `docs/PRD.md` (v0.3). Navigation follows decision D22. Diagrams are Mermaid; they render on GitHub and in most Markdown viewers.

**Legend:** rectangles = screens · diamonds = decisions · rounded = system actions · 🔒 = private-profile data involved · 🛟 = crisis entry available

**Global rules that apply to every flow**
- 🛟 "Need urgent help?" is reachable in ≤ 2 taps from every screen and is never paywalled.
- Members are shown only as **pen name + avatar**. Private-profile data (name, ID, age, phone) never appears on a member-facing screen.
- In chat and forum, messages containing links, phone numbers, addresses or videos are blocked before delivery with a friendly explanation.
- Block and Report are available on every message, post, comment and member card.

---

## 1. Navigation map (member app)

Bottom tabs: **Home · Chats · Forum · Therapists · Help**. **Me** (profiles, plans, settings, account standing) opens from the member's **avatar at the top-left** of every screen, and **urgent help** from the top bar of every screen (D22).

**1a. Tabs**

```mermaid
flowchart LR
    Launch["Launch"] --> Auth{"Signed in?"}
    Auth -- no --> Onb["Onboarding flow (§2)"]
    Auth -- yes --> Home["Home tab"]

    Home --> MatchSt["Matching status or match found (§3)"]
    Home --> Next["Next therapist session (§5)"]
    Home --> Highlight["Forum highlight (§4)"]
    Home -. "See all chats" .-> Chats["Chats tab"]
    Chats --> List["Chat list: therapists above peers"]
    List --> Conv["Conversation (§3)"]
    MatchSt --> Conv

    Forum["Forum tab"] --> Feed["Forum feed (§4)"]
    Ther["Therapists tab"] --> Dir["Therapist directory (§5)"]
    Help["Help tab"] --> Dept["Help departments (§9)"]
```

**1b. Reachable from every screen**

```mermaid
flowchart LR
    Avatar["Avatar, top-left"] --> Me["Me"]
    Me --> Prof["My profiles: public / private (§8)"]
    Me --> Sub["Plans and billing (§7)"]
    Me --> Set["Settings"]
    Me --> Stand["Account standing and appeals (§6)"]

    Crisis["🛟 Need urgent help? (top bar)"] --> Urgent["Urgent help page (§9)"]
```

---

## 2. Onboarding and sign-up

```mermaid
flowchart TD
    W["Welcome: what Echo is and is not"] --> Reg["Register 🔒 name, phone, DOB"]
    Reg --> Age{"18 or over?"}
    Age -- no --> Blocked["Not available yet screen + resources"]
    Age -- yes --> OTP["Verify phone by OTP"]
    OTP --> OTPok{"Code valid?"}
    OTPok -- no --> OTP
    OTPok -- yes --> IDv{"ID check required?"}
    IDv -- yes --> ID["Identity verification 🔒"]
    IDv -- no --> Cons
    ID --> Cons["Consents: Terms, Privacy, Guidelines, AI moderation"]
    Cons --> Pen["Choose pen name"]
    Pen --> PenOk{"Unique and allowed?"}
    PenOk -- no --> Pen
    PenOk -- yes --> Av["Choose avatar"]
    Av --> Lang["Select languages spoken"]
    Lang --> Pref["Optional: forum topics of interest"]
    Pref --> Preview["What others see: preview of public profile"]
    Preview --> Home["Home: matching starts automatically"]
    Reg -. risk wording .-> CrisisCard["🛟 Supportive resource card"]
```

Screens: Welcome · Register · Under-18 notice · OTP · ID verification · Consents · Pen name · Avatar · Languages · Topics · Public-profile preview.

---

## 3. Automatic matching and peer chat

```mermaid
flowchart TD
    Home["Home or Chats tab"] --> Has{"Active chat exists?"}
    Has -- yes --> List["Chat list"] --> Conv
    Has -- no --> MS["Finding someone to talk to"]
    MS --> Sys(["System matches by age band + shared language"])
    Sys --> Found{"Match found?"}
    Found -- no --> Wait["Still looking: notify me"] --> Forum["Browse forum meanwhile"]
    Found -- yes --> Intro["Match found: pen name, avatar, shared language"]
    Intro --> Start["Say hello"] --> Conv["Conversation"]
    Intro --> Skip["Skip match"] --> MS

    Conv --> Send["Send message"]
    Send --> Chk(["Check: links, phone, address, video, abuse, crisis"])
    Chk --> Pass{"Allowed?"}
    Pass -- yes --> Deliv["Delivered"]
    Pass -- no --> Warn["Blocked: explain why, nothing sent"]
    Chk -. risk signal .-> CrisisCard["🛟 Resource card to sender"]

    Conv --> Menu["Conversation menu"]
    Menu --> Mute["Mute"]
    Menu --> Dis["Disappearing chat 24h: needs both to agree"]
    Menu --> End["End conversation"] --> MS
    Menu --> Blk["Block"] --> Blocked["Confirmed: silent, never matched again"]
    Menu --> Rep["Report (§6)"]
    End --> Rate["How did it feel? Did you feel heard?"]
```

Screens: Matching status · Match found · Chat list · Conversation · Blocked-message notice · Conversation menu · Disappearing-chat consent · Rating prompt.

---

## 4. Public forum

```mermaid
flowchart TD
    F["Forum tab"] --> Feed["Feed: filter by topic"]
    Feed --> Topic["Topic page"]
    Feed --> Post["Post detail + comments"]
    Feed --> New["Create post"]

    New --> Draft["Write title, text, topic"]
    Draft --> Chk(["Check: links, phone, address, identifying details, abuse, crisis"])
    Chk --> Ok{"Clean?"}
    Ok -- identifying details --> Warn["Warning: remove names, places, workplaces"] --> Draft
    Ok -- blocked content --> Blocked["Cannot post: explain why"] --> Draft
    Ok -- risk signal --> Crisis["🛟 Resource card, then option to still post"]
    Ok -- yes --> Mode{"Moderation mode"}
    Mode -- new account --> Pending["Awaiting review"] --> Live
    Mode -- trusted --> Live["Published under pen name"]
    Crisis --> Mode

    Post --> Com["Add comment"] --> Chk
    Post --> Rep["Report post or comment (§6)"]
    Post --> Mute["Mute author or hide thread"]
    Post --> Badge["Therapist comment: verified badge, real name, 'general info, not treatment'"]
    Badge --> TP["Therapist profile (§5)"]
    Post --> Mine{"My post?"} --> Del["Delete my post"]
```

Screens: Feed · Topic · Post detail · Create post · Identifying-details warning · Pending review notice · Comment composer · Report sheet.

---

## 5. Therapists: directory, booking, chat, voice, video

```mermaid
flowchart TD
    T["Therapists tab"] --> Dir["Directory: filter by specialty, language, mode, price, availability"]
    Dir --> TP["Therapist public profile: name, photo, credentials, badge, rating"]
    TP --> Paid{"Has required plan or credit?"}
    Paid -- no --> Plans["Plans and pricing (§7)"] --> TP
    Paid -- yes --> Mode["Choose mode"]
    Mode --> Chat["Chat"]
    Mode --> Voice["Voice call"]
    Mode --> Video["Video call"]
    Chat --> Slot
    Voice --> Slot
    Video --> Slot["Pick time slot, or start now if available"]
    Slot --> Confirm["Confirm booking and price"]
    Confirm --> Remind["Reminder before session"]
    Remind --> Pre["Pre-session screen"]

    Pre --> Cam{"Video?"}
    Cam -- yes --> Check["Camera and mic check; camera can stay off, pen name and avatar shown"]
    Cam -- no --> Join
    Check --> Join["Join session"]
    Join --> Sess["In-session screen: chat / voice / video"]
    Sess --> Poor{"Poor connection?"}
    Poor -- yes --> Fall["Fallback: video to voice to chat"] --> Sess
    Sess --> End["End session"] --> Rate["Rate session"]
    Sess --> Rep["Report (§6)"]
    Sess -. risk signal .-> Crisis["🛟 Clinical escalation per protocol"]

    Confirm --> Resch["Reschedule or cancel: policy shown"]
```

Therapist-side screens (portal): Application and credential upload · Verification status · Profile (public) · Availability calendar · Client inbox · Session screen (chat/voice/video) · Private session notes · Earnings and payouts.

```mermaid
flowchart TD
    A["Apply: personal and professional details"] --> U["Upload licence, ID, documents 🔒"]
    U --> Q["Verification queue"]
    Q --> R{"Clinical reviewer decision"}
    R -- rejected --> Why["Reason shown; may reapply"]
    R -- more info --> U
    R -- approved --> P["Build public profile"]
    P --> Av["Set availability, modes, price"]
    Av --> Live["Listed in directory"]
    Live --> Exp{"Credential expiring?"}
    Exp -- yes --> Re["Re-verify, else hidden from booking"]
```

---

## 6. Report, block, strikes, appeals

```mermaid
flowchart TD
    Src["Message, post, comment, profile, or call"] --> Act{"Action"}
    Act --> Block["Block: immediate and silent"]
    Act --> Rep["Report"]
    Rep --> Reason["Choose reason + optional note"]
    Reason --> Snap(["Snapshot of content saved into a case"])
    Snap --> Ack["Thanks: we will review"]
    Block --> Opt["Also report?"] --> Rep

    Snap --> Q["Moderation queue (§10)"]
    Q --> Out["Outcome notice to reporter: action taken or no violation"]

    subgraph Offender["Reported member sees"]
        W1["Strike 1: warning, rule explained"]
        W2["Strike 2: time limited restriction"]
        W3["Strike 3: suspended pending review"]
    end
    Q --> Offender
    Offender --> Stand["Account standing screen"]
    Stand --> App["Appeal: tell us what happened"]
    App --> Rev(["Different reviewer decides"])
    Rev --> Res["Result: reinstated, restricted or banned"]
    W3 --> Safe["During suspension: crisis resources, help, billing and data export still available"]
```

---

## 7. Plans and billing

```mermaid
flowchart TD
    Entry["Chats locked, upgrade prompt, or avatar > Plans"] --> Plans["Plans: Daily, Monthly, Yearly; peer access and therapist services listed separately"]
    Plans --> Sel["Select plan"] --> Terms["Entitlements, renewal terms, auto-renew opt-in"]
    Terms --> Pay["Choose payment: M-Pesa or card"]
    Pay --> Auth(["Payment prompt on phone"])
    Auth --> Res{"Paid?"}
    Res -- yes --> Done["Active: receipt shown and sent"]
    Res -- no --> Fail["Payment failed: retry or change method"] --> Pay
    Done --> Manage["Avatar > Me > My plan: renew date, change, cancel, history, invoices"]
    Manage --> Cancel["Cancel: one confirmation, access until period ends"]
    Manage --> Lapse{"Lapsed?"}
    Lapse -- yes --> RO["Chats read only during grace period; safety and crisis stay open"] --> Plans
```

---

## 8. Profiles: public vs private

```mermaid
flowchart TD
    Me["Avatar (top-left) > Me"] --> Prof["My profiles"]
    Prof --> Pub["Public profile: pen name, avatar"]
    Prof --> Priv["Private profile 🔒: name, ID, age, phone, email"]
    Prof --> Prev["What others see: preview"]
    Pub --> EditP["Edit pen name (rate limited) or avatar"]
    Priv --> Verify["Re-authenticate: OTP or biometric"]
    Verify --> View["View private data"]
    View --> EditV["Request correction: re-verification if ID or DOB"]
    Me --> Priv2["Privacy settings"]
    Priv2 --> Export["Export my data"]
    Priv2 --> Delete["Delete account: explain retention exceptions, confirm"]
```

---

## 9. Help centre by department

```mermaid
flowchart TD
    H["Help tab"] --> Urgent["🛟 Crisis and urgent help (always on top)"]
    H --> Depts["Departments"]
    Depts --> D1["Getting started"]
    Depts --> D2["Account and profiles"]
    Depts --> D3["Privacy and anonymity"]
    Depts --> D4["Safety and reporting"]
    Depts --> D5["Billing and subscriptions"]
    Depts --> D6["Therapists and sessions"]
    Depts --> D7["Forum"]
    Depts --> D8["Technical support"]
    Depts --> D9["Feedback"]
    D1 --> Art
    D2 --> Art
    D3 --> Art
    D4 --> Art
    D5 --> Art
    D6 --> Art
    D7 --> Art
    D8 --> Art
    D9 --> Art["Articles and FAQs"]
    Art --> Solved{"Solved?"}
    Solved -- no --> Tk["Contact this department: create ticket"]
    Tk --> Risk{"Mentions risk?"}
    Risk -- yes --> Cr["Route to crisis queue"]
    Risk -- no --> Q["Department queue"] --> Reply["Reply in app, notify"]
    Solved -- yes --> Thx["Thanks, rate this article"]
```

---

## 10. Admin web: key flows

```mermaid
flowchart TD
    L["Login + MFA"] --> Ov["Overview: active users, paying users, active therapists, reported cases"]
    Ov --> Cases["Cases queue by severity and SLA"]
    Cases --> Case["Case detail: snapshot evidence, parties, history"]
    Case --> Dec{"Decision"}
    Dec --> Dismiss["Dismiss"]
    Dec --> Warn["Warn or strike"]
    Dec --> Restr["Restrict"]
    Dec --> Susp["Suspend"]
    Dec --> Esc["Escalate to clinical reviewer"]
    Dismiss --> Log
    Warn --> Log
    Restr --> Log
    Susp --> Log
    Esc --> Log(["Audit log entry with reason"])
    Case --> BG["Break-glass: reveal private profile (reason, second approver, logged)"]

    Ov --> Users["Users: public view by default"]
    Ov --> Bill["Billing: subscriptions, refunds, revenue"]
    Ov --> Ther["Therapists: verification queue, expiry, complaints"]
    Ov --> Mod["Moderation: AI flags, appeals, rules, strike config"]
    Ov --> Res["Help and resources: departments, articles, tickets, crisis lines"]
    Ov --> An["Analytics"]
    Ov --> Cfg["Configuration: plans, matching weights, feature flags"]
    Ov --> Aud["Audit log"]
```

---

## Screen count

| Surface | Screens (approx.) |
|---|---|
| Member app | ~45 |
| Therapist portal | ~10 |
| Admin web | ~18 |

## Open flow questions (feed back into PRD §14)

1. **After a skip or ended chat, how quickly does the next match appear?** Immediately risks "shopping"; a short cooldown or daily cap may be better.
2. **Does a member with no plan see the forum?** Draft assumes the forum is readable and postable on free accounts. Confirm.
3. **On-demand vs scheduled therapist sessions** (D4) changes the booking flow in §5.
4. **Camera-off with therapists** (D15) changes the pre-session screen.
5. **What counts as a "help department" (assumption in HLP-1)?** The list in §9 follows the support areas of the app. If you meant a directory of outside organisations (hotlines, clinics), that should be a separate section.
6. **Is free-text allowed anywhere on the public profile?** Draft: no bio.

## Next step suggestions

Wireframes for the five highest-risk screens: Welcome/consents, Match found + chat, Create post (with the identifying-details warning), Therapist profile + booking, and Report sheet.
