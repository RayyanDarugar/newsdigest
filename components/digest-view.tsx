import { DateNav } from "@/components/date-nav";
import { EntryCard } from "@/components/entry-card";
import { TickerMarquee } from "@/components/ticker-marquee";
import { Icon } from "@/components/icons";
import { getCategoryIcon } from "@/lib/category-icons";
import {
  getActiveIndustries,
  getCategories,
  getDigestByDate,
  getEntriesWithSources,
  getMarketItems,
} from "@/lib/queries";

export async function DigestView({
  date,
  dates,
  isLatest = false,
}: {
  date: string;
  dates: string[];
  isLatest?: boolean;
}) {
  const digest = await getDigestByDate(date);
  if (!digest) {
    return (
      <main>
        <DateNav date={date} dates={dates} />
        <p className="text-text-muted">No digest for {date}.</p>
      </main>
    );
  }

  const [categories, industries, entries, marketItems] = await Promise.all([
    getCategories(),
    getActiveIndustries(),
    getEntriesWithSources(digest.id),
    getMarketItems(digest.id),
  ]);
  const industriesBySlug = new Map(industries.map((i) => [i.slug, i]));
  const today = new Date().toISOString().slice(0, 10);
  // The first category by sort_order renders as the spotlight.
  const [spotlightCategory, ...restCategories] = categories;
  const byCategory = (slug: string) =>
    entries.filter((e) => e.category_slug === slug);

  return (
    <main>
      <TickerMarquee marketItems={marketItems} industries={industries} />
      <DateNav date={date} dates={dates} />
      {isLatest && date !== today && (
        <p className="mb-6 rounded border border-border bg-surface px-3 py-2 font-mono text-xs uppercase tracking-wide text-text-muted">
          No digest yet today — showing the latest from {date}.
        </p>
      )}
      <div className="space-y-12">
        {spotlightCategory && byCategory(spotlightCategory.slug).length > 0 && (
          <section>
            <h2 className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-text-muted after:h-px after:flex-1 after:bg-border">
              <Icon name={getCategoryIcon(spotlightCategory.slug)} className="flex-none text-accent" />
              {spotlightCategory.name}
            </h2>
            <div className="space-y-4">
              {byCategory(spotlightCategory.slug).map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  industriesBySlug={industriesBySlug}
                  date={date}
                  spotlight
                />
              ))}
            </div>
          </section>
        )}
        {restCategories.map((cat) => {
          const catEntries = byCategory(cat.slug);
          if (catEntries.length === 0) return null;
          return (
            <section key={cat.slug}>
              <h2 className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-text-muted after:h-px after:flex-1 after:bg-border">
                <Icon name={getCategoryIcon(cat.slug)} className="flex-none text-accent" />
                {cat.name}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {catEntries.map((e, i) => (
                  <EntryCard
                    key={e.id}
                    entry={e}
                    industriesBySlug={industriesBySlug}
                    date={date}
                    feature={i === 0 && catEntries.length > 1}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
