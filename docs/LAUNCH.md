# Launch runbook

The live checklist is in the Admin dashboard (Overview, real backend only). It reads the system and shows what is still to do. This page is the order to do things in, and what to do if something goes wrong.

## 1. Before anyone outside the team uses it

1. **Crisis lines and support organisations.** In Resources, replace every placeholder with a real, working number. Call each one. Press **Mark as checked**. Put one named person in charge of re-checking every 90 days.
2. **Team.** At least two Admins, two clinical reviewers and two moderators, all signed in once. (Two of each means no change, appeal or heavy queue depends on one person.)
3. **Plans and prices.** Every plan on offer has a price. The platform fee is the percentage you intend.
4. **Therapists.** At least three verified therapists with a profile and hours, accepting new clients.
5. **Run the two cleanup files** once in the Supabase SQL editor: `supabase/group_chat_cleanup.sql` and `supabase/account_deletion_cleanup.sql`. Each deletes data on a schedule and asks you to confirm.
6. **Remove test numbers.** The list that can complete a payment without paying (`private.payment_test_phones`) must be empty in production.

## 2. Switch on the providers (secrets are entered in the Supabase dashboard, never in chat or code)

| What | Where | Steps |
| --- | --- | --- |
| M-Pesa | Edge Functions > Secrets | `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_TOKEN`, `MPESA_ENV=sandbox` first. Test in the Daraja sandbox, then `production`. Make one real payment and refund it. |
| SMS | Edge Functions > Secrets, Vault, Auth | `AT_USERNAME`, `AT_API_KEY`, `AT_ENV`, optional `AT_SENDER_ID`; `SMS_DRAIN_TOKEN` and a vault secret `sms_drain_token` with the same value; enable the Phone provider and the Send SMS hook (`send-sms-hook`) and copy its secret to `SEND_SMS_HOOK_SECRET`. Receive one real sign-in code. |

## 3. Build and release

- Build the app with `EXPO_PUBLIC_BACKEND=supabase` and the production project's URL and publishable key. Check the Android export and the web build open and sign in.
- The web build is static (`npm run web:build`). Serve it over HTTPS on the production address.

## 4. Backups

- In Supabase, turn on daily backups (and point-in-time recovery if your plan has it). Restore into a scratch project once, and check a member can sign in and see their chats' expiry.

## 5. Walk through it on a real phone

Sign up, pay, match, chat, book, report, raise a help ticket, request a refund, delete the account. Then, as staff: decide a case, apply a sanction, approve a refund, mark a payout paid. Confirm each item on the checklist as you go.

## If something goes wrong

- **Payments stuck.** Look at `private.payment_events` for `unverified`, `amount_mismatch`, `unknown_callback` and `refund_needed`. A member whose prompt was answered but whose order stayed pending can retry; the app asks Safaricom directly after a few checks.
- **A bad deploy of an edge function.** Redeploy the previous version from `supabase/functions/`. Without secrets, M-Pesa and SMS functions answer "unavailable" and the app falls back to test payments (test numbers only), so removing a secret is a safe way to switch a provider off.
- **A crisis line is wrong.** Edit it in Resources straight away. The checklist's 90 day check resets until someone presses **Mark as checked** again.
- **A staff account is lost or compromised.** Another Admin deactivates it under Roles (a second Admin approves). Break-glass access and every file opened are in the audit log.
- **Database rollback.** Every migration is in `supabase/migrations/`; the rollback tests in `supabase/tests/` run inside a transaction and change nothing. Restore from a backup rather than editing live data.
