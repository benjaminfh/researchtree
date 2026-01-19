// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { handleRouteError, notFound } from '@/src/server/http';
import { INITIAL_BRANCH } from '@git/constants';
import { requireUser } from '@/src/server/auth';
import type { NodeRecord } from '@git/types';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';

interface RouteContext {
  params: { id: string };
}

function resolveRefName(refId: string | null, refNameById: Map<string, string>, label: string): string {
  if (!refId) {
    console.error('[history] missing ref id for node label', { label });
    // TODO: remove "unknown" fallback once legacy rows are backfilled with ref IDs.
    return 'unknown';
  }
  const refName = refNameById.get(refId);
  if (!refName) {
    console.error('[history] ref id not found for node label', { label, refId });
    // TODO: remove "unknown" fallback once legacy rows are backfilled with ref IDs.
    return 'unknown';
  }
  return refName;
}

function applyRefNames(
  rows: { nodeJson: NodeRecord; createdOnRefId: string | null; mergeFromRefId: string | null }[],
  refNameById: Map<string, string>
): NodeRecord[] {
  return rows.map((row) => {
    const createdOnBranch = resolveRefName(row.createdOnRefId, refNameById, 'createdOnBranch');
    const node = row.nodeJson;
    const mergeFrom =
      node.type === 'merge' ? resolveRefName(row.mergeFromRefId, refNameById, 'mergeFrom') : undefined;
    return {
      ...node,
      createdOnBranch,
      ...(node.type === 'merge' ? { mergeFrom } : {})
    } as NodeRecord;
  });
}

function isHiddenMessage(node: NodeRecord): boolean {
  return node.type === 'message' && node.role === 'user' && Boolean((node as any).uiHidden);
}

// History payloads omit rawResponse to keep UI fetches lightweight.
function stripRawResponse(node: NodeRecord): NodeRecord {
  if (node.type !== 'message') return node;
  const { rawResponse: _rawResponse, ...rest } = node as NodeRecord & { rawResponse?: unknown };
  return rest as NodeRecord;
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const refParam = searchParams.get('ref');
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : null;
    const effectiveLimit = typeof parsedLimit === 'number' && Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;

    if (store.mode === 'pg') {
      const { rtGetHistoryShadowV2, rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
      const { resolveCurrentRef, resolveRefByName } = await import('@/src/server/pgRefs');
      const refName = refParam?.trim();
      const ref = refName
        ? await resolveRefByName(params.id, refName)
        : await resolveCurrentRef(params.id, INITIAL_BRANCH);
      const rows = await rtGetHistoryShadowV2({ projectId: params.id, refId: ref.id, limit: effectiveLimit });
      const branches = await rtListRefsShadowV2({ projectId: params.id });
      const refNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
      const pgNodes = applyRefNames(rows.filter((r) => Boolean(r.nodeJson)) as any, refNameById);
      const nonStateNodes = pgNodes.filter((node) => node.type !== 'state' && !isHiddenMessage(node));
      const sanitizedNodes = nonStateNodes.map(stripRawResponse);
      return Response.json({ nodes: sanitizedNodes });
    }

    const { getProject } = await import('@git/projects');
    const { readNodesFromRef } = await import('@git/utils');

    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const refName = refParam?.trim() || INITIAL_BRANCH;
    const nodes = await readNodesFromRef(project.id, refName);

    // Canvas saves create `state` nodes in the git backend; those are not user-facing chat turns.
    // Keep them out of the history API response to avoid flooding the chat UI.
    const nonStateNodes = nodes.filter((node) => node.type !== 'state' && !isHiddenMessage(node));

    let result = nonStateNodes;
    if (limitParam) {
      if (parsedLimit && parsedLimit > 0) {
        result = nonStateNodes.slice(-parsedLimit);
      }
    }

    const sanitizedNodes = result.map(stripRawResponse);
    return Response.json({ nodes: sanitizedNodes });
  } catch (error) {
    return handleRouteError(error);
  }
}
