import { ALL_NAMED_SWATCHES } from '../data/palette';

export interface RGB {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
}

export interface HSV {
  h: number; // 0..360
  s: number; // 0..100
  v: number; // 0..100
}

export interface HSL {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
}

export function normalizeHex(input: string): string | null {
  const cleaned = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const expanded = cleaned
      .split('')
      .map((c) => c + c)
      .join('');
    return `#${expanded.toUpperCase()}`;
  }
  return null;
}

export function hexToRgb(hex: string): RGB {
  const norm = normalizeHex(hex) ?? '#1C2942';
  return {
    r: parseInt(norm.slice(1, 3), 16),
    g: parseInt(norm.slice(3, 5), 16),
    b: parseInt(norm.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s: Math.round(s), v: Math.round(v) };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const vn = Math.max(0, Math.min(100, v)) / 100;
  const hn = ((h % 360) + 360) % 360;

  const c = vn * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = vn - c;

  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (hn < 60) [rp, gp, bp] = [c, x, 0];
  else if (hn < 120) [rp, gp, bp] = [x, c, 0];
  else if (hn < 180) [rp, gp, bp] = [0, c, x];
  else if (hn < 240) [rp, gp, bp] = [0, x, c];
  else if (hn < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  return {
    h,
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const hn = ((h % 360) + 360) % 360;

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;

  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (hn < 60) [rp, gp, bp] = [c, x, 0];
  else if (hn < 120) [rp, gp, bp] = [x, c, 0];
  else if (hn < 180) [rp, gp, bp] = [0, c, x];
  else if (hn < 240) [rp, gp, bp] = [0, x, c];
  else if (hn < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

export function getPerceivedLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function isLightHex(hex: string): boolean {
  return getPerceivedLuminance(hex) > 0.78;
}

export function blendHex(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex({
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  });
}

/**
 * Generates an analogous low-saturation studio glow tint (15-20% sat) and complementary warm orb
 * from the active body colour so the studio backdrop breathes harmoniously with every uniform shade.
 */
export function computeAdaptiveBackdropTints(
  bodyHex: string,
  isDarkBackdrop: boolean
): { orbPrimary: string; orbWarm: string; glowTint: string } {
  const hsl = rgbToHsl(hexToRgb(bodyHex));
  const hasChroma = hsl.s >= 8;
  const analogousHue = hasChroma ? (hsl.h + 16) % 360 : 38;
  const warmComplementaryHue = hasChroma
    ? (hsl.h * 0.25 + 34) % 360 // Soft warm sand/gold bias, never neon
    : 36;

  const tintSat = hasChroma ? Math.min(20, Math.max(14, Math.round(hsl.s * 0.28))) : 10;

  if (isDarkBackdrop) {
    return {
      glowTint: rgbToHex(hslToRgb({ h: analogousHue, s: tintSat, l: 24 })),
      orbPrimary: rgbToHex(hslToRgb({ h: analogousHue, s: tintSat + 4, l: 28 })),
      orbWarm: rgbToHex(hslToRgb({ h: warmComplementaryHue, s: 18, l: 26 })),
    };
  }

  return {
    glowTint: rgbToHex(hslToRgb({ h: analogousHue, s: tintSat, l: 91 })),
    orbPrimary: rgbToHex(hslToRgb({ h: analogousHue, s: tintSat + 3, l: 86 })),
    orbWarm: rgbToHex(hslToRgb({ h: warmComplementaryHue, s: 20, l: 88 })),
  };
}

/**
 * Clamps pure #000000 and #FFFFFF extremes to realistic cotton dye albedo bounds.
 */
export function toRealisticFabricHex(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const minFloor = 17;
  const maxCeil = 242;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);

  if (minC > 240) {
    return rgbToHex({
      r: Math.min(242, r),
      g: Math.min(242, g),
      b: Math.min(239, b),
    });
  }

  if (maxC < minFloor) {
    const lift = minFloor - maxC;
    return rgbToHex({
      r: Math.min(maxCeil, r + lift),
      g: Math.min(maxCeil, g + lift),
      b: Math.min(maxCeil, b + lift),
    });
  }

  const mapCh = (c: number) => {
    if (c > maxCeil) return maxCeil + (c - maxCeil) * 0.25;
    if (c < 10 && maxC < 45) return 10 + c * 0.6;
    return c;
  };

  return rgbToHex({ r: mapCh(r), g: mapCh(g), b: mapCh(b) });
}

export function getNearestColourName(hex: string): string {
  const norm = normalizeHex(hex);
  if (!norm) return 'Custom Shade';

  const exact = ALL_NAMED_SWATCHES.find((s) => s.hex.toUpperCase() === norm);
  if (exact) return exact.name;

  const target = hexToRgb(norm);
  let bestName = 'Custom Shade';
  let bestDist = Infinity;

  for (const s of ALL_NAMED_SWATCHES) {
    const c = hexToRgb(s.hex);
    const rMean = (target.r + c.r) / 2;
    const dr = target.r - c.r;
    const dg = target.g - c.g;
    const db = target.b - c.b;
    const dist =
      (2 + rMean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rMean) / 256) * db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestName = s.name;
    }
  }

  return bestName;
}

export function computeContrastShade(bodyHex: string, invertDirection = false): string {
  const hsl = rgbToHsl(hexToRgb(bodyHex));
  const goLighter = invertDirection ? hsl.l >= 42 : hsl.l < 42;

  if (goLighter) {
    const nextL = Math.min(88, Math.max(hsl.l + 28, 56));
    const nextS = Math.max(6, Math.round(hsl.s * 0.72));
    return rgbToHex(hslToRgb({ h: hsl.h, s: nextS, l: nextL }));
  } else {
    const nextL = Math.max(13, Math.min(hsl.l - 28, 26));
    const nextS = Math.min(90, Math.round(hsl.s * 1.1 + 4));
    return rgbToHex(hslToRgb({ h: hsl.h, s: nextS, l: nextL }));
  }
}

export function shiftHexLightness(hex: string, deltaPercent: number): string {
  const hsl = rgbToHsl(hexToRgb(hex));
  const nextL = Math.max(6, Math.min(98, hsl.l + deltaPercent));
  return rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l: nextL }));
}

