-- Mutable canvas drafts (staged, not provenance)

create table if not exists public.artefact_drafts (
  project_id uuid not null references public.projects(id) on delete cascade,
  ref_name text not null,
  user_id uuid not null,
  content text not null,
  content_hash text not null,
  updated_at timestamptz not null default now(),
  primary key (project_id, ref_name, user_id)
);

create index if not exists artefact_drafts_project_ref_updated_idx
on public.artefact_drafts(project_id, ref_name, updated_at desc);

alter table public.artefact_drafts enable row level security;

drop policy if exists artefact_drafts_select_owner on public.artefact_drafts;
create policy artefact_drafts_select_owner
on public.artefact_drafts for select
using (user_id = auth.uid());

drop policy if exists artefact_drafts_write_owner on public.artefact_drafts;
create policy artefact_drafts_write_owner
on public.artefact_drafts for insert
with check (user_id = auth.uid());

drop policy if exists artefact_drafts_update_owner on public.artefact_drafts;
create policy artefact_drafts_update_owner
on public.artefact_drafts for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

