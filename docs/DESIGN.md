# Design — the Alarsio look, for the landing page and the app

**Owner:** Ishant (frontend and UI). This file decides how Alarsio looks. A PR that adds a
colour, a font size or a component that is not here updates this file in the same PR.

**Reference:** [rakenapp.com](https://www.rakenapp.com/), the closest product to ours (field
reports, time, construction), measured on 29 Oct 2026 from its computed styles at 1440 px.
We take its **structure and rhythm**. We do not take its logo, its hard-hat mark, its copy,
its screenshots or its photos. Alarsio has its own name, mark and words, and every product
image on our pages is a real Alarsio screen.

Where Raken fails contrast (white on its orange is 2.36:1, its grey eyebrow 2.01:1), we
change the colour. Every text pair below passes WCAG AA, and its ratio is written next to it.

---

## 1 · What Raken does, measured

| Thing | Raken | What we keep |
| :-- | :-- | :-- |
| Font | System stack (`ui-sans-serif, system-ui, sans-serif`), weights 400 / 500 / 700 / 800 | A real font (Inter), same weights |
| Hero headline | 54 px, weight 800, line height 1.0, dark grey `#3F3F3F` | Big, heavy, tight. Ink colour instead of grey |
| Eyebrow above a headline | 20.25 px, 700, light grey `#AFAFAF` (2.01:1, fails) | Keep the eyebrow, darker colour |
| Card heading | 33.75 px, 700, line height 1.2 | Same |
| Body | 18 px, line height 1.75, `#3F3F3F` | Same size and leading |
| Page background | `#FCFCFC` fading to `#F5F5F5` over 100 px | Warm off-white, flat |
| Cards | White, radius 27 px, no shadow, sit on the grey background | Same idea, radius 24 px |
| Buttons | Radius 9 px, 15.75 px, weight 500, padding 9 × 22.5 px, height 43 px | Same shape, taller (48 px) for touch |
| Primary button | White on orange `#FF8A1D` (2.36:1, fails) | Orange stays; text becomes ink |
| Header button | Near-black `#232323`, white text | Same |
| Text link | Blue `#0082F3` with a → arrow (3.83:1, fails for body text) | Darker blue |
| Dark band | Navy `#253746` to black gradient, white text (12.26:1) | Flat dark navy |
| Container | 1280 px wide, 54 px side padding | 1200 px, 24 px on phones, 48 px on desktop |
| Section spacing | 108 px top and bottom | 96 px desktop, 64 px phone |
| Header | 52 px, sticky, white | 64 px, sticky, white, thin bottom border |

**Raken's page, top to bottom:** sticky header (logo, five menus, Log in, primary CTA) · hero
(eyebrow, three-line headline, one sentence, four ticked bullets, two buttons, a phone and a
desktop screen overlapping) · "Digital tools your team will (actually) use": a big white card
with a vertical tab list on the left, a phone in the middle and the tab's copy on the right ·
customer logo strip · "Connect the field and office, faster": a 2 × 2 grid of white cards,
each a heading, two lines and a cropped product screen · app-store ratings with "Get started"
· a full-width photo with a testimonial card over it · a dark band with one email field ·
footer with a short paragraph, a phone number, a link list and the app-store badges.

---

## 2 · Alarsio tokens

These go into `apps/web/src/app/globals.css` as a Tailwind 4 `@theme` block, so classes like
`bg-surface` and `text-ink` exist. The web app and the landing page use the same tokens.

### Colour

| Token | Hex | Use | Contrast |
| :-- | :-- | :-- | :-- |
| `ink` | `#1C1917` | Headlines, body text, primary button text | 16.74:1 on `canvas` |
| `ink-muted` | `#57534E` | Secondary text, eyebrows, captions | 7.30:1 on `canvas` |
| `ink-faint` | `#78716C` | Placeholders, disabled text, metadata only | 4.59:1 on `canvas` |
| `canvas` | `#FAFAF9` | Page background | — |
| `surface` | `#FFFFFF` | Cards, header, inputs | — |
| `line` | `#E7E5E4` | Borders, dividers | — |
| `accent` | `#F97316` | Primary button, ticks, active tab marker | `ink` on it: 6.24:1 |
| `accent-hover` | `#EA580C` | Primary button hover | `ink` on it: 4.91:1 |
| `accent-strong` | `#C2410C` | Orange text on white, if ever needed | 5.18:1 on white |
| `link` | `#0369A1` | Text links | 5.93:1 on white |
| `night` | `#1F2A37` | Dark band, footer bar, dark header button | white on it: 14.54:1 |
| `night-muted` | `#A8A29E` | Secondary text on `night` | 5.76:1 |

