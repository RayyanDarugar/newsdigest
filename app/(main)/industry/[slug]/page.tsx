import { notFound } from "next/navigation";
import Link from "next/link";
import { SourceItemCard } from "@/components/source-item-card";
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

const GROUPS: Array<{ type: SourceItem["source_type"]; label: string }> = [
  { type: "reddit", label: "Reddit" },
  { type: "news", label: "News" },
  { type: "market", label: "Market" },
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
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{industry.name}</h1>
        {date && (
          <Link href={`/d/${date}`} className="text-sm text-neutral-500 underline">
            digest for {date}
          </Link>
        )}
      </div>

      {!digest && (
        <p className="text-neutral-500">
          {date ? `No digest for ${date}.` : "No digests yet."}
        </p>
      )}

      {digest && entries.length > 0 && (
        <section className="mb-8 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-400">
            In this digest
          </h2>
          {entries.map((e) => (
            <div key={e.id} className="py-2">
              <h3 className="font-medium">{e.title}</h3>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{e.body}</p>
            </div>
          ))}
        </section>
      )}

      {digest &&
        GROUPS.map(({ type, label }) => {
          const group = items.filter((i) => i.source_type === type);
          if (group.length === 0) return null;
          return (
            <section key={type} className="mb-8">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                {label}
              </h2>
              {group.map((item) => (
                <SourceItemCard key={item.id} item={item} />
              ))}
            </section>
          );
        })}

      {digest && items.length === 0 && (
        <p className="text-neutral-500">
          Nothing was pulled for {industry.name} on {date}.
        </p>
      )}
    </main>
  );
}
