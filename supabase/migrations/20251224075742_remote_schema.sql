
  create table "public"."access_codes" (
    "code" text not null,
    "max_uses" integer not null default 5,
    "uses" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "created_by" text,
    "note" text
      );


alter table "public"."access_codes" enable row level security;


  create table "public"."artefact_drafts" (
    "project_id" uuid not null,
    "ref_name" text not null,
    "user_id" uuid not null,
    "content" text not null,
    "content_hash" text not null,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."artefact_drafts" enable row level security;


  create table "public"."artefacts" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid not null,
    "commit_id" uuid not null,
    "kind" text not null,
    "content" text not null,
    "content_hash" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."artefacts" enable row level security;


  create table "public"."commit_order" (
    "project_id" uuid not null,
    "ref_name" text not null,
    "ordinal" bigint not null,
    "commit_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."commit_order" enable row level security;


  create table "public"."commits" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid not null,
    "parent1_commit_id" uuid,
    "parent2_commit_id" uuid,
    "message" text not null,
    "author_user_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."commits" enable row level security;


  create table "public"."email_allowlist" (
    "email" text not null,
    "created_at" timestamp with time zone not null default now(),
    "created_by" text,
    "note" text
      );


alter table "public"."email_allowlist" enable row level security;


  create table "public"."nodes" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid not null,
    "commit_id" uuid not null,
    "kind" text not null,
    "role" text not null default 'system'::text,
    "content_json" jsonb not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."nodes" enable row level security;


  create table "public"."project_members" (
    "project_id" uuid not null,
    "user_id" uuid not null,
    "role" text not null default 'owner'::text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."project_members" enable row level security;


  create table "public"."project_user_prefs" (
    "project_id" uuid not null,
    "user_id" uuid not null,
    "current_ref_name" text not null default 'main'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."project_user_prefs" enable row level security;


  create table "public"."projects" (
    "id" uuid not null,
    "owner_user_id" uuid not null,
    "name" text not null,
    "description" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."projects" enable row level security;


  create table "public"."refs" (
    "project_id" uuid not null,
    "name" text not null,
    "tip_commit_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."refs" enable row level security;


  create table "public"."stars" (
    "project_id" uuid not null,
    "node_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."stars" enable row level security;


  create table "public"."user_llm_keys" (
    "user_id" uuid not null,
    "openai_secret_id" uuid,
    "gemini_secret_id" uuid,
    "anthropic_secret_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."user_llm_keys" enable row level security;


  create table "public"."waitlist_requests" (
    "email" text not null,
    "status" text not null default 'pending'::text,
    "created_at" timestamp with time zone not null default now(),
    "last_requested_at" timestamp with time zone not null default now(),
    "request_count" integer not null default 1,
    "approved_at" timestamp with time zone,
    "approved_by" text
      );


alter table "public"."waitlist_requests" enable row level security;

CREATE UNIQUE INDEX access_codes_pkey ON public.access_codes USING btree (code);

CREATE UNIQUE INDEX artefact_drafts_pkey ON public.artefact_drafts USING btree (project_id, ref_name, user_id);

CREATE INDEX artefact_drafts_project_ref_updated_idx ON public.artefact_drafts USING btree (project_id, ref_name, updated_at DESC);

CREATE UNIQUE INDEX artefacts_pkey ON public.artefacts USING btree (id);

CREATE INDEX artefacts_project_commit_idx ON public.artefacts USING btree (project_id, commit_id);

CREATE INDEX artefacts_project_kind_created_idx ON public.artefacts USING btree (project_id, kind, created_at);

CREATE INDEX commit_order_commit_idx ON public.commit_order USING btree (project_id, commit_id);

CREATE UNIQUE INDEX commit_order_pkey ON public.commit_order USING btree (project_id, ref_name, ordinal);

CREATE UNIQUE INDEX commit_order_project_id_ref_name_commit_id_key ON public.commit_order USING btree (project_id, ref_name, commit_id);

CREATE INDEX commits_parent1_idx ON public.commits USING btree (parent1_commit_id);

CREATE INDEX commits_parent2_idx ON public.commits USING btree (parent2_commit_id);

CREATE UNIQUE INDEX commits_pkey ON public.commits USING btree (id);

CREATE INDEX commits_project_created_idx ON public.commits USING btree (project_id, created_at);

CREATE UNIQUE INDEX email_allowlist_pkey ON public.email_allowlist USING btree (email);

CREATE UNIQUE INDEX nodes_pkey ON public.nodes USING btree (id);

CREATE INDEX nodes_project_commit_idx ON public.nodes USING btree (project_id, commit_id);

CREATE INDEX nodes_project_created_idx ON public.nodes USING btree (project_id, created_at);

CREATE UNIQUE INDEX project_members_pkey ON public.project_members USING btree (project_id, user_id);

CREATE UNIQUE INDEX project_user_prefs_pkey ON public.project_user_prefs USING btree (project_id, user_id);

CREATE INDEX project_user_prefs_project_idx ON public.project_user_prefs USING btree (project_id);

CREATE INDEX project_user_prefs_user_idx ON public.project_user_prefs USING btree (user_id);

CREATE UNIQUE INDEX projects_pkey ON public.projects USING btree (id);

CREATE UNIQUE INDEX refs_pkey ON public.refs USING btree (project_id, name);

CREATE INDEX refs_tip_idx ON public.refs USING btree (project_id, tip_commit_id);

CREATE UNIQUE INDEX stars_pkey ON public.stars USING btree (project_id, node_id);

CREATE INDEX stars_project_idx ON public.stars USING btree (project_id);

CREATE UNIQUE INDEX user_llm_keys_pkey ON public.user_llm_keys USING btree (user_id);

CREATE INDEX waitlist_requests_last_requested_idx ON public.waitlist_requests USING btree (last_requested_at DESC);

CREATE UNIQUE INDEX waitlist_requests_pkey ON public.waitlist_requests USING btree (email);

CREATE INDEX waitlist_requests_status_idx ON public.waitlist_requests USING btree (status);

alter table "public"."access_codes" add constraint "access_codes_pkey" PRIMARY KEY using index "access_codes_pkey";

alter table "public"."artefact_drafts" add constraint "artefact_drafts_pkey" PRIMARY KEY using index "artefact_drafts_pkey";

alter table "public"."artefacts" add constraint "artefacts_pkey" PRIMARY KEY using index "artefacts_pkey";

alter table "public"."commit_order" add constraint "commit_order_pkey" PRIMARY KEY using index "commit_order_pkey";

alter table "public"."commits" add constraint "commits_pkey" PRIMARY KEY using index "commits_pkey";

alter table "public"."email_allowlist" add constraint "email_allowlist_pkey" PRIMARY KEY using index "email_allowlist_pkey";

alter table "public"."nodes" add constraint "nodes_pkey" PRIMARY KEY using index "nodes_pkey";

alter table "public"."project_members" add constraint "project_members_pkey" PRIMARY KEY using index "project_members_pkey";

alter table "public"."project_user_prefs" add constraint "project_user_prefs_pkey" PRIMARY KEY using index "project_user_prefs_pkey";

alter table "public"."projects" add constraint "projects_pkey" PRIMARY KEY using index "projects_pkey";

alter table "public"."refs" add constraint "refs_pkey" PRIMARY KEY using index "refs_pkey";

alter table "public"."stars" add constraint "stars_pkey" PRIMARY KEY using index "stars_pkey";

alter table "public"."user_llm_keys" add constraint "user_llm_keys_pkey" PRIMARY KEY using index "user_llm_keys_pkey";

alter table "public"."waitlist_requests" add constraint "waitlist_requests_pkey" PRIMARY KEY using index "waitlist_requests_pkey";

alter table "public"."artefact_drafts" add constraint "artefact_drafts_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."artefact_drafts" validate constraint "artefact_drafts_project_id_fkey";

alter table "public"."artefacts" add constraint "artefacts_commit_id_fkey" FOREIGN KEY (commit_id) REFERENCES public.commits(id) ON DELETE CASCADE not valid;

alter table "public"."artefacts" validate constraint "artefacts_commit_id_fkey";

alter table "public"."artefacts" add constraint "artefacts_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."artefacts" validate constraint "artefacts_project_id_fkey";

alter table "public"."commit_order" add constraint "commit_order_commit_id_fkey" FOREIGN KEY (commit_id) REFERENCES public.commits(id) ON DELETE CASCADE not valid;

alter table "public"."commit_order" validate constraint "commit_order_commit_id_fkey";

alter table "public"."commit_order" add constraint "commit_order_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."commit_order" validate constraint "commit_order_project_id_fkey";

alter table "public"."commit_order" add constraint "commit_order_project_id_ref_name_commit_id_key" UNIQUE using index "commit_order_project_id_ref_name_commit_id_key";

alter table "public"."commits" add constraint "commits_parent1_commit_id_fkey" FOREIGN KEY (parent1_commit_id) REFERENCES public.commits(id) not valid;

alter table "public"."commits" validate constraint "commits_parent1_commit_id_fkey";

alter table "public"."commits" add constraint "commits_parent2_commit_id_fkey" FOREIGN KEY (parent2_commit_id) REFERENCES public.commits(id) not valid;

alter table "public"."commits" validate constraint "commits_parent2_commit_id_fkey";

alter table "public"."commits" add constraint "commits_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."commits" validate constraint "commits_project_id_fkey";

alter table "public"."nodes" add constraint "nodes_commit_id_fkey" FOREIGN KEY (commit_id) REFERENCES public.commits(id) ON DELETE CASCADE not valid;

alter table "public"."nodes" validate constraint "nodes_commit_id_fkey";

alter table "public"."nodes" add constraint "nodes_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."nodes" validate constraint "nodes_project_id_fkey";

alter table "public"."project_members" add constraint "project_members_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."project_members" validate constraint "project_members_project_id_fkey";

alter table "public"."project_user_prefs" add constraint "project_user_prefs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."project_user_prefs" validate constraint "project_user_prefs_project_id_fkey";

alter table "public"."refs" add constraint "refs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."refs" validate constraint "refs_project_id_fkey";

alter table "public"."stars" add constraint "stars_node_id_fkey" FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE not valid;

alter table "public"."stars" validate constraint "stars_node_id_fkey";

alter table "public"."waitlist_requests" add constraint "waitlist_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))) not valid;

alter table "public"."waitlist_requests" validate constraint "waitlist_requests_status_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.rt_append_node_to_ref(p_project_id uuid, p_ref_name text, p_kind text, p_role text, p_content_json jsonb, p_commit_message text DEFAULT NULL::text, p_node_id uuid DEFAULT NULL::uuid, p_lock_timeout_ms integer DEFAULT 3000)
 RETURNS TABLE(new_commit_id uuid, node_id uuid, ordinal bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old_tip uuid;
  v_new_commit_id uuid;
  v_node_id uuid;
  v_last_ordinal bigint;
  v_next_ordinal bigint;
  v_content_json jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  -- Fail fast on concurrent writers for the same ref (UI shows spinner then error).
  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.tip_commit_id
    into v_old_tip
  from public.refs r
  where r.project_id = p_project_id and r.name = p_ref_name
  for update;

  if not found then
    raise exception 'Ref not found';
  end if;

  select coalesce(max(co.ordinal), -1)
    into v_last_ordinal
  from public.commit_order co
  where co.project_id = p_project_id and co.ref_name = p_ref_name;

  v_next_ordinal := v_last_ordinal + 1;

  insert into public.commits (project_id, parent1_commit_id, parent2_commit_id, message, author_user_id)
  values (p_project_id, v_old_tip, null, coalesce(p_commit_message, p_kind), auth.uid())
  returning id into v_new_commit_id;

  v_node_id := coalesce(p_node_id, gen_random_uuid());
  v_content_json := jsonb_set(coalesce(p_content_json, '{}'::jsonb), '{id}', to_jsonb(v_node_id::text), true);

  insert into public.nodes (id, project_id, commit_id, kind, role, content_json)
  values (v_node_id, p_project_id, v_new_commit_id, p_kind, p_role, v_content_json);

  insert into public.commit_order (project_id, ref_name, ordinal, commit_id)
  values (p_project_id, p_ref_name, v_next_ordinal, v_new_commit_id);

  update public.refs
  set tip_commit_id = v_new_commit_id, updated_at = now()
  where project_id = p_project_id and name = p_ref_name;

  return query select v_new_commit_id, v_node_id, v_next_ordinal;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_append_node_to_ref_v1(p_project_id uuid, p_ref_name text, p_kind text, p_role text, p_content_json jsonb, p_node_id uuid DEFAULT NULL::uuid, p_commit_message text DEFAULT NULL::text, p_attach_draft boolean DEFAULT false, p_artefact_kind text DEFAULT 'canvas_md'::text, p_lock_timeout_ms integer DEFAULT 3000)
 RETURNS TABLE(new_commit_id uuid, node_id uuid, ordinal bigint, artefact_id uuid, artefact_content_hash text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old_tip uuid;
  v_new_commit_id uuid;
  v_node_id uuid;
  v_last_ordinal bigint;
  v_next_ordinal bigint;
  v_content_json jsonb;
  v_draft_content text;
  v_draft_hash text;
  v_latest_hash text;
  v_artefact_id uuid;
  v_artefact_hash text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  -- Ensure ref exists (shadow-write may arrive before branches are migrated).
  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, p_ref_name, null)
  on conflict do nothing;

  select r.tip_commit_id
    into v_old_tip
  from public.refs r
  where r.project_id = p_project_id and r.name = p_ref_name
  for update;

  if not found then
    raise exception 'Ref not found';
  end if;

  select coalesce(max(co.ordinal), -1)
    into v_last_ordinal
  from public.commit_order co
  where co.project_id = p_project_id and co.ref_name = p_ref_name;

  v_next_ordinal := v_last_ordinal + 1;

  insert into public.commits (project_id, parent1_commit_id, parent2_commit_id, message, author_user_id)
  values (p_project_id, v_old_tip, null, coalesce(p_commit_message, p_kind), auth.uid())
  returning id into v_new_commit_id;

  v_node_id := coalesce(p_node_id, gen_random_uuid());
  v_content_json := jsonb_set(coalesce(p_content_json, '{}'::jsonb), '{id}', to_jsonb(v_node_id::text), true);

  insert into public.nodes (id, project_id, commit_id, kind, role, content_json)
  values (v_node_id, p_project_id, v_new_commit_id, p_kind, coalesce(p_role, 'system'), v_content_json);

  if p_attach_draft then
    select d.content, d.content_hash
      into v_draft_content, v_draft_hash
    from public.artefact_drafts d
    where d.project_id = p_project_id
      and d.ref_name = p_ref_name
      and d.user_id = auth.uid();

    if found then
      select a.content_hash
        into v_latest_hash
      from public.artefacts a
      join public.commit_order co
        on co.project_id = a.project_id
       and co.commit_id = a.commit_id
      where a.project_id = p_project_id
        and co.ref_name = p_ref_name
        and a.kind = p_artefact_kind
      order by co.ordinal desc
      limit 1;

      if v_latest_hash is distinct from v_draft_hash then
        insert into public.artefacts (project_id, commit_id, kind, content, content_hash)
        values (p_project_id, v_new_commit_id, p_artefact_kind, coalesce(v_draft_content, ''), v_draft_hash)
        returning id, content_hash into v_artefact_id, v_artefact_hash;
      end if;
    end if;
  end if;

  insert into public.commit_order (project_id, ref_name, ordinal, commit_id)
  values (p_project_id, p_ref_name, v_next_ordinal, v_new_commit_id);

  update public.refs
  set tip_commit_id = v_new_commit_id, updated_at = now()
  where project_id = p_project_id and name = p_ref_name;

  return query select v_new_commit_id, v_node_id, v_next_ordinal, v_artefact_id, v_artefact_hash;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_create_project(p_name text, p_description text DEFAULT NULL::text, p_project_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project_id uuid;
  v_existing_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_project_id := coalesce(p_project_id, gen_random_uuid());

  select p.owner_user_id
    into v_existing_owner
  from public.projects p
  where p.id = v_project_id;

  if found and v_existing_owner is distinct from auth.uid() then
    raise exception 'Not authorized';
  end if;

  if not found then
    insert into public.projects (id, owner_user_id, name, description)
    values (v_project_id, auth.uid(), p_name, p_description);
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (v_project_id, auth.uid(), 'owner')
  on conflict do nothing;

  insert into public.refs (project_id, name, tip_commit_id)
  values (v_project_id, 'main', null)
  on conflict do nothing;

  return v_project_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_create_ref_from_node_parent_v1(p_project_id uuid, p_source_ref_name text, p_new_ref_name text, p_node_id uuid, p_lock_timeout_ms integer DEFAULT 3000)
 RETURNS TABLE(base_commit_id uuid, base_ordinal bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_node_commit_id uuid;
  v_node_ordinal bigint;
  v_base_commit_id uuid;
  v_base_ordinal bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, p_source_ref_name, null)
  on conflict do nothing;

  select n.commit_id
    into v_node_commit_id
  from public.nodes n
  where n.project_id = p_project_id and n.id = p_node_id;

  if not found then
    raise exception 'Node not found in Postgres (shadow-write not available for this history yet)';
  end if;

  select co.ordinal
    into v_node_ordinal
  from public.commit_order co
  where co.project_id = p_project_id
    and co.ref_name = p_source_ref_name
    and co.commit_id = v_node_commit_id;

  if not found then
    raise exception 'Node is not on source ref in Postgres';
  end if;

  select c.parent1_commit_id
    into v_base_commit_id
  from public.commits c
  where c.id = v_node_commit_id;

  v_base_ordinal := v_node_ordinal - 1;

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, p_new_ref_name, v_base_commit_id)
  on conflict (project_id, name)
  do update set
    tip_commit_id = excluded.tip_commit_id,
    updated_at = now();

  delete from public.commit_order co
  where co.project_id = p_project_id and co.ref_name = p_new_ref_name;

  if v_base_ordinal >= 0 then
    insert into public.commit_order (project_id, ref_name, ordinal, commit_id)
    select co.project_id, p_new_ref_name, co.ordinal, co.commit_id
    from public.commit_order co
    where co.project_id = p_project_id
      and co.ref_name = p_source_ref_name
      and co.ordinal <= v_base_ordinal
    order by co.ordinal asc;
  end if;

  return query select v_base_commit_id, v_base_ordinal;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_create_ref_from_ref_v1(p_project_id uuid, p_from_ref_name text, p_new_ref_name text, p_lock_timeout_ms integer DEFAULT 3000)
 RETURNS TABLE(base_commit_id uuid, base_ordinal bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tip uuid;
  v_last_ordinal bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  if p_new_ref_name is null or btrim(p_new_ref_name) = '' then
    raise exception 'new ref name is required';
  end if;
  if p_from_ref_name is null or btrim(p_from_ref_name) = '' then
    raise exception 'from ref name is required';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  -- Ensure source exists.
  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, btrim(p_from_ref_name), null)
  on conflict do nothing;

  -- Fail if destination already exists.
  if exists (
    select 1 from public.refs r
    where r.project_id = p_project_id and r.name = btrim(p_new_ref_name)
  ) then
    raise exception 'Ref already exists';
  end if;

  -- Snapshot the source tip.
  select r.tip_commit_id
    into v_tip
  from public.refs r
  where r.project_id = p_project_id and r.name = btrim(p_from_ref_name)
  for share;

  select coalesce(max(co.ordinal), -1)
    into v_last_ordinal
  from public.commit_order co
  where co.project_id = p_project_id and co.ref_name = btrim(p_from_ref_name);

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, btrim(p_new_ref_name), v_tip);

  -- Copy commit ordering prefix so "node index" semantics match the source ref.
  insert into public.commit_order (project_id, ref_name, ordinal, commit_id)
  select co.project_id, btrim(p_new_ref_name), co.ordinal, co.commit_id
  from public.commit_order co
  where co.project_id = p_project_id
    and co.ref_name = btrim(p_from_ref_name)
  order by co.ordinal asc;

  return query select v_tip, v_last_ordinal;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_get_canvas_v1(p_project_id uuid, p_ref_name text, p_kind text DEFAULT 'canvas_md'::text)
 RETURNS TABLE(content text, content_hash text, updated_at timestamp with time zone, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_content text;
  v_hash text;
  v_updated timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  -- Prefer the caller's draft (mutable).
  select d.content, d.content_hash, d.updated_at
    into v_content, v_hash, v_updated
  from public.artefact_drafts d
  where d.project_id = p_project_id
    and d.ref_name = p_ref_name
    and d.user_id = auth.uid();

  if found then
    return query select v_content, v_hash, v_updated, 'draft'::text;
    return;
  end if;

  -- Fallback: latest immutable artefact on the ref history.
  select a.content, a.content_hash, a.created_at
    into v_content, v_hash, v_updated
  from public.artefacts a
  join public.commit_order co
    on co.project_id = a.project_id
   and co.commit_id = a.commit_id
  where a.project_id = p_project_id
    and co.ref_name = p_ref_name
    and a.kind = p_kind
  order by co.ordinal desc
  limit 1;

  if found then
    return query select v_content, v_hash, v_updated, 'artefact'::text;
    return;
  end if;

  return query select ''::text, ''::text, null::timestamptz, 'empty'::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_get_current_ref_v1(p_project_id uuid, p_default_ref_name text DEFAULT 'main'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ref text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  select pup.current_ref_name
    into v_ref
  from public.project_user_prefs pup
  where pup.project_id = p_project_id and pup.user_id = auth.uid();

  return coalesce(v_ref, p_default_ref_name, 'main');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_get_history_v1(p_project_id uuid, p_ref_name text, p_limit integer DEFAULT 200, p_before_ordinal bigint DEFAULT NULL::bigint)
 RETURNS TABLE(ordinal bigint, node_json jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select t.ordinal, t.node_json
  from (
    select co.ordinal, n.content_json as node_json
    from public.commit_order co
    join public.nodes n
      on n.project_id = co.project_id
     and n.commit_id = co.commit_id
    where co.project_id = p_project_id
      and co.ref_name = p_ref_name
      and (p_before_ordinal is null or co.ordinal < p_before_ordinal)
    order by co.ordinal desc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) t
  order by t.ordinal asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_get_starred_node_ids_v1(p_project_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  select coalesce(array_agg(s.node_id order by s.created_at asc), '{}'::uuid[])
    into v_ids
  from public.stars s
  where s.project_id = p_project_id;

  return v_ids;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_get_user_llm_key_server_v1(p_user_id uuid, p_provider text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret_id uuid;
  v_secret text;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if p_provider is null or p_provider not in ('openai', 'gemini', 'anthropic') then
    raise exception 'Invalid provider';
  end if;

  if p_provider = 'openai' then
    select k.openai_secret_id into v_secret_id
    from public.user_llm_keys k
    where k.user_id = p_user_id;
  elsif p_provider = 'gemini' then
    select k.gemini_secret_id into v_secret_id
    from public.user_llm_keys k
    where k.user_id = p_user_id;
  else
    select k.anthropic_secret_id into v_secret_id
    from public.user_llm_keys k
    where k.user_id = p_user_id;
  end if;

  if v_secret_id is null then
    return null;
  end if;

  select public.rt_vault_decrypt_secret_compat_v1(v_secret_id) into v_secret;
  return v_secret;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_get_user_llm_key_status_v1()
 RETURNS TABLE(has_openai boolean, has_gemini boolean, has_anthropic boolean, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  insert into public.user_llm_keys (user_id)
  values (auth.uid())
  on conflict do nothing;

  return query
  select
    (k.openai_secret_id is not null) as has_openai,
    (k.gemini_secret_id is not null) as has_gemini,
    (k.anthropic_secret_id is not null) as has_anthropic,
    k.updated_at
  from public.user_llm_keys k
  where k.user_id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_get_user_llm_key_v1(p_provider text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret_id uuid;
  v_secret text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if p_provider is null or p_provider not in ('openai', 'gemini', 'anthropic') then
    raise exception 'Invalid provider';
  end if;

  insert into public.user_llm_keys (user_id)
  values (auth.uid())
  on conflict do nothing;

  if p_provider = 'openai' then
    select k.openai_secret_id into v_secret_id
    from public.user_llm_keys k
    where k.user_id = auth.uid();
  elsif p_provider = 'gemini' then
    select k.gemini_secret_id into v_secret_id
    from public.user_llm_keys k
    where k.user_id = auth.uid();
  else
    select k.anthropic_secret_id into v_secret_id
    from public.user_llm_keys k
    where k.user_id = auth.uid();
  end if;

  if v_secret_id is null then
    return null;
  end if;

  select public.rt_vault_decrypt_secret_compat_v1(v_secret_id) into v_secret;
  return v_secret;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_is_project_member(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.rt_list_refs_v1(p_project_id uuid)
 RETURNS TABLE(name text, head_commit text, node_count bigint, is_trunk boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    r.name,
    coalesce(r.tip_commit_id::text, '') as head_commit,
    coalesce(mx.max_ordinal + 1, 0)::bigint as node_count,
    (r.name = 'main') as is_trunk
  from public.refs r
  left join (
    select co.ref_name, max(co.ordinal) as max_ordinal
    from public.commit_order co
    where co.project_id = p_project_id
    group by co.ref_name
  ) mx on mx.ref_name = r.name
  where r.project_id = p_project_id
  order by (r.name = 'main') desc, r.updated_at desc, r.name asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_merge_ours_v1(p_project_id uuid, p_target_ref_name text, p_source_ref_name text, p_merge_node_json jsonb, p_merge_node_id uuid DEFAULT NULL::uuid, p_commit_message text DEFAULT NULL::text, p_lock_timeout_ms integer DEFAULT 3000)
 RETURNS TABLE(new_commit_id uuid, node_id uuid, ordinal bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target_old_tip uuid;
  v_source_tip uuid;
  v_new_commit_id uuid;
  v_node_id uuid;
  v_last_ordinal bigint;
  v_next_ordinal bigint;
  v_node_json jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, p_target_ref_name, null)
  on conflict do nothing;

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, p_source_ref_name, null)
  on conflict do nothing;

  -- Lock target ref so merge is serialized on that branch.
  select r.tip_commit_id
    into v_target_old_tip
  from public.refs r
  where r.project_id = p_project_id and r.name = p_target_ref_name
  for update;

  if not found then
    raise exception 'Target ref not found';
  end if;

  select r.tip_commit_id
    into v_source_tip
  from public.refs r
  where r.project_id = p_project_id and r.name = p_source_ref_name;

  if v_source_tip is null then
    raise exception 'Source ref tip not available';
  end if;

  select coalesce(max(co.ordinal), -1)
    into v_last_ordinal
  from public.commit_order co
  where co.project_id = p_project_id and co.ref_name = p_target_ref_name;

  v_next_ordinal := v_last_ordinal + 1;

  insert into public.commits (project_id, parent1_commit_id, parent2_commit_id, message, author_user_id)
  values (p_project_id, v_target_old_tip, v_source_tip, coalesce(p_commit_message, 'merge'), auth.uid())
  returning id into v_new_commit_id;

  v_node_id := coalesce(p_merge_node_id, gen_random_uuid());
  v_node_json := jsonb_set(coalesce(p_merge_node_json, '{}'::jsonb), '{id}', to_jsonb(v_node_id::text), true);

  insert into public.nodes (id, project_id, commit_id, kind, role, content_json)
  values (v_node_id, p_project_id, v_new_commit_id, 'merge', 'system', v_node_json);

  insert into public.commit_order (project_id, ref_name, ordinal, commit_id)
  values (p_project_id, p_target_ref_name, v_next_ordinal, v_new_commit_id);

  update public.refs
  set tip_commit_id = v_new_commit_id, updated_at = now()
  where project_id = p_project_id and name = p_target_ref_name;

  return query select v_new_commit_id, v_node_id, v_next_ordinal;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_redeem_access_code_v1(p_code text, p_email text, p_approved_by text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_code text := lower(trim(p_code));
  v_email text := lower(trim(p_email));
  v_row public.access_codes%rowtype;
begin
  if v_code is null or v_code = '' then
    raise exception 'Access code is required';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'Email is required';
  end if;

  update public.access_codes
  set uses = uses + 1
  where code = v_code and uses < max_uses
  returning * into v_row;

  if not found then
    return false;
  end if;

  insert into public.email_allowlist (email, created_by, note)
  values (v_email, p_approved_by, 'access_code:' || v_code)
  on conflict (email) do update
  set created_by = excluded.created_by;

  insert into public.waitlist_requests (email, status, approved_at, approved_by, last_requested_at)
  values (v_email, 'approved', now(), p_approved_by, now())
  on conflict (email) do update
  set status = 'approved',
      approved_at = now(),
      approved_by = p_approved_by,
      last_requested_at = now();

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_save_artefact_draft(p_project_id uuid, p_ref_name text, p_content text, p_lock_timeout_ms integer DEFAULT 3000)
 RETURNS TABLE(content_hash text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hash text;
  v_updated timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  v_hash := encode(extensions.digest(convert_to(coalesce(p_content, ''), 'utf8'), 'sha256'::text), 'hex');

  insert into public.artefact_drafts (project_id, ref_name, user_id, content, content_hash, updated_at)
  values (p_project_id, p_ref_name, auth.uid(), coalesce(p_content, ''), v_hash, now())
  on conflict (project_id, ref_name, user_id)
  do update set
    content = excluded.content,
    content_hash = excluded.content_hash,
    updated_at = excluded.updated_at
  returning artefact_drafts.updated_at into v_updated;

  return query select v_hash, v_updated;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_set_current_ref_v1(p_project_id uuid, p_ref_name text, p_lock_timeout_ms integer DEFAULT 3000)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  if p_ref_name is null or btrim(p_ref_name) = '' then
    raise exception 'ref name is required';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, btrim(p_ref_name), null)
  on conflict do nothing;

  insert into public.project_user_prefs (project_id, user_id, current_ref_name, updated_at)
  values (p_project_id, auth.uid(), btrim(p_ref_name), now())
  on conflict (project_id, user_id)
  do update set
    current_ref_name = excluded.current_ref_name,
    updated_at = excluded.updated_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_set_user_llm_key_v1(p_provider text, p_secret text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_existing_secret_id uuid;
  v_new_secret_id uuid;
  v_trimmed text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if p_provider is null or p_provider not in ('openai', 'gemini', 'anthropic') then
    raise exception 'Invalid provider';
  end if;

  insert into public.user_llm_keys (user_id)
  values (auth.uid())
  on conflict do nothing;

  v_trimmed := nullif(btrim(coalesce(p_secret, '')), '');

  if p_provider = 'openai' then
    select k.openai_secret_id into v_existing_secret_id
    from public.user_llm_keys k
    where k.user_id = auth.uid()
    for update;

    if v_trimmed is null then
      update public.user_llm_keys
      set openai_secret_id = null, updated_at = now()
      where user_id = auth.uid();
      begin
        if v_existing_secret_id is not null then
          perform vault.delete_secret(v_existing_secret_id);
        end if;
      exception when undefined_function then
        -- ignore; not all vault installs support deletion
      end;
      return;
    end if;

    if v_existing_secret_id is not null then
      begin
        perform vault.update_secret(v_existing_secret_id, v_trimmed);
        update public.user_llm_keys
        set updated_at = now()
        where user_id = auth.uid();
        return;
      exception when undefined_function then
        -- fall through to create a new secret
      end;
    end if;

    v_new_secret_id := vault.create_secret(v_trimmed);
    update public.user_llm_keys
    set openai_secret_id = v_new_secret_id, updated_at = now()
    where user_id = auth.uid();
    return;
  end if;

  if p_provider = 'gemini' then
    select k.gemini_secret_id into v_existing_secret_id
    from public.user_llm_keys k
    where k.user_id = auth.uid()
    for update;

    if v_trimmed is null then
      update public.user_llm_keys
      set gemini_secret_id = null, updated_at = now()
      where user_id = auth.uid();
      begin
        if v_existing_secret_id is not null then
          perform vault.delete_secret(v_existing_secret_id);
        end if;
      exception when undefined_function then
      end;
      return;
    end if;

    if v_existing_secret_id is not null then
      begin
        perform vault.update_secret(v_existing_secret_id, v_trimmed);
        update public.user_llm_keys
        set updated_at = now()
        where user_id = auth.uid();
        return;
      exception when undefined_function then
      end;
    end if;

    v_new_secret_id := vault.create_secret(v_trimmed);
    update public.user_llm_keys
    set gemini_secret_id = v_new_secret_id, updated_at = now()
    where user_id = auth.uid();
    return;
  end if;

  if p_provider = 'anthropic' then
    select k.anthropic_secret_id into v_existing_secret_id
    from public.user_llm_keys k
    where k.user_id = auth.uid()
    for update;

    if v_trimmed is null then
      update public.user_llm_keys
      set anthropic_secret_id = null, updated_at = now()
      where user_id = auth.uid();
      begin
        if v_existing_secret_id is not null then
          perform vault.delete_secret(v_existing_secret_id);
        end if;
      exception when undefined_function then
      end;
      return;
    end if;

    if v_existing_secret_id is not null then
      begin
        perform vault.update_secret(v_existing_secret_id, v_trimmed);
        update public.user_llm_keys
        set updated_at = now()
        where user_id = auth.uid();
        return;
      exception when undefined_function then
      end;
    end if;

    v_new_secret_id := vault.create_secret(v_trimmed);
    update public.user_llm_keys
    set anthropic_secret_id = v_new_secret_id, updated_at = now()
    where user_id = auth.uid();
    return;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_toggle_star_v1(p_project_id uuid, p_node_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  if p_node_id is null then
    raise exception 'node id is required';
  end if;

  if exists (
    select 1 from public.stars s
    where s.project_id = p_project_id and s.node_id = p_node_id
  ) then
    delete from public.stars s
    where s.project_id = p_project_id and s.node_id = p_node_id;
  else
    insert into public.stars (project_id, node_id)
    values (p_project_id, p_node_id)
    on conflict do nothing;
  end if;

  select coalesce(array_agg(s.node_id order by s.created_at asc), '{}'::uuid[])
    into v_ids
  from public.stars s
  where s.project_id = p_project_id;

  return v_ids;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_update_artefact_on_ref(p_project_id uuid, p_ref_name text, p_content text, p_kind text DEFAULT 'canvas_md'::text, p_state_node_id uuid DEFAULT NULL::uuid, p_state_node_json jsonb DEFAULT NULL::jsonb, p_commit_message text DEFAULT NULL::text, p_lock_timeout_ms integer DEFAULT 3000)
 RETURNS TABLE(new_commit_id uuid, artefact_id uuid, state_node_id uuid, ordinal bigint, content_hash text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old_tip uuid;
  v_new_commit_id uuid;
  v_artefact_id uuid;
  v_state_node_id uuid;
  v_last_ordinal bigint;
  v_next_ordinal bigint;
  v_content_hash text;
  v_state_json jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, p_ref_name, null)
  on conflict do nothing;

  select r.tip_commit_id
    into v_old_tip
  from public.refs r
  where r.project_id = p_project_id and r.name = p_ref_name
  for update;

  if not found then
    raise exception 'Ref not found';
  end if;

  select coalesce(max(co.ordinal), -1)
    into v_last_ordinal
  from public.commit_order co
  where co.project_id = p_project_id and co.ref_name = p_ref_name;

  v_next_ordinal := v_last_ordinal + 1;
  v_content_hash := encode(extensions.digest(convert_to(coalesce(p_content, ''), 'utf8'), 'sha256'::text), 'hex');

  insert into public.commits (project_id, parent1_commit_id, parent2_commit_id, message, author_user_id)
  values (p_project_id, v_old_tip, null, coalesce(p_commit_message, 'artefact'), auth.uid())
  returning id into v_new_commit_id;

  insert into public.artefacts (project_id, commit_id, kind, content, content_hash)
  values (p_project_id, v_new_commit_id, p_kind, coalesce(p_content, ''), v_content_hash)
  returning id into v_artefact_id;

  if p_state_node_json is not null then
    v_state_node_id := coalesce(p_state_node_id, gen_random_uuid());
    v_state_json := jsonb_set(coalesce(p_state_node_json, '{}'::jsonb), '{id}', to_jsonb(v_state_node_id::text), true);
    insert into public.nodes (id, project_id, commit_id, kind, role, content_json)
    values (v_state_node_id, p_project_id, v_new_commit_id, 'state', 'system', v_state_json);
  end if;

  insert into public.commit_order (project_id, ref_name, ordinal, commit_id)
  values (p_project_id, p_ref_name, v_next_ordinal, v_new_commit_id);

  update public.refs
  set tip_commit_id = v_new_commit_id, updated_at = now()
  where project_id = p_project_id and name = p_ref_name;

  return query select v_new_commit_id, v_artefact_id, v_state_node_id, v_next_ordinal, v_content_hash;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rt_vault_decrypt_secret_compat_v1(p_secret_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text;
begin
  if p_secret_id is null then
    return null;
  end if;

  -- Newer Vault API.
  begin
    execute 'select vault.decrypt_secret($1)' into v_secret using p_secret_id;
    return v_secret;
  exception when undefined_function then
    null;
  end;

  -- Some installs expose a decrypted_secrets view.
  begin
    begin
      execute 'select decrypted_secret from vault.decrypted_secrets where id = $1' into v_secret using p_secret_id;
      return v_secret;
    exception when undefined_column then
      execute 'select secret from vault.decrypted_secrets where id = $1' into v_secret using p_secret_id;
      return v_secret;
    end;
  exception when undefined_table then
    null;
  end;

  -- Some installs expose a read_secret() function.
  begin
    execute 'select vault.read_secret($1)' into v_secret using p_secret_id;
    return v_secret;
  exception when undefined_function then
    null;
  end;

  -- Some installs expose a read_secret() function returning JSON.
  begin
    execute 'select (vault.read_secret($1))::jsonb ->> ''secret''' into v_secret using p_secret_id;
    if v_secret is not null then
      return v_secret;
    end if;
  exception when undefined_function or cannot_coerce or invalid_text_representation then
    null;
  end;

  -- Some installs expose a get_secret() function returning JSON.
  begin
    execute 'select (vault.get_secret($1))::jsonb ->> ''secret''' into v_secret using p_secret_id;
    if v_secret is not null then
      return v_secret;
    end if;
  exception when undefined_function or cannot_coerce or invalid_text_representation then
    null;
  end;

  -- Some installs expose a get_secret() function returning a record with a "secret" field.
  begin
    execute 'select (vault.get_secret($1)).secret' into v_secret using p_secret_id;
    return v_secret;
  exception when undefined_function or undefined_column then
    null;
  end;

  raise exception 'Vault secret read is not supported by this Supabase Vault install';
end;
$function$
;

grant delete on table "public"."access_codes" to "anon";

grant insert on table "public"."access_codes" to "anon";

grant references on table "public"."access_codes" to "anon";

grant select on table "public"."access_codes" to "anon";

grant trigger on table "public"."access_codes" to "anon";

grant truncate on table "public"."access_codes" to "anon";

grant update on table "public"."access_codes" to "anon";

grant delete on table "public"."access_codes" to "authenticated";

grant insert on table "public"."access_codes" to "authenticated";

grant references on table "public"."access_codes" to "authenticated";

grant select on table "public"."access_codes" to "authenticated";

grant trigger on table "public"."access_codes" to "authenticated";

grant truncate on table "public"."access_codes" to "authenticated";

grant update on table "public"."access_codes" to "authenticated";

grant delete on table "public"."access_codes" to "service_role";

grant insert on table "public"."access_codes" to "service_role";

grant references on table "public"."access_codes" to "service_role";

grant select on table "public"."access_codes" to "service_role";

grant trigger on table "public"."access_codes" to "service_role";

grant truncate on table "public"."access_codes" to "service_role";

grant update on table "public"."access_codes" to "service_role";

grant delete on table "public"."artefact_drafts" to "anon";

grant insert on table "public"."artefact_drafts" to "anon";

grant references on table "public"."artefact_drafts" to "anon";

grant select on table "public"."artefact_drafts" to "anon";

grant trigger on table "public"."artefact_drafts" to "anon";

grant truncate on table "public"."artefact_drafts" to "anon";

grant update on table "public"."artefact_drafts" to "anon";

grant delete on table "public"."artefact_drafts" to "authenticated";

grant insert on table "public"."artefact_drafts" to "authenticated";

grant references on table "public"."artefact_drafts" to "authenticated";

grant select on table "public"."artefact_drafts" to "authenticated";

grant trigger on table "public"."artefact_drafts" to "authenticated";

grant truncate on table "public"."artefact_drafts" to "authenticated";

grant update on table "public"."artefact_drafts" to "authenticated";

grant delete on table "public"."artefact_drafts" to "service_role";

grant insert on table "public"."artefact_drafts" to "service_role";

grant references on table "public"."artefact_drafts" to "service_role";

grant select on table "public"."artefact_drafts" to "service_role";

grant trigger on table "public"."artefact_drafts" to "service_role";

grant truncate on table "public"."artefact_drafts" to "service_role";

grant update on table "public"."artefact_drafts" to "service_role";

grant delete on table "public"."artefacts" to "anon";

grant insert on table "public"."artefacts" to "anon";

grant references on table "public"."artefacts" to "anon";

grant select on table "public"."artefacts" to "anon";

grant trigger on table "public"."artefacts" to "anon";

grant truncate on table "public"."artefacts" to "anon";

grant update on table "public"."artefacts" to "anon";

grant delete on table "public"."artefacts" to "authenticated";

grant insert on table "public"."artefacts" to "authenticated";

grant references on table "public"."artefacts" to "authenticated";

grant select on table "public"."artefacts" to "authenticated";

grant trigger on table "public"."artefacts" to "authenticated";

grant truncate on table "public"."artefacts" to "authenticated";

grant update on table "public"."artefacts" to "authenticated";

grant delete on table "public"."artefacts" to "service_role";

grant insert on table "public"."artefacts" to "service_role";

grant references on table "public"."artefacts" to "service_role";

grant select on table "public"."artefacts" to "service_role";

grant trigger on table "public"."artefacts" to "service_role";

grant truncate on table "public"."artefacts" to "service_role";

grant update on table "public"."artefacts" to "service_role";

grant delete on table "public"."commit_order" to "anon";

grant insert on table "public"."commit_order" to "anon";

grant references on table "public"."commit_order" to "anon";

grant select on table "public"."commit_order" to "anon";

grant trigger on table "public"."commit_order" to "anon";

grant truncate on table "public"."commit_order" to "anon";

grant update on table "public"."commit_order" to "anon";

grant delete on table "public"."commit_order" to "authenticated";

grant insert on table "public"."commit_order" to "authenticated";

grant references on table "public"."commit_order" to "authenticated";

grant select on table "public"."commit_order" to "authenticated";

grant trigger on table "public"."commit_order" to "authenticated";

grant truncate on table "public"."commit_order" to "authenticated";

grant update on table "public"."commit_order" to "authenticated";

grant delete on table "public"."commit_order" to "service_role";

grant insert on table "public"."commit_order" to "service_role";

grant references on table "public"."commit_order" to "service_role";

grant select on table "public"."commit_order" to "service_role";

grant trigger on table "public"."commit_order" to "service_role";

grant truncate on table "public"."commit_order" to "service_role";

grant update on table "public"."commit_order" to "service_role";

grant delete on table "public"."commits" to "anon";

grant insert on table "public"."commits" to "anon";

grant references on table "public"."commits" to "anon";

grant select on table "public"."commits" to "anon";

grant trigger on table "public"."commits" to "anon";

grant truncate on table "public"."commits" to "anon";

grant update on table "public"."commits" to "anon";

grant delete on table "public"."commits" to "authenticated";

grant insert on table "public"."commits" to "authenticated";

grant references on table "public"."commits" to "authenticated";

grant select on table "public"."commits" to "authenticated";

grant trigger on table "public"."commits" to "authenticated";

grant truncate on table "public"."commits" to "authenticated";

grant update on table "public"."commits" to "authenticated";

grant delete on table "public"."commits" to "service_role";

grant insert on table "public"."commits" to "service_role";

grant references on table "public"."commits" to "service_role";

grant select on table "public"."commits" to "service_role";

grant trigger on table "public"."commits" to "service_role";

grant truncate on table "public"."commits" to "service_role";

grant update on table "public"."commits" to "service_role";

grant delete on table "public"."email_allowlist" to "anon";

grant insert on table "public"."email_allowlist" to "anon";

grant references on table "public"."email_allowlist" to "anon";

grant select on table "public"."email_allowlist" to "anon";

grant trigger on table "public"."email_allowlist" to "anon";

grant truncate on table "public"."email_allowlist" to "anon";

grant update on table "public"."email_allowlist" to "anon";

grant delete on table "public"."email_allowlist" to "authenticated";

grant insert on table "public"."email_allowlist" to "authenticated";

grant references on table "public"."email_allowlist" to "authenticated";

grant select on table "public"."email_allowlist" to "authenticated";

grant trigger on table "public"."email_allowlist" to "authenticated";

grant truncate on table "public"."email_allowlist" to "authenticated";

grant update on table "public"."email_allowlist" to "authenticated";

grant delete on table "public"."email_allowlist" to "service_role";

grant insert on table "public"."email_allowlist" to "service_role";

grant references on table "public"."email_allowlist" to "service_role";

grant select on table "public"."email_allowlist" to "service_role";

grant trigger on table "public"."email_allowlist" to "service_role";

grant truncate on table "public"."email_allowlist" to "service_role";

grant update on table "public"."email_allowlist" to "service_role";

grant delete on table "public"."nodes" to "anon";

grant insert on table "public"."nodes" to "anon";

grant references on table "public"."nodes" to "anon";

grant select on table "public"."nodes" to "anon";

grant trigger on table "public"."nodes" to "anon";

grant truncate on table "public"."nodes" to "anon";

grant update on table "public"."nodes" to "anon";

grant delete on table "public"."nodes" to "authenticated";

grant insert on table "public"."nodes" to "authenticated";

grant references on table "public"."nodes" to "authenticated";

grant select on table "public"."nodes" to "authenticated";

grant trigger on table "public"."nodes" to "authenticated";

grant truncate on table "public"."nodes" to "authenticated";

grant update on table "public"."nodes" to "authenticated";

grant delete on table "public"."nodes" to "service_role";

grant insert on table "public"."nodes" to "service_role";

grant references on table "public"."nodes" to "service_role";

grant select on table "public"."nodes" to "service_role";

grant trigger on table "public"."nodes" to "service_role";

grant truncate on table "public"."nodes" to "service_role";

grant update on table "public"."nodes" to "service_role";

grant delete on table "public"."project_members" to "anon";

grant insert on table "public"."project_members" to "anon";

grant references on table "public"."project_members" to "anon";

grant select on table "public"."project_members" to "anon";

grant trigger on table "public"."project_members" to "anon";

grant truncate on table "public"."project_members" to "anon";

grant update on table "public"."project_members" to "anon";

grant delete on table "public"."project_members" to "authenticated";

grant insert on table "public"."project_members" to "authenticated";

grant references on table "public"."project_members" to "authenticated";

grant select on table "public"."project_members" to "authenticated";

grant trigger on table "public"."project_members" to "authenticated";

grant truncate on table "public"."project_members" to "authenticated";

grant update on table "public"."project_members" to "authenticated";

grant delete on table "public"."project_members" to "service_role";

grant insert on table "public"."project_members" to "service_role";

grant references on table "public"."project_members" to "service_role";

grant select on table "public"."project_members" to "service_role";

grant trigger on table "public"."project_members" to "service_role";

grant truncate on table "public"."project_members" to "service_role";

grant update on table "public"."project_members" to "service_role";

grant delete on table "public"."project_user_prefs" to "anon";

grant insert on table "public"."project_user_prefs" to "anon";

grant references on table "public"."project_user_prefs" to "anon";

grant select on table "public"."project_user_prefs" to "anon";

grant trigger on table "public"."project_user_prefs" to "anon";

grant truncate on table "public"."project_user_prefs" to "anon";

grant update on table "public"."project_user_prefs" to "anon";

grant delete on table "public"."project_user_prefs" to "authenticated";

grant insert on table "public"."project_user_prefs" to "authenticated";

grant references on table "public"."project_user_prefs" to "authenticated";

grant select on table "public"."project_user_prefs" to "authenticated";

grant trigger on table "public"."project_user_prefs" to "authenticated";

grant truncate on table "public"."project_user_prefs" to "authenticated";

grant update on table "public"."project_user_prefs" to "authenticated";

grant delete on table "public"."project_user_prefs" to "service_role";

grant insert on table "public"."project_user_prefs" to "service_role";

grant references on table "public"."project_user_prefs" to "service_role";

grant select on table "public"."project_user_prefs" to "service_role";

grant trigger on table "public"."project_user_prefs" to "service_role";

grant truncate on table "public"."project_user_prefs" to "service_role";

grant update on table "public"."project_user_prefs" to "service_role";

grant delete on table "public"."projects" to "anon";

grant insert on table "public"."projects" to "anon";

grant references on table "public"."projects" to "anon";

grant select on table "public"."projects" to "anon";

grant trigger on table "public"."projects" to "anon";

grant truncate on table "public"."projects" to "anon";

grant update on table "public"."projects" to "anon";

grant delete on table "public"."projects" to "authenticated";

grant insert on table "public"."projects" to "authenticated";

grant references on table "public"."projects" to "authenticated";

grant select on table "public"."projects" to "authenticated";

grant trigger on table "public"."projects" to "authenticated";

grant truncate on table "public"."projects" to "authenticated";

grant update on table "public"."projects" to "authenticated";

grant delete on table "public"."projects" to "service_role";

grant insert on table "public"."projects" to "service_role";

grant references on table "public"."projects" to "service_role";

grant select on table "public"."projects" to "service_role";

grant trigger on table "public"."projects" to "service_role";

grant truncate on table "public"."projects" to "service_role";

grant update on table "public"."projects" to "service_role";

grant delete on table "public"."refs" to "anon";

grant insert on table "public"."refs" to "anon";

grant references on table "public"."refs" to "anon";

grant select on table "public"."refs" to "anon";

grant trigger on table "public"."refs" to "anon";

grant truncate on table "public"."refs" to "anon";

grant update on table "public"."refs" to "anon";

grant delete on table "public"."refs" to "authenticated";

grant insert on table "public"."refs" to "authenticated";

grant references on table "public"."refs" to "authenticated";

grant select on table "public"."refs" to "authenticated";

grant trigger on table "public"."refs" to "authenticated";

grant truncate on table "public"."refs" to "authenticated";

grant update on table "public"."refs" to "authenticated";

grant delete on table "public"."refs" to "service_role";

grant insert on table "public"."refs" to "service_role";

grant references on table "public"."refs" to "service_role";

grant select on table "public"."refs" to "service_role";

grant trigger on table "public"."refs" to "service_role";

grant truncate on table "public"."refs" to "service_role";

grant update on table "public"."refs" to "service_role";

grant delete on table "public"."stars" to "anon";

grant insert on table "public"."stars" to "anon";

grant references on table "public"."stars" to "anon";

grant select on table "public"."stars" to "anon";

grant trigger on table "public"."stars" to "anon";

grant truncate on table "public"."stars" to "anon";

grant update on table "public"."stars" to "anon";

grant delete on table "public"."stars" to "authenticated";

grant insert on table "public"."stars" to "authenticated";

grant references on table "public"."stars" to "authenticated";

grant select on table "public"."stars" to "authenticated";

grant trigger on table "public"."stars" to "authenticated";

grant truncate on table "public"."stars" to "authenticated";

grant update on table "public"."stars" to "authenticated";

grant delete on table "public"."stars" to "service_role";

grant insert on table "public"."stars" to "service_role";

grant references on table "public"."stars" to "service_role";

grant select on table "public"."stars" to "service_role";

grant trigger on table "public"."stars" to "service_role";

grant truncate on table "public"."stars" to "service_role";

grant update on table "public"."stars" to "service_role";

grant references on table "public"."user_llm_keys" to "anon";

grant select on table "public"."user_llm_keys" to "anon";

grant trigger on table "public"."user_llm_keys" to "anon";

grant truncate on table "public"."user_llm_keys" to "anon";

grant references on table "public"."user_llm_keys" to "authenticated";

grant select on table "public"."user_llm_keys" to "authenticated";

grant trigger on table "public"."user_llm_keys" to "authenticated";

grant truncate on table "public"."user_llm_keys" to "authenticated";

grant delete on table "public"."user_llm_keys" to "service_role";

grant insert on table "public"."user_llm_keys" to "service_role";

grant references on table "public"."user_llm_keys" to "service_role";

grant select on table "public"."user_llm_keys" to "service_role";

grant trigger on table "public"."user_llm_keys" to "service_role";

grant truncate on table "public"."user_llm_keys" to "service_role";

grant update on table "public"."user_llm_keys" to "service_role";

grant delete on table "public"."waitlist_requests" to "anon";

grant insert on table "public"."waitlist_requests" to "anon";

grant references on table "public"."waitlist_requests" to "anon";

grant select on table "public"."waitlist_requests" to "anon";

grant trigger on table "public"."waitlist_requests" to "anon";

grant truncate on table "public"."waitlist_requests" to "anon";

grant update on table "public"."waitlist_requests" to "anon";

grant delete on table "public"."waitlist_requests" to "authenticated";

grant insert on table "public"."waitlist_requests" to "authenticated";

grant references on table "public"."waitlist_requests" to "authenticated";

grant select on table "public"."waitlist_requests" to "authenticated";

grant trigger on table "public"."waitlist_requests" to "authenticated";

grant truncate on table "public"."waitlist_requests" to "authenticated";

grant update on table "public"."waitlist_requests" to "authenticated";

grant delete on table "public"."waitlist_requests" to "service_role";

grant insert on table "public"."waitlist_requests" to "service_role";

grant references on table "public"."waitlist_requests" to "service_role";

grant select on table "public"."waitlist_requests" to "service_role";

grant trigger on table "public"."waitlist_requests" to "service_role";

grant truncate on table "public"."waitlist_requests" to "service_role";

grant update on table "public"."waitlist_requests" to "service_role";


  create policy "artefact_drafts_select_owner"
  on "public"."artefact_drafts"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) AND public.rt_is_project_member(project_id)));



  create policy "artefact_drafts_update_owner"
  on "public"."artefact_drafts"
  as permissive
  for update
  to public
using (((user_id = auth.uid()) AND public.rt_is_project_member(project_id)))
with check (((user_id = auth.uid()) AND public.rt_is_project_member(project_id)));



  create policy "artefact_drafts_write_owner"
  on "public"."artefact_drafts"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) AND public.rt_is_project_member(project_id)));



  create policy "artefacts_insert_member"
  on "public"."artefacts"
  as permissive
  for insert
  to public
with check (public.rt_is_project_member(project_id));



  create policy "artefacts_select_member"
  on "public"."artefacts"
  as permissive
  for select
  to public
using (public.rt_is_project_member(project_id));



  create policy "commit_order_insert_member"
  on "public"."commit_order"
  as permissive
  for insert
  to public
with check (public.rt_is_project_member(project_id));



  create policy "commit_order_select_member"
  on "public"."commit_order"
  as permissive
  for select
  to public
using (public.rt_is_project_member(project_id));



  create policy "commits_insert_member"
  on "public"."commits"
  as permissive
  for insert
  to public
with check (public.rt_is_project_member(project_id));



  create policy "commits_select_member"
  on "public"."commits"
  as permissive
  for select
  to public
using (public.rt_is_project_member(project_id));



  create policy "nodes_insert_member"
  on "public"."nodes"
  as permissive
  for insert
  to public
with check (public.rt_is_project_member(project_id));



  create policy "nodes_select_member"
  on "public"."nodes"
  as permissive
  for select
  to public
using (public.rt_is_project_member(project_id));



  create policy "project_members_insert_owner_self"
  on "public"."project_members"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_members.project_id) AND (p.owner_user_id = auth.uid()))))));



  create policy "project_members_select_self"
  on "public"."project_members"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "project_user_prefs_select_own"
  on "public"."project_user_prefs"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) AND public.rt_is_project_member(project_id)));



  create policy "project_user_prefs_update_own"
  on "public"."project_user_prefs"
  as permissive
  for update
  to public
using (((user_id = auth.uid()) AND public.rt_is_project_member(project_id)))
with check (((user_id = auth.uid()) AND public.rt_is_project_member(project_id)));



  create policy "project_user_prefs_upsert_own"
  on "public"."project_user_prefs"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) AND public.rt_is_project_member(project_id)));



  create policy "projects_insert_owner"
  on "public"."projects"
  as permissive
  for insert
  to public
with check ((owner_user_id = auth.uid()));



  create policy "projects_select_member"
  on "public"."projects"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.project_members pm
  WHERE ((pm.project_id = projects.id) AND (pm.user_id = auth.uid())))));



  create policy "projects_update_owner"
  on "public"."projects"
  as permissive
  for update
  to public
using ((owner_user_id = auth.uid()))
with check ((owner_user_id = auth.uid()));



  create policy "refs_insert_member"
  on "public"."refs"
  as permissive
  for insert
  to public
with check (public.rt_is_project_member(project_id));



  create policy "refs_select_member"
  on "public"."refs"
  as permissive
  for select
  to public
using (public.rt_is_project_member(project_id));



  create policy "refs_update_member"
  on "public"."refs"
  as permissive
  for update
  to public
using (public.rt_is_project_member(project_id))
with check (public.rt_is_project_member(project_id));



  create policy "stars_delete_member"
  on "public"."stars"
  as permissive
  for delete
  to public
using (public.rt_is_project_member(project_id));



  create policy "stars_insert_member"
  on "public"."stars"
  as permissive
  for insert
  to public
with check (public.rt_is_project_member(project_id));



  create policy "stars_select_member"
  on "public"."stars"
  as permissive
  for select
  to public
using (public.rt_is_project_member(project_id));



  create policy "user_llm_keys_select_self"
  on "public"."user_llm_keys"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



