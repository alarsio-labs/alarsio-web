# Phone test checklist (Android APK)

For: whoever holds the test Android phone. About 45 minutes. Write **Pass** or **Fail** and what you saw
in the last column, and take a screenshot of anything that fails.

**Before you start**

- Install the APK from https://www.alarsio.com/download (allow installs from the browser when asked).
- Sign in as the **supervisor** test account.
- The test organisation is **Audit Test Co**. The supervisor is assigned to **Audit Site A**, which has four
  workers: AUD-01 Ramesh Kumar, AUD-02 Sunita Devi, AUD-03 Arif Shaikh, AUD-04 Mohan Lal.
- **Site A's pin must be where you are standing.** Open Google Maps, long-press your blue dot, copy the
  two numbers (for example `26.91240, 81.03530`) and send them to the test lead, who moves the pin before you start.
  Without this, every check-in counts as "outside the site".

**Airplane mode** means: swipe down, tap the airplane icon. Turn it off again only where a step says so.

---

## S6 · Sign in, then work offline

| # | Do this | Pass looks like | Result |
| :-- | :-- | :-- | :-- |
| 6.1 | Open the app and sign in as the supervisor | Home screen (Today) opens with your name and Audit Site A | |
| 6.2 | Close the app fully (swipe it away), turn on airplane mode, open it again | It opens straight to Today, still signed in, without asking for a password | |

## S7 · Check in and check out (stay in airplane mode for 7.1–7.4)

| # | Do this | Pass looks like | Result |
| :-- | :-- | :-- | :-- |
| 7.1 | Open Audit Site A, tap **Check in** | The phone asks for location permission **only now**, on this tap. Allow it. | |
| 7.2 | — | The check-in is saved at once with no signal. It does **not** say "On the server". | |
| 7.3 | Tap **Check out** | Saved at once, still not "On the server" | |
| 7.4 | Walk about 300 m away (outside the 200 m circle) and tap **Check in** again | The app asks for a **reason** before saving. Type "Audit test, outside", then **Check in anyway** | |
| 7.5 | Android Settings → Apps → Alarsio → Permissions → Location → **Don't allow**. Back in the app, tap **Check in** | The app still lets you check in with a reason. It does not crash or block you. Turn location back on afterwards. | |
| 7.6 | Turn airplane mode **off**. Open the Sync screen and tap **Sync now** | Each record changes to **On the server**. Nothing appears twice. | |

## S8 · Day register (airplane mode on)

| # | Do this | Pass looks like | Result |
| :-- | :-- | :-- | :-- |
| 8.1 | Airplane mode on. Open the **Register** for Audit Site A, today | All four workers are listed | |
| 8.2 | Tap **Mark everyone present** | All four show Present in one tap | |
| 8.3 | Change Sunita Devi to **Half day**, give Arif Shaikh **2** overtime hours, add a note on Mohan Lal | Each change saves at once | |
| 8.4 | Close the app fully, open it again, open the register | Your changes are still there | |
| 8.5 | Airplane mode off, **Sync now** | Every entry shows **On the server**; nothing sent twice | |

## S10 · Daily report (airplane mode on)

| # | Do this | Pass looks like | Result |
| :-- | :-- | :-- | :-- |
| 10.1 | Airplane mode on. Start today's **daily report** for Audit Site A | Headcount is **already filled in** from the register (4) and says where the number came from | |
| 10.2 | Type some work done, then close the app fully and reopen it | The draft is still there, exactly as typed | |
| 10.3 | Add a **blocker**, mark it **serious**, tick the **safety** flag, write a next-day plan, add one photo, and **Submit** | It is saved. It does **not** say submitted or "On the server" yet. | |
| 10.4 | Airplane mode off, **Sync now** | The report shows **On the server**; the photo uploads after it | |

## S13 · Offline sync, all together

| # | Do this | Pass looks like | Result |
| :-- | :-- | :-- | :-- |
| 13.1 | Look at the Sync screen after S7–S10 | Every record went pending → syncing → synced. Nothing ever said "submitted" before the server confirmed. | |

**Stop here and tell the test lead.** The test lead then approves the day on the web as the project manager (S9),
reviews the report (S11) and builds a wage period from it (S12).

## S9 · After the day is approved (the test lead tells you when)

| # | Do this | Pass looks like | Result |
| :-- | :-- | :-- | :-- |
| 9.1 | On the phone, open today's register and change Ramesh Kumar to **Absent**, then **Sync now** | The change shows **Needs attention**, because the day was already approved. It is not applied. | |
| 9.2 | Propose a **correction** for Ramesh Kumar with a reason, **Sync now** | The correction is accepted and waits for a manager | |

## S11 · After the report is sent back (the test lead tells you when)

| # | Do this | Pass looks like | Result |
| :-- | :-- | :-- | :-- |
| 11.1 | Open today's report on the phone | You can see it was **sent back** and the manager's note. *(Known gap #136/#137: the phone may not show this yet. Write what you see.)* | |
| 11.2 | Edit it, give a reason, resubmit, **Sync now** | It reaches the server as a new revision | |

---

Anything that fails: note the step number, what you expected, what happened, and attach the screenshot.
