// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export async function rtGetCurrentRefShadowV2(input: {
  projectId: string;
  defaultRefName?: string;
}): Promise<{ refId: string | null; refName: string }> {
  const { rpc } = getPgStoreAdapter();
  // PostgREST can be sensitive to function signatures when defaults are involved.
  // Prefer omitting optional/default params unless we truly need them.
  const params: Record<string, unknown> = { p_project_id: input.projectId };
  if (input.defaultRefName && input.defaultRefName !== 'main') {
    params.p_default_ref_name = input.defaultRefName;
  }

  const { data, error } = await rpc('rt_get_current_ref_v2', params);
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    refId: row?.ref_id ? String(row.ref_id) : null,
    refName: String(row?.ref_name ?? input.defaultRefName ?? 'main')
  };
}

export async function rtSetCurrentRefShadowV2(input: { projectId: string; refId: string }): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_set_current_ref_v2', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    // Always pass this to avoid schema-cache signature mismatches for default args.
    p_lock_timeout_ms: 3000
  });
  if (error) {
    throw new Error(error.message);
  }
}
