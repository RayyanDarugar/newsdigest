import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getActiveIndustries,
  getCategories,
  getDeepDive,
  getDigestById,
  getEntryWithSourcesById,
} from "@/lib/queries";
import { SourceLink } from "@/components/source-link";
import { Icon } from "@/components/icons";
import { Markdown } from "@/components/markdown";
import { AngleCard } from "@/components/angle-card";
import { DeepDiveSection } from "@/components/deep-dive-section";
import { RegenerateButton } from "@/components/regenerate-button";
import { EntryChat } from "@/components/entry-chat";
import { getCategoryIcon } from "@/lib/category-icons";
import { getIndustryColor, getIndustryTextColor } from "@/lib/industry-colors";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const entry = await getEntryWithSourcesById(id);
  if (!entry) notFound();

  const [digest, deepDive, categories, industries] = await Promise.all([
    getDigestById(entry.digest_id),
    getDeepDive(id),
    getCategories(),
    getActiveIndustries(),
  ]);
  const category = categories.find((c) => c.slug === entry.category_slug);
  const industry = entry.industry_slug
    ? industries.find((i) => i.slug === entry.industry_slug)
    : undefined;
  const date = digest?.digest_date;

  return (
    <main>
      <header className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2.5 font-mono text-xs uppercase tracking-wide text-text-muted">
          <Icon
            name={getCategoryIcon(entry.category_slug)}
            className="flex-none text-accent"
          />
          <span>{category?.name ?? entry.category_slug}</span>
          {industry && (
            <Link
              href={`/industry/${industry.slug}${date ? `?date=${date}` : ""}`}
              className="rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide"
              style={{
                background: getIndustryColor(industry.slug),
                color: getIndustryTextColor(industry.slug),
              }}
            >
              {industry.name}
            </Link>
          )}
          {date && (
            <Link
              href={`/d/${date}`}
              className="ml-auto text-accent underline underline-offset-2 hover:no-underline"
            >
              ← {date} digest
            </Link>
          )}
        </div>
        <h1 className="max-w-[34ch] font-body text-2xl font-semibold leading-tight sm:text-3xl">
          {entry.title}
        </h1>
        <p className="mt-3 max-w-[58ch] leading-relaxed text-text-muted">
          {entry.body}
        </p>
        {entry.sources.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {entry.sources.map((s) => (
              <SourceLink key={s.id} item={s} />
            ))}
          </div>
        )}
      </header>

      <section className="mb-10">
        <h2 className="mb-4 flex items-center justify-between gap-2 font-mono text-xs uppercase tracking-[0.15em] text-text-muted after:hidden">
          <span className="flex items-center gap-2">
            <Icon name="doc" className="flex-none text-accent" />
            The Deep Dive
          </span>
          {deepDive && <RegenerateButton entryId={id} />}
        </h2>
        {deepDive ? (
          <div className="rounded border border-border bg-surface p-5">
            <Markdown>{deepDive.summary}</Markdown>
          </div>
        ) : (
          <DeepDiveSection entryId={id} />
        )}
      </section>

      {deepDive && deepDive.angles.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-text-muted">
            <Icon name="bolt" className="flex-none text-accent" />
            Angles
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {deepDive.angles.map((angle, i) => (
              <AngleCard key={i} angle={angle} index={i} />
            ))}
          </div>
        </section>
      )}

      {deepDive && deepDive.sources_used.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.15em] text-text-muted">
            Sources consulted
          </h2>
          <ul className="space-y-1">
            {deepDive.sources_used.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-text-muted underline underline-offset-2 hover:text-text"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-text-muted">
          <Icon name="chat" className="flex-none text-accent" />
          Ask about this story
        </h2>
        <EntryChat entryId={id} enabled={!!deepDive} />
      </section>
    </main>
  );
}
