-- Migration 002: entry deep dives + user profile.
-- Run in the Supabase SQL editor after schema.sql.

create table entry_deep_dives (
  entry_id uuid primary key references digest_entries(id) on delete cascade,
  summary text not null,
  angles jsonb not null default '[]'::jsonb,
  sources_used jsonb not null default '[]'::jsonb,
  model text not null,
  created_at timestamptz not null default now()
);

create table app_profile (
  id int primary key default 1 check (id = 1),
  bio text not null default '',
  updated_at timestamptz not null default now()
);

insert into app_profile (id) values (1);

-- Service-role only, like every other table.
alter table entry_deep_dives enable row level security;
alter table app_profile enable row level security;
