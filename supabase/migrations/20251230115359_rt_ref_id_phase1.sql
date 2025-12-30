-- Phase 1: introduce ref_id columns and backfill.

alter table public.refs
  add column id uuid default gen_random_uuid();

update public.refs
set id = gen_random_uuid()
where id is null;

alter table public.refs
  alter column id set not null;

create unique index if not exists refs_project_id_id_key
  on public.refs (project_id, id);

alter table public.commit_order
  add column ref_id uuid;

alter table public.artefact_drafts
  add column ref_id uuid;

alter table public.project_user_prefs
  add column current_ref_id uuid;

update public.commit_order co
set ref_id = r.id
from public.refs r
where co.project_id = r.project_id
  and co.ref_name = r.name
  and co.ref_id is null;

update public.artefact_drafts d
set ref_id = r.id
from public.refs r
where d.project_id = r.project_id
  and d.ref_name = r.name
  and d.ref_id is null;

update public.project_user_prefs pup
set current_ref_id = r.id
from public.refs r
where pup.project_id = r.project_id
  and pup.current_ref_name = r.name
  and pup.current_ref_id is null;

create index if not exists commit_order_project_ref_id_ordinal_idx
  on public.commit_order (project_id, ref_id, ordinal);

create index if not exists commit_order_project_ref_id_commit_idx
  on public.commit_order (project_id, ref_id, commit_id);

create index if not exists artefact_drafts_project_ref_id_updated_idx
  on public.artefact_drafts (project_id, ref_id, updated_at desc);

create index if not exists project_user_prefs_project_ref_id_idx
  on public.project_user_prefs (project_id, current_ref_id);
