-- Verification queries for pg_refs_fixture.sql

-- 1) Project exists
select id, name
from public.projects
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 2) Refs created
select project_id, id, name, tip_commit_id
from public.refs
where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
order by name;

-- 3) Commit order per ref
select r.name as ref_name, count(*) as commits
from public.commit_order co
join public.refs r
  on r.project_id = co.project_id
 and r.id = co.ref_id
where co.project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
group by r.name
order by r.name;

-- 4) Nodes count
select count(*) as nodes
from public.nodes
where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 5) Drafts
select r.name as ref_name, d.user_id, d.content
from public.artefact_drafts d
join public.refs r
  on r.project_id = d.project_id
 and r.id = d.ref_id
where d.project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
order by r.name;

-- 6) Current ref pref
select r.name as current_ref_name
from public.project_user_prefs pup
join public.refs r
  on r.project_id = pup.project_id
 and r.id = pup.current_ref_id
where pup.project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
