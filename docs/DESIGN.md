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

- Radius **0** on the sign-in pages and forms. Public pages (v2.1, section 2) use 20 px cards and pill
  buttons. Borders 1.5 px ink on paper elements, 1 px `hair` elsewhere.
- No decorative gradients, no photography, no icon fonts. The only shadows are under the two screen mocks.
- Easing `cubic-bezier(.22,1,.36,1)`; `cubic-bezier(.65,0,.35,1)` only for stage transitions.

---

## 2 · The home page (v2.1, 6 Nov 2026)

**Status:** proposed by Manish on 6 Nov 2026 under the deadline override, after a design review against
brainwhite.com (navigation and page structure only; none of its content or branding). **Ishant (owner of
this file) confirms or changes it after 15 Nov.** It replaces the five pinned scroll stages of v2, which
are in git history: they took about 14 desktop screens before any plain content, and the hero had no button.

**What changes from v2, on public pages only** (the sign-in pages and the app console are unchanged):
light and dark bands alternate (cream / loam, one paper band, one red closing band); cards have a 20 px
radius (14–24 px inside the mocks, slip and heatmap) and 1 px hairlines; public buttons are pills
(`.lp-pill*` in `landing.css`; the square `.lp-btn` stays for forms); bracketed mono eyebrows
"( … )" and numbered items "01 ·" signpost each band; mono labels are at least 12 px. Tokens and fonts
are unchanged.

Sections, top to bottom (`app/page.tsx`, words in `lib/landing/content.ts`, styles in `app/home.css`):

1. **Hero** (cream): eyebrow, an Anton H1 that says what the product does, a lede, **Start free pilot** and
   **Download Android app**, "Free during the pilot · No card needed". Beside it the two screen mocks.
   The H1 is 64 px at most with a line height of 1.02, balanced so it takes four or five lines, not seven.
   The phone mock sits below the dashboard's four stat cards and its table title, so no figure or heading is
   covered, and the dashboard's status column is wide enough for "Needs approval".
   **Hero motion:** the eyebrow, lede, buttons and note fade up once in turn (0 to 0.3 s), then the
   dashboard, the phone and the caption (0.15 to 0.6 s). From 1000 px, while scrolling the first 560 px, the
   phone drifts up 34 px and the dashboard down 12 px (scroll-linked, so it moves only while you scroll).
   The H1 is not animated because it is the largest paint on the page. None of it loops (TESTING.md), and
   all of it is off under reduced motion.
2. **Marquee** (red, ink type): five short facts sliding left; paused on hover, still under reduced motion.
3. **Problem** (loam): three numbered cards, "Problem 01 ·". No figures.
4. **Features** `#features` (cream): six numbered cards, each with its role and phone or web.
5. **Roles** `#roles` (loam): four cards (Owner, Project manager, Supervisor, Accountant) with where they
   work, what they do, what they see, and one pill each: Start free pilot, Get the app or Sign in.
6. **How it works** `#how` (cream): five numbered steps; beside them a loam card "We never say sent until
   it's sent" with the phone's four status words in order and the approved day-record slip.
7. **Heatmap** (paper): one sample site, 26 weeks, one square per day, four levels of red by share of the
   roster present, three stat tiles, the chosen day read out (`aria-live`). Arrow keys move a day or a
   week. Data is generated in `lib/landing/sample-site.ts`, fixed, and captioned "Sample site, sample data".
8. **Your data** (loam): four guarantees, each true in the schema today.
9. **FAQ** `#faq` (cream): eight `<details>` rows beside a short heading and a Contact link.
10. **Closing CTA** (red): ink pill and line pill. Then the site footer.

**Screen mocks** (`components/landing/screen-mocks.tsx`): the phone Today screen and the web Overview drawn
in HTML and CSS with the apps' own labels and status words and sample sites. Each is one `role="img"` with
an `aria-label`. They stand in for device screenshots until real ones are taken; keep their words in step
with the screens they copy.

**Motion:** CSS only. Cards and steps rise as they enter the viewport with a scroll-driven animation
(`animation-timeline: view()`, inside `@supports` and `prefers-reduced-motion: no-preference`); browsers
without it show everything at once. No canvas on the home page, no scroll handler, no preloader, no
smooth-scroll or 3D library. The heatmap is the only script.

Every claim is a row in `docs/FEATURES.md`. No customer names, ratings, prices or real-looking customer
numbers until the pilot produces real ones; sample figures are always labelled as samples.

## 2b · Sign-in pages, v3 (warm glass)

