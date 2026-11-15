# Alarsio Phase 2: the team guide (Manish, Nikhil, Anuradha)

**Due:** Sat 15 Nov 2026, 11:59 PM IST. **Our target:** submit by 9 PM.
**What we hand in:** one Google Drive folder, `Alarsio_Phase2`, shared with our mentor (view access), plus the form link.
**After that:** a 20-minute live review. We demo from www.alarsio.com, then the mentor uses our test login.

---

## 1. The 6 deliverables: what, who, status

| # | Deliverable | What the guide wants | Owner | Status |
|---|---|---|---|---|
| 1 | Demo video | One unlisted YouTube video, up to 10 min. Live product with the URL bar visible, a real phone, realistic data. Every member speaks and says their name. | All 3 (Claude edits) | Recording today |
| 2 | MVP access and feature doc | Live link, test login with sample data, a 3-task "Try this" script, repo link, a 1–2 page feature doc | Manish | Ready: test login seeded, Try-this passed 13 Nov, feature doc written |
| 3 | Design partners | 3 partners. Each one: written confirmation plus usage evidence (account date, active users, records, weekly activity) | Manish | Manchitra ✅ confirmation; Buildbool and Abhinav pending; usage screenshots pending |
| 4 | Feedback log | Google Sheet, newest first, 2+ rows per partner, evidence link for each Shipped row | Manish sends chats; Claude fills | Waiting for WhatsApp chats |
| 5 | Pricing attempt | A named monthly ₹ price to the person who decides spending. A 2–3 page write-up of their words and objections | Manish sends chats; Claude writes | Waiting for WhatsApp chats |
| 6 | Post-mortem | One page, with names, numbers, quotes and dates | Claude drafts; all 3 check | Tonight |

**Our 3 design partners**
1. Manchitra Architects, Lucknow: the owner, since 6 Nov 2026. Confirmation by email, 13 Nov.
2. Buildbool Construction Pvt Ltd: [owner, city, start date, confirmation].
3. Abhinav Constructions & Arts: [owner, city, start date, confirmation].

---

## 2. Who does what

### Manish
- **Usage evidence**, in this order:
  1. Run `supabase db push --dry-run`, and push if `staff_usage` is listed.
  2. Add yourself to `staff_members`.
  3. Screenshot `/staff/usage`.
  4. Run the hand SQL (`03_Design_Partners/usage-by-org.sql`, queries 1–3) and screenshot each result.
  5. Save both into each partner's folder.
- **Send Claude:** the pricing WhatsApp chat, the feedback chats, and the partner 2–3 details and confirmations.
- **Record video segments** S1 (problem), S2 (core workflow, one take) and S7 (honest gaps).
- **Evening:** upload the video to YouTube (Unlisted), build the Drive folder, fill the README passwords and links, share with the mentor, submit the form.

### Nikhil
- Install APK 0.1.1 on your Android phone from www.alarsio.com/download. Sign in as the demo supervisor; Manish sends the login privately.
- **Record video segments** S3 (when things go wrong) and S4 (built from feedback).
- **Evening:** read the post-mortem and the video before we submit.

### Anuradha
- Prepare the architecture diagram for S6.
- **Record video segments** S5 (real usage, from the usage page you built) and S6 (under the hood).
- **Evening:** check the feedback log against the WhatsApp chats.

### Claude
- Edit the 7 clips into one video.
- Fill the feedback log, write the pricing doc, finish the feature doc's "Used by / Requested by" column, draft the post-mortem.
- Compare `/staff/usage` with the hand SQL.

---

## 3. Today's timeline

| Time | Manish | Nikhil | Anuradha |
|---|---|---|---|
| Now–11:30 | Usage setup and screenshots; send Claude the chats and partner details | Install the APK, sign in, read RECORDING-GUIDE | Read RECORDING-GUIDE, prepare the diagram |
| 11:30–13:30 | Record S1, S2, S7 | Record S3; S4 after Claude sends the feedback items | Record S5, S6 |
| 13:30 | Everyone uploads their clips to Manish's Drive folder `clips` | | |
| 14:00–17:00 | Claude edits the video and writes the docs | Review the post-mortem draft | Review the feedback log |
| 17:00–19:00 | YouTube upload (Unlisted), check in incognito | Watch the full video | Watch the full video |
| 19:00–21:00 | Drive folder, share, submit the form | Final check | Final check |

---

## 4. Rules (they protect our grade)
- **Real only:** no invented partners, dates, quotes or numbers. Faculty will phone at least one partner.
- **Partners** must not be relatives or friends of any of us.
- **Something done by hand behind the scenes is fine; we say so in Honest gaps.** Hiding it costs more than admitting it.
- **Passwords** go only in the README for the mentor, never in the video or on public pages.
- **Don't post about the college submission publicly.** Alarsio is presented as a startup.

---

## 5. Drive folder structure
```
Alarsio_Phase2/
├── 00_README              team, product, all links, test login
├── 01_Demo_Video          YouTube link
├── 02_MVP_Access          live link, test login, Try-this, repo link, feature doc
├── 03_Design_Partners/
│   ├── Manchitra_Architects/       confirmation.pdf, usage-staff-page.png, usage-sql.png
│   ├── Buildbool_Construction/     same 3 files
│   └── Abhinav_Constructions_Arts/ same 3 files
├── 04_Feedback_Log        Google Sheet
├── 05_Pricing_Attempt     pricing doc + WhatsApp screenshots
└── 06_Postmortem          one page
```

---

## 6. Final submission checklist (tick only with proof)
- [ ] The video opens in a fresh incognito window with no access request
- [ ] It was recorded on the live product, and Manish, Nikhil and Anuradha each present and say their name
- [ ] Live link and test login work in incognito (Try-this passed 13 Nov)
- [ ] Someone outside the team has tried the Try-this script
- [ ] Mentor has read access to the repo (public ✅)
- [ ] The feature table matches what the video shows
- [ ] 3 partner confirmations, each with usage evidence
- [ ] Every partner is independent of every team member
- [ ] Feedback log: 2+ rows per partner, evidence for every Shipped row
- [ ] Pricing doc: the exact monthly price and objections in their words
- [ ] Post-mortem fits on one page
- [ ] Folder link submitted through the form before 11:59 PM