**Status colours** are for the app, and the landing page reuses them when it shows a screen.
They are a soft background with dark text. Never colour alone: every status also has its word.

| Status | Text / background | Ratio | Words in the app |
| :-- | :-- | :-- | :-- |
| Synced, approved | `#166534` on `#DCFCE7` | 6.49:1 | "On the server", "Approved" |
| Pending, syncing | `#1E40AF` on `#DBEAFE` | 7.15:1 | "Saved on this phone", "Sending…" |
| Warning, low stock, sent back | `#92400E` on `#FEF3C7` | 6.37:1 | "Needs attention", "Low stock", "Sent back" |
| Failed, rejected, conflict | `#991B1B` on `#FEE2E2` | 6.80:1 | "Rejected", "Conflict" |

### Type

**Inter**, loaded with `next/font/google` so the file is self-hosted at build time. No font is
fetched from Google when a page loads. Use tabular figures (`font-variant-numeric:
tabular-nums`) wherever numbers line up: wages, headcounts, stock, dates.

| Style | Size desktop / phone | Weight | Line height | Letter spacing |
| :-- | :-- | :-- | :-- | :-- |
| `display` (hero headline) | 56 / 38 px | 800 | 1.05 | -0.02em |
| `h2` (section headline) | 44 / 30 px | 800 | 1.1 | -0.015em |
| `h3` (card heading) | 30 / 24 px | 700 | 1.2 | -0.01em |
| `eyebrow` | 16 / 14 px | 600 | 1.4 | 0, sentence case, `ink-muted` |
| `lead` (hero sentence) | 20 / 18 px | 400 | 1.6 | 0 |
| `body` | 18 / 16 px | 400 | 1.7 | 0 |
| `small` | 14 px | 500 | 1.5 | 0 |

Inside the app (dashboard, tables, forms) body text is 16 px and line height 1.5. The large
sizes are for the landing page.

### Space, shape, depth

- **Spacing scale:** Tailwind's 4 px steps. Most used: 8, 12, 16, 24, 32, 48, 64, 96.
- **Container:** `max-w-[1200px] mx-auto px-6 lg:px-12`.
- **Section:** `py-16 lg:py-24`. Space between a section headline and its content: 48 px.
- **Radius:** buttons and inputs 10 px; small cards 16 px; feature cards and product frames
  24 px; status chips and pills fully round.
- **Shadow:** none on cards, which stand out because they are white on `canvas`. One soft
  shadow, `0 8px 24px rgb(28 25 23 / 0.08)`, only on product screens that float.
- **Borders:** 1 px `line`, on inputs, tables and the header's bottom edge.

---

## 3 · Components

| Component | Spec |
| :-- | :-- |
| **Primary button** | `accent` background, `ink` text, 16 px weight 600, radius 10 px, height 48 px, padding 0 24 px. Hover `accent-hover`. One per screen area. |
| **Secondary button** | `surface` background, 1 px `line` border, `ink` text, same size. On the hero it sits next to the primary one. |
| **Dark button** | `night` background, white text. Used for Sign in in the header. |
| **Text link** | `link` colour, weight 600, a trailing → that moves 2 px right on hover. Underlined in body text. |
| **Focus** | Every interactive element: 2 px `ink` outline with a 2 px offset (`focus-visible`). Never removed. |
| **Tick list** | 20 px round `accent` tick, `ink` text 18 px, 12 px between items. At most four items. |
| **Feature card** | `surface`, radius 24 px, padding 32 px (24 px on phone). Heading, two lines of body, then a cropped product screen that bleeds off the bottom edge. |
| **Tabbed feature panel** | One large card. Left: a vertical tab list; the active tab is a white pill with a → and an `accent` left marker. Middle: the phone screen for that tab. Right: eyebrow, `h3`, two lines, a text link. On phones it becomes stacked: tabs as a horizontal scroller, then the screen, then the text. |
| **Status chip** | Round pill, 12 px weight 600, the status colours above, always with its word. |
| **Product frame** | A real Alarsio screen inside a simple phone or browser outline drawn in CSS: radius 24 px, 1 px `line` border, the floating shadow. No device photos. |
| **Dark band** | Full width, `night`, centred `h2` in white, one line in `night-muted`, one primary button. |
| **Header** | 64 px, sticky, `surface` with a 1 px `line` bottom. Left: the Alarsio wordmark. Middle: three or four anchor links. Right: Sign in (dark button) and the primary CTA. Below 768 px the links collapse into a menu button with a 48 px tap area. |

