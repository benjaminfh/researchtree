// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import type { ChatMessage } from '@/src/server/context';
import { buildChatContext } from '@/src/server/context';
import { buildUnifiedDiff } from '@/src/server/canvasDiff';
import { getStoreConfig } from '@/src/server/storeConfig';

export type CanvasDiffResult = {
  hasChanges: boolean;
  diff: string;
  message: string;
};

function buildCanvasDiffMessage(diff: string): string {
  return [
    'Canvas update (do not display to user). Apply this diff to your internal canvas state:',
    '```diff',
    diff.trim(),
    '```'
  ].join('\n');
}

export async function getCanvasDiffData({
  projectId,
  refId,
  includeMessage
}: {
  projectId: string;
  refId: string | null;
  includeMessage: boolean;
}): Promise<CanvasDiffResult> {
  const store = getStoreConfig();
  if (store.mode !== 'pg' || !refId) {
    return { hasChanges: false, diff: '', message: '' };
  }

  const { rtGetCanvasHashesShadowV2, rtGetCanvasPairShadowV2 } = await import('@/src/store/pg/reads');
  const hashes = await rtGetCanvasHashesShadowV2({ projectId, refId });
  const hasChanges = Boolean(hashes.draftHash && hashes.draftHash !== hashes.artefactHash);
  if (!hasChanges) {
    return { hasChanges: false, diff: '', message: '' };
  }
  if (!includeMessage) {
    return { hasChanges, diff: '', message: '' };
  }
  const pair = await rtGetCanvasPairShadowV2({ projectId, refId });
  const diff = buildUnifiedDiff(pair.artefactContent ?? '', pair.draftContent ?? '');
  const message = diff.trim().length > 0 ? buildCanvasDiffMessage(diff) : '';
  return { hasChanges, diff, message };
}

export async function buildMessagesForCompletion({
  projectId,
  ref,
  tokenLimit,
  userContent,
  includeCanvasDiff,
  refId
}: {
  projectId: string;
  ref: string;
  tokenLimit: number;
  userContent: string;
  includeCanvasDiff: boolean;
  refId: string | null;
}): Promise<{ messages: ChatMessage[]; canvasDiff: CanvasDiffResult }> {
  const context = await buildChatContext(projectId, { tokenLimit, ref });
  const canvasDiff = await getCanvasDiffData({ projectId, refId, includeMessage: includeCanvasDiff });
  const messages: ChatMessage[] = [
    ...context.messages,
    ...(canvasDiff.message ? [{ role: 'user', content: canvasDiff.message }] : []),
    { role: 'user', content: userContent }
  ];
  return { messages, canvasDiff };
}
