import { notFound } from "next/navigation";
import Link from "next/link";
import { SourceItemCard } from "@/components/source-item-card";
import { Icon, type IconName } from "@/components/icons";
import { getIndustryColor } from "@/lib/industry-colors";
import {
  getDigestByDate,
  getDigestDates,
  getIndustry,
  getIndustryEntries,
  getIndustryItems,
} from "@/lib/queries";
import type { SourceItem } from "@/lib/types";
import { isValidDigestDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const GROUPS: Array<{ type: SourceItem["source_type"]; label: string; icon: IconName }> = [
  { type: "reddit", label: "Reddit", icon: "chat" },
  { type: "news", label: "News", icon: "doc" },
  { type: "market", label: "Market", icon: "bars" },
];

export default async function IndustryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { slug } = await params;
  const { date: dateParam } = await searchParams;

  const industry = await getIndustry(slug);
  if (!industry) notFound();

  const dates = await getDigestDates();
  const date = dateParam && isValidDigestDate(dateParam) ? dateParam : dates[0];

  const digest = date ? await getDigestByDate(date) : null;
  const [items, entries] = digest
    ? await Promise.all([
        getIndustryItems(digest.id, slug),
        getIndustryEntries(digest.id, slug),
      ])
    : [[], []];

  return (
    <main>
      <div className="mb-2 flex items-center gap-3">
        <span
          className="h-4 w-4 flex-none rounded-sm"
          style={{ background: getIndustryColor(industry.slug) }}
        />
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight">
          {industry.name}
        </h1>
      </div>
      <div className="mb-8 flex items-center justify-between gap-4 font-mono text-xs uppercase tracking-wide text-text-muted">
        <span>{date ?? "—"}</span>
        {date && (
          <Link href={`/d/${date}`} className="text-accent underline underline-offset-2 hover:no-underline">
            View full digest
          </Link>
        )}
      </div>

      {!digest && (
        <p className="text-text-muted">
          {date ? `No digest for ${date}.` : "No digests yet."}
        </p>
      )}

      {digest && entries.length > 0 && (
        <section className="mb-10 rounded border border-border bg-surface p-5">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.15em] text-text-muted">
            In this digest
          </h2>
          {entries.map((e) => (
            <div key={e.id} className="py-2">
              <h3 className="font-body font-semibold">{e.title}</h3>
              <p className="mt-1 text-sm text-text-muted">{e.body}</p>
            </div>
          ))}
        </section>
      )}

      {digest &&
        GROUPS.map(({ type, label, icon }) => {
          const group = items.filter((i) => i.source_type === type);
          if (group.length === 0) return null;
          return (
            <section key={type} className="mb-10">
              <h2 className="mb-1 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-text-muted">
                <Icon name={icon} className="flex-none text-accent" />
                {label}
              </h2>
              {group.map((item) => (
                <SourceItemCard key={item.id} item={item} />
              ))}
            </section>
          );
        })}

      {digest && items.length === 0 && (
        <p className="text-text-muted">
          Nothing was pulled for {industry.name} on {date}.
        </p>
      )}
    </main>
  );
}
