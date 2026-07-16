export type Industry = {
  slug: string;
  name: string;
  active: boolean;
  sort_order: number;
};

export type Category = {
  slug: string;
  name: string;
  sort_order: number;
};

export type Digest = {
  id: string;
  digest_date: string;
  created_at: string;
};

export type SourceItem = {
  id: string;
  digest_id: string;
  industry_slug: string | null;
  source_type: "reddit" | "news" | "market";
  title: string;
  url: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  position: number;
};

export type DigestEntry = {
  id: string;
  digest_id: string;
  category_slug: string;
  industry_slug: string | null;
  title: string;
  body: string;
  position: number;
};

export type EntryWithSources = DigestEntry & { sources: SourceItem[] };

export type Angle = {
  title: string;
  rationale: string;
  first_move: string;
};

export type DeepDiveSource = { title: string; url: string };

export type DeepDive = {
  entry_id: string;
  summary: string;
  angles: Angle[];
  sources_used: DeepDiveSource[];
  model: string;
  created_at: string;
};
