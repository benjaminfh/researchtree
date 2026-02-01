-- Fix Supabase lints for function search_path and RLS policies.

alter function public.rt_is_project_owner(uuid) set search_path = 'public';

-- Provide explicit RLS policies to satisfy linting while keeping tables closed by default.

drop policy if exists "access_codes_no_access" on public.access_codes;
create policy "access_codes_no_access" on public.access_codes
  for all
  to public
  using (false)
  with check (false);

drop policy if exists "email_allowlist_no_access" on public.email_allowlist;
create policy "email_allowlist_no_access" on public.email_allowlist
  for all
  to public
  using (false)
  with check (false);

drop policy if exists "waitlist_requests_no_access" on public.waitlist_requests;
create policy "waitlist_requests_no_access" on public.waitlist_requests
  for all
  to public
  using (false)
  with check (false);

-- Fix auth RLS initplan warning by materializing auth.uid().

drop policy if exists "project_invites_select_owner" on public.project_invites;
create policy "project_invites_select_owner" on public.project_invites
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_invites.project_id
        and p.owner_user_id = (select auth.uid())
    )
  );
