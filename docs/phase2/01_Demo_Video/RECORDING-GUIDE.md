# Alarsio demo video: recording guide (Manish, Nikhil, Anuradha)

**One unlisted YouTube video, under 10 minutes.** Each person records their own segments as separate clips. Claude joins and edits them.

| # | Segment | Max | Who | File name |
|---|---|---|---|---|
| S1 | Problem and users | 0:30 | Manish | `S1_Manish.mp4` |
| S2 | Core workflow, ONE take | 3:30 | Manish | `S2_Manish.mp4` |
| S3 | When things go wrong | 1:00 | Nikhil | `S3_Nikhil.mp4` |
| S4 | Built from feedback | 2:00 | Nikhil | `S4_Nikhil.mp4` |
| S5 | Real usage | 1:00 | Anuradha | `S5_Anuradha.mp4` |
| S6 | Under the hood | 1:00 | Anuradha | `S6_Anuradha.mp4` |
| S7 | Honest gaps | 0:30 | Manish | `S7_Manish.mp4` |

## Rules from the Sitare guide
- Record on the **live site, www.alarsio.com, with the browser's address bar visible**. No localhost, no slides, no Figma.
- Record the **phone part on a real Android phone** with the installed app (APK 0.1.1).
- Use realistic data: the demo company **Sharma Constructions (Demo)**. Never use "test123".
- **S2 is one continuous take, with no cuts.** Cuts between segments are fine.
- **Each of us says our name** at the start of our first segment.
- **Never show passwords, emails or phone numbers on screen.** Sign in before you press record.

## Recording settings (everyone)
- **Tool:** OBS Studio (free). Settings → Video: 1920×1080, 30 FPS. Output: MP4. Loom also works; download the MP4.
- **Microphone on, quiet room.** Speak a little slower than normal.
- **Chrome:** zoom 110%, close other tabs, hide bookmarks (Ctrl+Shift+B), Do Not Disturb on.
- Leave **2 seconds of silence** at the start and end of each clip. Claude trims it.
- Re-record a segment as many times as you like. Send only the best take.
- **Send clips** to Manish's Google Drive folder `clips`, not WhatsApp, because WhatsApp ruins the quality.

## Phone on screen (S2, S3)
Use **scrcpy** to show the phone's screen in a window on the laptop; see `phone-mirroring-guide.pdf`. Put the phone window on the left and Chrome on the right, then record the whole screen in OBS. If scrcpy fails, record the phone with Android's own screen recorder and send that clip. Claude places it side by side.

---

## S1: Problem and users (Manish, 0:30)
**On screen:** www.alarsio.com home page. Your webcam in a corner is optional.
**Say:**
> "Hi, I'm Manish Tiwari from Alarsio. Small building contractors run five, ten, twenty sites from paper registers and WhatsApp photos. So wages get disputed, cement goes missing, and the owner keeps driving between sites. Alarsio is for contractors with 2 to 20 sites. Our design partners are Manchitra Architects, Buildbool Construction, and Abhinav Constructions and Arts."

## S2: Core workflow, one take (Manish, 3:30)
**Before recording:**
- Phone signed in as the demo supervisor (Vikas) and mirrored on the left.
- Chrome on the right, signed in as the owner (Rakesh) at www.alarsio.com.
- Rehearse once, so the take stays under 3:30.

**One take. Do this, and narrate as you go:**
1. **Phone:** open Gomti Nagar G+3 Residence → **Check in** at the site.
   > "This is Vikas, the site supervisor. He checks in at the site, and the phone records where he is."
2. **Phone:** open today's attendance → **mark all present** → set one worker to half day, give one worker 2 hours overtime → save.
   > "Attendance for seven workers takes under a minute."
3. **Phone:** Materials → cement → **receipt: 100 bags** → save.
4. **Phone:** Daily report → headcount, work done, one photo → **submit**. Show that it says it has synced.
   > "Everything is saved on the phone first and sent when there is network."
5. **Web:** **Attendance** → open today's Gomti Nagar day → **Approve**.
   > "In the evening, the owner sees every site in one place and approves the day."
6. **Web:** **Daily reports** → open today's report → **Mark reviewed**.
7. **Web:** **Materials** → show cement up by 100.
8. **Web:** **Wages** → open the locked week 3–9 Nov → point to one worker's days, overtime and the −₹500 advance.
   > "Wages come only from approved attendance, so each line can be explained."

