import Link from "next/link";
import type { EntryWithSources, Industry } from "@/lib/types";
import { SourceLink } from "@/components/source-link";
import { Icon } from "@/components/icons";
import { getIndustryColor, getIndustryTextColor } from "@/lib/industry-colors";

export function EntryCard({
  entry,
  industriesBySlug,
  date,
  spotlight = false,
  feature = false,
}: {
  entry: EntryWithSources;
  industriesBySlug: Map<string, Industry>;
  date: string;
  spotlight?: boolean;
  feature?: boolean;
}) {
  const industry = entry.industry_slug
    ? industriesBySlug.get(entry.industry_slug)
    : undefined;
  const tabColor = industry ? getIndustryColor(industry.slug) : undefined;
  const tabText = industry ? getIndustryTextColor(industry.slug) : undefined;

  if (spotlight) {
    return (
      <article className="relative overflow-hidden rounded border border-border border-l-4 border-l-accent bg-surface p-6 sm:p-7">
        <Icon
          name="bolt"
          className="pointer-events-none absolute -right-3 -top-5 h-44 w-44 text-accent opacity-[0.07]"
        />
        <h1 className="drop-cap relative max-w-[34ch] font-body text-2xl font-semibold leading-tight sm:text-3xl">
          {entry.title}
        </h1>
        <p className="relative mt-3 max-w-[58ch] font-body text-base leading-relaxed text-text">
          {entry.body}
        </p>
        <div className="relative mt-4 flex flex-wrap items-center gap-2.5">
          {industry && (
            <Link
              href={`/industry/${industry.slug}?date=${date}`}
              className="rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide"
              style={{ background: tabColor, color: tabText }}
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

  return (
    <article
      className={`relative overflow-hidden rounded border border-border bg-surface p-4 transition-transform duration-150 hover:-translate-y-0.5 ${
        feature ? "sm:col-span-2 sm:p-6" : ""
      }`}
    >
      {tabColor && (
        <span
          className="absolute left-0 top-0 h-7 w-7 [clip-path:polygon(0_0,100%_0,0_100%)]"
          style={{ background: tabColor }}
        />
      )}
      {industry && (
        <Link
          href={`/industry/${industry.slug}?date=${date}`}
          className="mb-2.5 mt-1 inline-block rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide"
          style={{ background: tabColor, color: tabText }}
        >
          {industry.name}
        </Link>
      )}
      <h3 className={`font-body font-semibold leading-snug ${feature ? "text-xl" : "text-base"}`}>
        {entry.title}
      </h3>
      <p className={`mt-2 leading-relaxed text-text-muted ${feature ? "text-[15px]" : "text-sm"}`}>
        {entry.body}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {entry.sources.map((s) => (
          <SourceLink key={s.id} item={s} />
        ))}
      </div>
    </article>
  );
}
