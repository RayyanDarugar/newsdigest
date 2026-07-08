import type { SourceItem } from "@/lib/types";
import { Icon, type IconName } from "@/components/icons";

function sourceIcon(item: SourceItem): IconName {
  if (item.source_type === "reddit") return "chat";
  if (item.source_type === "market") return "bars";
  return "doc";
}

export function SourceItemCard({ item }: { item: SourceItem }) {
  const meta: string[] = [];
  if (typeof item.metadata.subreddit === "string") meta.push(`r/${item.metadata.subreddit}`);
  if (typeof item.metadata.source === "string") meta.push(item.metadata.source);
  if (typeof item.metadata.ticker === "string") meta.push(String(item.metadata.ticker));
  if (typeof item.metadata.score === "number") meta.push(`▲ ${item.metadata.score}`);
  if (typeof item.metadata.comments === "number") meta.push(`${item.metadata.comments} comments`);

  return (
    <article className="flex gap-3 border-b border-border py-3.5 last:border-b-0">
      <Icon name={sourceIcon(item)} className="mt-1 h-3.5 w-3.5 flex-none text-text-muted" />
      <div>
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-body font-semibold hover:underline"
          >
            {item.title} ↗
          </a>
        ) : (
          <span className="font-body font-semibold">{item.title}</span>
        )}
        {item.summary && <p className="mt-1 text-sm text-text-muted">{item.summary}</p>}
        {meta.length > 0 && (
          <p className="mt-1 font-mono text-[11px] text-text-muted">{meta.join(" · ")}</p>
        )}
      </div>
    </article>
  );
}