## S3: When things go wrong (Nikhil, 1:00)
**Before recording:**
- Install APK 0.1.1 from www.alarsio.com/download on your Android phone. Manish sends you the supervisor login privately.
- Sign in before you press record. If you have no Android phone, record on Manish's phone.

**Do this:**
1. Say: "I'm Nikhil Mehta. Sites often have no signal, so let's turn the network off."
2. Turn on **airplane mode** → mark attendance at Jankipuram Shop Complex → show it is **waiting to send**.
3. Turn airplane mode **off** → show it **syncs once**. On the website, refresh: there is one entry, not two.
   > "Nothing is lost and nothing is sent twice."
4. Optional, if there's time: on the website, signed in as the person who recorded the day, try to approve it. It is **blocked**: "a day you recorded must be reviewed by someone else."

## S4: Built from feedback (Nikhil, 2:00)
**Only things a partner really asked for before we built them.** Every item must also be in the feedback log with the same date and words.
Claude fills this table from Manish's WhatsApp chats before you record:

| # | Who asked (partner, person) | When | Their words | What we changed | Shipped | Show on screen |
|---|---|---|---|---|---|---|
| 1 | Manchitra Architects, site team | 13 Nov | "Geolocation not capturing correctly, no fix button also" | Check-in now says why there is no location and gives a button to fix it | In app 0.1.1, live on /download 14 Nov (PR #225) | Phone: check in with location off → the message and the fix button |
| 2 | Manchitra Architects, site team | 13 Nov | "Sign in is not correctly working for supervisor, it goes to create organization not my invitation" | An invited supervisor is sent back to "Join the team" after signing in | 13 Nov (PR #227) | Web: the invite link → "Join the team" screen |
| 3 | Manchitra Architects | 13 Nov | Wants the app in Hindi, sign-in by mobile number, a WhatsApp day summary | Not built yet: planned | – | Say it; it also goes in Honest gaps |
| + | Buildbool / Abhinav | [date] | "[their words]" | [ ] | [ ] | Add when Manish sends their replies |

**Say it honestly. Item 2 we had already fixed the same morning, so don't claim we built it because they asked:**
> "On 13 November, Manchitra Architects' site team told us check-in was not capturing the location and there was no way to fix it. The new app version, 0.1.1, now tells the supervisor why and gives a fix button. They also hit a sign-in problem: an invited supervisor was sent to create a new company. We had found the same bug that morning; the fix was already live, and we asked them to update. They also asked for Hindi screens and mobile-number sign-in, which are planned next."

Then show items 1 and 2 on screen, 20–30 seconds each.

## S5: Real usage (Anuradha, 1:00)
**On screen:** www.alarsio.com/staff/usage, signed in as a staff account. Show only the 3 partner rows; blur names if a partner asked.
**Say:**
> "I'm Anuradha Tiwari. This is our team-only usage page. It shows counts only, no personal data. Manchitra Architects has used Alarsio since [date]: [n] attendance marks, [n] daily reports, [n] users active this month. Buildbool… Abhinav…"

Read the numbers from the screen; Claude checks them against the SQL first. If the page fails, show the SQL result screenshots.

## S6: Under the hood (Anuradha, 1:00)
**On screen:** a simple diagram:
```
Supervisor's Android app (offline outbox) ──sync──┐
Owner's browser ──► website on Vercel (Mumbai) ──► Supabase: database, login, photos
                                                    └── Resend: emails
```
**Say:**
> "The website is built with Next.js and runs on Vercel in Mumbai. The phone app is built with Expo. It saves every entry on the phone first, so it works with no internet. Data is stored in Supabase, a Postgres database. Security rules sit inside the database, so each company sees only its own data. Emails go through Resend. There is no AI inside the product today."

## S7: Honest gaps (Manish, 0:30)
**On screen:** the "Known limitations" list in the feature doc, or your webcam.
**Say (fill in the facts):**
> "Honest gaps. Our partners started recently, so we have [n] days of use, not months. We set up each partner in person ourselves. Partners want phone-number login, Hindi screens and a WhatsApp day summary; none of these is built yet. The app is Android only."

---

## Before you send your clip
- [ ] I said my name at the start of my first segment
- [ ] The address bar shows www.alarsio.com, or the phone is clearly the real app
- [ ] No password, email or phone number is visible
- [ ] The clip is within the time limit for my segment
- [ ] The file is MP4, named as in the table, and uploaded to Manish's Drive `clips` folder