Sign in, Create account, Check email, Link expired, Forgot password, Set a new password and the invite
page (`app/(auth)`). Chosen by Manish on 7 Nov 2026 from five mocks: the glass card and type of option A,
the phone of option D and the wordmark of option C. It replaces the loam panel with the site-grid canvas.

- **Fonts** (`app/fonts.ts`, self-hosted): Bricolage Grotesque 700 for titles (30 px on phones, 34 px from
  480 px), Instrument Sans for text (16 px body and inputs, 14 px labels, 13 px hints), Archivo 800 at
  125% width, upper case, for the wordmark (22 px), with "SIO" in red. Labels are sentence case, not mono.
- **Ground.** Warm cream `#F7EFE6` under three soft peach glows. Each page tints the glow a little through
  its tone: warm (sign in), fresh (create account), mail (check email), alert (link expired, bad invite),
  key (passwords), invite.
- **Layout** (`components/auth/scene.tsx`). From 960 px: a picture on the left and the card on the right.
  Below that the picture goes and a small header sits above the card, different on each page: a "Works with
  no signal" chip (sign in), a three-step strip with step 1 lit (create account), a floating envelope
  (check email), an amber clock (link expired), a key or a lock (passwords), an envelope-house (invite).
- **Pictures** (`components/auth/visuals.tsx`, all sample data, hidden from screen readers): the phone's
  Today screen (sign in), the three steps to a pilot (create account), an inbox with the email arriving
  (check email), a torn old link beside a new one (link expired), a key or lock (passwords), the invitation
  with the roles (invite).
- **Links under the scene** (`.sx-sitelinks` in `app/(auth)/layout.tsx`): "Download app" and "Contact"
  (`AUTH_FOOTER_LINKS` in `lib/site/nav.ts`), 14 px, muted and underlined, centred, 44 px tap height. These
  pages have no site header or footer, so this is how a visitor finds the app and a way to reach us.
- **Card.** White at 72% with a 20 px blur, 28 px corners (24 px on phones), 40 px padding (28 × 22 on
  phones). Inputs 52 px, 14 px corners, red focus ring. The main button is a red pill, 52 px.
- **Feedback.** `SubmitButton` (`components/auth/submit-button.tsx`) swaps to a spinner and a "…ing" label
  while the form sends, ignores a second tap, dims the fields, and after 6 s adds "Still working. A slow
  connection can take a little longer." Links between these pages (`PendingLink`) show a small spinner while
  the next page loads. Notices (`AuthNotice`) drop in with an icon: error (red, a small shake, `role="alert"`),
  success, warning and info (`role="status"`). New passwords get a four-step strength bar
  (`lib/auth/strength.ts`; a guide only, the rule is `lib/auth/password.ts`).
- **Motion.** The card and its rows rise in over 0.5 s, one after another; the phone and the floating cards
  drift slowly. With reduced motion, all of it stops except the spinner.
- **Link expired** (`/link-expired`). `/auth/confirm` sends a link it cannot use here (`lib/auth/expired.ts`),
  keeping `next`, or with `for=reset` for a password link. The page asks for the email and sends a new link
  of the same kind; "Check your email" can send it again too. Both answer the same whether or not the address
  has an account; only Supabase's own rate limit shows a "wait a minute" message.

## 2b-i · Info pages

The public pages (landing, About, Download, Contact, Book a demo, Privacy, Terms, 404, error) share one
frame, in `components/site/public-frame.tsx`, and every page after the home page uses the About look:

- **Header** (v2.1, `components/site/site-header.tsx` via `PublicHeader`): the wordmark; from 1000 px the
  page links Features, How it works, **Who we serve** (a dropdown), Download app, About, Contact (`HEADER_ITEMS` in
  `lib/site/nav.ts`); "Sign in"
  as a line pill from 640 px; "Start free pilot" (`CTA.primary`) as a red pill at every width; below
  1000 px a **Menu** button. Tap targets 44 px. The same header on the home page, info pages, 404 and error.
- **Who we serve** (`HeaderGroup` in `components/site/site-header.tsx`): a button with a caret that opens a
  short list of the four roles (Owners, Project managers, Supervisors, Accountants; `WHO_WE_SERVE`), each
  jumping to its card in the home page's "Four roles" section (`#role-owner` and so on, from `roleId()`).
  A plain disclosure, not an ARIA menu: `aria-expanded`, ordinary links, and it closes on Escape (focus
  returns to the button), a click outside, focus moving away, or choosing a link. Only the four roles in
  CLAUDE.md are listed. Below 1000 px the full-screen menu's "Who does what" goes to the same section.
