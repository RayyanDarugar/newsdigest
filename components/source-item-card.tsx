import type { SourceItem } from "@/lib/types";

export function SourceItemCard({ item }: { item: SourceItem }) {
  const meta: string[] = [];
  if (typeof item.metadata.subreddit === "string") meta.push(`r/${item.metadata.subreddit}`);
  if (typeof item.metadata.source === "string") meta.push(item.metadata.source);
  if (typeof item.metadata.ticker === "string") meta.push(String(item.metadata.ticker));
  if (typeof item.metadata.score === "number") meta.push(`▲ ${item.metadata.score}`);
  if (typeof item.metadata.comments === "number") meta.push(`${item.metadata.comments} comments`);

  return (
    <article className="border-b border-neutral-100 py-3 last:border-b-0 dark:border-neutral-900">
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline"
        >
          {item.title} ↗
        </a>
      ) : (
        <span className="font-medium">{item.title}</span>
      )}
      {item.summary && (
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{item.summary}</p>
      )}
      {meta.length > 0 && (
        <p className="mt-1 text-xs text-neutral-400">{meta.join(" · ")}</p>
      )}
    </article>
  );
}