export function extractDominantColorsFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  maxColors = 6
): string[] {
  const sampleDim = 96;
  const work = document.createElement('canvas');
  work.width = sampleDim;
  work.height = sampleDim;
  const ctx = work.getContext('2d');
  if (!ctx) return [];

  ctx.drawImage(sourceCanvas, 0, 0, sampleDim, sampleDim);
  const data = ctx.getImageData(0, 0, sampleDim, sampleDim).data;

  const buckets = new Map<
    string,
    { rSum: number; gSum: number; bSum: number; count: number }
  >();

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 140) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const entry = buckets.get(key);
    if (entry) {
      entry.rSum += r;
      entry.gSum += g;
      entry.bSum += b;
      entry.count += 1;
    } else {
      buckets.set(key, { rSum: r, gSum: g, bSum: b, count: 1 });
    }
  }

  const sorted = Array.from(buckets.values())
    .map((b) => ({
      r: b.rSum / b.count,
      g: b.gSum / b.count,
      b: b.bSum / b.count,
      count: b.count,
    }))
    .sort((a, b) => b.count - a.count);

  const selected: RGB[] = [];
  const minDistSq = 42 * 42;

  for (const cand of sorted) {
    if (selected.length >= maxColors) break;
    const tooClose = selected.some((s) => {
      const dr = s.r - cand.r;
      const dg = s.g - cand.g;
      const db = s.b - cand.b;
      return dr * dr + dg * dg + db * db < minDistSq;
    });
    if (!tooClose) {
      selected.push({ r: cand.r, g: cand.g, b: cand.b });
    }
  }

  return selected.map(rgbToHex);
}
