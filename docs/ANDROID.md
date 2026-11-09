# Building the Android app and sharing it

Echo's phone app is built in Expo's cloud (EAS). You do not need Android Studio. The build gives you a file (an APK) and a link; anyone with an Android phone can open the link and install it.

## One-time setup (on your PC)

1. Make a free account at https://expo.dev (remember the username and password).
2. In the Windows command prompt:
   ```
   npm install -g eas-cli
   eas login
   ```
3. Go to the app folder and link it to your Expo account:
   ```
   cd C:\Users\PC\haven\mobile
   git pull
   npm install --legacy-peer-deps
   eas init
   ```
   Say yes when it asks to create a project. It adds a project id to `app.json`. Commit that change (`git add app.json`, `git commit -m "Link the Expo project"`, `git push`) so the id is kept.

## Build the app

There are two builds. Pick by who it is for.

| Build | Command | What it is |
|---|---|---|
| **demo** | `eas build --platform android --profile demo` | The app with made-up data kept on the phone, like Expo Go. Nothing is real, so it is safe to hand to anyone to look at. |
| **live** | `eas build --platform android --profile live` | The same app connected to your real Echo service (sign-up, therapists, payments, Watch). Real accounts and real data. |

- The first time, it asks **"Generate a new Android Keystore?"** Say **yes**. Expo keeps it safe. It is the key that signs your app; every later build must use the same one.
- It runs in the cloud and takes about 10 to 30 minutes on the free plan (there can be a queue). You can close the window and come back; `eas build:list` shows it.
- When it finishes you get a **link and a QR code** to the APK. Open the link on the phone, or scan the QR code.

## Share it

1. Send the link from the build page (WhatsApp, email).
2. On their Android phone: open the link, download the file, tap it to install. Android asks to allow installing from this source ("Install unknown apps"). Say yes for that browser or app. This is normal for apps outside the Play Store.
3. To give them a new version, run the build again and send the new link. Installing over the old one keeps their data on the phone.

## What does not work yet in a shared build (be honest with the person you share with)

- **Push notifications** are not set up. Reminders and alarms for sessions and group chats are scheduled on the phone and do work. Notifications from the server (a new chat message when the app is closed) do not (backlog Q-60).
- **Sign in with Google** has not been set up for the Android build (it needs the build's signing fingerprint added in Google Cloud). Phone and email sign-in are the ones to use.
- **Calls** (voice and video) have not been tried on real phones yet (backlog Q-61).
- The demo build resets if the app's data is cleared.

## Later: the Play Store

When you are ready, `eas build --platform android --profile store` makes the file Google Play wants (an AAB). You need a Google Play developer account (a one-time fee), a privacy policy page, and store screenshots. The checklist in `docs/LAUNCH.md` covers what to finish first.
