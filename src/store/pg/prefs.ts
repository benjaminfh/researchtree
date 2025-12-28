import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export async function rtGetCurrentRefShadowV1(input: { projectId: string; defaultRefName?: string }): Promise<{ refName: string }> {
  const { rpc } = getPgStoreAdapter();
  // PostgREST can be sensitive to function signatures when defaults are involved.
  // Prefer omitting optional/default params unless we truly need them.
  const params: Record<string, unknown> = { p_project_id: input.projectId };
  if (input.defaultRefName && input.defaultRefName !== 'main') {
    params.p_default_ref_name = input.defaultRefName;
  }

  const { data, error } = await rpc('rt_get_current_ref_v1', params);
  if (error) {
    throw new Error(error.message);
  }
  return { refName: String(data ?? input.defaultRefName ?? 'main') };
}

export async function rtSetCurrentRefShadowV1(input: { projectId: string; refName: string }): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_set_current_ref_v1', {
    p_project_id: input.projectId,
    p_ref_name: input.refName,
    // Always pass this to avoid schema-cache signature mismatches for default args.
    p_lock_timeout_ms: 3000
  });
  if (error) {
    throw new Error(error.message);
  }
}
