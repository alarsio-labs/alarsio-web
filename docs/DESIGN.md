# Design — the Alarsio look

**Owner:** Ishant (frontend and UI). This file decides how Alarsio looks. A PR that adds a
colour, a font size or a component that is not here updates this file in the same PR.

**Direction (v2, 29 Oct 2026): warm print editorial.** A site record is a printed thing:
a register, a slip, a stamped day. The landing page reads like one being printed as you
scroll. It replaces v1 (a Raken-like SaaS page), which is in git history.

Three committed colours plus one dark ground, heavy condensed display type against
wide-tracked mono furniture, 1.5 px ink borders, zero radii, and flat generated plates
(canvas) instead of photography or device mock-ups.

---

## 1 · Tokens

### Colour

| Token | Hex | Use | Contrast |
| :-- | :-- | :-- | :-- |
| `cream` | `#E7E2D8` | Page ground | — |
| `ink` | `#171717` | All text, borders, buttons | 13.89:1 on cream |
| `muted` | `#56524C` | Secondary text, captions | 6.01:1 on cream, 7.63:1 on paper |
| `red` | `#EF493C` | **Marks only on cream**: meters, the active cue border, rules, the wordmark. **Text only on `loam`**. | 4.62:1 on loam; 2.86:1 on cream, so never text there |
| `red-deep` | `#B92725` | Red **text** on cream or paper: role tags, printed values | 4.81:1 on cream, 6.11:1 on paper |
| `paper` | `#FFFDF8` | Cards, the artifact | — |
| `loam` | `#241A12` | The two dark stages, the footer | cream on it: 13.21:1 |
| `hair` | `rgb(23 23 23 / .16)` | Hairlines; `.08` for faint ones | — |

Red is rationed: never a red ground behind body text, never red body copy, never red text
on cream. Ink on a red button is 4.86:1 and allowed.

### Type

All three fonts are self-hosted with `next/font/google`; nothing is fetched when a page loads.

| Role | Font | Spec |
| :-- | :-- | :-- |
| Display | **Anton** | Uppercase, letter-spacing -.02em to -.045em, line height .86 |
| Body | **Inter** 400–700 | 16–18 px, line height 1.55 |
| Labels | **Martian Mono** 400 | 10.5 px, letter-spacing .18em, uppercase. Every label, caption, role tag, record id and status line |

Poster lines are sized from their own character count, never a bare `vw`:
`font-size: min(<clamp>, calc(92vw / (chars * .44)))` with `white-space: nowrap`.

### Shape and motion

- Radius **0** everywhere. Borders 1.5 px ink on paper elements, 1 px `hair` elsewhere.
- No shadows, no decorative gradients, no photography, no icon fonts.
- Easing `cubic-bezier(.22,1,.36,1)`; `cubic-bezier(.65,0,.35,1)` only for stage transitions.

---

## 2 · The landing page

Five pinned stages (a tall section with a `position: sticky` inner at `top: 0`, `100svh`,
`overflow: hidden`), then three normal bands. All motion is CSS custom properties on
`:root`, written by **one** rAF-coalesced, passive scroll handler. The CSS never knows
about JavaScript beyond those values.

Every claim is a row in `docs/FEATURES.md`. No customer names, ratings, prices or numbers
until the pilot produces real ones.

### Stage 1 · Poster hero (280svh, loam)

A full-bleed canvas of short red strokes drifting on sines of time and index, 5–19 % alpha:
a site grid seen from above. A two-line lockup: "SITE RECORDS WITH NO SIGNAL" above,
"ALARSIO" below in red at poster scale. Three separate variables: `--hero-type-y` 0 to
-90px, `--hero-type-scale` 1 to .74, `--hero-type-alpha` 1 to 0. Mono metadata across the
bottom (Offline first · 2 to 20 sites · Android and web · For Indian contractors), fading
on page progress. Check each poster line's `scrollWidth` against its `clientWidth`.

### Stage 2 · Clip-wipe manifesto (260svh, cream)

