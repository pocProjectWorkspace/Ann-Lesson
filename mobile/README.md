# Lesson Plan — mobile app (Android and iOS)

Expo / React Native app for **teachers and students**. School admins and the
platform owner keep using the web app. The app talks to the web server's JSON
API under `/api/mobile/*` and opens lesson PDFs in the same page-turning book
viewer as the web, inside a web view.

## Screens

| Screen | Who | What |
|---|---|---|
| Login | all | School code, username or student ID, password |
| Home | student | Subjects of their class with progress bars |
| Home | teacher | Assigned classes with subject, lesson and student counts |
| Subject | student | Lessons with New / In progress / Learnt badges |
| Class | teacher | Subjects and lessons with viewed and learnt counts |
| Lesson | both | PDF files with "Read as book"; students mark learnt (after opening the book), teachers see and confirm per-student progress |
| Book | both | Full-screen page-turning viewer |
| Notifications | both | Bell on Home; new lessons, class changes, teacher confirmations; tap to open |

## Run it in development

Requirements: Node 20+, the web server running (`cd ../web && npm run dev`), and
either the **Expo Go** app on a phone or an Android emulator / iOS simulator.

```bash
cd mobile
npm install
# Point the app at your computer's LAN address (not localhost) so a phone can reach it.
# The web server prints it on start, e.g. "Network: http://192.168.1.20:3000".
echo EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 > .env
# And in web/.env, so the dev server serves the book viewer to that address:
#   ALLOWED_DEV_ORIGINS=192.168.1.20
npm start
```

Then scan the QR code with Expo Go (Android) or the Camera app (iOS), or press
`a` for the Android emulator / `i` for the iOS simulator. The Android emulator
can also use `http://10.0.2.2:3000`, which is the default when `.env` is absent.

Test logins are listed in the root README. Admin accounts are refused by the app
on purpose. Teachers and students can read PDFs in the app but not download them.

Checks: `npx tsc --noEmit` and `npm run lint` (Expo's ESLint config); CI runs both.

## Run it in a browser (no device needed)

The same app runs on the web through React Native Web, which is the quickest way to
click through every screen:

```bash
cd mobile
EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo export --platform web --output-dir dist-web
node serve-web.mjs 3100          # then open http://localhost:3100
```

The web server allows local origins in development; in production add the origin to
`CORS_ORIGINS`. On the web the token lives in localStorage and the book viewer is an iframe;
on devices it is the keychain / keystore and a native web view.

## Offline and push

- Home, subjects, classes and lessons keep their last successful response on the device
  and show it with an "offline" banner when the network is down. PDFs are not cached.
- On a real device the app registers an Expo push token after sign-in (needs an EAS
  project id, which `eas init` adds to `app.json`), and the server sends a push for every
  in-app notification. Nothing is sent on web or in Expo Go without a project id.

## How authentication works

- Login returns a signed token (12 hours). It is stored in the device's secure
  storage and sent as `Authorization: Bearer …` on every request.
- To open the book viewer, the app asks the server for a 10-minute hand-off token
  and loads `/embed/viewer/<fileId>?t=…`. The page and the PDF request both accept
  that token, so the viewer works even when the web view drops cookies. The
  long-lived session token never appears in a URL.

## Build for the stores (later)

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview   # APK for testing
eas build --platform all                          # store builds
```

Before a store build: set `EXPO_PUBLIC_API_URL` to the HTTPS production URL in
`eas.json` env, remove `usesCleartextTraffic` from `app.json`, and replace the
placeholder icons in `assets/`.

## Project layout

```
app/_layout.tsx        Navigation stack and auth provider
app/index.tsx          Redirects to login or home
app/login.tsx
app/home.tsx           Student subjects or teacher classes
app/subject/[id].tsx   Student lesson list
app/class/[id].tsx     Teacher class detail
app/lesson/[id].tsx    Lesson, files, progress
app/viewer/[fileId].tsx  Web view with the book viewer
lib/api.ts             Typed API client
lib/auth.tsx           Session state and secure storage
lib/ui.tsx             Small UI kit
lib/config.ts          API base URL
```
