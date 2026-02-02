-- Add indexes to cover foreign keys flagged by Supabase linter.

create index if not exists artefact_drafts_ref_id_idx
  on public.artefact_drafts (ref_id);

create index if not exists artefacts_commit_id_idx
  on public.artefacts (commit_id);

create index if not exists artefacts_ref_id_idx
  on public.artefacts (ref_id);

create index if not exists commit_order_commit_id_idx
  on public.commit_order (commit_id);

create index if not exists commit_order_ref_id_idx
  on public.commit_order (ref_id);

create index if not exists nodes_commit_id_idx
  on public.nodes (commit_id);

create index if not exists nodes_created_on_ref_id_idx
  on public.nodes (created_on_ref_id);

create index if not exists nodes_merge_from_ref_id_idx
  on public.nodes (merge_from_ref_id);

create index if not exists project_user_prefs_current_ref_id_idx
  on public.project_user_prefs (current_ref_id);

create index if not exists ref_leases_ref_id_idx
  on public.ref_leases (ref_id);

create index if not exists stars_node_id_idx
  on public.stars (node_id);
