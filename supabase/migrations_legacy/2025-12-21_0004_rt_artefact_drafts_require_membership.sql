-- Require project membership for mutable artefact drafts.
-- Previously drafts were gated only by user_id = auth.uid(), which allowed inserting drafts into any existing project_id.

alter table public.artefact_drafts enable row level security;

drop policy if exists artefact_drafts_select_owner on public.artefact_drafts;
create policy artefact_drafts_select_owner
on public.artefact_drafts for select
using (
  user_id = auth.uid()
  and public.rt_is_project_member(project_id)
);

drop policy if exists artefact_drafts_write_owner on public.artefact_drafts;
create policy artefact_drafts_write_owner
on public.artefact_drafts for insert
with check (
  user_id = auth.uid()
  and public.rt_is_project_member(project_id)
);

drop policy if exists artefact_drafts_update_owner on public.artefact_drafts;
create policy artefact_drafts_update_owner
on public.artefact_drafts for update
using (
  user_id = auth.uid()
  and public.rt_is_project_member(project_id)
)
with check (
  user_id = auth.uid()
  and public.rt_is_project_member(project_id)
);