- **Menu.** A native modal `<dialog>`, full screen on loam: numbered Anton links (`MENU_LINKS`), then Start
  free pilot, Sign in and WhatsApp (when configured). Focus starts on Close and stays inside; Esc closes it
  and returns focus to the Menu button; the page behind does not scroll.
- **Footer.** `SiteFooter` on every public page: loam, wordmark and one line, four columns (Product, Get
  started, Company, Legal; `FOOTER_COLUMNS`), 44 px rows, then copyright and the contact email.
- **Page hero** (`components/site/page-hero.tsx`, `PageHero`): the first band of every page after the home
  page: a small breadcrumb, the red `( eyebrow )`, the Anton headline (`hm-h1`, at most 18ch), a lede (56ch),
  an optional mono "Last updated" line and room for buttons or facts. It clears the fixed 56 px header itself
  (`.pg-hero` in `app/(site)/site.css`). **Closing band** (`components/site/closing-cta.tsx`, `ClosingCta`):
  the home page's red call to action from `CTA`, on About, Download and Contact. The site layout loads
  `app/home.css` once; each page wraps its bands in `.hm`. Cards are `hm-card` (cream bands) or
  `hm-card-dark` (loam bands) with a mono `hm-num` label; links inside them are `.pg-link`.
- **Download** (`app/(site)/download`): hero with the APK button (from `NEXT_PUBLIC_APK_URL`, else the pilot
  build's `PILOT_APK_URL` on its GitHub Release, https only, `lib/site/download.ts`) and "Use the web app instead",
  then a mono line "Version 0.1.1 · 13 Nov 2026 · 62 MB · Android only" (only for that build); three numbered
  install steps; a loam "Phone or web?" band; the closing band. With no valid link the button becomes
  "Ask on WhatsApp" (or Contact), never a dead link.
- **Contact** (`app/(site)/contact`): hero, three numbered topic cards, a loam "Reach us" band showing only
  the configured email, WhatsApp and phone, "Before you write", the closing band.
- **Book a demo** (`app/(site)/demo`): hero, then the enquiry form beside "What happens next" on a paper band
  (`.ef-*`, unchanged).
- **Privacy, Terms** (`app/(site)/privacy`, `terms`): hero (eyebrow "Legal", the intro as the lede, the
  last-updated line), then `LegalDoc` on a paper band: the contents list beside a 760 px reading column.
  No cards: long legal text stays easy to read.
- **About** (`app/(site)/about`): built from the home page's own pieces (`app/home.css`, the shared
  `Eyebrow` in `components/site/eyebrow.tsx`) so it reads as the same site: a cream hero with the Anton
  headline, the lede and the five at-a-glance facts as pills; a loam mission band; four numbered cards for
  what the app covers; a loam band of three principles; and the home page's red closing call to action
  (`ClosingCta`). Its hero is `PageHero` with the facts row (`.pg-facts`); only the two-column mission is in
  `about/about.css`. It is the reference for every other public page.
- **Skip link.** "Skip to content" is the first thing Tab reaches on every page (`app/layout.tsx`,
  styles in `globals.css`). It jumps to `#main`, which is the `<main>` of the page, or the wrapper around
  the page in the signed-in app.
- **Missing and broken pages.** `app/not-found.tsx` (status 404: `PageHero` with Home, Dashboard and a
  contact line), `app/error.tsx` (`PageHero` with Try again, Home and a contact line; it shows no error text) and
  `app/global-error.tsx` (own `<html>`, inline styles in cream, ink and red).
- **Titles.** Every page has a title through the `"%s | Alarsio"` template; the signed-in pages use a
  short static title.

## 2c · Dashboard

`app/(app)/dashboard`, in the app console (section 4): the top bar alone (no organisation is chosen yet, so
no module pills), a PageHead "Your organisations", then one white card per organisation: a lettered avatar, its
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
region names it. While the form is being sent (`useFormStatus`), the submit button and Back are disabled
and dimmed, the submit has `aria-busy` and shows `pendingLabel` ("Creating your organisation…"), so it
cannot be sent twice. Used by Create organisation (name, where you work, check and create).

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
scroll inside their own card with the first column pinned. Controls are 40 px with a mouse and at least
44 px on a touch screen (`@media (pointer: coarse)`).

**Width.** List and table pages (`max-w-6xl`) use up to 1280 px; forms and detail pages keep 576 to 768 px,
because long input lines are harder to read. In the console every page sits at the left of the content
area, not centred in it.

## 3 · Rules

