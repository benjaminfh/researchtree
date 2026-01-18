-- Add explicit ref_id foreign keys for node provenance.

alter table public.nodes
  add column if not exists created_on_ref_id uuid,
  add column if not exists merge_from_ref_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'nodes_created_on_ref_id_fkey'
  ) then
    alter table public.nodes
      add constraint nodes_created_on_ref_id_fkey
      foreign key (created_on_ref_id)
      references public.refs(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'nodes_merge_from_ref_id_fkey'
  ) then
    alter table public.nodes
      add constraint nodes_merge_from_ref_id_fkey
      foreign key (merge_from_ref_id)
      references public.refs(id)
      on delete set null;
  end if;
end;
$$;

update public.nodes n
set created_on_ref_id = r.id
from public.refs r
where n.created_on_ref_id is null
  and n.project_id = r.project_id
  and n.content_json->>'createdOnBranch' = r.name;

update public.nodes n
set merge_from_ref_id = r.id
from public.refs r
where n.merge_from_ref_id is null
  and n.project_id = r.project_id
  and n.content_json->>'mergeFrom' = r.name;

create index if not exists nodes_project_created_on_ref_id_idx
  on public.nodes (project_id, created_on_ref_id);

create index if not exists nodes_project_merge_from_ref_id_idx
  on public.nodes (project_id, merge_from_ref_id);