One sentence, clamp(34px, 5.6vw, 78px) over 16ch: "Every attendance, report and bag of
cement, captured with no signal and trusted at wage time." The base is 34 % ink; an exact
`aria-hidden` duplicate in full ink sits in the same box, clipped by
`inset(calc(100% - var(--manifesto-wipe)) 0 0)`; `--manifesto-wipe` runs 0 % to 100 %.
`--manifesto-scale` 1 to 1.05. The duplicate's rect matches the base to 0 px on all edges.

### Stage 3 · Horizontal rail (340svh, cream)

Heading "One phone. Six records." and a mono hint. Six paper cards in a non-wrapping row,
`flex: 0 0 clamp(230px, 26vw, 330px)`, 1.5 px ink border, a generated plate at 3/4, an Anton
title, a mono type line and a `red-deep` role tag where the reference had a price:
Check in · Day register · Daily report · Materials · Overview · Wage summary. The row
translates by `-progress × (track.scrollWidth − innerWidth)`, so the last card lands flush.
A hairline meter with a red fill beneath.

### Stage 4 · The day record (420svh, loam)

Copy left, artifact right (stacked on phones). The artifact is a paper slip at 3/4: a mono
header ("Day record · Baner Residency, Tower A"), a big Anton line, a generated site plate,
three mono rows (record id, server, approved). Six variables: `--packet-alpha`,
`--packet-enter` (translateY from 38px), `--packet-scale` (.78 to 1), `--packet-cut` (0 to 1),
`--packet-meter`, `--packet-copy-x`. A phase index from progress (0–3); **only when it
changes**: light the four cues cumulatively (Checked in inside the geofence · Everyone
present, two exceptions · Report filed · Day approved), swap the status line (the app's own
words: "Saved on this phone, waiting to send" → "Sending…" → "On the server" → "Approved,
ready for wages"), and fill the rows; "Server" reads "pending" until phase 1. A dashed 2 px
ink perforation opens on `--packet-cut` at the end: the approved day tears off to wages.
Never write DOM text on every frame.

### Stage 5 · Wage period band (300svh, cream)

Content bottom-aligned. A canvas of 22 stacked contour lines (sine plus a slower harmonic,
every fifth line red), parallaxed on `--season-y` -4 % to 4 % and `--season-scale` 1.10 to
1.055. Headline "From approved days to wages you can explain." Three chapters in a row at .3
opacity, exactly one at full opacity by `floor(progress × 3)`: 01 Approve · 02 Calculate ·
03 Lock and export.

### After the pins

1. **Who does what**: a ruled table, Role · Records · Sees, one row per role.
2. **FAQ**: native `<details>` rows.
3. **Footer** on loam: "Run 2 to 20 sites? Join the pilot." Join the pilot goes to
   `/sign-up` (the existing owner sign-up; the page collects nothing). Sign in. Copyright.

A slim fixed header on cream: the wordmark (one word part in red; a logo is exempt from
contrast) and Sign in / Join the pilot.

### Per-word and per-atom motion

Every headline, lede and statement is split at render time into word spans that rise .42em
and fade in on a 38 ms stagger. Every card, card title, meta, role tag, table row, cue,
artifact row, chapter, FAQ row, metadata item, button and footer line carries `data-rev`
with `--d` = 40–100 ms × its index. One IntersectionObserver at threshold .12 reveals them
and unobserves on entry.

---

## 2b · Sign in, sign up, check email

Same tokens and fonts (`app/fonts.ts`, `landing.css`), laid out in `app/(auth)/layout.tsx`: a loam
panel with the drifting site-grid canvas, the wordmark, "Site records with no signal" and the hero's
mono metadata, beside the form on cream. On phones the panel is a band above the form, without the
metadata. The form pieces are in `components/v2-form.tsx` (styles `app/v2-form.css`): a mono eyebrow and an Anton title, mono labels,
48 px paper inputs with a 1.5 px ink border and zero radius, a full-width ink button, an error notice
with a red left rule (`role="alert"`), and a hairline-ruled foot for the other link. These pages and
the dashboard use them; the other app pages keep `components/form.tsx` for now.

## 2c · Dashboard

`app/(app)/dashboard`: the shared app header (2e: wordmark, the signed-in email, Sign out), a loam band with
the site-grid canvas and "Your organisations", then one paper card per organisation: its name in Anton,
the member's role as a `red-deep` mono tag, and a ruled grid of page links (mono label, one-line note,
→), one column on phones and up to four on desktop. Which links a role sees comes from
`lib/dashboard/links.ts` and is unchanged from before the restyle (`links.test.ts`). With no
organisation, the band reads "Create your organisation" and the v2 form takes its place. The form
pieces (`components/v2-form.tsx`, `app/v2-form.css`) are shared with the sign-in pages.