- **Reduced motion and no JavaScript get the same page, still.** Reveals and the marquee run
  only under `prefers-reduced-motion: no-preference`. Without JavaScript every section and the
  heatmap's stat tiles are still there, and the footer carries every link the menu has.
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

## 3b · Phone app (v2.1, proposed 6 Nov 2026)

**Status:** proposed by Manish under the deadline override; **Ishant confirms or changes it after 15 Nov.**
It brings the phone app in line with the public site (section 2). Tokens are in `apps/mobile/src/theme.ts`.

- **Ground and cards.** Every screen sits on `cream`; cards are `paper` with a 1 px `hair` border and a
  16 px radius. Inputs are `paper` with a 10 px radius. Red stays a mark, never body text.
- **Type.** Anton (bundled, `src/ui/fonts.ts`) for screen titles, the header title, the wordmark and
  tutorial titles only; the system font for everything else, 16 px body.
- **Buttons** (`src/ui/Pill.tsx`): pills at least 48 px tall. Red with ink text for the one main action on
  a screen, ink for normal actions, line for a second action, cream on loam.
- **Icons** (`src/ui/Icon.tsx`): one fixed set from MaterialCommunityIcons, always beside a word and hidden
  from screen readers.
- **Start.** Native splash (loam, logo) → brand splash (logo, wordmark, one line; 1.5 s, a tap skips) →
  signed out: the four-slide tutorial on the first open only (`alarsio.onboarding.seen.v1` in
  AsyncStorage), then Sign in; signed in: Today. "How Alarsio works" on Sign in and on Help reopens it.
- **Sign in.** Loam band with logo and wordmark over a rounded cream form.
- **Today.** A sync chip under the date that is always shown (`syncChip` in `sync/status-text.ts`: All sent
  / N waiting to send / N need attention), an icon beside each row label, pill buttons below the cards.

## 4 · App screens: the app console, v4 "warm glass"

