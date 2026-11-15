# Anuradha: your tasks today (15 Nov). Everything done by 6 PM

Manish is recording the video and Nikhil owns the feedback log and pricing doc. You own the **usage evidence** for our 3 design partners, the **partner folders**, and your 2 video clips.
Files are in the `Alarsio_Phase2` Drive folder. The public guides are in the repo under `docs/phase2/`.

## Rules (important: faculty will phone partners)
- Use **real numbers only**, straight from the database. Never type numbers in by hand.
- **Never show emails, phone numbers or passwords** on screen or in screenshots. Blur a name if a partner asks.
- Leave out the test org (Audit Test Co) and the demo org (Sharma Constructions (Demo)). They are not partners.

---

## Task 1: Usage evidence for the 3 partners (by 12:30 PM)
Partners: **Manchitra Architects**, **Buildbool Construction Pvt Ltd**, **Abhinav Constructions & Arts**.

**A. Your usage page (`/staff/usage`, PR #232)**
1. Check the migration is on production. In the repo, run `supabase db push --dry-run`.
   - If it lists `20261104100000_staff_usage.sql`, run `supabase db push`, then the dry run again; it must say "up to date".
   - Follow `docs/DEPLOY.md`: run it at a quiet moment.
2. Add yourself and Manish as staff. In the Supabase SQL editor, run this once per person, using your own login email:
   ```sql
   insert into public.staff_members (user_id, added_by)
   select id, 'anuradha' from auth.users where email = '<login email>';
   ```
3. Open www.alarsio.com/staff/usage. Screenshot each partner's row, one image per partner.
4. Check that a non-staff account gets the 404 page.

**B. The hand-run SQL (backup and cross-check)**
1. In the SQL editor, run queries 1, 2 and 3 from `03_Design_Partners/usage-by-org.sql` (also at `docs/phase2/03_Design_Partners/usage-by-org.sql`).
2. Screenshot each result.

**C. Compare A and B for each partner:** the account date, attendance marks, daily reports, material entries and the weekly counts must match.
- If they don't, note which numbers differ and tell Manish before 1 PM.
- Check that Manchitra's activity starts around **6 Nov**, the date in their confirmation letter. If the account date is later, tell Manish so we describe it honestly.

**D. Save** into each partner's Drive folder, `03_Design_Partners/<Company>/`:
- `usage-staff-page.png`
- `usage-sql.png` (queries 1 and 2 for that partner)

## Task 2: Partner folders (by 4 PM)
Each partner folder needs exactly 3 files:
| Folder | confirmation | usage-staff-page.png | usage-sql.png |
|---|---|---|---|
| `Manchitra_Architects` | Email PDF from Manish (received 13 Nov) | you | you |
| `Buildbool_Construction` | From Manish when it arrives | you | you |
| `Abhinav_Constructions_Arts` | From Manish when it arrives | you | you |

Each confirmation must show: name, role, business, city, start date, how they use it, "not a relative or friend", and a phone number or email faculty can use. If something is missing, tell Manish.

## Task 3: Your video clips (by 1:30 PM)
Script and click path: `01_Demo_Video/RECORDING-GUIDE.md`.
- **S5, real usage (1 min):** show www.alarsio.com/staff/usage with only the 3 partner rows. Read the numbers from the screen, after checking them in Task 1. If the page fails, show the SQL screenshots.
- **S6, under the hood (1 min):** show the simple diagram (it's in the guide) and say the architecture lines from the script. Say that there is no AI in the product.
- Start with "I'm Anuradha Tiwari". Record MP4 at 1080p. No emails or passwords on screen. Upload `S5_Anuradha.mp4` and `S6_Anuradha.mp4` to Manish's Drive folder `clips`.

## Task 4: Final check (5–7 PM)
- [ ] The feature table in `02_MVP_Access/feature-doc` matches what the video shows
- [ ] Every partner folder has its 3 files
- [ ] Watch the full edited video once and tell Manish about any mistake

## Send Manish when done
- [ ] The 6 usage screenshots in the partner folders, plus the comparison result (match, or what differs)
- [ ] S5 and S6 clips in `clips`
- [ ] Final check done
