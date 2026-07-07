import Link from "next/link";
import type { EntryWithSources, Industry } from "@/lib/types";
import { SourceLink } from "@/components/source-link";

export function EntryCard({
  entry,
  industriesBySlug,
  date,
  spotlight = false,
}: {
  entry: EntryWithSources;
  industriesBySlug: Map<string, Industry>;
  date: string;
  spotlight?: boolean;
}) {
  const industry = entry.industry_slug
    ? industriesBySlug.get(entry.industry_slug)
    : undefined;
  return (
    <article
      className={
        spotlight
          ? "rounded-xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900"
          : "border-b border-neutral-100 pb-4 last:border-b-0 dark:border-neutral-900"
      }
    >
      <h3 className={spotlight ? "text-lg font-semibold" : "font-medium"}>
        {entry.title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
        {entry.body}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {industry && (
          <Link
            href={`/industry/${industry.slug}?date=${date}`}
            className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            {industry.name}
          </Link>
        )}
        {entry.sources.map((s) => (
          <SourceLink key={s.id} item={s} />
        ))}
      </div>
    </article>
  );
}
