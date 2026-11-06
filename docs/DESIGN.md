# Design — the Alarsio look

**Owner:** Ishant (frontend and UI). This file decides how Alarsio looks. A PR that adds a
colour, a font size or a component that is not here updates this file in the same PR.

**Direction (v2, 29 Oct 2026): warm print editorial.** A site record is a printed thing:
a register, a slip, a stamped day. The landing page reads like one being printed as you
scroll. It replaces v1 (a Raken-like SaaS page), which is in git history. The print look is for the
landing page and the sign-in pages only; every signed-in page uses the app console in section 4.

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

A full-bleed canvas of short red strokes angled on sines of index, 5–19 % alpha, drawn once (still):
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
panel with the still site-grid canvas, the wordmark, "Site records with no signal" and the hero's
mono metadata, beside the form on cream. On phones the panel is a band above the form, without the
metadata. The form pieces are in `components/v2-form.tsx` (styles `app/v2-form.css`): a mono eyebrow and an Anton title, mono labels,
48 px paper inputs with a 1.5 px ink border and zero radius, a full-width ink button, an error notice
with a red left rule (`role="alert"`), and a hairline-ruled foot for the other link. These pages and
the dashboard use them; the other app pages keep `components/form.tsx` for now.

The auth pages also carry the password pieces: `components/password-input.tsx` (a field with a
Show/Hide button, 48 px) and the "Forgot password?" link, and the sign-up page has the required
terms checkbox in a 48 px row.

## 2b-i · Info pages

The public pages (landing, About, Contact, Privacy, Terms, 404, error) share one frame, in
`components/site/public-frame.tsx`:

- **Header.** The same `Wordmark` and `HeadActions` on every page. There is one call to action,
  "Join the pilot" (`CTA.primary` in `lib/landing/content.ts`), and "Sign in" beside it. "Sign in" stays
  visible on phones, as a text link, and the three fit on one row down to 320 px. Both keep a 48 px tap
  target on phones. The landing page keeps its own section nav and footer CTA.
- **Footer.** `SiteFooter` on every info page.
- **Skip link.** "Skip to content" is the first thing Tab reaches on every page (`app/layout.tsx`,
  styles in `globals.css`). It jumps to `#main`, which is the `<main>` of the page, or the wrapper around
  the page in the signed-in app.
- **Missing and broken pages.** `app/not-found.tsx` (status 404, with Home, Dashboard and a contact
  link), `app/error.tsx` (Try again, Home, a contact link; it shows no error text) and
  `app/global-error.tsx` (own `<html>`, inline styles in cream, ink and red).
- **Titles.** Every page has a title through the `"%s | Alarsio"` template; the signed-in pages use a
  short static title.

## 2c · Dashboard

`app/(app)/dashboard`, in the app console (section 4): the top bar alone (no organisation is chosen yet, so
no sidebar), a PageHead "Your organisations", then one white card per organisation: a lettered avatar, its
name, the member's role as a muted pill, and a grid of link tiles (icon, label, one-line note, →), one
column on phones and up to four on desktop. Which links a role sees comes from `lib/dashboard/links.ts`
(`links.test.ts`). With no organisation, the head reads "Create your organisation" and the stepper (2d)
sits in a card. The form pieces (`components/v2-form.tsx`) are shared with the sign-in pages and restyled
inside `.app` by `app/(app)/console.css`.

## 2d · Stepper

`components/v2-stepper.tsx` (styles in `app/v2-form.css`), after the AnimatedStepper pattern but native:
no animation library and no icon set. Square 44 px numbered indicators (the active one with a red
border, done ones ink with a drawn check) joined by a hairline meter with a red fill; the new step
slides 20 px in from the side it comes from; the container eases to each step's height. Continue checks
only the current step's fields; an indicator jumps back to any step already reached. It sits inside
one real `<form>`, every step stays in the DOM so its fields submit, and without JavaScript all steps
show one under another with the submit button. Focus moves to the new step's heading and a polite live
region names it. Used by Create organisation (name, where you work, check and create).

