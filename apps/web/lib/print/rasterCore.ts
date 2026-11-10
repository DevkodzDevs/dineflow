/**
 * The DOM-free half of raster printing: bit-packing, the ESC/POS raster command, text wrapping by
 * grapheme, and the "does this need a picture?" test. No canvas here, so it is unit-tested in Node
 * (`raster.test.ts`); `raster.ts` draws with a canvas and hands the pixels to these.
 *
 * Byte layout emitted by `rasterCommand` — GS v 0 (print raster bit image), one band at a time:
 *   1D 76 30 m xL xH yL yH <data>
 *   m = 0 (normal size); xL xH = width in BYTES (little-endian) = ceil(widthPx / 8);
 *   yL yH = rows in this band (little-endian); data = xBytes × rows, MSB first, 1 = black.
 *   80 mm paper is 576 px → 72 bytes a row; 58 mm is 384 px → 48 bytes a row.
 */

/** Dots across the printable area. Most 80 mm heads are 576 px; 58 mm ones 384 px. */
export const DOTS: Record<58 | 80, number> = { 58: 384, 80: 576 };
/** Rows per band. A single GS v 0 may carry up to 65535 rows, but a cheap printer's buffer is small:
 *  256-row bands cost 8 header bytes each and never overrun one. */
export const BAND_ROWS = 256;

/** One row of pixels (truthy = black) packed to bytes, MSB first; the last byte is padded with white. */
export function packRow(bits: ArrayLike<number | boolean>, widthPx = bits.length): Uint8Array {
  const out = new Uint8Array(Math.ceil(widthPx / 8));
  for (let x = 0; x < widthPx; x++) if (bits[x]) out[x >> 3] |= 0x80 >> (x & 7);
  return out;
}

/** The GS v 0 bytes for a whole image, split into bands of `bandRows`. `rows` are packed rows, all
 *  `ceil(widthPx/8)` bytes long (a short one is padded, a long one cut). */
export function rasterCommand(widthPx: number, rows: Uint8Array[], bandRows = BAND_ROWS): Uint8Array {
  const xBytes = Math.ceil(widthPx / 8);
  const bands = Math.ceil(rows.length / bandRows);
  const out = new Uint8Array(bands * 8 + rows.length * xBytes);
  let o = 0;
  for (let b = 0; b < bands; b++) {
    const from = b * bandRows, n = Math.min(bandRows, rows.length - from);
    out.set([0x1d, 0x76, 0x30, 0x00, xBytes & 0xff, (xBytes >> 8) & 0xff, n & 0xff, (n >> 8) & 0xff], o); o += 8;
    for (let r = from; r < from + n; r++) { const row = rows[r]; out.set(row.length === xBytes ? row : row.subarray(0, xBytes), o); o += xBytes; }
  }
  return out;
}

/** The string as user-perceived characters. Tamil "கொ" is three code points and one grapheme; a
 *  line must never break inside it. `Intl.Segmenter` where it exists; else code points with
 *  combining marks (Mn/Mc/Me), joiners and variation selectors kept with the letter before them. */
export function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (loc?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  const out: string[] = [];
  for (const cp of Array.from(text)) {
    if (out.length && /^[\p{M}‌‍️]$/u.test(cp)) out[out.length - 1] += cp;
    else if (out.length && /[‍]$/u.test(out[out.length - 1])) out[out.length - 1] += cp;
    else out.push(cp);
  }
  return out;
}

/**
 * Wrap `text` into lines no wider than `maxPx`, measured by `measure`. Breaks at spaces; a single
 * word wider than the line is broken between graphemes, never inside one. Every character of the
 * input comes out (only the spaces that became line breaks are dropped).
 */
export function wrapText(measure: (s: string) => number, text: string, maxPx: number): string[] {
  const lines: string[] = [];
  for (const para of String(text ?? "").split("\n")) {
    const words = para.trim().split(/ +/);
    let line = "";
    const push = () => { lines.push(line); line = ""; };
    for (const word of words) {
      const tryLine = line ? line + " " + word : word;
      if (measure(tryLine) <= maxPx) { line = tryLine; continue; }
      if (line) push();
      if (measure(word) <= maxPx) { line = word; continue; }
      // a word wider than the paper: fill grapheme by grapheme
      for (const g of graphemes(word)) {
        if (line && measure(line + g) > maxPx) push();
        line += g;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

/** Typographic punctuation the text path cannot print on code page 0 — folded to ASCII look-alikes
 *  before writing or testing. "₹" becomes "Rs". */
export function fold(s: string): string {
  return s.replace(/[‐-―−]/g, "-").replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/…/g, "...").replace(/•/g, "*").replace(/×/g, "x").replace(/₹/g, "Rs").replace(/ /g, " ");
}

/** True when, after folding, anything is outside Latin-1 — Tamil, Devanagari, a symbol the text path
 *  would print as garbage. The `auto` script switches to a picture on this. */
export function needsRaster(text: string): boolean {
  return /[^\u0000-ÿ]/.test(fold(text));
}

/** The pixels of a white-on-black canvas as packed rows: luminance below `cut` is ink. No dithering —
 *  this is text, and grey text on a thermal head is a smear. */
export function thresholdRows(rgba: Uint8ClampedArray | Uint8Array, widthPx: number, heightPx: number, cut = 160): Uint8Array[] {
  const rows: Uint8Array[] = [];
  const bits = new Uint8Array(widthPx);
  for (let y = 0; y < heightPx; y++) {
    const base = y * widthPx * 4;
    for (let x = 0; x < widthPx; x++) {
      const i = base + x * 4, a = rgba[i + 3] / 255;
      const lum = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a + 255 * (1 - a);
      bits[x] = lum < cut ? 1 : 0;
    }
    rows.push(packRow(bits, widthPx));
  }
  return rows;
}

/** Rows of nothing at the end of the image are paper; drop them so the feed is the printer's, not ours. */
export function trimBlankTail(rows: Uint8Array[], keep = 8): Uint8Array[] {
  let last = rows.length - 1;
  while (last >= 0 && rows[last].every((b) => b === 0)) last--;
  return rows.slice(0, Math.min(rows.length, last + 1 + keep));
}
