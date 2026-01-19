// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { tokenUsageRequestSchema } from '@/src/server/schemas';
import { badRequest, handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectEditor } from '@/src/server/authz';
import { getBranchConfigMap, resolveBranchConfig } from '@/src/server/branchConfig';
import type { LLMProvider } from '@/src/server/llm';
import { getProviderTokenLimit } from '@/src/server/providerCapabilities';
import { buildUserMessage } from '@/src/server/chatMessages';
import { buildMessagesForCompletion } from '@/src/server/chatPayload';
import { countCharactersForMessages, estimateTokensFromChars } from '@/src/shared/tokenEstimate';

interface RouteContext {
  params: { id: string };
}

async function getPreferredBranch(projectId: string): Promise<{ id: string | null; name: string }> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { resolveCurrentRef } = await import('@/src/server/pgRefs');
    const current = await resolveCurrentRef(projectId, 'main');
    return { id: current.id, name: current.name };
  }
  const { getCurrentBranchName } = await import('@git/utils');
  const name = await getCurrentBranchName(projectId).catch(() => 'main');
  return { id: null, name };
}

function labelForProvider(provider: LLMProvider): string {
  if (provider === 'openai' || provider === 'openai_responses') return 'OpenAI';
  if (provider === 'gemini') return 'Gemini';
  if (provider === 'anthropic') return 'Anthropic';
  return 'Mock';
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectEditor({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = tokenUsageRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { message, question, highlight, llmProvider, ref } = parsed.data;
    const userContent = buildUserMessage({ message, question, highlight });
    if (!userContent.trim()) {
      throw badRequest('Message is required.');
    }

    const preferred = await getPreferredBranch(params.id);
    const requestedRefName = ref?.trim() || null;
    const targetRefName = requestedRefName ?? preferred.name;
    let targetRefId: string | null = null;
    if (store.mode === 'pg') {
      if (requestedRefName) {
        const { resolveRefByName } = await import('@/src/server/pgRefs');
        targetRefId = (await resolveRefByName(params.id, requestedRefName)).id;
      } else {
        targetRefId = preferred.id;
      }
    }
    if (store.mode === 'pg' && !targetRefId) {
      throw badRequest(`Branch ${targetRefName} is missing ref id`);
    }

    const branchConfigMap = await getBranchConfigMap(params.id);
    const activeConfig = branchConfigMap[targetRefName] ?? resolveBranchConfig();
    const provider = activeConfig.provider;
    const modelName = activeConfig.model;
    if (llmProvider && llmProvider !== provider) {
      throw badRequest(
        `Branch ${targetRefName} is locked to ${labelForProvider(provider)} (${modelName}). Create a new branch to switch.`
      );
    }

    const tokenLimit = await getProviderTokenLimit(provider, modelName);
    const canvasToolsEnabled = store.mode === 'pg' && process.env.RT_CANVAS_TOOLS === 'true';
    const { messages } = await buildMessagesForCompletion({
      projectId: params.id,
      ref: targetRefName,
      tokenLimit,
      userContent,
      includeCanvasDiff: canvasToolsEnabled,
      refId: targetRefId
    });

    const charCount = countCharactersForMessages(messages);
    const tokenEstimate = estimateTokensFromChars(charCount);

    return Response.json({ charCount, tokenEstimate, tokenLimit });
  } catch (error) {
    return handleRouteError(error);
  }
}
