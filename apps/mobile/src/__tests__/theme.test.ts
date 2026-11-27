import { brand, colors, tone, toneOnDark } from '../theme';

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme contrast (WCAG AA, 4.5:1 for normal text)', () => {
  const onLight: [string, string][] = [
    ['text', colors.text],
    ['muted', colors.muted],
    ['actionText', colors.actionText],
    ['field', colors.field],
  ];

  it.each(onLight)('%s reads on the card and the ground', (_name, hex) => {
    expect(contrast(hex, colors.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex, colors.ground)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(tone))('%s chip text reads on its tint', (_name, t) => {
    expect(contrast(t.text, t.tint)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(tone))('white text reads on the solid %s button', (_name, t) => {
    expect(contrast(colors.white, t.text)).toBeGreaterThanOrEqual(4.5);
  });

  it('text reads on the orange action button', () => {
    expect(contrast(colors.text, colors.action)).toBeGreaterThanOrEqual(4.5);
  });

  it('header text reads on the header', () => {
    expect(contrast(colors.white, colors.header)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.headerMuted, colors.header)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(toneOnDark))('%s status text reads on the header', (_name, hex) => {
    expect(contrast(hex, colors.header)).toBeGreaterThanOrEqual(4.5);
  });

  it('white text on a disabled button reads', () => {
    expect(contrast(colors.white, colors.disabled)).toBeGreaterThanOrEqual(4.5);
  });

  it('brand text reads on the splash and sign-in grounds', () => {
    expect(contrast(brand.ink, brand.cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(brand.cream, brand.loam)).toBeGreaterThanOrEqual(4.5);
  });
});
