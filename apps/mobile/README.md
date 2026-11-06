# Alarsio Mobile (`apps/mobile`)

Expo / React Native field app for supervisors. It captures site records offline (attendance, daily reports, materials) and syncs them to Supabase when the phone is online.

Rules that apply here (from the root `CLAUDE.md`): RLS is the security boundary, no service-role key anywhere, offline first, no secrets in git.

## 1. Quick facts

| Item | Value |
| :-- | :-- |
| Android package | `in.alarsio.app` (cannot change once installed on phones) |
| Expo account / project | `@alarsio/alarsio` |
| EAS project ID | `a664e60b-1d02-457d-b65b-8f7ff30d75dd` (in `app.json`, not a secret) |
| Expo SDK | 57 |
| App version | 0.1.0 (Android versionCode managed remotely by EAS) |
| Offline store | `expo-sqlite` outbox |
| Backend | Supabase (publishable key only) |

## 2. Folder layout

```
apps/mobile
├── app.json        Expo config (package, plugins, permissions, EAS project ID, owner)
├── eas.json        EAS build profiles (only "pilot")
├── .env.local      Local dev variables (gitignored, never commit)
├── assets/         Icons (the PNGs are drawn from assets/brand/*.svg by scripts/export-icons.mjs)
├── scripts/        export-icons.mjs
└── src/
    ├── app/        Expo Router screens: index (Today), about, attendance, materials, reports
    ├── attendance/ Attendance feature code
    ├── reports/    Daily reporting feature code
    ├── materials/  Materials feature code
    ├── auth/       Sign-in and session
    ├── sync/       Offline sync / outbox
    ├── db/         Local SQLite database
    ├── config/     public-config.ts reads the EXPO_PUBLIC_* variables; support.ts holds the support contacts and web links
    ├── lib/        Shared helpers (screen titles, date picker helpers)
    ├── today/      Read-only data for the Today home screen
    ├── theme.ts    Colour, spacing and type tokens (from docs/DESIGN.md)
    ├── screens/    Screen components
    └── __tests__/  Tests
```

## 2a. What the app does for each role

- **Supervisors and project managers** get the capture app: a Today home (a card per site with check in, register and report), a sync bar on every other screen, and Help and about.
- **Owners and accountants** are shown a screen that points them to alarsio.com. A user with no company yet is told to ask for an invite link.
- The role comes from the user's own `memberships` rows, which RLS already lets them read. The answer is cached on the phone (`alarsio-access:<userId>`, cleared on sign-out). With no signal and no cache the user gets the capture app; the server still refuses anything they may not record.
- Support contacts (email, WhatsApp) and web links live only in `src/config/support.ts`. To move to a support@alarsio.com mailbox, change `SUPPORT_EMAIL` there.
- The sync bar (`src/sync/SyncBar.tsx`) reads the outbox counts on the phone and the connection state, and uses the words in `src/sync/status-text.ts`. Tapping it opens Today, where the sync panel and Sync now are.
- A material entry's date is chosen from the phone's calendar and cannot be in the future.

## 3. Environment variables

Only two, both public (compiled into the APK, readable by anyone who has it):

| Name | What |
| :-- | :-- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Publishable** key (`sb_publishable_...`) |

- Local dev: put them in `apps/mobile/.env.local` (gitignored).
- Pilot build: stored in the EAS `preview` environment, never in a file.
- **Never** use the service-role key or any secret key (rule 2).
- Changing either value needs a new build.

Read in code only through `src/config/public-config.ts`.

## 4. Local development

Run from the repo root in Git Bash, using the repo pnpm version (`pnpm@9.12.0`):

```bash
pnpm install
pnpm dev --filter=mobile        # expo start
pnpm typecheck                  # before every commit
pnpm lint                       # before every commit
pnpm test                       # jest
```

## 5. Pilot Android APK (issue #130)

Source of truth: `docs/DEPLOY.md` sections 3, 5 and 6.

### 5.1 One-time setup (done on 2026-11-04)

1. `eas login` in the browser (own account).
2. `eas init` in `apps/mobile`. It created `@alarsio/alarsio` and wrote into `app.json`: `extra.eas.projectId`, `owner: "alarsio"`, an empty `extra.router`, and Android location permissions (`ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`).
3. Set the two public variables in the EAS `preview` environment (names in section 3), with `--visibility plaintext`, from the `apps/mobile` folder.
4. Check them: `eas env:list preview`.

> Run `eas` commands from `apps/mobile`, not the repo root. Run from the root, `eas init` writes a stray `app.json` there.

### 5.2 Build

```bash
cd apps/mobile
eas build --profile pilot --platform android
```

- Profile `pilot`: internal distribution, APK, reads the `preview` environment.
- First build generated an Android keystore, managed by EAS.
- Check a build without waiting: `eas build:view <build-id>`.

