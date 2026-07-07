-- Industry Digest schema. Run in the Supabase SQL editor.
-- Idempotent-ish: drops nothing; run once on a fresh project.

create table industries (
  slug text primary key,
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0
);

create table categories (
  slug text primary key,
  name text not null,
  sort_order int not null default 0
);

create table digests (
  id uuid primary key,
  digest_date date not null unique,
  raw_payload jsonb not null,
  created_at timestamptz not null default now()
);

create table source_items (
  id uuid primary key,
  digest_id uuid not null references digests(id) on delete cascade,
  industry_slug text references industries(slug),
  source_type text not null check (source_type in ('reddit', 'news', 'market')),
  title text not null,
  url text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  position int not null default 0
);

create index source_items_digest_industry_idx on source_items (digest_id, industry_slug);

create table digest_entries (
  id uuid primary key,
  digest_id uuid not null references digests(id) on delete cascade,
  category_slug text not null references categories(slug),
  industry_slug text references industries(slug),
  title text not null,
  body text not null,
  position int not null default 0
);

create index digest_entries_digest_category_idx on digest_entries (digest_id, category_slug);

create table entry_sources (
  entry_id uuid not null references digest_entries(id) on delete cascade,
  source_item_id uuid not null references source_items(id) on delete cascade,
  primary key (entry_id, source_item_id)
);

-- The app uses only the service-role key. Enable RLS with no policies so the
-- anon key can read nothing.
alter table industries enable row level security;
alter table categories enable row level security;
alter table digests enable row level security;
alter table source_items enable row level security;
alter table digest_entries enable row level security;
alter table entry_sources enable row level security;

-- Transactional delete-and-replace for one day's digest. Functions run in a
-- single transaction, so a failure leaves prior data intact.
create or replace function replace_digest(
  p_digest jsonb,
  p_items jsonb,
  p_entries jsonb,
  p_entry_sources jsonb
) returns void
language plpgsql
as $$
begin
  delete from digests where digest_date = (p_digest ->> 'digest_date')::date;

  insert into digests (id, digest_date, raw_payload)
  values (
    (p_digest ->> 'id')::uuid,
    (p_digest ->> 'digest_date')::date,
    p_digest -> 'raw_payload'
  );

  insert into source_items (id, digest_id, industry_slug, source_type, title, url, summary, metadata, position)
  select
    (x ->> 'id')::uuid,
    (x ->> 'digest_id')::uuid,
    x ->> 'industry_slug',
    x ->> 'source_type',
    x ->> 'title',
    x ->> 'url',
    x ->> 'summary',
    coalesce(x -> 'metadata', '{}'::jsonb),
    (x ->> 'position')::int
  from jsonb_array_elements(p_items) x;

  insert into digest_entries (id, digest_id, category_slug, industry_slug, title, body, position)
  select
    (x ->> 'id')::uuid,
    (x ->> 'digest_id')::uuid,
    x ->> 'category_slug',
    x ->> 'industry_slug',
    x ->> 'title',
    x ->> 'body',
    (x ->> 'position')::int
  from jsonb_array_elements(p_entries) x;

  insert into entry_sources (entry_id, source_item_id)
  select
    (x ->> 'entry_id')::uuid,
    (x ->> 'source_item_id')::uuid
  from jsonb_array_elements(p_entry_sources) x;
end;
$$;

-- Seeds
insert into categories (slug, name, sort_order) values
  ('big_event', 'Biggest Event of the Day', 0),
  ('world_news', 'World News', 1),
  ('community_sentiment', 'Community Sentiment', 2),
  ('industry_events', 'Industry Events', 3),
  ('finance', 'Finance', 4),
  ('opportunities', 'Opportunities', 5);

insert into industries (slug, name, sort_order) values
  ('sports-management', 'Sports Management', 0),
  ('media', 'Media', 1),
  ('manufacturing', 'Manufacturing', 2),
  ('consulting', 'Consulting', 3),
  ('contracting', 'Contracting', 4),
  ('brick-and-mortar', 'Brick & Mortar', 5),
  ('energy', 'Energy', 6),
  ('logistics', 'Logistics', 7),
  ('real-estate', 'Real Estate', 8),
  ('agriculture', 'Agriculture', 9);