**Touch:** every tap target is at least 48 × 48 px, on the landing page and in the phone app.
Supervisors work outdoors, in sun and with dirty hands.

---

## 4 · The landing page, section by section

The same skeleton as Raken, with Alarsio's own message (`docs/PRD.md`). Everything claimed
is a feature in `docs/FEATURES.md`. No customer logos, testimonials, ratings or numbers
until the pilot produces real ones.

1. **Header.** As above. Links: How it works · Offline · Wages · FAQ.
2. **Hero.** Eyebrow "Site records for Indian contractors". Headline in three short lines,
   for example "Your site record. / Even with no signal. / Trusted at wage time." One `lead`
   sentence from the PRD promise. Four ticks: verified check-in on site · attendance in one
   tap · a five-minute daily report · wages from approved attendance. Buttons: **Join the
   pilot** (primary) and **See how it works** (secondary; Sign in is in the header). Right
   side: the phone's check-in screen with its "On the server" chip, overlapping only the
   left padding of the owner's `/overview` in a browser frame. Below 640 px the hero shows
   the overview alone, because the phone screens follow in section 4.
3. **Problem strip.** Three short cards on `canvas`: paper registers · WhatsApp and Excel ·
   the same record typed two or three times, then an argument at wage time.
4. **"A day on site" tabbed panel.** Tabs: Check in · Mark attendance · Daily report ·
   Materials. Each shows the real phone screen and two lines of copy.
5. **"Built for no signal."** Text on one side, the phone's record states on the other:
   Saved on this phone → Sending… → On the server, and Needs attention. Message: it never
   says submitted before the server has it.
6. **"From the site to the office" 2 × 2 cards:** Owner overview · Approve attendance ·
   Wage summary and export · Your data stays yours (owner export, audit log).
7. **Roles strip.** Owner · Project manager · Supervisor · Accountant, one line each.
8. **Dark band.** "Run 2 to 20 sites? Join the pilot." **Join the pilot** goes to `/sign-up`,
   the existing owner sign-up, so the page collects nothing itself. A form that stores leads
   is a new feature and needs its own row in FEATURES.
9. **FAQ.** Four questions: does it work offline · which phones · who sees what · can I
   export my data.
10. **Footer.** Wordmark, one sentence, copyright. Privacy and Terms links are added once
    those pages exist; the page never links to a page that is not there.

**Route:** the page lives at `/`. A signed-in visitor goes straight to `/dashboard`.

---

## 5 · Rules

- **Phone first.** Design at 375 px first, then widen. No horizontal scroll at any width.
- **Real screens only.** A product image shows only what the app can show, with its real
  words and states (`apps/mobile`, `/overview`) and demo data. Until there are screenshots
  from a phone, the frames are drawn in HTML (`components/landing/screens.tsx`); when a
  screen's words change in the app, change them there too.
- **Performance.** No third-party scripts, trackers or chat widgets. Images in AVIF or WebP
  with fixed width and height, the hero screen loaded first and the rest lazily. Target
  Lighthouse 90 or more on mobile.
- **Accessibility.** One `h1` per page. Headings in order. Alt text that says what the screen
  shows. Every pair in section 2 passes AA; a new pair is checked before it is used.
- **Motion.** Only small transitions (150–200 ms) on hover and focus, and none when the user
  asks for reduced motion.
- **English only** in the MVP (PRD, out of scope).
- **No dark mode** in the MVP. The tokens leave room for it later.
