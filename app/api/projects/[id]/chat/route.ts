import { chatRequestSchema } from '@/src/server/schemas';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { buildChatContext } from '@/src/server/context';
import { encodeChunk, resolveLLMProvider, streamAssistantCompletion } from '@/src/server/llm';
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

    const { message, intent, llmProvider, ref, thinking } = parsed.data as typeof parsed.data & { thinking?: ThinkingSetting };
    const provider = resolveLLMProvider(llmProvider);
    const tokenLimit = await getProviderTokenLimit(provider);
    const apiKey = await requireUserApiKeyForProvider(provider);

    const targetRef = ref ?? (await getPreferredBranch(params.id));
    console.info('[chat] start', { requestId, userId: user.id, projectId: params.id, provider, ref: targetRef });
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

          try {
            for await (const chunk of streamAssistantCompletion({
              messages: messagesForCompletion,
              signal: abortController.signal,
              provider,
              thinking,
              apiKey
            })) {
              buffered += chunk.content;
              yieldedAny = true;
              controllerStream.enqueue(encodeChunk(chunk.content));
            }
          } catch (error) {
            streamError = error;
          }

          if (!yieldedAny && !abortController.signal.aborted && streamError == null) {
            streamError = new Error('LLM returned empty response');
          }

          const shouldPersist =
            buffered.trim().length > 0 && (streamError == null || abortController.signal.aborted);

          try {
            if (shouldPersist) {
              if (store.mode === 'pg') {
                const { rtGetHistoryShadowV1 } = await import('@/src/store/pg/reads');
                const { rtAppendNodeToRefShadowV1 } = await import('@/src/store/pg/nodes');
                const last = await rtGetHistoryShadowV1({ projectId: params.id, refName: targetRef, limit: 1 }).catch(() => []);
                const lastNode = (last[0]?.nodeJson as any) ?? null;
                const parentId = lastNode?.id ? String(lastNode.id) : null;

                const userNode = {
                  id: uuidv4(),
                  type: 'message',
                  role: 'user',
                  content: message,
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

                const assistantNode = {
                  id: uuidv4(),
                  type: 'message',
                  role: 'assistant',
                  content: buffered,
                  timestamp: Date.now(),
                  parent: userNode.id,
                  createdOnBranch: targetRef,
                  interrupted: abortController.signal.aborted || streamError !== null
                };
                await rtAppendNodeToRefShadowV1({
                  projectId: params.id,
                  refName: targetRef,
                  kind: assistantNode.type,
                  role: assistantNode.role,
                  contentJson: assistantNode,
                  nodeId: assistantNode.id,
                  commitMessage: 'assistant_message',
                  attachDraft: false
                });
              } else {
                const { getProject } = await import('@git/projects');
                const { appendNodeToRefNoCheckout } = await import('@git/nodes');
                const project = await getProject(params.id);
                if (!project) {
                  throw notFound('Project not found');
                }
                await appendNodeToRefNoCheckout(project.id, targetRef, {
                  type: 'message',
                  role: 'user',
                  content: message,
                  contextWindow: [],
                  tokensUsed: undefined
                });
                await appendNodeToRefNoCheckout(project.id, targetRef, {
                  type: 'message',
                  role: 'assistant',
                  content: buffered,
                  interrupted: abortController.signal.aborted || streamError !== null
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
          'Content-Type': 'text/plain; charset=utf-8',
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
