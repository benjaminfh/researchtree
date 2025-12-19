-- SideQuest / ResearchTree provenance store (Postgres)
-- Apply in Supabase (SQL Editor or via supabase-cli migrations).

create extension if not exists pgcrypto;

-- Projects + membership
create table if not exists public.projects (
  id uuid primary key,
  owner_user_id uuid not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- Branch refs
create table if not exists public.refs (
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  tip_commit_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, name)
);

create index if not exists refs_tip_idx on public.refs(project_id, tip_commit_id);

-- Immutable commits (git-ish DAG)
create table if not exists public.commits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  parent1_commit_id uuid null references public.commits(id),
  parent2_commit_id uuid null references public.commits(id),
  message text not null,
  author_user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists commits_project_created_idx on public.commits(project_id, created_at);
create index if not exists commits_parent1_idx on public.commits(parent1_commit_id);
create index if not exists commits_parent2_idx on public.commits(parent2_commit_id);

-- Event log rows (nodes)
create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  commit_id uuid not null references public.commits(id) on delete cascade,
  kind text not null,
  role text not null default 'system',
  content_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists nodes_project_commit_idx on public.nodes(project_id, commit_id);
create index if not exists nodes_project_created_idx on public.nodes(project_id, created_at);

-- Versioned artefacts (canvas markdown)
create table if not exists public.artefacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  commit_id uuid not null references public.commits(id) on delete cascade,
  kind text not null,
  content text not null,
  content_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists artefacts_project_commit_idx on public.artefacts(project_id, commit_id);
create index if not exists artefacts_project_kind_created_idx on public.artefacts(project_id, kind, created_at);

-- Mutable UI state (not provenance)
create table if not exists public.stars (
  project_id uuid not null references public.projects(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, node_id)
);

create index if not exists stars_project_idx on public.stars(project_id);

-- Deterministic commit/node ordering per ref
create table if not exists public.commit_order (
  project_id uuid not null references public.projects(id) on delete cascade,
  ref_name text not null,
  ordinal bigint not null,
  commit_id uuid not null references public.commits(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, ref_name, ordinal),
  unique (project_id, ref_name, commit_id)
);

create index if not exists commit_order_commit_idx on public.commit_order(project_id, commit_id);

-- RLS
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.refs enable row level security;
alter table public.commits enable row level security;
alter table public.nodes enable row level security;
alter table public.artefacts enable row level security;
alter table public.stars enable row level security;
alter table public.commit_order enable row level security;

-- Policies (MVP: membership grants access)

-- project_members: users can see their own membership rows
drop policy if exists project_members_select_self on public.project_members;
create policy project_members_select_self
on public.project_members for select
using (user_id = auth.uid());

-- projects
drop policy if exists projects_select_member on public.projects;
create policy projects_select_member
on public.projects for select
using (
  exists (
    select 1
    from public.project_members pm
    where pm.project_id = projects.id
      and pm.user_id = auth.uid()
  )
);

drop policy if exists projects_insert_owner on public.projects;
create policy projects_insert_owner
on public.projects for insert
with check (owner_user_id = auth.uid());

drop policy if exists projects_update_owner on public.projects;
create policy projects_update_owner
on public.projects for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

-- project_members: owner can add themself (idempotent for create_project)
drop policy if exists project_members_insert_owner_self on public.project_members;
create policy project_members_insert_owner_self
on public.project_members for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.projects p
    where p.id = project_members.project_id
      and p.owner_user_id = auth.uid()
  )
);

-- shared membership check for all other tables
create or replace function public.rt_is_project_member(p_project_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  );
$$;

-- refs
drop policy if exists refs_select_member on public.refs;
create policy refs_select_member
on public.refs for select
using (public.rt_is_project_member(refs.project_id));

drop policy if exists refs_insert_member on public.refs;
create policy refs_insert_member
on public.refs for insert
with check (public.rt_is_project_member(refs.project_id));

drop policy if exists refs_update_member on public.refs;
create policy refs_update_member
on public.refs for update
using (public.rt_is_project_member(refs.project_id))
with check (public.rt_is_project_member(refs.project_id));

-- commits
drop policy if exists commits_select_member on public.commits;
create policy commits_select_member
on public.commits for select
using (public.rt_is_project_member(commits.project_id));

drop policy if exists commits_insert_member on public.commits;
create policy commits_insert_member
on public.commits for insert
with check (public.rt_is_project_member(commits.project_id));

-- nodes
drop policy if exists nodes_select_member on public.nodes;
create policy nodes_select_member
on public.nodes for select
using (public.rt_is_project_member(nodes.project_id));

drop policy if exists nodes_insert_member on public.nodes;
create policy nodes_insert_member
on public.nodes for insert
with check (public.rt_is_project_member(nodes.project_id));

-- artefacts
drop policy if exists artefacts_select_member on public.artefacts;
create policy artefacts_select_member
on public.artefacts for select
using (public.rt_is_project_member(artefacts.project_id));

drop policy if exists artefacts_insert_member on public.artefacts;
create policy artefacts_insert_member
on public.artefacts for insert
with check (public.rt_is_project_member(artefacts.project_id));

-- stars
drop policy if exists stars_select_member on public.stars;
create policy stars_select_member
on public.stars for select
using (public.rt_is_project_member(stars.project_id));

drop policy if exists stars_insert_member on public.stars;
create policy stars_insert_member
on public.stars for insert
with check (public.rt_is_project_member(stars.project_id));

drop policy if exists stars_delete_member on public.stars;
create policy stars_delete_member
on public.stars for delete
using (public.rt_is_project_member(stars.project_id));

-- commit_order
drop policy if exists commit_order_select_member on public.commit_order;
create policy commit_order_select_member
on public.commit_order for select
using (public.rt_is_project_member(commit_order.project_id));

drop policy if exists commit_order_insert_member on public.commit_order;
create policy commit_order_insert_member
on public.commit_order for insert
with check (public.rt_is_project_member(commit_order.project_id));

