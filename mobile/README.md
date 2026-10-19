# Echo member app

The member app for Echo, an anonymous peer-support and therapy platform for Kenya. Built with React Native and Expo (TypeScript), so it runs in Expo Go on a phone and in a browser.

The backend is a **mock** that lives on the device. Everything a screen needs goes through `src/api`, so a real service can replace it without changing screens. Nothing here talks to a server, sends a real SMS, or takes a real payment.

## Run it

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

Browser flows: `onboarding`, `chat`, `forum`, `book`, `help`, `me`, `portal`. Build the web export first, then pass its folder.

## Trying the app

1. Register with any adult date of birth. The one-time code is shown on screen in demo mode.
2. Open **Me, then Demo tools** to grant a plan, end it, fail the next payment, add a notice, show a new-device alert, move the clock forward, or show sample prices.
3. Prices are an open decision (PRD D2, D3), so they show as `KES ___` until **Show sample prices** is on.

## How it is organised

```
src/app/         Screens. Folders and file names are the routes (expo-router).
src/api/         The contract with the backend, and the mock that implements it.
src/lib/         Pure rules with no UI: safety checks, age, booking, plan state, time.
src/store/       A small reactive store, saved on the device. Secure storage holds the signed-in flag.
src/components/  The design system: text, buttons, controls, cards, sheets, art.
src/data/        Seed content, help articles, plans, and the config flags for open decisions.
src/i18n/        English text is the key. Kiswahili is a draft that needs a native reviewer.
tests/           Unit tests. e2e/ holds the browser flows.
```

## The therapist portal

A desktop-style web app inside the same project, at `/portal`. From the welcome screen choose **I'm a therapist**, then continue as the demo therapist, or try **Apply to join Echo**. It has Today, Inbox, Calendar (weekly availability, time off, caps), Sessions, a live session with private notes, wrap-up, raising a concern, Forum, Earnings with payouts, and the public profile editor. Publishing the profile or availability changes what members see in the directory. Open it in a browser window wider than about 900 px to see the two-column layout.

## Rules the app enforces

- Messages, posts and comments with a link, phone number, email, social handle or address are blocked before they are sent, with a plain reason. The mock backend checks again, so the rule holds even if the app is changed.
- Members are shown only as a pen name, an avatar and an age range. Real details sit in a private profile that needs a phone code to open.
- Under-18s are turned away at registration.
- Peer chat needs an active plan. When a plan ends, chats become read-only. Therapist chats, urgent help, the help centre and reading the community stay free.
- Signs of distress offer urgent help. They never block or punish.
- In the portal, clients are only a pen name and avatar. Inbox messages follow the same sharing limits, therapist forum replies can't invite people to book or make contact, and changing a payout needs a fresh code.
- Urgent help is on every screen and works signed out.

## Not finished, on purpose

- **Placeholders for open decisions.** Crisis numbers and support organisations are marked as unverified (D29). Prices are blank (D2, D3). See `src/data/config.ts` and PRD section on decisions.
- **Calls are simulated.** Voice and video need a provider that has not been chosen. Nothing is recorded or sent.
- **Payments are simulated.** M-Pesa takes about three seconds and can be made to fail from Demo tools.
- **Kiswahili is a draft.**
- **Admin dashboard** is designed in `docs/` but not built here.

## Web build note

On web, the mock API is exposed as `globalThis.__echo` so browser tests can drive it. This is a demo hook and goes away when a real backend is connected.
