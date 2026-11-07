# Launch runbook

The live checklist is in the staff dashboard (Overview, real backend only). It reads the system and shows what is still to do. This page is the order to do things in, and what to do if something goes wrong.

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
| Voice and video calls (Daily) | Edge Functions > Secrets | Make a Daily account (daily.co), then add `DAILY_API_KEY` (Daily dashboard, Developers) and `DAILY_DOMAIN` (your Daily subdomain, for example `echo` for echo.daily.co). The function `call-join` is already deployed. Without these a call screen says "Calls aren't switched on yet" and the therapist can talk in Chats. Rooms are private, hold two people, can't be recorded, and open 10 minutes before the session. On a phone the call runs in a web view, so it works in Expo Go; test one real voice and one real video session between two devices before you sell them. To check the secrets without making a call, open `https://<project>.supabase.co/functions/v1/call-check`: it answers `ready: true` once both secrets are set and Daily accepts the key (it never shows them). |
| M-Pesa refunds | Edge Functions > Secrets | Add `MPESA_INITIATOR_NAME` (the B2C API operator Safaricom gave you) and `MPESA_SECURITY_CREDENTIAL` (that operator's password encrypted with Safaricom's certificate; the Daraja portal can generate it) next to the payment secrets, and make sure `SMS_DRAIN_TOKEN` is set (the same token the text sender uses). In Daraja, set the B2C result and timeout address to `https://<project>.supabase.co/functions/v1/mpesa-refund-result?token=<MPESA_CALLBACK_TOKEN>`. B2C has to be enabled on your shortcode by Safaricom for production. Until these are set, refunds wait in Billing as "Send by hand". Test one refund in the sandbox first. |
| Sign-up emails (Resend) | Supabase > Project Settings > Authentication > SMTP Settings | **Required before launch.** Without it Supabase sends only a few emails an hour, so sign-up stops after a handful of people. Verify an Echo sending domain in Resend (the only domain verified there today is not Echo's), create a Resend API key, then enter host `smtp.resend.com`, port `465`, username `resend`, the key as the password and a sender such as `no-reply@<your domain>`. Then raise Authentication > Rate Limits (emails per hour). Steps in `docs/EMAIL_PASSWORD.md`. |
| Staff authenticator codes | Supabase > Authentication > Multi-Factor | Check that **TOTP** is turned on (enroll and verify). Then, the first time each staff member signs in (including the first Admin, after the setup code), the dashboard shows a QR code to scan with an authenticator app. **If someone loses their phone:** in Supabase > Authentication > Users, open that person and remove their TOTP factor; they set up a new one at the next sign-in. If nobody can get in, an owner can set `staffMfa` to `{"required": false}` in the server configuration for a short time, then set it back to `true`. |
| Watch videos (storage limit) | Supabase > Storage > Settings | Raise the **global file size limit** to at least the largest video you will upload (up to 5 GB; the Pro plan allows it). The episodes bucket itself already allows 5 GB, but a video is refused while the project-wide limit is lower (the default is 50 MB). **Cost to know:** members stream from Supabase Storage, and Pro includes 250 GB of data transfer a month, then it is charged by the GB. A one-hour video can be about 1 GB, so a few hundred views a month will pass the allowance. If Watch grows, move the files to a video host (Cloudflare Stream, Mux or Bunny); the app only asks for a link, so that change is small. |
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

## Verification documents: 12-month retention

Verification documents (therapist applications and licence renewals) are kept for 12 months after the decision on them, then deleted. The `document-retention` edge function is deployed and the logic lives in `supabase/document_retention_cleanup.sql`. Run that file once in the SQL editor (it deletes data, so it is kept apart); it schedules a daily job. Documents are never removed while an application is pending or waiting for information. It uses the same `sms_drain_token` vault secret and `SMS_DRAIN_TOKEN` function secret as the SMS sender, so nothing new to enter.


## Sign in with Google

Optional but built. Setup is in `docs/GOOGLE_SIGNIN.md`: a Google OAuth client, the Google provider and redirect URLs in Supabase, and `supabase/google_signin_setup.sql` run once in the SQL editor.

## Email and password, and Forgot password

Built. Setup is in `docs/EMAIL_PASSWORD.md`: the Email provider and minimum password length, redirect URLs, two email templates, and a custom SMTP sender (Supabase's own sender is limited to a few emails an hour). Needs the same `supabase/google_signin_setup.sql` as Google.

## Therapists and staff by email

Link a therapist by email under **Therapists**, and add staff by email under **Roles** (an Admin, with a second Admin to approve). The first Admin can use Google at the staff page with the one-time setup code. Ask staff to turn on 2-step verification on their Google account; avoid email-and-password-only for Admins.

## The website is for therapists and staff only

On the live website (`EXPO_PUBLIC_BACKEND=supabase`, in a browser) members cannot sign up or log in: the landing page shows a note that Echo for members is the mobile app, the top bar offers Therapist sign in and Staff sign in, and any member address (login, register, chat and so on) goes back to the landing page. A member who finishes an emailed link in a browser (confirming an email, resetting a password) is signed out of the browser and told to open the app. Urgent help, Terms and privacy, and the help centre stay public. The demo build (no backend set) keeps the member screens so it can be tried in a browser.