## 2d · Stepper

`components/v2-stepper.tsx` (styles in `app/v2-form.css`), after the AnimatedStepper pattern but native:
no animation library and no icon set. Square 44 px numbered indicators (the active one with a red
border, done ones ink with a drawn check) joined by a hairline meter with a red fill; the new step
slides 20 px in from the side it comes from; the container eases to each step's height. Continue checks
only the current step's fields; an indicator jumps back to any step already reached. It sits inside
one real `<form>`, every step stays in the DOM so its fields submit, and without JavaScript all steps
show one under another with the submit button. Focus moves to the new step's heading and a polite live
region names it. Used by Create organisation (name, where you work, check and create).

## 2e · The other app pages

Every signed-in page sits in `app/(app)/layout.tsx`: the v2 header (wordmark to the dashboard, the
signed-in email, Sign out) over the cream ground. The pages keep their markup; `app/(app)/app.css`
restyles them from one place. Inside `.app`, Tailwind's neutral scale, `white` and every radius point at
v2 values (warm ink and stone, paper, zero), each text step checked AA on cream, paper and the light
fills. Unlayered base rules set `h1` and `h2` in Anton and table headers in mono, give the "← back"
links (`app-back`) a mono label and a 44 px target, and give the pages' own ink buttons the v2 label.
`components/form.tsx` (Field, inputClass, buttonClass, Notice) now draws the v2 pieces, so every form
changed with it. `buttonClass` is full width as a Tailwind class so `sm:w-auto` can narrow it; a button
beside a field uses `buttonBase`, because a plain `w-auto` loses to `w-full`. The invite page moved to
`app/(auth)/invite/[token]` (same URL) to use the sign-in layout.

**Responsive and touch.** Checked at 320, 375, 768, 1024 and 1440 px on every page: no page scrolls
sideways (wide tables scroll inside their own box). Every control is at least 44 px to tap:
stand-alone text links get 12 px of tap area above and below (cancelled by a negative margin, so the
layout does not move), checkboxes are 20 px inside a 44 px label, the file picker is a v2 button, and
every button on an app page has a 44 px minimum (`v2-form.css`, `app.css`).

**Width.** List and table pages (overview, reports, attendance, workers, materials, sites, wages) use up
to 1024 px (`max-w-5xl`); forms and detail pages stay at 576 to 768 px, because long input lines are
harder to read. **Wide tables** scroll inside their own box with the first column pinned (`position:
sticky`, its own ground and a 1 px line on its right edge), so a row's name or code stays in view.

## 3 · Rules

- **Reduced motion and no JavaScript get the same page, still.** Motion styles apply only
  under `html.lp-motion`, which the script sets when `prefers-reduced-motion` is not
  `reduce`. Without it: stages are normal height, nothing is pinned, the rail wraps and
  centres, the manifesto is full ink, the artifact shows its final printed state, every
  chapter is at full opacity, canvases draw one still frame, and every reveal is visible.
- **Accessibility.** One `h1`. Text stays real text; word spans are inline. Canvases and the
  manifesto duplicate are `aria-hidden`. Focus outline 2 px ink (cream on loam), 2 px offset.
  Tap targets at least 48 px. Every text pair in section 1 passes AA.
- **Performance.** No third-party scripts or trackers. Canvases pause when off screen and
  when the tab is hidden, and draw at most at device pixel ratio 2. Target Lighthouse 90+ on
  mobile.
