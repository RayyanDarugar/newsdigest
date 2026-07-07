import { getServiceClient } from "@/lib/db";
import type {
  Category,
  Digest,
  DigestEntry,
  EntryWithSources,
  Industry,
  SourceItem,
} from "@/lib/types";

export async function getDigestDates(): Promise<string[]> {
  const { data, error } = await getServiceClient()
    .from("digests")
    .select("digest_date")
    .order("digest_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => d.digest_date as string);
}

export async function getDigestByDate(date: string): Promise<Digest | null> {
  const { data, error } = await getServiceClient()
    .from("digests")
    .select("id, digest_date, created_at")
    .eq("digest_date", date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Digest | null;
}

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await getServiceClient()
    .from("categories")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Category[];
}

export async function getActiveIndustries(): Promise<Industry[]> {
  const { data, error } = await getServiceClient()
    .from("industries")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Industry[];
}

export async function getIndustry(slug: string): Promise<Industry | null> {
  const { data, error } = await getServiceClient()
    .from("industries")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Industry | null;
}

type EntryRow = DigestEntry & {
  entry_sources: Array<{ source_items: SourceItem | null }> | null;
};

export async function getEntriesWithSources(
  digestId: string,
): Promise<EntryWithSources[]> {
  const { data, error } = await getServiceClient()
    .from("digest_entries")
    .select("*, entry_sources(source_items(*))")
    .eq("digest_id", digestId)
    .order("position");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as EntryRow[]).map(
    ({ entry_sources, ...entry }) => ({
      ...entry,
      sources: (entry_sources ?? [])
        .map((es) => es.source_items)
        .filter((s): s is SourceItem => s !== null)
        .sort((a, b) => a.position - b.position),
    }),
  );
}

export async function getIndustryItems(
  digestId: string,
  slug: string,
): Promise<SourceItem[]> {
  const { data, error } = await getServiceClient()
    .from("source_items")
    .select("*")
    .eq("digest_id", digestId)
    .eq("industry_slug", slug)
    .order("source_type")
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as SourceItem[];
}

export async function getIndustryEntries(
  digestId: string,
  slug: string,
): Promise<DigestEntry[]> {
  const { data, error } = await getServiceClient()
    .from("digest_entries")
    .select("*")
    .eq("digest_id", digestId)
    .eq("industry_slug", slug)
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as DigestEntry[];
}
