-- CrimeTimeSnacks community, step one: cases people can follow, updates on
-- those cases, and email members who get a weekly digest.
--
-- Lives in the shared Supabase project (iwsjhiplpbagqkepogmg) alongside other
-- apps, so every object is prefixed cts_. Public reads happen through the anon
-- key at build time (cases and approved updates only); every write goes through
-- the Vercel functions in /api/community with the service role key.
--
-- Apply:  psql "$POSTGRES_URL_NON_POOLING" -f automation/community/schema.sql
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.cts_cases (
  slug          text primary key,
  title         text not null,
  summary       text not null default '',
  angle         text not null default '',
  years         text not null default '',
  status        text not null default 'open',          -- open | trial | convicted | cold | closed
  category      text not null default 'case',          -- case | fbi (step two)
  next_date     date,
  next_label    text not null default '',              -- "Trial begins", "Sentencing"
  image         text not null default '',
  episode_slug  text not null default '',              -- links the podcast episode when there is one
  sources       jsonb not null default '[]'::jsonb,
  featured      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.cts_case_updates (
  id            bigint generated always as identity primary key,
  case_slug     text not null references public.cts_cases(slug) on delete cascade,
  happened_on   date not null default current_date,
  title         text not null,
  summary       text not null default '',
  url           text not null default '',
  source        text not null default '',
  status        text not null default 'pending',       -- pending | approved | rejected
  found_by      text not null default 'watcher',       -- watcher | cory | studio
  created_at    timestamptz not null default now(),
  approved_at   timestamptz
);
create unique index if not exists cts_case_updates_url_uq on public.cts_case_updates (case_slug, url) where url <> '';
create index if not exists cts_case_updates_case_status_idx on public.cts_case_updates (case_slug, status, happened_on desc);

create table if not exists public.cts_members (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  token           text not null unique default encode(gen_random_bytes(24), 'hex'),
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz,
  last_digest_at  timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.cts_follows (
  member_id   uuid not null references public.cts_members(id) on delete cascade,
  case_slug   text not null references public.cts_cases(slug) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (member_id, case_slug)
);

create table if not exists public.cts_digest_log (
  id           bigint generated always as identity primary key,
  member_id    uuid not null references public.cts_members(id) on delete cascade,
  sent_at      timestamptz not null default now(),
  update_count int not null default 0,
  resend_id    text not null default ''
);

-- Row level security: anon may read cases and approved updates, nothing else.
alter table public.cts_cases        enable row level security;
alter table public.cts_case_updates enable row level security;
alter table public.cts_members      enable row level security;
alter table public.cts_follows      enable row level security;
alter table public.cts_digest_log   enable row level security;

drop policy if exists cts_cases_public_read on public.cts_cases;
create policy cts_cases_public_read on public.cts_cases for select to anon, authenticated using (true);

drop policy if exists cts_updates_public_read on public.cts_case_updates;
create policy cts_updates_public_read on public.cts_case_updates for select to anon, authenticated using (status = 'approved');

-- No policies on members, follows, digest_log: only the service role touches them.

-- Follower counts for the case pages, without exposing members.
create or replace view public.cts_case_follow_counts as
  select c.slug, count(f.member_id)::int as followers
  from public.cts_cases c
  left join public.cts_follows f on f.case_slug = c.slug
  left join public.cts_members m on m.id = f.member_id and m.confirmed_at is not null and m.unsubscribed_at is null
  group by c.slug;
grant select on public.cts_case_follow_counts to anon, authenticated;

create or replace function public.cts_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists cts_cases_touch on public.cts_cases;
create trigger cts_cases_touch before update on public.cts_cases for each row execute function public.cts_touch_updated_at();
