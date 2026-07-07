import { DateNav } from "@/components/date-nav";
import { EntryCard } from "@/components/entry-card";
import {
  getActiveIndustries,
  getCategories,
  getDigestByDate,
  getEntriesWithSources,
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
        <p className="text-neutral-500">No digest for {date}.</p>
      </main>
    );
  }

  const [categories, industries, entries] = await Promise.all([
    getCategories(),
    getActiveIndustries(),
    getEntriesWithSources(digest.id),
  ]);
  const industriesBySlug = new Map(industries.map((i) => [i.slug, i]));
  const today = new Date().toISOString().slice(0, 10);
  // The first category by sort_order renders as the spotlight.
  const [spotlightCategory, ...restCategories] = categories;
  const byCategory = (slug: string) =>
    entries.filter((e) => e.category_slug === slug);

  return (
    <main>
      <DateNav date={date} dates={dates} />
      {isLatest && date !== today && (
        <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No digest yet today — showing the latest from {date}.
        </p>
      )}
      <div className="space-y-10">
        {spotlightCategory && byCategory(spotlightCategory.slug).length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
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
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                {cat.name}
              </h2>
              <div className="space-y-4">
                {catEntries.map((e) => (
                  <EntryCard
                    key={e.id}
                    entry={e}
                    industriesBySlug={industriesBySlug}
                    date={date}
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
