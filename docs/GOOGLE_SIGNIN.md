# Sign in with Google: setup

Members can sign up and log in with Google as well as with a phone code. The code is in the app; three things have to be set up by hand, because they need your Google and Supabase accounts and a secret that must never be pasted into chat or code.

## 1. Google Cloud (about 10 minutes)

1. Open https://console.cloud.google.com and create a project (for example "Echo").
2. **APIs & Services, then OAuth consent screen.** Choose **External**. Fill in the app name (Echo), a support email and a developer email. Add your own Gmail as a test user while it is in testing. Before launch, publish the consent screen.
3. **APIs & Services, then Credentials, then Create credentials, then OAuth client ID.** Application type **Web application**. Name it "Echo web".
4. Under **Authorised redirect URIs** add exactly:
   `https://htsfkotheyrfyhqzeiny.supabase.co/auth/v1/callback`
5. Create it. Google shows a **Client ID** and a **Client secret**. Keep that tab open.

## 2. Supabase

1. Open the **haven** project, then **Authentication**, then **Sign In / Providers** (also called **Providers**), then **Google**.
2. Switch it on. Paste the **Client ID** and **Client secret** from Google into the two boxes there, and save. (Do this yourself; do not send them to anyone.)
3. **Authentication, then URL Configuration.** Set **Site URL** to `https://haven-three-xi.vercel.app`. Under **Redirect URLs** add:
   - `https://haven-three-xi.vercel.app/auth-callback`
   - `https://*-roselynewambugus-projects.vercel.app/auth-callback` (preview sites)
   - `http://localhost:8081/auth-callback` (running in a browser on your computer)
   - `exp://**` (Expo Go on a phone)
   - `echo://auth-callback` (a real app build)

## 3. Linking accounts

In Supabase, **Authentication, then Sign In / Providers**, switch on **Allow manual linking**. Without it, the Link Google button in Settings fails with a plain error.

## 4. The database

Run `supabase/google_signin_setup.sql` once in the SQL editor (it makes the phone number optional, so a Google member can have none). Until you do, Google sign-up is refused with "Signing up with Google isn't switched on yet" and phone sign-up carries on as before. Signing in with Google for someone who already has an account is not affected.

## What a Google member can and cannot do

- Echo holds the email Google verified, not a phone number. Echo knows who they are by that email, which is a weaker promise of anonymity than a number-only account; the terms and privacy text should say so.
- Opening the private profile asks them to confirm with Google again, not a phone code.
- Paying by M-Pesa asks which number to charge.
- No SMS reminders (no number to send to), and the phone-number recovery page does not apply to them.
- One person, one account: someone who signed up by phone adds Google under **Settings, Sign-in methods**, and someone who signed up with Google can add a phone number there. This needs **Allow manual linking** switched on (below). Two accounts that were already made separately are not merged; the person keeps the one they want and asks us to remove the other.

## Still to build

- Therapists and staff signing in with Google. Today they are linked by phone number, so a Google sign-in for them would only create a member account. Linking by email is the next step.
