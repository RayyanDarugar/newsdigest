import type { SourceItem } from "@/lib/types";
import { Icon, type IconName } from "@/components/icons";

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

function sourceIcon(item: SourceItem): IconName {
  if (item.source_type === "reddit") return "chat";
  if (item.source_type === "market") return "bars";
  return "doc";
}

export function SourceLink({ item }: { item: SourceItem }) {
  const label = sourceLabel(item);
  const icon = sourceIcon(item);
  const cls =
    "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-text-muted transition-colors";
  if (!item.url) {
    return (
      <span className={cls} title={item.title}>
        <Icon name={icon} className="h-2.5 w-2.5 flex-none" />
        {label}
      </span>
    );
  }
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      title={item.title}
      className={`${cls} hover:border-text-muted hover:text-text`}
    >
      <Icon name={icon} className="h-2.5 w-2.5 flex-none" />
      {label} ↗
    </a>
  );
}
