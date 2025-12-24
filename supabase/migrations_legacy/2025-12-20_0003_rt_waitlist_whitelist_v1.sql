create table if not exists public.email_allowlist (
  email text primary key,
  created_at timestamptz not null default now(),
  created_by text null,
  note text null
);

alter table public.email_allowlist enable row level security;

create table if not exists public.waitlist_requests (
  email text primary key,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  last_requested_at timestamptz not null default now(),
  request_count integer not null default 1,
  approved_at timestamptz null,
  approved_by text null
);

create index if not exists waitlist_requests_status_idx on public.waitlist_requests(status);
create index if not exists waitlist_requests_last_requested_idx on public.waitlist_requests(last_requested_at desc);

alter table public.waitlist_requests enable row level security;

