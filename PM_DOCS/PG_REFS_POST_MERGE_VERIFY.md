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
where ref_id is null;
```

[
  {
    "commit_order_missing_ref_id": 0
  }
]

```sql
select count(*) as drafts_missing_ref_id
from public.artefact_drafts
where ref_id is null;
```

[
  {
    "drafts_missing_ref_id": 0
  }
]

```sql
select count(*) as prefs_missing_ref_id
from public.project_user_prefs
where current_ref_id is null;
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

[
  {
    "artefacts_missing_ref_id": 1
  }
]

Note: Backfill picks one ref per commit using `commit_order` (highest ordinal, then ref_id) so counts should be 0 once the patch migration runs.

## 5) Smoke API routes (PG store mode)

- `GET /api/projects/{id}/branches`
- `POST /api/projects/{id}/chat`
- `POST /api/projects/{id}/merge`
- `GET /api/projects/{id}/graph`
- `GET /api/projects/{id}/artefact?ref=main`

## Phase 3: Cleanup Verification (after ref_name removal)

### 1) Confirm legacy ref_name columns are gone

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('commit_order','artefact_drafts','project_user_prefs')
  and column_name in ('ref_name','current_ref_name');
```

Expect: zero rows.

[
  {
    "column_name": "ref_name"
  },
  {
    "column_name": "ref_name"
  },
  {
    "column_name": "current_ref_name"
  }
]

### 2) Confirm ref_id is not null

```sql
select count(*) as commit_order_null_ref_id
from public.commit_order
where ref_id is null;

```

[
  {
    "commit_order_null_ref_id": 0
  }
]

```sql
select count(*) as artefact_drafts_null_ref_id
from public.artefact_drafts
where ref_id is null;
```

[
  {
    "artefact_drafts_null_ref_id": 0
  }
]

```sql
select count(*) as artefacts_null_ref_id
from public.artefacts
where ref_id is null;
```

[
  {
    "artefacts_null_ref_id": 1
  }
]

Expect: all 0.

### 3) Confirm key constraints exist

```sql
select conname, conrelid::regclass
from pg_constraint
where conname in (
  'commit_order_pkey',
  'commit_order_project_id_ref_id_commit_id_key',
  'artefact_drafts_pkey',
  'refs_pkey',
  'refs_project_id_name_key'
);
```

[
  {
    "conname": "artefact_drafts_pkey",
    "conrelid": "artefact_drafts"
  },
  {
    "conname": "commit_order_pkey",
    "conrelid": "commit_order"
  },
  {
    "conname": "refs_pkey",
    "conrelid": "refs"
  }
]

Expect: all present.

### 4) Confirm pinned_ref_id column

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'projects'
  and column_name = 'pinned_ref_id';
```

Success. No rows returned

Expect: one row.

### 5) RPC smoke (v2)

- `rt_get_history_v2`
- `rt_get_canvas_v2`
- `rt_append_node_to_ref_v2`
- `rt_merge_ours_v2`
