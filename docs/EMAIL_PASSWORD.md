# Email and password sign-in, and Forgot password: setup

Members can sign up and log in with an email and a password, next to the phone code and Google. Supabase Auth keeps the passwords (Echo never sees them) and sends the emails. The code is in the app; the settings below are made by hand in the Supabase dashboard.

## How it works for a person

- **Sign up with email:** email and password on the sign-up screen, then Supabase emails a link. Opening it confirms the address and carries on to registration (terms, date of birth, pen name). No phone number is needed.
- **Log in with email:** the login screen has "Log in with email and password".
- **Forgot password?** A link on the email login screen. They enter their email, and we say the same thing whether or not it has an account. The email has a link that works for one hour and once. It opens **Choose a new password**; saving it signs them in and takes them on (Home for a member). An old or used link shows "This link has expired" with a button to ask for a new one.
- The link is a web address, so on a phone it opens in the browser and the person finishes there; they then log in to the app with the new password.

## Supabase settings

1. **Authentication, then Sign In / Providers, then Email:** switch on **Enable Email provider** and **Confirm email**. Set the **Minimum password length** to 8. If your plan has it, switch on **Prevent use of leaked passwords**.
2. **Authentication, then URL Configuration:** the Site URL is `https://haven-three-xi.vercel.app`, and the Redirect URLs include `https://haven-three-xi.vercel.app/auth-callback` (the same list as for Google; see `docs/GOOGLE_SIGNIN.md`).
3. **Authentication, then Emails (templates):** change three templates so the link carries a token that works on any device, not just the browser that asked for it.
   - **Confirm signup**, link: `{{ .SiteURL }}/auth-callback?token_hash={{ .TokenHash }}&type=signup`
   - **Reset password**, link: `{{ .SiteURL }}/auth-callback?token_hash={{ .TokenHash }}&type=recovery`
   - **Change email address**, link: `{{ .SiteURL }}/auth-callback?token_hash={{ .TokenHash }}&type=email_change` (used when someone who signed up by phone adds an email and password under Settings, Sign-in methods)
   In each template use that address as the link target, for example `<a href="{{ .SiteURL }}/auth-callback?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a>`.
4. **Project Settings, then Authentication, then SMTP Settings:** switch on a custom SMTP sender. Supabase's built-in sender allows only a few emails an hour and is for testing. With Resend: host `smtp.resend.com`, port `465`, username `resend`, password your Resend API key (enter it yourself in this form; do not send it to anyone), and a sender address on a domain you have verified in Resend.

## Optional

`EXPO_PUBLIC_WEB_URL` is the public web address used in emails sent from the phone app. It defaults to `https://haven-three-xi.vercel.app`; set it if the address changes.

## What an email member can and cannot do

The same as a Google member (see `docs/GOOGLE_SIGNIN.md`): Echo holds a verified email and no phone number, so opening the private profile asks for the password, M-Pesa asks which number to charge, and there are no text reminders. Run `supabase/google_signin_setup.sql` once, the same file, to let an account exist without a phone number.

## One person, one account

Someone who signed up by phone adds an email and password under **Settings, Sign-in methods**. Supabase emails a confirmation link; opening it finishes the link, so the email login reaches the same account. Turn on **Allow manual linking** (see `docs/GOOGLE_SIGNIN.md`). The same screen adds Google, and adds a phone number to an account that began with Google or an email.

## Therapists and staff

They can use an email and password too: **Sign in with email and password** on the therapist portal or staff sign-in page, with **Forgot password?** there as well. A therapist or staff member who has no password yet uses **Create your sign-in**, confirms the email Echo linked to them, and goes straight to their dashboard. Linking is by email, set up by a clinical reviewer or Admin (see `docs/GOOGLE_SIGNIN.md`). Staff with only a password have no second factor, so prefer Google or the phone code for Admins and clinical staff.

## Not built yet
- Changing the password while logged in (Forgot password covers it for now).


## Sign-up is email-only (v1.00)

Members and therapists sign up with an email and a password (or Google). In Supabase, **Authentication, Providers, Email** should have **Confirm email** on, and **Authentication, URL Configuration** should list your site address and the app's `auth-callback` link as allowed redirect URLs. The confirmation link opens `/auth-callback`; the app then carries on with sign-up (members) or the application (therapists). With Confirm email off, there is no link step and sign-up goes straight to the next screen.