Inside the app console the indicators are 32 px circles and the meter is ink (console.css); the sign-in
pages are unchanged.

## 2e · The other app pages

Every signed-in page sits in `app/(app)/layout.tsx` and draws in the app console (section 4). The pages
keep their markup; `app/(app)/console.css` styles them from one place. Inside `.app` the landing tokens are
redefined to the console's, Tailwind's neutral scale and radii point at cool greys and real corners, and
`h1`, `h2`, table headers and the `lp-*` / `au-*` classes the pages still use draw in Inter. `buttonClass`
in `components/form.tsx` is still full width as a Tailwind class so `sm:w-auto` can narrow it; a button
beside a field uses `buttonBase`.

**Responsive and touch.** No page scrolls sideways at 375 px (checked 6 Nov with the console); wide tables
scroll inside their own card with the first column pinned. Controls are 36–38 px with a mouse and at least
44 px on a touch screen (`@media (pointer: coarse)`).

**Width.** List and table pages (`max-w-6xl`) use up to 1240 px; forms and detail pages keep 576 to 768 px,
because long input lines are harder to read. In the console every page sits at the left of the content
area, not centred in it.

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
- **The app's own screens.** Sign in, sign up and check email use these tokens (section 2b).
  Every signed-in page, the dashboard included, uses the app console in section 4 instead.

---

## 4 · App screens: the app console (v3)

**Status: Accepted by Ishant, 6 Nov 2026, under the deadline override in CLAUDE.md. Manish to confirm
after 15 Nov.** It replaces "Warm print, calm" (proposed by Manish 29 Oct, accepted 30 Oct), which is in
git history. Why: the working screens are used for hours, by owners comparing us with the SaaS tools they
already use. The print look (Anton titles, uppercase mono, 1.5 px black borders, zero radius) read as the
landing page, not as a product. The landing page and the sign-in pages keep the print look (sections 1 to
2b); every signed-in page uses this console.

### Tokens (scoped to `.app`, in `app/(app)/console.css`)

| Token | Value | Use | Contrast |
| :-- | :-- | :-- | :-- |
| `--cream` (page) | `#F7F8FA` | Page ground | — |
| `--paper` | `#FFFFFF` | Cards, tables, sidebar, top bar, inputs | — |
| `--ink` | `#18181B` | Text, primary buttons, focus ring | 17.7:1 on white |
| `--muted` | `#52525B` | Secondary text | 7.7:1 on white |
| `--faint` | `#71717A` | Labels, eyebrows, table headers | 4.8:1 on white, 4.5:1 on the page |
| `--hair` / `--hair-faint` | `#E4E4E7` / `#F0F0F2` | Borders / row lines | — |
| `--line-strong` | `#D4D4D8` | Input and secondary-button borders | — |
| `--red` | `#EF493C` | Marks only: the wordmark and the current module's bar | never text |
| `--red-deep` | `#B42318` | Error text and the error notice's rule | 6.5:1 on white |

- **Type:** Inter only, 14 px body, `tabular-nums` for numbers. Page title 22 px (26 px from 768 px),
  semibold; card title 15 px; stat value 28 px. No Anton and no uppercase mono inside the app.
- **Shape:** radius 8 px on cards, 6 px on controls; borders 1 px; shadow `0 1px 2px rgb(16 24 40 / .05)`.
- **Motion:** none beyond a 150 ms colour change on hover; none at all under reduced motion.
- **Focus:** 2 px ink outline at 2 px offset; inputs show an ink border and a 3 px soft ring.

### The frame

`components/app/app-frame.tsx` in the `(app)` layout. The layout reads the memberships once; the frame
takes the organisation from the page's `?org=` (a layout cannot read the query string).

