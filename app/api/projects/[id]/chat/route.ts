import { chatRequestSchema } from '@/src/server/schemas';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { buildChatContext } from '@/src/server/context';
import { encodeChunk, streamAssistantCompletion } from '@/src/server/llm';
import { registerStream, releaseStream } from '@/src/server/stream-registry';
import { getProviderTokenLimit } from '@/src/server/providerCapabilities';
import { acquireProjectRefLock } from '@/src/server/locks';
import { type ThinkingSetting } from '@/src/shared/thinking';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { v4 as uuidv4 } from 'uuid';
import { requireProjectAccess } from '@/src/server/authz';
import type { LLMProvider } from '@/src/server/llm';
import { requireUserApiKeyForProvider } from '@/src/server/llmUserKeys';
import { getDefaultThinkingSetting, validateThinkingSetting } from '@/src/shared/llmCapabilities';
import { deriveTextFromBlocks } from '@/src/shared/thinkingTraces';
import type { ThinkingContentBlock } from '@/src/shared/thinkingTraces';
import { buildContentBlocksForProvider, buildTextBlock } from '@/src/server/llmContentBlocks';
import { getBranchConfigMap, resolveBranchConfig } from '@/src/server/branchConfig';

interface RouteContext {
  params: { id: string };
}

async function getPreferredBranch(projectId: string): Promise<string> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { rtGetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
    const { refName } = await rtGetCurrentRefShadowV1({ projectId, defaultRefName: 'main' });
    return refName;
  }
  const { getCurrentBranchName } = await import('@git/utils');
  return getCurrentBranchName(projectId).catch(() => 'main');
}