### 5.3 First pilot build

| Item | Value |
| :-- | :-- |
| Status | finished |
| Build ID | `f040e0c6-d623-42af-9b3f-4f58f834bb30` |
| Build page | https://expo.dev/accounts/alarsio/projects/alarsio/builds/f040e0c6-d623-42af-9b3f-4f58f834bb30 |
| APK | https://expo.dev/artifacts/eas/sDiHXxCOLoUyZM6zDgEEh8OIC4XAJeWHvbVjI1_y9C8.apk |
| Version / code | 0.1.0 / 1 |
| Built from commit | `79bfbf7` (before the `app.json` change below) |

### 5.4 Install on a phone

1. Open the APK link in Chrome on the phone, or scan the QR on the build page.
2. Tap **Download anyway** if Chrome warns.
3. Open the file. If blocked, allow installs from Chrome in Settings, then tap **Install**.
4. If Play Protect warns, tap **Install anyway**.
5. Open **Alarsio**. The sign-in screen should show.

## 6. Secrets scan

Run the three commands in `docs/DEPLOY.md` section 5 from the repo root before each release. Each should print nothing (the only expected hits are the lines in `docs/DEPLOY.md` that document the patterns). The commands are not repeated here so this file does not trip its own scan.

Result on 2026-11-04: scans 1 and 2 printed nothing, scan 3 matched only `docs/DEPLOY.md`, and the git history check found nothing outside that file.

## 7. Smoke tests on the phone (S6 to S13)

Run on the installed APK. Setup: an owner has invited a supervisor, with a test site and a pin near the phone. Record each result in #58. A row in `docs/FEATURES.md` stays unticked until its test passes.

| # | Flow | Steps | Pass looks like | Result |
| :-- | :-- | :-- | :-- | :-- |
| S6 | Phone sign-in | Sign in as the supervisor, then turn on airplane mode | The signed-in screen still opens offline | [ ] |
| S7 | Check in / out | Inside the geofence: check in, check out. Then check in from outside with a reason. Then deny location | Location asked once, on the tap. Inside saves at once. Outside asks for a reason. Denial still allows a check-in with a reason. Row says "On the server" only after sync | [ ] |
| S8 | Day register | Airplane mode: mark everyone present, change one worker, reconnect | Records reach the server in order, show "On the server", nothing sent twice | [ ] |
| S9 | Approval | Web, as project manager: approve the day. Then on the phone edit an entry for that day and propose a correction | Late edit shows "needs attention". Correction appears for review. Nobody reviews a day they recorded | [ ] |
| S10 | Daily report | Offline: draft a report, then file it with a blocker and safety flag, reconnect | Headcount pre-filled from attendance. Draft survives a restart. Filed report reaches the web | [ ] |
| S11 | Report review | Web, as manager: send the report back with a reason, resubmit, approve | Status words match. No one reviews their own report | [ ] |
| S12 | Wage summary | Web, as accountant: build a period over approved days, check totals, export CSV and Excel | Export matches the screen | [ ] |
| S13 | Offline sync | Airplane mode, do S7 to S10 captures, then reconnect | Every record shows pending, then synced. A conflict reads "needs attention". Nothing says "submitted" early | [ ] |

S9, S11 and S12 are web steps that need the phone data from S7 to S10. Do them in order.

If a test fails, do not tick the row. Open an issue with the steps and what you saw.

## 8. Open items

- [ ] The pilot polish adds native pieces (`expo-splash-screen`, `@react-native-community/datetimepicker`, the new icon and splash), so **a new APK is needed**: `eas build --profile pilot --platform android` from `apps/mobile`.
- [ ] Install the APK on a real phone and confirm it opens (S6 onward).
- [ ] Merge the PR that commits the `eas init` changes to `apps/mobile/app.json`. The pilot APK was built before that change; a new build is needed only if the permissions or plugins change.
- [ ] Tick the matching rows in `docs/FEATURES.md` after each smoke test passes.
- [ ] Optional: update `eas-cli` (`npm install -g eas-cli`). The build worked on the older version.
- [ ] Play Store, iOS and over-the-air updates are out of scope for the pilot.

## 9. Troubleshooting

| Problem | Fix |
| :-- | :-- |
| Screen says "Configuration missing: EXPO_PUBLIC_..." | The variable is missing. Local: check `.env.local`. APK: check `eas env:list preview`, then rebuild |
| `eas init` created `app.json` in the repo root | Delete it, then run `eas init --id <project-id>` from `apps/mobile` |
| "Cannot determine native SDK version... `expo` is not installed" | Run `pnpm install` at the repo root, and run `eas` from `apps/mobile` |
| APK will not install | Allow installs from the browser, then tap **Install anyway** in Play Protect |
