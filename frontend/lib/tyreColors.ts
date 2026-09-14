// Pirelli dry-compound colours — domain encoding, not UI chrome.
// Teal stays reserved for interactive state (buttons, focus, slider thumbs).

export const TYRE_COLORS = {
  SOFT: "#DA291C",
  MEDIUM: "#FFD12E",
  HARD: "#F0F0F0",
} as const;

export type DryCompound = keyof typeof TYRE_COLORS;

export function tyreColor(compound: string): string {
  const key = compound.toUpperCase() as DryCompound;
  return TYRE_COLORS[key] ?? "#C9CDD3";
}

/** HARD is off-white; a 1px rim keeps the swatch from dissolving into the page. */
export function tyreNeedsOutline(compound: string): boolean {
  return compound.toUpperCase() === "HARD";
}