function labelForProvider(provider: LLMProvider): string {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'gemini') return 'Gemini';
  if (provider === 'anthropic') return 'Anthropic';
  return 'Mock';
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const requestId = uuidv4();
    const user = await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { message, intent, llmProvider, ref, thinking, webSearch } = parsed.data as typeof parsed.data & {
      thinking?: ThinkingSetting;
      webSearch?: boolean;
    };
    const targetRef = ref ?? (await getPreferredBranch(params.id));
    const branchConfigMap = await getBranchConfigMap(params.id);
    const activeConfig = branchConfigMap[targetRef] ?? resolveBranchConfig();
    const provider = activeConfig.provider;
    const modelName = activeConfig.model;
    if (llmProvider && llmProvider !== provider) {
      throw badRequest(`Branch ${targetRef} is locked to ${labelForProvider(provider)} (${modelName}). Create a new branch to switch.`);
    }
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
    const tokenLimit = await getProviderTokenLimit(provider, modelName);
    const apiKey = await requireUserApiKeyForProvider(provider);

    console.info('[chat] start', { requestId, userId: user.id, projectId: params.id, provider, ref: targetRef, webSearch });
    const releaseLock = await acquireProjectRefLock(params.id, targetRef);
    const abortController = new AbortController();

    try {
      const context = await buildChatContext(params.id, { tokenLimit, ref: targetRef });
      const messagesForCompletion = [...context.messages, { role: 'user' as const, content: message }];

      registerStream(params.id, abortController, targetRef);

      let released = false;
      const releaseAll = () => {
        if (released) return;
        released = true;
        releaseStream(params.id, targetRef);
        releaseLock();
      };

      const stream = new ReadableStream<Uint8Array>({
        async start(controllerStream) {
          let buffered = '';
          let streamError: unknown = null;
          let yieldedAny = false;
          let yieldedText = false;
          let persistedUser = false;
          let persistedUserNodeId: string | null = null;
          let gitProjectId: string | null = null;
          const streamBlocks: ThinkingContentBlock[] = [];
          let rawResponse: unknown = null;

          const ensureUserPersisted = async () => {
            if (persistedUser) return;

            if (store.mode === 'pg') {
              const { rtGetHistoryShadowV1 } = await import('@/src/store/pg/reads');
              const { rtAppendNodeToRefShadowV1 } = await import('@/src/store/pg/nodes');
              const last = await rtGetHistoryShadowV1({ projectId: params.id, refName: targetRef, limit: 1 }).catch(() => []);
              const lastNode = (last[0]?.nodeJson as any) ?? null;
              const parentId = lastNode?.id ? String(lastNode.id) : null;

              const nodeId = persistedUserNodeId ?? uuidv4();
              persistedUserNodeId = nodeId;

              const userNode = {
                id: nodeId,
                type: 'message',
                role: 'user',
                content: message,
                contentBlocks: buildTextBlock(message),
                timestamp: Date.now(),
                parent: parentId,
                createdOnBranch: targetRef,
                contextWindow: [],
                tokensUsed: undefined
              };
              await rtAppendNodeToRefShadowV1({
                projectId: params.id,
                refName: targetRef,
                kind: userNode.type,
                role: userNode.role,
                contentJson: userNode,
                nodeId: userNode.id,
                commitMessage: 'user_message',
                attachDraft: true
              });
              persistedUser = true;
              return;
            }

            const { getProject } = await import('@git/projects');
            const { appendNodeToRefNoCheckout } = await import('@git/nodes');
            if (!gitProjectId) {
              const project = await getProject(params.id);
              if (!project) {
                throw notFound('Project not found');
              }
              gitProjectId = project.id;
            }

            await appendNodeToRefNoCheckout(gitProjectId, targetRef, {
              type: 'message',
              role: 'user',
              content: message,
              contentBlocks: buildTextBlock(message),
              contextWindow: [],
              tokensUsed: undefined
            });
            persistedUser = true;
          };

          try {
            for await (const chunk of streamAssistantCompletion({
              messages: messagesForCompletion,
              signal: abortController.signal,
              provider,
              model: modelName,
              thinking: effectiveThinking,
              webSearch,
              apiKey
            })) {
              const content = chunk.content;
              if (!content) continue;

              if (!persistedUser) {
                await ensureUserPersisted();
              }
              yieldedAny = true;
              if (chunk.type === 'thinking') {
                const last = streamBlocks[streamBlocks.length - 1];
                if (chunk.append && last?.type === 'thinking') {
                  last.thinking += content;
                } else {
                  streamBlocks.push({
                    type: 'thinking',
                    thinking: content
                  });
                }
                controllerStream.enqueue(encodeChunk(`${JSON.stringify({ type: 'thinking', content, append: chunk.append })}\n`));
                continue;
              }
              if (chunk.type === 'thinking_signature') {
                streamBlocks.push({
                  type: 'thinking_signature',
                  signature: content
                });
                controllerStream.enqueue(encodeChunk(`${JSON.stringify({ type: 'thinking_signature', content, append: chunk.append })}\n`));
                continue;
              }
              if (chunk.type === 'raw_response') {
                rawResponse = chunk.payload ?? null;
                continue;
              }
              const lastText = streamBlocks[streamBlocks.length - 1];
              if (lastText?.type === 'text') {
                lastText.text += content;
              } else {
                streamBlocks.push({ type: 'text', text: content });
              }
              buffered += content;
              yieldedText = true;
              controllerStream.enqueue(encodeChunk(`${JSON.stringify({ type: 'text', content })}\n`));
            }
          } catch (error) {
            streamError = error;
          }

          if (!yieldedText && !abortController.signal.aborted && streamError == null) {
            streamError = new Error('LLM returned empty response');
          }

          try {
            if (persistedUser && buffered.trim().length > 0) {
              const contentBlocks = buildContentBlocksForProvider({
                provider,
                rawResponse,
                fallbackText: buffered,
                fallbackBlocks: streamBlocks
              });
              const contentText = deriveTextFromBlocks(contentBlocks) || buffered;
              if (store.mode === 'pg') {
                const { rtAppendNodeToRefShadowV1 } = await import('@/src/store/pg/nodes');
                const assistantNode = {
                  id: uuidv4(),
                  type: 'message',
                  role: 'assistant',
                  content: contentText,
                  contentBlocks,
                  timestamp: Date.now(),
                  parent: persistedUserNodeId,
                  createdOnBranch: targetRef,
                  modelUsed: modelName,
                  interrupted: abortController.signal.aborted || streamError !== null,
                  rawResponse
                };
                await rtAppendNodeToRefShadowV1({
                  projectId: params.id,
                  refName: targetRef,
                  kind: assistantNode.type,
                  role: assistantNode.role,
                  contentJson: assistantNode,
                  nodeId: assistantNode.id,
                  commitMessage: 'assistant_message',
                  attachDraft: false,
                  rawResponse
                });
              } else if (gitProjectId) {
                const { appendNodeToRefNoCheckout } = await import('@git/nodes');
                await appendNodeToRefNoCheckout(gitProjectId, targetRef, {
                  type: 'message',
                  role: 'assistant',
                  content: contentText,
                  contentBlocks,
                  modelUsed: modelName,
                  interrupted: abortController.signal.aborted || streamError !== null,
                  rawResponse
                });
              }
            }
          } catch (error) {
            streamError = streamError ?? error;
          } finally {
            releaseAll();
          }

          if (streamError) {
            const message = streamError instanceof Error ? streamError.message : String(streamError);
            console.error('[chat] stream error', {
              requestId,
              userId: user.id,
              projectId: params.id,
              provider,
              ref: targetRef,
              yieldedAny,
              bufferedLength: buffered.length,
              message
            });
            controllerStream.error(streamError);
            return;
          }
          console.info('[chat] complete', {
            requestId,
            userId: user.id,
            projectId: params.id,
            provider,
            ref: targetRef,
            bufferedLength: buffered.length
          });
          controllerStream.close();
        },
        cancel() {
          abortController.abort();
          releaseAll();
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'x-rt-request-id': requestId
        }
      });
    } catch (error) {
      releaseStream(params.id, targetRef);
      releaseLock();
      throw error;
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
