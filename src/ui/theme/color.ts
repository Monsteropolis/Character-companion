/**
 * Colour conversion, used to prove contrast rather than assume it.
 *
 * Designing in OKLCH gives perceptually even lightness, but WCAG contrast is defined on sRGB
 * relative luminance -- so the palette has to be converted and measured, not eyeballed. These
 * functions exist to let `moods.test.ts` fail the build on an inaccessible mood.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** OKLCH -> linear sRGB, via OKLab and LMS (Björn Ottosson's transform). */
export function oklchToLinearRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const bb = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = l - 0.0894841775 * a - 1.291485548 * bb;

  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  return {
    r: 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    g: -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    b: -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  };
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

function linearToSrgb(channel: number): number {
  const v = clamp01(channel);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/**
 * Relative luminance of an OKLCH colour, as actually rendered.
 *
 * The round trip through gamma-encoded sRGB is deliberate: it clamps out-of-gamut colours the
 * same way a browser does, so the measured contrast matches what a user really sees rather than
 * a theoretical value the display cannot produce.
 */
export function relativeLuminance(l: number, c: number, h: number): number {
  const linear = oklchToLinearRgb(l, c, h);
  const displayed = {
    r: srgbToLinear(linearToSrgb(linear.r)),
    g: srgbToLinear(linearToSrgb(linear.g)),
    b: srgbToLinear(linearToSrgb(linear.b)),
  };
  return 0.2126 * displayed.r + 0.7152 * displayed.g + 0.0722 * displayed.b;
}

/** WCAG 2.1 contrast ratio between two OKLCH colours. Ranges from 1 to 21. */
export function contrastRatio(
  a: { l: number; c: number; h: number },
  b: { l: number; c: number; h: number },
): number {
  const la = relativeLuminance(a.l, a.c, a.h);
  const lb = relativeLuminance(b.l, b.c, b.h);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export const WCAG_AA_TEXT = 4.5;
export const WCAG_AA_LARGE_TEXT = 3;
/** Non-text UI components (borders, icons, focus rings) need 3:1 under WCAG 2.1 SC 1.4.11. */
export const WCAG_AA_UI = 3;
