import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  rtGetHistoryShadowV1,
  rtGetCanvasShadowV1,
  rtListRefsShadowV1,
  rtGetProjectMainRefUpdatesShadowV1,
  rtGetStarredNodeIdsShadowV1
} from '@/src/store/pg/reads';
import { rtAppendNodeToRefShadowV1, rtGetNodeContentShadowV1 } from '@/src/store/pg/nodes';
import { rtCreateRefFromNodeParentShadowV1, rtCreateRefFromRefShadowV1 } from '@/src/store/pg/branches';
import { rtCreateProjectShadow, rtGetProjectShadowV1, rtListProjectsShadowV1 } from '@/src/store/pg/projects';
import { rtGetCurrentRefShadowV1, rtSetCurrentRefShadowV1 } from '@/src/store/pg/prefs';
import { rtGetRefPreviousResponseIdV1, rtSetRefPreviousResponseIdV1 } from '@/src/store/pg/refs';
import { rtUpdateArtefactShadow } from '@/src/store/pg/artefacts';
import { rtSaveArtefactDraft } from '@/src/store/pg/drafts';
import { rtMergeOursShadowV1 } from '@/src/store/pg/merge';
import { rtToggleStarV1 } from '@/src/store/pg/stars';
import { rtGetUserLlmKeyStatusV1, rtSetUserLlmKeyV1, rtGetUserLlmKeyServerV1 } from '@/src/store/pg/userLlmKeys';
import { rtListProjectMemberIdsShadowV1 } from '@/src/store/pg/members';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  adminRpc: vi.fn()
}));

vi.mock('@/src/server/supabase/server', () => ({
  createSupabaseServerClient: () => ({ rpc: mocks.rpc })
}));

vi.mock('@/src/server/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.adminRpc })
}));