**Status: Accepted by Ishant, 7 Nov 2026, under the deadline override in CLAUDE.md. Manish to confirm
after 15 Nov.** It replaces v3 (the grey console with a sidebar, #176, 6 Nov), which replaced "Warm print,
calm" (30 Oct); both are in git history. Why: Ishant chose a warmer, more polished dashboard look from a
reference shot. We took its patterns (warm ground, frosted cards, pill navigation, light display numbers,
stat cards with bars, tinted alert rows), not its brand or content. The landing page keeps its own look (sections 1 to 2a)
and the sign-in pages use warm glass too (section 2b); every signed-in page uses this console.

### Tokens (scoped to `.app`, in `app/(app)/console.css`)

| Token | Value | Use | Contrast |
| :-- | :-- | :-- | :-- |
| `--cream` (page) | `#F6F3EF` plus a fixed peach glow (`rgb(239 73 60 / .10)`) bottom right | Page ground | — |
| `--glass` | `rgb(255 255 255 / .72)`, 14 px backdrop blur, 1 px white border | Cards, stat cards, the pill track, the bar | — |
| `--ink` | `#1C1917` | Text, primary buttons, the current segment | 17.2:1 on white |
| `--muted` | `#57534E` | Secondary text, inactive pills | 7.6:1 on white |
| `--faint` | `#78716C` | Labels, footnotes, breadcrumb | 4.8:1 on white, 4.5:1 on the page |
| `--hair` / `--line-strong` | `#E7E1DA` / `#D6CFC7` | Borders on solid surfaces / inputs | — |
| `--accent` | `#EF493C` (Alarsio red-orange) | The logo tile, progress bars, alert squares, the focus ring on inputs | never body text |
| `--red-deep` | `#B42318` | Error text | 6.5:1 on white |

- **Type:** Inter only. Page title **light 300**, 40 px (30 px on a phone), tracking −0.025em. Stat values
  light 300, 38 px, with a 13 px unit. Card titles 15 px medium. No Anton and no uppercase mono in the app.
- **Shape:** cards 16 px radius, menus and alert rows 12 px, inputs 10 px; buttons, pills, tags and the
  segmented control are fully round. Shadow `0 1px 2px` plus a soft `0 8px 24px -12px`.
- **Motion:** none beyond a 150 ms colour change; none under reduced motion.
- Without `backdrop-filter`, glass falls back to near-solid white. Menus are always solid white.

### The frame

`components/app/app-frame.tsx` in the `(app)` layout. The layout reads the memberships once; the frame
takes the organisation from the page's `?org=` (a layout cannot read the query string).

- **Top bar, sticky, 64 px:** the logo tile and "Alarsio" on the left; the modules as **pills** in one
  glass capsule in the centre (`SidebarNav variant="pills"`; the current one is a white pill with a
  shadow); on the right the organisation switcher (avatar, name, role, chevrons → `/dashboard`) and a
  round **account** button (the email's initial) whose menu shows who is signed in and Sign out.
- **Under 1200 px** the nine pills do not fit, so they fold into a **Menu** button (the same links,
  stacked, with icons). Under 768 px the switcher moves into the Menu and the Menu spans the screen.
  Both menus are native `<details>`, so they work without JavaScript.
- **Breadcrumb** under the bar, above the title: a folder icon, the organisation, then the module.
- **No `?org=`** (the dashboard hub): no pills, no breadcrumb; the logo and the account button only.
- No sidebar, no bottom bar, and no sideways page scroll at 375 px.

**Which links a role sees:** the pills, the Menu and the dashboard read one list, `lib/dashboard/links.ts`
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

In `components/app/`: `AppFrame`, `AppTopBar` (with `Brand`, `OrgSwitch`, `AccountMenu`, `Crumbs`),
`SidebarNav`, `Icon`, `PageHead`, `StatCard`, `Card`, `DataTable`, `StatusTag`, `Button` / `ButtonLink`
and `Notice`. Fields stay in `v2-form.tsx`. A screen uses these pieces and does not restyle them.

- **Account menu** (`AccountMenu`, `NameForm`): the round button shows the initial of the person's name (else
  their email); the panel shows "Signed in as", the name and the email, a **Your name** field with Save
  (`updateMyName` in `app/(app)/account-actions.ts`, 1 to 120 characters, the person's own row only), then Sign out.
  "New user" (a profile made without a name) is never shown as a name.
- **Page head.** Light title, the note under it, and on the right an optional `aside` (a segmented control)
  and one action.
- **Segmented control** (`.ax-seg`): a glass capsule; the current item is ink with white text. The Overview
  uses it for Yesterday · Today (links to `?date=`).
- **Button.** Fully round, 40 px (44 px on touch). Primary: ink with white text. Secondary: white glass.
  There is no red button; a destructive action keeps its existing confirm step.
- **Field.** A 13 px label above a 40 px input on near-white, 10 px radius; focus is an ink border and a
  soft accent ring.
- **Notice.** A tinted glass strip with a small square: error is red (`role="alert"`), information blue
  (`role="status"`).
- **Status tag.** A round soft pill with a small square, three tones (`lib/app/status.ts`): **amber** asks
  someone to act, **green** is settled, **grey** is nothing yet.
- **Stat card.** The label and a round ↗ link to the page behind the number (`href`); a light number with
  its unit; a footnote line (`foot`, `footEnd`); and a bar (`progress`) with an accent fill, a hatched
  remainder and an ink marker. With nothing to measure (max 0) there is no bar. "To approve" and "Low
  stock" turn amber with a square when above 0.
- **Footnotes and bars show only counts the page loaded.** Never a trend, a target or a comparison we do not
  store. The Overview's come from `overviewStatDetails()` in `lib/overview/screen.ts` (tested): active of
  all sites, reports filed of active sites, days approved of active sites, and the number of sites with
  low stock.
- **Alert rows** (Overview "Alerts & tasks"): one tinted row per `needsYou()` item, the thing on top and
  the site under it, its action on the right. Peach with a red square for an item that needs a decision,
  amber for a flag, stock or visit, and one green "All clear" row when there is nothing.
- **Card.** Glass, 16 px radius, a title row without a divider. A table that is the card's only child runs
  nearly edge to edge.
- **Table.** A quiet header row in 12 px grey, faint row lines, row hover, numbers right-aligned. Under
  900 px it scrolls inside its card with the first column pinned on its own ground.
- **Empty state.** One sentence saying what is missing and the one action that fills it.

### Rules

- **Accessibility.** Section 3 applies: AA on every text pair, a visible focus ring, 44 px targets on
  touch. Every table header is a `<th scope>`, and the first cell of a row is its `<th scope="row">`.
  Icons are `aria-hidden`; the label beside each one carries the meaning.
- **Data.** A screen shows only data that already exists, read as the signed-in user under RLS (ADR-041:
  published views only). The Overview's "Headcount reported" sums `daily_report_status.headcount`.
- **Phone.** Check every page at 375 px.
- **No new colour.** Any colour or size not in this section updates this file in the same PR.
- **Out of scope:** the phone app (see section 3b), dark mode, motion.
