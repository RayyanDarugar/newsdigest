import type { IconName } from "@/components/icons";

const CATEGORY_ICON: Record<string, IconName> = {
  big_event: "bolt",
  world_news: "globe",
  community_sentiment: "chat",
  industry_events: "cal",
  finance: "bars",
  opportunities: "target",
};

// Categories are data-driven too — a slug added later without an icon
// mapping falls back to a generic glyph rather than breaking the layout.
export function getCategoryIcon(slug: string): IconName {
  return CATEGORY_ICON[slug] ?? "doc";
}
