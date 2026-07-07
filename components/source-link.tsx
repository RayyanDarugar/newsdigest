import type { SourceItem } from "@/lib/types";

function sourceLabel(item: SourceItem): string {
  if (item.source_type === "reddit" && typeof item.metadata.subreddit === "string") {
    return `r/${item.metadata.subreddit}`;
  }
  if (typeof item.metadata.source === "string") return item.metadata.source;
  if (typeof item.metadata.ticker === "string") return item.metadata.ticker;
  if (item.url) {
    try {
      return new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      /* fall through */
    }
  }
  return item.source_type;
}

export function SourceLink({ item }: { item: SourceItem }) {
  const label = sourceLabel(item);
  const cls =
    "rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400";
  if (!item.url) {
    return <span className={cls} title={item.title}>{label}</span>;
  }
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      title={item.title}
      className={`${cls} hover:border-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100`}
    >
      {label} ↗
    </a>
  );
}
