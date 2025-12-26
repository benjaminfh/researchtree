import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { buildChatContext } from '@/src/server/context';
import { editMessageSchema } from '@/src/server/schemas';
import { acquireProjectRefLock, withProjectLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';
import { getProviderTokenLimit } from '@/src/server/providerCapabilities';
import { resolveLLMProvider, streamAssistantCompletion } from '@/src/server/llm';
import { type ThinkingSetting } from '@/src/shared/thinking';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';
import { v4 as uuidv4 } from 'uuid';
import { createSupabaseServerClient } from '@/src/server/supabase/server';
import { requireUserApiKeyForProvider } from '@/src/server/llmUserKeys';
import { getDefaultThinkingSetting, validateThinkingSetting } from '@/src/shared/llmCapabilities';
import { deriveTextFromBlocks } from '@/src/shared/thinkingTraces';
import type { ThinkingContentBlock } from '@/src/shared/thinkingTraces';
import { buildContentBlocksForProvider, buildTextBlock } from '@/src/server/llmContentBlocks';
import { getBranchConfigMap, resolveBranchConfig } from '@/src/server/branchConfig';
import { getPreviousResponseId, setPreviousResponseId } from '@/src/server/llmState';

interface RouteContext {
  params: { id: string };
}

async function getPreferredBranch(projectId: string): Promise<string> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { rtGetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
    return (await rtGetCurrentRefShadowV1({ projectId, defaultRefName: 'main' })).refName;
  }
  const { getCurrentBranchName } = await import('@git/utils');
  return getCurrentBranchName(projectId).catch(() => 'main');
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = editMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { content, branchName, fromRef, nodeId, llmProvider, llmModel, thinking } = parsed.data as typeof parsed.data & {
      thinking?: ThinkingSetting;
    };
    const currentBranch = await getPreferredBranch(params.id);
    const targetBranch = branchName?.trim() || `edit-${Date.now()}`;
    const sourceRef = fromRef?.trim() || currentBranch;
    const branchConfigMap = await getBranchConfigMap(params.id);
    const baseConfig = branchConfigMap[sourceRef] ?? resolveBranchConfig();
    const requestedConfig = resolveBranchConfig({
      provider: llmProvider ?? baseConfig.provider,
      model: llmModel ?? (llmProvider ? null : baseConfig.model),
      fallback: baseConfig
    });
    const provider = requestedConfig.provider;
    const modelName = requestedConfig.model;
    const resolvedProvider = resolveLLMProvider(provider);
    const effectiveThinking = thinking ?? getDefaultThinkingSetting(provider, modelName);
    const thinkingValidation = validateThinkingSetting(provider, modelName, effectiveThinking);
    if (!thinkingValidation.ok) {
      throw badRequest(thinkingValidation.message ?? 'Invalid thinking setting', {
        provider,
        modelName,
        thinking: effectiveThinking,
        allowed: thinkingValidation.allowed
      });
    }

    return await withProjectLock(params.id, async () => {
      const releaseRefLock = await acquireProjectRefLock(params.id, sourceRef);
      try {
        if (store.mode === 'pg') {
          const { rtCreateRefFromNodeParentShadowV1 } = await import('@/src/store/pg/branches');
          const { rtSetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
          const { rtAppendNodeToRefShadowV1 } = await import('@/src/store/pg/nodes');

          const supabase = createSupabaseServerClient();
          const { data, error } = await supabase
            .from('nodes')
            .select('content_json')
            .eq('project_id', params.id)
            .eq('id', nodeId)
            .maybeSingle();
          if (error) {
            throw new Error(error.message);
          }
          const targetNode = (data as any)?.content_json as any | null;
          if (!targetNode) {
            throw badRequest(`Node ${nodeId} not found`);
          }
          if (targetNode.type !== 'message') {
            throw badRequest('Only message nodes can be edited');
          }

          const apiKey = targetNode.role === 'user' ? await requireUserApiKeyForProvider(provider) : null;

          await rtCreateRefFromNodeParentShadowV1({
            projectId: params.id,
            sourceRefName: sourceRef,
            newRefName: targetBranch,
            nodeId,
            provider,
            model: modelName,
            previousResponseId: null
          });

          await rtSetCurrentRefShadowV1({ projectId: params.id, refName: targetBranch });

          const { rtGetHistoryShadowV1 } = await import('@/src/store/pg/reads');
          const lastTargetRows = await rtGetHistoryShadowV1({ projectId: params.id, refName: targetBranch, limit: 1 }).catch(() => []);
          const lastTargetNode = (lastTargetRows[0]?.nodeJson as any) ?? null;
          const parentId = lastTargetNode?.id ? String(lastTargetNode.id) : null;

          const editedNode = {
            id: uuidv4(),
            type: 'message',
            role: targetNode.role,
            content,
            contentBlocks: buildTextBlock(content),
            timestamp: Date.now(),
            parent: parentId,
            createdOnBranch: targetBranch
          };

          await rtAppendNodeToRefShadowV1({
            projectId: params.id,
            refName: targetBranch,
            kind: editedNode.type,
            role: editedNode.role,
            contentJson: editedNode,
            nodeId: editedNode.id,
            commitMessage: 'edit_message',
            attachDraft: true
          });

          let assistantNode: any = null;
          if (editedNode.role === 'user') {
            try {
              const tokenLimit = await getProviderTokenLimit(provider, modelName);
              const context = await buildChatContext(params.id, { tokenLimit, ref: targetBranch });
              const messagesForCompletion = context.messages;

              let buffered = '';
              const streamBlocks: ThinkingContentBlock[] = [];
              let rawResponse: unknown = null;
              let responseId: string | null = null;
              const previousResponseId =
                resolvedProvider === 'openai_responses'
                  ? await getPreviousResponseId(params.id, targetBranch).catch(() => null)
                  : null;
              for await (const chunk of streamAssistantCompletion({
                messages: messagesForCompletion,
                provider: resolvedProvider,
                model: modelName,
                thinking: effectiveThinking,
                apiKey,
                previousResponseId
              })) {
                if (chunk.type === 'thinking') {
                  const last = streamBlocks[streamBlocks.length - 1];
                  if (chunk.append && last?.type === 'thinking') {
                    last.thinking += chunk.content;
                  } else {
                    streamBlocks.push({
                      type: 'thinking',
                      thinking: chunk.content
                    });
                  }
                  continue;
                }
                if (chunk.type === 'thinking_signature') {
                  streamBlocks.push({
                    type: 'thinking_signature',
                    signature: chunk.content
                  });
                  continue;
                }
                if (chunk.type === 'raw_response') {
                  rawResponse = chunk.payload ?? null;
                  if (rawResponse && typeof rawResponse === 'object' && (rawResponse as any).responseId) {
                    responseId = String((rawResponse as any).responseId);
                  }
                  continue;
                }
                const lastText = streamBlocks[streamBlocks.length - 1];
                if (lastText?.type === 'text') {
                  lastText.text += chunk.content;
                } else {
                  streamBlocks.push({ type: 'text', text: chunk.content });
                }
                buffered += chunk.content;
              }

              if (buffered.trim()) {
                const contentBlocks = buildContentBlocksForProvider({
                  provider,
                  rawResponse,
                  fallbackText: buffered,
                  fallbackBlocks: streamBlocks
                });
                const contentText = deriveTextFromBlocks(contentBlocks) || buffered;
                assistantNode = {
                  id: uuidv4(),
                  type: 'message',
                  role: 'assistant',
                  content: contentText,
                  contentBlocks,
                  timestamp: Date.now(),
                  parent: editedNode.id,
                  createdOnBranch: targetBranch,
                  modelUsed: modelName,
                  responseId: responseId ?? undefined,
                  interrupted: false,
                  rawResponse
                };

                await rtAppendNodeToRefShadowV1({
                  projectId: params.id,
                  refName: targetBranch,
                  kind: assistantNode.type,
                  role: assistantNode.role,
                  contentJson: assistantNode,
                  nodeId: assistantNode.id,
                  commitMessage: 'assistant_message',
                  attachDraft: false,
                  rawResponse
                });
                if (resolvedProvider === 'openai_responses' && responseId) {
                  await setPreviousResponseId(params.id, targetBranch, responseId);
                }
              } else {
                console.warn('[edit] Skipping empty assistant response');
              }
            } catch (error) {
              console.error('[edit] Failed to run LLM completion after edit', error);
            }
          }

          return Response.json({ branchName: targetBranch, node: editedNode, assistantNode }, { status: 201 });
        }

        const { appendNode } = await import('@git/nodes');
        const { createBranch } = await import('@git/branches');
        const { getProject } = await import('@git/projects');
        const { getCommitHashForNode, readNodesFromRef } = await import('@git/utils');

        const project = await getProject(params.id);
        if (!project) {
          throw notFound('Project not found');
        }

        const sourceNodes = await readNodesFromRef(project.id, sourceRef);
        const targetNode = sourceNodes.find((node) => node.id === nodeId);
        if (!targetNode) {
          throw badRequest(`Node ${nodeId} not found on ref ${sourceRef}`);
        }
        if (targetNode.type !== 'message') {
          throw badRequest('Only message nodes can be edited');
        }

        const apiKey = targetNode.role === 'user' ? await requireUserApiKeyForProvider(provider) : null;

        try {
          const commitHash = await getCommitHashForNode(project.id, sourceRef, nodeId, { parent: true });
          await createBranch(project.id, targetBranch, commitHash, { provider, model: modelName, previousResponseId: null });
        } catch (err) {
          const message = (err as Error)?.message ?? 'Failed to create edit branch';
          throw badRequest(message);
        }

        const node = await appendNode(
          project.id,
          {
            type: 'message',
            role: targetNode.role,
            content,
            contentBlocks: buildTextBlock(content)
          },
          { ref: targetBranch }
        );

        let assistantNode: any = null;
        if (node.type === 'message' && node.role === 'user') {
          try {
            const tokenLimit = await getProviderTokenLimit(provider, modelName);
            const context = await buildChatContext(project.id, { tokenLimit, ref: targetBranch });
            const messagesForCompletion = context.messages;

            let buffered = '';
            const streamBlocks: ThinkingContentBlock[] = [];
            let rawResponse: unknown = null;
            let responseId: string | null = null;
            const previousResponseId =
              resolvedProvider === 'openai_responses'
                ? await getPreviousResponseId(params.id, targetBranch).catch(() => null)
                : null;
            for await (const chunk of streamAssistantCompletion({
              messages: messagesForCompletion,
              provider: resolvedProvider,
              model: modelName,
              thinking: effectiveThinking,
              apiKey,
              previousResponseId
            })) {
              if (chunk.type === 'thinking') {
                const last = streamBlocks[streamBlocks.length - 1];
                if (chunk.append && last?.type === 'thinking') {
                  last.thinking += chunk.content;
                } else {
                  streamBlocks.push({
                    type: 'thinking',
                    thinking: chunk.content
                  });
                }
                continue;
              }
              if (chunk.type === 'thinking_signature') {
                streamBlocks.push({
                  type: 'thinking_signature',
                  signature: chunk.content
                });
                continue;
              }
              if (chunk.type === 'raw_response') {
                rawResponse = chunk.payload ?? null;
                if (rawResponse && typeof rawResponse === 'object' && (rawResponse as any).responseId) {
                  responseId = String((rawResponse as any).responseId);
                }
                continue;
              }
              const lastText = streamBlocks[streamBlocks.length - 1];
              if (lastText?.type === 'text') {
                lastText.text += chunk.content;
              } else {
                streamBlocks.push({ type: 'text', text: chunk.content });
              }
              buffered += chunk.content;
            }

            if (buffered.trim()) {
              const contentBlocks = buildContentBlocksForProvider({
                provider,
                rawResponse,
                fallbackText: buffered,
                fallbackBlocks: streamBlocks
              });
              const contentText = deriveTextFromBlocks(contentBlocks) || buffered;
              assistantNode = await appendNode(
                project.id,
                {
                  type: 'message',
                  role: 'assistant',
                  content: contentText,
                  contentBlocks,
                  modelUsed: modelName,
                  responseId: responseId ?? undefined,
                  interrupted: false,
                  rawResponse
                },
                { ref: targetBranch }
              );
              if (resolvedProvider === 'openai_responses' && responseId) {
                await setPreviousResponseId(params.id, targetBranch, responseId);
              }
            } else {
              console.warn('[edit] Skipping empty assistant response');
            }
          } catch (error) {
            console.error('[edit] Failed to run LLM completion after edit', error);
          }
        }

        return Response.json({ branchName: targetBranch, node, assistantNode }, { status: 201 });
      } finally {
        releaseRefLock();
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
