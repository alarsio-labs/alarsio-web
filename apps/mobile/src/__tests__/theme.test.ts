import { colors, tone } from '../theme';

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
  const text: Array<[string, string]> = [
    ['ink', colors.ink],
    ['muted', colors.muted],
    ['redDeep', colors.redDeep],
    ['tone.wait', tone.wait],
    ['tone.ok', tone.ok],
    ['tone.attention', tone.attention],
  ];

  it.each(text)('%s reads on paper and on white', (_name, hex) => {
    expect(contrast(hex, colors.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex, colors.white)).toBeGreaterThanOrEqual(4.5);
  });

  it('white text on an ink button reads', () => {
    expect(contrast(colors.white, colors.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it('white text on a disabled button reads', () => {
    expect(contrast(colors.white, colors.disabled)).toBeGreaterThanOrEqual(4.5);
  });
});
