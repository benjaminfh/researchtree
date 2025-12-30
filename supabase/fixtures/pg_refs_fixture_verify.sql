-- Verification queries for pg_refs_fixture.sql

-- 1) Project exists
select id, name
from public.projects
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 2) Refs created
select project_id, name, tip_commit_id
from public.refs
where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
order by name;

-- 3) Commit order per ref
select ref_name, count(*) as commits
from public.commit_order
where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
group by ref_name
order by ref_name;

-- 4) Nodes count
select count(*) as nodes
from public.nodes
where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 5) Drafts
select ref_name, user_id, content
from public.artefact_drafts
where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
order by ref_name;

-- 6) Current ref pref
select current_ref_name
from public.project_user_prefs
where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
