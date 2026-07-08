const PALETTE = [
  "#4a8c82", // teal
  "#8c6fa8", // violet
  "#5b7a99", // steel blue
  "#9c6b8a", // dusty plum
  "#c1783d", // burnt orange
  "#b8963e", // ochre
  "#bd5b38", // rust
  "#4e8c93", // slate cyan
  "#b06a5c", // clay rose
  "#7c8c4a", // olive
];

const KNOWN: Record<string, string> = {
  "sports-management": PALETTE[0],
  media: PALETTE[1],
  manufacturing: PALETTE[2],
  consulting: PALETTE[3],
  contracting: PALETTE[4],
  "brick-and-mortar": PALETTE[5],
  energy: PALETTE[6],
  logistics: PALETTE[7],
  "real-estate": PALETTE[8],
  agriculture: PALETTE[9],
};

/**
 * Every tracked industry gets a stable accent color, used consistently as a
 * small dot/flag/badge wherever that industry shows up. The ten current
 * slugs get a hand-picked color; any slug added later (industries are
 * data-driven, not fixed) still gets a stable color via a deterministic
 * hash onto the same palette, so adding an industry never breaks styling.
 */
export function getIndustryColor(slug: string): string {
  if (KNOWN[slug]) return KNOWN[slug];
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Readable text color (near-black or near-cream) for a filled badge using an industry color as its background. */
export function getIndustryTextColor(slug: string): string {
  return relativeLuminance(getIndustryColor(slug)) > 0.35 ? "#14120f" : "#fbf8f2";
}