- **Sidebar (1024 px and wider), 248 px, fixed:** the wordmark (red mark), the organisation switcher
  (lettered avatar, name, role, chevrons; links to `/dashboard`), the module list (`SidebarNav`: an inline
  SVG icon from `nav-icon.tsx` and the label; the current one has a grey ground and a 3 px red bar), and at
  the bottom the signed-in email and Sign out.
- **Top bar, sticky, 56 px:** the breadcrumb (organisation / current module, from `activeLink()` in
  `lib/app/nav.ts`). Under 1024 px it also carries the wordmark and a **Menu** button: a native `<details>`
  that opens the switcher, the modules and Sign out, so it works without JavaScript.
- **No `?org=`** (the dashboard hub): no sidebar; the bar carries the wordmark, the email and Sign out.
- No bottom bar, and no sideways page scroll at 375 px.

**Which links a role sees:** the sidebar, the menu and the dashboard read one list, `lib/dashboard/links.ts`
(tested by `links.test.ts`). RLS stays the boundary; a hidden link is only a convenience.

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

### Home after sign-in

| Memberships | Where the user lands |
| :-- | :-- |
| None | the dashboard's Create organisation stepper (2c, 2d) |
| One | the home for their role: owner and project_manager `/overview`, accountant `/wages`, supervisor `/reports` |
| Several | the dashboard hub (2c), one card per organisation |

`homeFor()` in `lib/dashboard/memberships.ts` decides it, and the dashboard redirects.

### Components

In `components/app/`: `AppFrame`, `AppTopBar` (with `Brand`, `OrgSwitch`, `SignOutButton`), `SidebarNav`,
`Icon`, `PageHead`, `StatCard`, `Card`, `DataTable`, `StatusTag`, `Button` / `ButtonLink` and `Notice`.
Fields stay in `v2-form.tsx`. A screen uses these pieces and does not restyle them.

- **Button.** Primary: ink ground, white text. Secondary: white with a grey border. 38 px (44 px on touch),
  6 px radius, 14 px medium. There is no red button; a destructive action (archive, lock, reopen, send
  back) keeps its existing confirm step.
- **Field.** A 13 px medium label above a 38 px white input with a grey border and 6 px radius. Help text
  12 px under it; an error makes the border `red-deep`.
- **Notice.** A soft ground with a 3 px left rule: error is red (`role="alert"`), information blue
  (`role="status"`).
- **Status tag.** A soft pill with a dot, in the app's own words. Three tones (`lib/app/status.ts`): a state
  that asks someone to act (needs approval, sent back, rejected, flagged, no rate, low stock) is **amber**;
  a settled state (approved, filed) is **green**; nothing yet (draft, none, not started, not filed) is
  **grey**. The word still carries the meaning.
- **Stat card.** A 13 px label and a 28 px number. "To approve" and "Low stock" turn amber, with a dot
  before the label, only when the number is above 0.
- **Card.** White, 1 px border, 8 px radius, the faint shadow; a title row with a divider. A table that is
  the card's only child runs edge to edge.
- **Table.** A `#FAFAFA` header row in 12 px medium grey, hairline row lines, row hover, numbers right-aligned.
  On a narrow screen it scrolls inside its card with the first column pinned. No card layouts on phones.
- **Empty state.** One sentence saying what is missing and the one action that fills it.

### Rules

- **Accessibility.** Section 3 applies: AA on every text pair, a visible focus ring, 44 px targets on
  touch. Every table header is a `<th scope>`, and the first cell of a row is its `<th scope="row">`.
  Icons are `aria-hidden`; the label beside each one carries the meaning.
- **Data.** A screen shows only data that already exists, read as the signed-in user under RLS (ADR-041:
  published views only). The Overview's "Headcount reported" sums `daily_report_status.headcount`.
- **Phone.** Check every page at 375 px.
- **No new colour.** Any colour or size not in this section updates this file in the same PR.
- **Out of scope:** the phone app (its own decision after the pilot), dark mode, motion.