describe('pg store RPC wrappers', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.adminRpc.mockReset();
  });

  it('rtGetHistoryShadowV1 maps params and data', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ordinal: 1, node_json: { id: 'n1' } }],
      error: null
    });

    const result = await rtGetHistoryShadowV1({ projectId: 'p1', refName: 'main' });
    expect(mocks.rpc).toHaveBeenCalledWith('rt_get_history_v1', {
      p_project_id: 'p1',
      p_ref_name: 'main',
      p_limit: 200,
      p_include_raw_response: false
    });
    expect(result).toEqual([{ ordinal: 1, nodeJson: { id: 'n1' } }]);
  });

  it('rtGetCanvasShadowV1 maps data and handles missing row', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ content: 'Hi', content_hash: 'h1', updated_at: null, source: 'draft' }],
      error: null
    });

    const result = await rtGetCanvasShadowV1({ projectId: 'p1', refName: 'main' });
    expect(mocks.rpc).toHaveBeenCalledWith('rt_get_canvas_v1', {
      p_project_id: 'p1',
      p_ref_name: 'main'
    });
    expect(result).toEqual({ content: 'Hi', contentHash: 'h1', updatedAt: null, source: 'draft' });

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(rtGetCanvasShadowV1({ projectId: 'p1', refName: 'main' })).rejects.toThrow(
      'No data returned from rt_get_canvas_v1'
    );
  });

  it('rtListRefsShadowV1 maps rows', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        { name: 'main', head_commit: 'c1', node_count: 2, is_trunk: true },
        { name: 'feat', head_commit: 'c2', node_count: 1, is_trunk: false, provider: 'openai', model: 'gpt-5.2' }
      ],
      error: null
    });

    const result = await rtListRefsShadowV1({ projectId: 'p1' });
    expect(result).toEqual([
      { name: 'main', headCommit: 'c1', nodeCount: 2, isTrunk: true, provider: undefined, model: undefined },
      { name: 'feat', headCommit: 'c2', nodeCount: 1, isTrunk: false, provider: 'openai', model: 'gpt-5.2' }
    ]);
  });

  it('rtListProjectsShadowV1 maps rows', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ id: 'p1', name: 'PG', description: null, created_at: '2025-01-01T00:00:00Z', updated_at: null }],
      error: null
    });

    const result = await rtListProjectsShadowV1();
    expect(result).toEqual([
      {
        id: 'p1',
        name: 'PG',
        description: undefined,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      }
    ]);
  });

  it('rtGetProjectShadowV1 maps rows and handles missing', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ id: 'p1', name: 'PG', description: 'd', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-02T00:00:00Z' }],
      error: null
    });

    const result = await rtGetProjectShadowV1({ projectId: 'p1' });
    expect(result).toEqual({
      id: 'p1',
      name: 'PG',
      description: 'd',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z'
    });

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await rtGetProjectShadowV1({ projectId: 'p1' })).toBeNull();
  });

  it('rtGetProjectMainRefUpdatesShadowV1 maps rows', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        { project_id: 'p1', updated_at: '2025-01-03T00:00:00Z' },
        { project_id: null, updated_at: null }
      ],
      error: null
    });

    const result = await rtGetProjectMainRefUpdatesShadowV1({ projectIds: ['p1'] });
    expect(result).toEqual([{ projectId: 'p1', updatedAt: '2025-01-03T00:00:00.000Z' }]);
  });

  it('rtGetNodeContentShadowV1 returns data and handles errors', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 'node-1' }, error: null });
    await expect(rtGetNodeContentShadowV1({ projectId: 'p1', nodeId: 'node-1' })).resolves.toEqual({ id: 'node-1' });

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'nope' } });
    await expect(rtGetNodeContentShadowV1({ projectId: 'p1', nodeId: 'node-1' })).rejects.toThrow('nope');
  });

  it('rtListProjectMemberIdsShadowV1 maps rows', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ project_id: 'p1' }, { project_id: 'p2' }], error: null });
    await expect(rtListProjectMemberIdsShadowV1({ userId: 'u1' })).resolves.toEqual(['p1', 'p2']);
  });

  it('rtGetStarredNodeIdsShadowV1 normalizes response', async () => {
    mocks.rpc.mockResolvedValue({ data: ['a', 'b'], error: null });
    expect(await rtGetStarredNodeIdsShadowV1({ projectId: 'p1' })).toEqual(['a', 'b']);

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await rtGetStarredNodeIdsShadowV1({ projectId: 'p1' })).toEqual([]);
  });

  it('rtAppendNodeToRefShadowV1 maps params and data', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ new_commit_id: 'c1', node_id: 'n1', ordinal: 2, artefact_id: null, artefact_content_hash: null }],
      error: null
    });

    const result = await rtAppendNodeToRefShadowV1({
      projectId: 'p1',
      refName: 'main',
      kind: 'message',
      role: undefined,
      contentJson: { text: 'hello' },
      nodeId: 'n1'
    });

    expect(mocks.rpc).toHaveBeenCalledWith('rt_append_node_to_ref_v1', {
      p_project_id: 'p1',
      p_ref_name: 'main',
      p_kind: 'message',
      p_role: 'system',
      p_content_json: { text: 'hello' },
      p_node_id: 'n1',
      p_commit_message: null,
      p_attach_draft: false,
      p_artefact_kind: 'canvas_md',
      p_lock_timeout_ms: 3000,
      p_raw_response: null
    });
    expect(result).toEqual({
      newCommitId: 'c1',
      nodeId: 'n1',
      ordinal: 2,
      artefactId: null,
      artefactContentHash: null
    });
  });

  it('rtAppendNodeToRefShadowV1 throws when RPC fails or returns no rows', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'nope' } });
    await expect(
      rtAppendNodeToRefShadowV1({
        projectId: 'p1',
        refName: 'main',
        kind: 'message',
        role: 'user',
        contentJson: {},
        nodeId: 'n1'
      })
    ).rejects.toThrow('nope');

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      rtAppendNodeToRefShadowV1({
        projectId: 'p1',
        refName: 'main',
        kind: 'message',
        role: 'user',
        contentJson: {},
        nodeId: 'n1'
      })
    ).rejects.toThrow('No data returned from rt_append_node_to_ref_v1');
  });

  it('rtCreateRefFromNodeParentShadowV1 maps data', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ base_commit_id: 'c1', base_ordinal: 4 }],
      error: null
    });

    const result = await rtCreateRefFromNodeParentShadowV1({
      projectId: 'p1',
      sourceRefName: 'main',
      newRefName: 'feat',
      nodeId: 'n1',
      provider: 'openai',
      model: 'gpt-5.2',
      previousResponseId: 'r1'
    });

    expect(mocks.rpc).toHaveBeenCalledWith('rt_create_ref_from_node_parent_v1', {
      p_project_id: 'p1',
      p_source_ref_name: 'main',
      p_new_ref_name: 'feat',
      p_node_id: 'n1',
      p_provider: 'openai',
      p_model: 'gpt-5.2',
      p_previous_response_id: 'r1'
    });
    expect(result).toEqual({ baseCommitId: 'c1', baseOrdinal: 4 });
  });

  it('rtCreateRefFromNodeParentShadowV1 throws when RPC fails or returns no rows', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    await expect(
      rtCreateRefFromNodeParentShadowV1({
        projectId: 'p1',
        sourceRefName: 'main',
        newRefName: 'feat',
        nodeId: 'n1'
      })
    ).rejects.toThrow('fail');

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      rtCreateRefFromNodeParentShadowV1({
        projectId: 'p1',
        sourceRefName: 'main',
        newRefName: 'feat',
        nodeId: 'n1'
      })
    ).rejects.toThrow('No data returned from rt_create_ref_from_node_parent_v1');
  });

  it('rtCreateRefFromRefShadowV1 maps data', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ base_commit_id: null, base_ordinal: 0 }],
      error: null
    });

    const result = await rtCreateRefFromRefShadowV1({
      projectId: 'p1',
      fromRefName: 'main',
      newRefName: 'feat'
    });

    expect(mocks.rpc).toHaveBeenCalledWith('rt_create_ref_from_ref_v1', {
      p_project_id: 'p1',
      p_from_ref_name: 'main',
      p_new_ref_name: 'feat',
      p_provider: null,
      p_model: null,
      p_previous_response_id: null
    });
    expect(result).toEqual({ baseCommitId: null, baseOrdinal: 0 });
  });

  it('rtCreateRefFromRefShadowV1 throws when RPC fails or returns no rows', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    await expect(
      rtCreateRefFromRefShadowV1({
        projectId: 'p1',
        fromRefName: 'main',
        newRefName: 'feat'
      })
    ).rejects.toThrow('fail');

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      rtCreateRefFromRefShadowV1({
        projectId: 'p1',
        fromRefName: 'main',
        newRefName: 'feat'
      })
    ).rejects.toThrow('No data returned from rt_create_ref_from_ref_v1');
  });

  it('rtCreateProjectShadow maps params and result', async () => {
    mocks.rpc.mockResolvedValue({ data: 'proj-1', error: null });

    const result = await rtCreateProjectShadow({ name: 'Test', description: undefined });
    expect(mocks.rpc).toHaveBeenCalledWith('rt_create_project', {
      p_name: 'Test',
      p_description: null,
      p_project_id: null,
      p_provider: null,
      p_model: null
    });
    expect(result).toEqual({ projectId: 'proj-1' });
  });

  it('rtCreateProjectShadow throws when RPC fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    await expect(rtCreateProjectShadow({ name: 'Test' })).rejects.toThrow('fail');
  });

  it('rtGetCurrentRefShadowV1 omits default ref params and returns fallback', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    const result = await rtGetCurrentRefShadowV1({ projectId: 'p1', defaultRefName: 'main' });
    expect(mocks.rpc).toHaveBeenCalledWith('rt_get_current_ref_v1', { p_project_id: 'p1' });
    expect(result).toEqual({ refName: 'main' });
  });

  it('rtGetCurrentRefShadowV1 throws when RPC fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    await expect(rtGetCurrentRefShadowV1({ projectId: 'p1' })).rejects.toThrow('fail');
  });

  it('rtSetCurrentRefShadowV1 includes lock timeout', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await rtSetCurrentRefShadowV1({ projectId: 'p1', refName: 'main' });
    expect(mocks.rpc).toHaveBeenCalledWith('rt_set_current_ref_v1', {
      p_project_id: 'p1',
      p_ref_name: 'main',
      p_lock_timeout_ms: 3000
    });
  });

  it('rtSetCurrentRefShadowV1 throws when RPC fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    await expect(rtSetCurrentRefShadowV1({ projectId: 'p1', refName: 'main' })).rejects.toThrow('fail');
  });

  it('rtGetRefPreviousResponseIdV1 and rtSetRefPreviousResponseIdV1 map params', async () => {
    mocks.rpc.mockResolvedValue({ data: 'prev-1', error: null });
    expect(await rtGetRefPreviousResponseIdV1({ projectId: 'p1', refName: 'main' })).toBe('prev-1');

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await rtGetRefPreviousResponseIdV1({ projectId: 'p1', refName: 'main' })).toBeNull();

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await rtSetRefPreviousResponseIdV1({ projectId: 'p1', refName: 'main', previousResponseId: null });
    expect(mocks.rpc).toHaveBeenCalledWith('rt_set_ref_previous_response_id_v1', {
      p_project_id: 'p1',
      p_ref_name: 'main',
      p_previous_response_id: null
    });
  });

  it('rtGetRefPreviousResponseIdV1 and rtSetRefPreviousResponseIdV1 throw on RPC errors', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    await expect(rtGetRefPreviousResponseIdV1({ projectId: 'p1', refName: 'main' })).rejects.toThrow('fail');

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    await expect(
      rtSetRefPreviousResponseIdV1({ projectId: 'p1', refName: 'main', previousResponseId: null })
    ).rejects.toThrow('fail');
  });

  it('rtUpdateArtefactShadow maps params and data', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ new_commit_id: 'c1', artefact_id: 'a1', state_node_id: null, ordinal: 3, content_hash: 'h1' }],
      error: null
    });

    const result = await rtUpdateArtefactShadow({ projectId: 'p1', refName: 'main', content: 'hi' });
    expect(mocks.rpc).toHaveBeenCalledWith('rt_update_artefact_on_ref', {
      p_project_id: 'p1',
      p_ref_name: 'main',
      p_content: 'hi',
      p_kind: 'canvas_md',
      p_state_node_id: null,
      p_state_node_json: null,
      p_commit_message: null,
      p_lock_timeout_ms: 3000
    });
    expect(result).toEqual({ newCommitId: 'c1', artefactId: 'a1', stateNodeId: null, ordinal: 3, contentHash: 'h1' });
  });

  it('rtUpdateArtefactShadow throws when RPC fails or returns no rows', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    await expect(rtUpdateArtefactShadow({ projectId: 'p1', refName: 'main', content: 'hi' })).rejects.toThrow('fail');

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(rtUpdateArtefactShadow({ projectId: 'p1', refName: 'main', content: 'hi' })).rejects.toThrow(
      'No data returned from rt_update_artefact_on_ref'
    );
  });

  it('rtSaveArtefactDraft maps params and data', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ content_hash: 'h1', updated_at: 't1' }],
      error: null
    });

    const result = await rtSaveArtefactDraft({ projectId: 'p1', refName: 'main', content: 'hi' });
    expect(mocks.rpc).toHaveBeenCalledWith('rt_save_artefact_draft', {
      p_project_id: 'p1',
      p_ref_name: 'main',
      p_content: 'hi'
    });
    expect(result).toEqual({ contentHash: 'h1', updatedAt: 't1' });
  });

  it('rtSaveArtefactDraft throws when RPC fails or returns no rows', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    await expect(rtSaveArtefactDraft({ projectId: 'p1', refName: 'main', content: 'hi' })).rejects.toThrow('fail');

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(rtSaveArtefactDraft({ projectId: 'p1', refName: 'main', content: 'hi' })).rejects.toThrow(
      'No data returned from rt_save_artefact_draft'
    );
  });

  it('rtMergeOursShadowV1 maps params and data', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ new_commit_id: 'c1', node_id: 'n1', ordinal: 5 }],
      error: null
    });

    const result = await rtMergeOursShadowV1({
      projectId: 'p1',
      targetRefName: 'main',
      sourceRefName: 'feat',
      mergeNodeId: 'm1',
      mergeNodeJson: { id: 'm1' },
      commitMessage: 'msg'
    });

    expect(mocks.rpc).toHaveBeenCalledWith('rt_merge_ours_v1', {
      p_project_id: 'p1',
      p_target_ref_name: 'main',
      p_source_ref_name: 'feat',
      p_merge_node_json: { id: 'm1' },
      p_merge_node_id: 'm1',
      p_commit_message: 'msg'
    });
    expect(result).toEqual({ newCommitId: 'c1', nodeId: 'n1', ordinal: 5 });
  });

  it('rtMergeOursShadowV1 throws when RPC fails or returns no rows', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    await expect(
      rtMergeOursShadowV1({
        projectId: 'p1',
        targetRefName: 'main',
        sourceRefName: 'feat',
        mergeNodeId: 'm1',
        mergeNodeJson: { id: 'm1' }
      })
    ).rejects.toThrow('fail');

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      rtMergeOursShadowV1({
        projectId: 'p1',
        targetRefName: 'main',
        sourceRefName: 'feat',
        mergeNodeId: 'm1',
        mergeNodeJson: { id: 'm1' }
      })
    ).rejects.toThrow('No data returned from rt_merge_ours_v1');
  });

  it('rtToggleStarV1 normalizes response', async () => {
    mocks.rpc.mockResolvedValue({ data: ['n1'], error: null });
    expect(await rtToggleStarV1({ projectId: 'p1', nodeId: 'n1' })).toEqual(['n1']);

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await rtToggleStarV1({ projectId: 'p1', nodeId: 'n1' })).toEqual([]);
  });

  it('rtToggleStarV1 throws when RPC fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    await expect(rtToggleStarV1({ projectId: 'p1', nodeId: 'n1' })).rejects.toThrow('fail');
  });

  it('rtGetUserLlmKeyStatusV1 maps status and formats errors', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ has_openai: true, has_gemini: false, has_anthropic: true, updated_at: 't1' }],
      error: null
    });
    expect(await rtGetUserLlmKeyStatusV1()).toEqual({
      hasOpenAI: true,
      hasGemini: false,
      hasAnthropic: true,
      updatedAt: 't1'
    });

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'bad', code: 'E1', details: 'detail', hint: 'hint' }
    });
    await expect(rtGetUserLlmKeyStatusV1()).rejects.toThrow('E1');
  });

  it('rtSetUserLlmKeyV1 and rtGetUserLlmKeyServerV1 map params', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await rtSetUserLlmKeyV1({ provider: 'openai', secret: 's' });
    expect(mocks.rpc).toHaveBeenCalledWith('rt_set_user_llm_key_v1', {
      p_provider: 'openai',
      p_secret: 's'
    });

    mocks.adminRpc.mockResolvedValue({ data: 'key', error: null });
    expect(await rtGetUserLlmKeyServerV1({ userId: 'u1', provider: 'openai_responses' })).toBe('key');
    expect(mocks.adminRpc).toHaveBeenCalledWith('rt_get_user_llm_key_server_v1', {
      p_user_id: 'u1',
      p_provider: 'openai'
    });

    await expect(rtGetUserLlmKeyServerV1({ userId: 'u1', provider: 'mock' })).rejects.toThrow(
      'Mock provider has no API key'
    );
  });

  it('rtSetUserLlmKeyV1 and rtGetUserLlmKeyServerV1 throw on RPC errors', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    await expect(rtSetUserLlmKeyV1({ provider: 'openai', secret: 's' })).rejects.toThrow('fail');

    mocks.adminRpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    await expect(rtGetUserLlmKeyServerV1({ userId: 'u1', provider: 'openai' })).rejects.toThrow('fail');
  });
});
