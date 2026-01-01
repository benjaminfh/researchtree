-- Phase 1 patch: add ref_id to artefacts and backfill.

alter table public.artefacts
  add column ref_id uuid;

with ranked as (
  select
    co.project_id,
    co.commit_id,
    co.ref_id,
    row_number() over (
      partition by co.project_id, co.commit_id
      order by co.ordinal desc, co.ref_id
    ) as rn
  from public.commit_order co
)
update public.artefacts a
set ref_id = ranked.ref_id
from ranked
where a.project_id = ranked.project_id
  and a.commit_id = ranked.commit_id
  and ranked.rn = 1
  and a.ref_id is null;

create index if not exists artefacts_project_ref_id_idx
  on public.artefacts (project_id, ref_id);
