// The phone app's design tokens. Colours come from docs/DESIGN.md; the tone
// colours are the one place the "waiting / on the server / needs attention"
// status colours are defined, so no screen keeps its own copy.
export const colors = {
  ink: '#171717',
  muted: '#56524C',
  paper: '#FFFDF8',
  cream: '#E7E2D8',
  loam: '#241A12',
  /** Brand red: marks and accents only, never body text. */
  red: '#EF493C',
  /** Error text and attention borders. */
  redDeep: '#B92725',
  redTint: '#fdecee',
  white: '#ffffff',
  line: '#ccc',
  fieldLine: '#888',
  disabled: '#767676',
} as const;

export const tone = {
  wait: '#8a5a00',
  ok: '#1b6e20',
  attention: '#B92725',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const type = { title: 24, body: 16, small: 14 } as const;

export const minTarget = 44;
export const primaryTarget = 48;
