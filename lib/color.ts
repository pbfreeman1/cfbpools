/**
 * Whether a hex color is light enough to read as TEXT on our dark
 * background (#0B1220). Several SEC teams' real brand colors (near-black
 * navy, dark maroon, etc.) fail this — for those we fall back to normal
 * readable text and use the real color as a small accent dot instead,
 * rather than risking illegible text.
 */
export function isReadableOnDark(hex: string | null | undefined): boolean {
  if (!hex) return false;
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return false;

  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  // Relative luminance (sRGB) — standard perceptual brightness estimate.
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.35;
}
