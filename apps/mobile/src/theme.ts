// The phone app's design tokens. docs/DESIGN.md section 5 is the single source:
// change a value there and here in the same PR.
export const colors = {
  ground: '#F6F7F9',
  card: '#FFFFFF',
  text: '#1F2937',
  muted: '#4B5563',
  border: '#E5E7EB',
  /** Input and unselected-button border. */
  field: '#6B7280',
  header: '#1E293B',
  headerMuted: '#CBD5E1',
  /** The one main action. Text on it is `text`. */
  action: '#F97316',
  /** Orange text or icon on a light ground, and the active tab. */
  actionText: '#C2410C',
  disabled: '#6B7280',
  white: '#FFFFFF',
} as const;

/** Status chips: `tint` behind, `text` on it. `text` is also the solid fill of a selected register button. */
export const tone = {
  ok: { tint: '#DCFCE7', text: '#166534' },
  wait: { tint: '#FEF3C7', text: '#92400E' },
  attention: { tint: '#FEE2E2', text: '#B91C1C' },
  neutral: { tint: '#E5E7EB', text: '#374151' },
} as const;

export type Tone = keyof typeof tone;

/** Status colours for text and icons on the slate header (the sync line under the title). */
export const toneOnDark = { ok: '#86EFAC', wait: '#FCD34D', attention: '#FCA5A5', neutral: colors.headerMuted } as const;

/** The print brand. Only the splash, the tutorial and Sign in use it (DESIGN.md section 5). */
export const brand = {
  ink: '#171717',
  cream: '#E7E2D8',
  paper: '#FFFDF8',
  loam: '#241A12',
  red: '#EF493C',
  creamMuted: '#B0AAA1',
  hair: 'rgba(23, 23, 23, 0.16)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const type = { title: 22, heading: 18, body: 16, small: 14, counter: 28 } as const;

/** Line height is 1.45 x the size so Devanagari marks are not clipped. */
export const lineHeight = (size: number): number => Math.round(size * 1.45);

/** Touch target: 48 dp (iOS HIG asks for 44 pt). */
export const minTarget = 48;
export const primaryTarget = 48;

export const radius = { chip: 10, input: 10, button: 12, card: 14, pill: 999 } as const;

/** Font scaling stays on, capped so a large setting does not break a row. */
export const maxFontScale = 1.4;

/** Anton is for the wordmark and the splash, tutorial and Sign in titles. Noto Sans Devanagari is used when the language is Hindi. */
export const fonts = {
  display: 'Anton_400Regular',
  hindi: 'NotoSansDevanagari_400Regular',
  hindiBold: 'NotoSansDevanagari_700Bold',
} as const;
