alter policy "project_members_select_self" on public.project_members
  using ((user_id = (select auth.uid())));

alter policy "projects_select_member" on public.projects
  using ((exists (
    select 1
    from public.project_members pm
    where ((pm.project_id = projects.id) and (pm.user_id = (select auth.uid())))
  )));

alter policy "projects_insert_owner" on public.projects
  with check ((owner_user_id = (select auth.uid())));

alter policy "projects_update_owner" on public.projects
  using ((owner_user_id = (select auth.uid())))
  with check ((owner_user_id = (select auth.uid())));

alter policy "project_members_insert_owner_self" on public.project_members
  with check (((user_id = (select auth.uid())) and (exists (
    select 1
    from public.projects p
    where ((p.id = project_members.project_id) and (p.owner_user_id = (select auth.uid())))
  ))));

alter policy "project_user_prefs_select_own" on public.project_user_prefs
  using (((user_id = (select auth.uid())) and public.rt_is_project_member(project_id)));

alter policy "project_user_prefs_upsert_own" on public.project_user_prefs
  with check (((user_id = (select auth.uid())) and public.rt_is_project_member(project_id)));

alter policy "project_user_prefs_update_own" on public.project_user_prefs
  using (((user_id = (select auth.uid())) and public.rt_is_project_member(project_id)))
  with check (((user_id = (select auth.uid())) and public.rt_is_project_member(project_id)));

alter policy "user_llm_keys_select_self" on public.user_llm_keys
  using ((user_id = (select auth.uid())));

alter policy "artefact_drafts_select_owner" on public.artefact_drafts
  using (((user_id = (select auth.uid())) and public.rt_is_project_member(project_id)));

alter policy "artefact_drafts_write_owner" on public.artefact_drafts
  with check (((user_id = (select auth.uid())) and public.rt_is_project_member(project_id)));

alter policy "artefact_drafts_update_owner" on public.artefact_drafts
  using (((user_id = (select auth.uid())) and public.rt_is_project_member(project_id)))
  with check (((user_id = (select auth.uid())) and public.rt_is_project_member(project_id)));
