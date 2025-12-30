# PG Refs Post-Merge Verification (Dev Supabase)

Use this checklist after CI applies migrations to the dev Supabase branch.

## 1) Confirm v2 RPCs exist

```sql
select routine_name, data_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'rt_get_current_ref_v2',
    'rt_get_history_v2',
    'rt_get_canvas_v2',
    'rt_get_canvas_hashes_v2',
    'rt_get_canvas_pair_v2',
    'rt_create_ref_from_ref_v2',
    'rt_create_ref_from_node_parent_v2',
    'rt_merge_ours_v2',
    'rt_save_artefact_draft_v2',
    'rt_update_artefact_on_ref_v2',
    'rt_append_node_to_ref_v2'
  )
order by routine_name;
```

==> 

```
[
  {
    "routine_name": "rt_append_node_to_ref_v2",
    "data_type": "record"
  },
  {
    "routine_name": "rt_create_ref_from_node_parent_v2",
    "data_type": "record"
  },
  {
    "routine_name": "rt_create_ref_from_ref_v2",
    "data_type": "record"
  },
  {
    "routine_name": "rt_get_canvas_hashes_v2",
    "data_type": "record"
  },
  {
    "routine_name": "rt_get_canvas_pair_v2",
    "data_type": "record"
  },
  {
    "routine_name": "rt_get_canvas_v2",
    "data_type": "record"
  },
  {
    "routine_name": "rt_get_current_ref_v2",
    "data_type": "record"
  },
  {
    "routine_name": "rt_get_history_v2",
    "data_type": "record"
  },
  {
    "routine_name": "rt_merge_ours_v2",
    "data_type": "record"
  },
  {
    "routine_name": "rt_save_artefact_draft_v2",
    "data_type": "record"
  },
  {
    "routine_name": "rt_update_artefact_on_ref_v2",
    "data_type": "record"
  }
]
```

## 2) Confirm current-ref returns both id + name

```sql
select *
from rt_get_current_ref_v2('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'main');
```

==> 
[
  {
    "ref_id": "d7fa0443-aca2-4494-852d-af9dcefd24ba",
    "ref_name": "main"
  }
]

## 3) Fixture verification (dev fixture project)

Run the fixture verification file:

- `supabase/fixtures/pg_refs_fixture_verify.sql`

Each query should return non-empty rows with expected counts.

1 => 
[
  {
    "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "name": "PG Refs Fixture"
  }
]

2 => 
```
[
  {
    "project_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "name": "branch-a",
    "tip_commit_id": "55555555-5555-5555-5555-555555555555"
  },
  {
    "project_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "name": "branch-b",
    "tip_commit_id": "77777777-7777-7777-7777-777777777777"
  },
  {
    "project_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "name": "main",
    "tip_commit_id": "33333333-3333-3333-3333-333333333333"
  }
]
```
3 => 
```
[
  {
    "ref_name": "branch-a",
    "commits": 4
  },
  {
    "ref_name": "branch-b",
    "commits": 4
  },
  {
    "ref_name": "main",
    "commits": 3
  }
]
```

4 => 
```
[
  {
    "nodes": 7
  }
]
```
5 =>
```
[
  {
    "ref_name": "branch-a",
    "user_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "content": "Draft content branch-a"
  },
  {
    "ref_name": "main",
    "user_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "content": "Draft content main"
  }
]
```

6 =>
```
[
  {
    "current_ref_name": "main"
  }
]
```


## 4) Backfill integrity checks (Phase 1)

```sql
select count(*) as refs_missing_id
from public.refs
where id is null;
```

[
  {
    "refs_missing_id": 0
  }
]

```sql
select count(*) as commit_order_missing_ref_id
from public.commit_order
where ref_id is null and ref_name is not null;
```

[
  {
    "commit_order_missing_ref_id": 0
  }
]

```sql
select count(*) as drafts_missing_ref_id
from public.artefact_drafts
where ref_id is null and ref_name is not null;
```

[
  {
    "drafts_missing_ref_id": 0
  }
]

```sql
select count(*) as prefs_missing_ref_id
from public.project_user_prefs
where current_ref_id is null and current_ref_name is not null;
```
[
  {
    "prefs_missing_ref_id": 0
  }
]

```sql
select count(*) as artefacts_missing_ref_id
from public.artefacts
where ref_id is null;
```

Note: Backfill picks one ref per commit using `commit_order` (highest ordinal, then ref_id) so counts should be 0 once the patch migration runs.

## 5) Smoke API routes (PG store mode)

- `GET /api/projects/{id}/branches`
- `POST /api/projects/{id}/chat`
- `POST /api/projects/{id}/merge`
- `GET /api/projects/{id}/graph`
- `GET /api/projects/{id}/artefact?ref=main`