- **Phone first.** Check 375 px. No horizontal page scroll; check each poster line too.
- **English only** in the MVP. **No dark mode** in the MVP.
- **The app's own screens.** Sign in, sign up, check email and the dashboard use these tokens
  (sections 2b to 2d), and so does every module page, through the theme layer in
  `app/(app)/app.css` (section 2e). Section 4 is the proposed fuller version for the module pages.

---

## 4 · App screens

**Status: Accepted** (Ishant, 30 Oct 2026). Proposed by Manish on 29 Oct; of the UI options, the
**"Warm print, calm"** direction was chosen. This section is the target for the working screens. Until
each module's PR lands, section 2e's theme layer keeps the not-yet-moved pages in the tokens.

What the decision settled, where the earlier draft or section 2e differed:
- the top bar carries the organisation name and role, with a row of module tabs under it (below);
- status tags are ink, `red-deep` or muted (no green or amber);
- page titles are Anton at 56 px on desktop and 35 px on a phone; card titles about 26 px;
- buttons and tabs are at least **44 px** tall on these screens (section 3's 48 px stays for the landing);
- mono labels are 11 px on these screens.

The app has two kinds of page:
- **Entry pages:** sign in, sign up, check email, and the dashboard. They are the brand's front
  door, and they keep the fuller look of sections 2b to 2d.
- **Working screens:** every module page (Overview, Attendance, Reports, Sites, Materials, Workers,
  Wages, Team, Export). These are the forms and dense tables that people use for an hour, so they
  use the same tokens in a **calmer** form.

### What carries over, and what does not

| | Landing | Entry pages | Working screens |
| :-- | :-- | :-- | :-- |
| Ground | cream, loam stages | cream, plus one loam band with the site-grid canvas | cream page, `paper` for cards, forms and tables. No loam |
| Display | Anton at poster scale | Anton titles and organisation names | Anton for the page title (`h1`, 56 px desktop, 35 px phone), card titles (26 px) and big numbers. Never in tables |
| Body and tables | Inter | Inter | Inter 15 px. Numbers use `tabular-nums` |
| Mono labels | Martian Mono | form labels, eyebrows, role tags | 11 px uppercase: form labels, tabs, buttons, statuses, table headers, the eyebrow ("THU 30 OCT · ASIA/KOLKATA") |
| Shape | radius 0, 1.5 px ink | the same | the same |
| Motion | pinned stages, word reveals | the canvas drift and the stepper (2d) | **none** beyond a 150 ms colour change on hover and focus |
| Red | marks; text only on loam | the same | marks only (the square before an alert label, the notice rule, the wordmark). Red **text** is `red-deep`, only for a state that needs action. Never a red button |

All motion follows section 3: none under reduced motion, and the page works without JavaScript.

### The frame

Every working screen gets a top bar on cream, on one line at every width:
- **Left:** the wordmark, which links to `/dashboard`.
- **Then:** the organisation name and the role in mono, linking to `/dashboard` to change
  organisation. On a phone the name shortens with an ellipsis and the role is hidden.
- **Right:** Sign out, an outline button.

Under it, a row of **module tabs** for the user's role in that organisation. The current tab is ink
with paper text. Below 768 px the tabs fold into a **Menu** button that opens a native `<details>`
list, so it works without JavaScript. No sidebar, no bottom bar, and no sideways page scroll at 375 px.

**Which links a role sees:** the top bar and the dashboard read one list, `lib/dashboard/links.ts`
(tested by `links.test.ts`), so they cannot disagree. It matches what each page already allows.
RLS stays the boundary; a hidden link is only a convenience.

| Link | owner | project_manager | accountant | supervisor |
| :-- | :-: | :-: | :-: | :-: |
| Overview | ✓ | ✓ | | |
| Attendance | ✓ | ✓ | | |
| Daily reports | ✓ | ✓ | | ✓ |
| Sites | ✓ | ✓ | | |
| Materials | ✓ | ✓ | | |
| Workers | ✓ | ✓ | ✓ | |
| Wages | ✓ | | ✓ | |
| Team | ✓ | | | |
| Export | ✓ | | | |

Export is not in `links.ts` yet; #135 adds it.

### Home after sign-in

| Memberships | Where the user lands |
| :-- | :-- |
| None | the dashboard's Create organisation stepper (2c, 2d) |
| One | the home for their role, below |
| Several | the dashboard hub (2c), one card per organisation |

The home for each role:

| Role | Home |
| :-- | :-- |
| owner, project_manager | `/overview` |
| accountant | `/wages` |
| supervisor | `/reports`, with one line saying that capture is on the phone app |

The dashboard stays reachable from the wordmark and from the organisation name in the top bar. No
cookie or table is needed.

### Components

The pieces are in `components/app/` (styles in `app/v2-app.css`): `AppTopBar`, `ModuleTabs`,
`PageHead`, `StatCard`, `Card`, `DataTable`, `StatusTag`, `Button` / `ButtonLink` and `Notice` (the
v2 one from `components/v2-form.tsx`). Fields stay in `v2-form.tsx`. `components/form.tsx` is retired
once no page imports it. A screen uses these pieces and does not restyle them.

- **Button.** Primary: ink ground, cream mono text (full width in a form, as in `v2-form.tsx`).
  Secondary: an ink outline. Text link: ink, underlined. Height at least 44 px. A destructive action (archive, lock, reopen, send back) uses the same styles
  **plus** its existing confirm step. There is no red button.
- **Field.** As in `v2-form.tsx`: a mono label above a 48 px paper input with a 1.5 px ink border
  and radius 0. Help and error text sit under the input. The error text is `red-deep`, and the
  input gets a red border.
- **Notice.** As in `v2-form.tsx`: paper, a 1.5 px ink border with a 4 px left rule, ink text.
  - **Error:** the left rule is red, `role="alert"`.
  - **Info:** the left rule stays ink, `role="status"`.
- **Status tag.** Mono 11 px uppercase in a 1 px box, using the app's own words. Three tones
  (`lib/app/status.ts`): a state that asks someone to act (needs approval, needs attention, sent
  back, rejected, flagged, no rate, low stock) is `red-deep`; a settled state (approved, filed) is
  ink; a state where nothing has happened yet (draft, none, not started, not filed) is muted. The
  word carries the meaning, so there is no green or amber.
- **Stat card.** A mono label and an Anton number. "To approve" and "Low stock" turn `red-deep`,
  with the red square before the label, only when the number is above 0.
- **Table.** Paper, a mono header row, `hair` row lines, numbers right-aligned. On a narrow
  screen the table scrolls sideways inside its own box with the first column fixed, and the
  page itself never scrolls sideways (#138 is the first case). There are no card layouts on
  phones.
- **Card.** Paper, 1.5 px ink border, no shadow, as the dashboard's organisation cards. Used for
  an overview site row, a summary tile and a form panel.
- **Empty state.** One sentence saying what is missing and the one action that fills it.

### Rules

- **Accessibility.** Section 3's accessibility rules apply: AA on every text pair, focus
  outline 2 px ink at 2 px offset, and tap targets of at least 44 px. Every table header is a
  `<th scope>`, and the first cell of a row is its `<th scope="row">`.
- **Data.** A screen shows only data that already exists, read as the signed-in user under RLS.
  On the Overview: "Headcount reported" sums `daily_report_status.headcount` (no published view
  gives live presence for a day not yet approved); the "Supervisor" column is left out until Sites
  publishes a view of its assignments (ADR-041 reads published views only).
- **Phone.** Check every page at 375 px.
- **No new colour.** Any colour or size not in section 1 updates this file in the same PR.
- **Out of scope here:**
  - the phone app (its own decision after the pilot, with outdoor contrast checked);
  - dark mode;
  - motion on working screens.

### Order of work

Each step is a separate PR, reviewed by Ishant:
1. **Components** in `components/app/`, with tests. No page changes.
2. **The frame and the home redirect** (with #135 and #140).
3. **One PR per module** moving its pages to the components: Overview, Attendance, Reports,
   Sites, Materials, Workers, Wages, Team and Export.
