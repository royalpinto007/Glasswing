/**
 * Colour parsing and WCAG contrast, kept pure.
 *
 * This is the part of an accessibility checker most likely to be quietly
 * wrong, and the part nobody notices is wrong: a ratio that is off by a
 * little still looks like a number. So it is separated from the DOM entirely
 * and tested against the values in the WCAG spec.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** 0 to 1. */
  a: number;
}

/**
 * Parse the colour strings a browser actually returns.
 *
 * getComputedStyle normalises almost everything to rgb() or rgba(), so those
 * two matter most. Hex is accepted because it is what a person types when
 * checking a value by hand.
 */
export function parseColor(input: string): Rgb | null {
  const value = input.trim().toLowerCase();
  if (!value || value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgb?.[1]) {
    // Both the legacy comma form and the modern space form, which Chrome has
    // started returning for some properties.
    const parts = rgb[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map(Number);
    const [r, g, b, a] = parts;
    if (r === undefined || g === undefined || b === undefined) return null;
    if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
    return { r, g, b, a: a === undefined || !Number.isFinite(a) ? 1 : a };
  }

  const hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex?.[1]) {
    const h = hex[1];
    const expand = (s: string) => parseInt(s.length === 1 ? s + s : s, 16);
    if (h.length === 3 || h.length === 4) {
      return {
        r: expand(h[0]!),
        g: expand(h[1]!),
        b: expand(h[2]!),
        a: h.length === 4 ? expand(h[3]!) / 255 : 1,
      };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: expand(h.slice(0, 2)),
        g: expand(h.slice(2, 4)),
        b: expand(h.slice(4, 6)),
        a: h.length === 8 ? expand(h.slice(6, 8)) / 255 : 1,
      };
    }
  }

  return null;
}

/**
 * Flatten a translucent colour onto what is behind it.
 *
 * Contrast is only defined between two opaque colours. Text at 60% opacity
 * over white is not the colour it claims to be, and checking the declared
 * value would pass things a reader cannot actually read.
 */
export function flatten(fg: Rgb, bg: Rgb): Rgb {
  if (fg.a >= 1) return { ...fg, a: 1 };
  const mix = (f: number, b: number) => f * fg.a + b * (1 - fg.a);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 };
}

/** Relative luminance, exactly as WCAG 2 defines it. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * WCAG calls text "large" at 18pt, or 14pt when bold. Browsers report pixels,
 * and 18pt is 24px, 14pt is 18.66px. Large text is allowed a lower ratio
 * because size compensates for contrast.
 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  if (fontSizePx >= 24) return true;
  return fontSizePx >= 18.66 && fontWeight >= 700;
}

export type ContrastLevel = 'fail' | 'aa' | 'aaa';

/** Which WCAG level a ratio reaches for text of this size. */
export function levelFor(ratio: number, large: boolean): ContrastLevel {
  if (large) {
    if (ratio >= 4.5) return 'aaa';
    return ratio >= 3 ? 'aa' : 'fail';
  }
  if (ratio >= 7) return 'aaa';
  return ratio >= 4.5 ? 'aa' : 'fail';
}

/** The ratio this text needs to reach AA, for the "needs 4.5, has 3.1" message. */
export function requiredRatio(large: boolean): number {
  return large ? 3 : 4.5;
}

/** One decimal place. A ratio printed to four is false precision. */
export function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 10) / 10}:1`;
}
