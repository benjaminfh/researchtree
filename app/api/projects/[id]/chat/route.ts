import { appendNodeToRefNoCheckout } from '@git/nodes';
import { getProject } from '@git/projects';
import { chatRequestSchema } from '@/src/server/schemas';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { buildChatContext, type ChatMessage } from '@/src/server/context';
import { encodeChunk, resolveLLMProvider, streamAssistantCompletion } from '@/src/server/llm';
import { registerStream, releaseStream } from '@/src/server/stream-registry';
import { getProviderTokenLimit } from '@/src/server/providerCapabilities';
import { acquireProjectRefLock } from '@/src/server/locks';
import { getThinkingSystemInstruction, type ThinkingSetting } from '@/src/shared/thinking';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { v4 as uuidv4 } from 'uuid';
import { requireProjectAccess } from '@/src/server/authz';

interface RouteContext {
  params: { id: string };
}

async function getPreferredBranch(projectId: string): Promise<string> {
  const shouldUsePrefs = getStoreConfig().usePgPrefs;
  if (!shouldUsePrefs) return 'main';
  try {
    const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
    const { rtGetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
    await rtCreateProjectShadow({ projectId, name: 'Untitled' });
    const { refName } = await rtGetCurrentRefShadowV1({ projectId, defaultRefName: 'main' });
    return refName;
  } catch {
    return 'main';
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    await requireProjectAccess(project);

    const body = await request.json().catch(() => null);
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { message, intent, llmProvider, ref, thinking } = parsed.data as typeof parsed.data & { thinking?: ThinkingSetting };
    const provider = resolveLLMProvider(llmProvider);
    const tokenLimit = await getProviderTokenLimit(provider);

    const targetRef = ref ?? (await getPreferredBranch(project.id));
    const releaseLock = await acquireProjectRefLock(project.id, targetRef);
    const abortController = new AbortController();

    try {
      let userNode: any;
      if (store.mode === 'pg') {
        const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
        const { rtAppendNodeToRefShadowV1 } = await import('@/src/store/pg/nodes');
        await rtCreateProjectShadow({
          projectId: project.id,
          name: project.name ?? 'Untitled',
          description: project.description
        });
        const nodeId = uuidv4();
        userNode = {
          id: nodeId,
          type: 'message',
          role: 'user',
          content: message,
          timestamp: Date.now(),
          parent: null,
          createdOnBranch: targetRef,
          contextWindow: [],
          tokensUsed: undefined
        };
        await rtAppendNodeToRefShadowV1({
          projectId: project.id,
          refName: targetRef,
          kind: userNode.type,
          role: userNode.role,
          contentJson: userNode,
          nodeId: userNode.id,
          commitMessage: 'user_message',
          attachDraft: true
        });
      } else {
        userNode = await appendNodeToRefNoCheckout(project.id, targetRef, {
          type: 'message',
          role: 'user',
          content: message,
          contextWindow: [],
          tokensUsed: undefined
        });

        if (store.shadowWriteToPg) {
          try {
            const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
            const { rtAppendNodeToRefShadowV1 } = await import('@/src/store/pg/nodes');
            await rtCreateProjectShadow({
              projectId: project.id,
              name: project.name ?? 'Untitled',
              description: project.description
            });
            await rtAppendNodeToRefShadowV1({
              projectId: project.id,
              refName: targetRef,
              kind: userNode.type,
              role: userNode.role,
              contentJson: userNode,
              nodeId: userNode.id,
              commitMessage: 'user_message',
              attachDraft: true
            });
          } catch (error) {
            console.error('[pg-shadow-write] Failed to append user node', error);
          }
        }
      }

      const context = await buildChatContext(project.id, { tokenLimit, ref: targetRef });
      const thinkingInstruction = getThinkingSystemInstruction(thinking);
      const messagesForCompletion: ChatMessage[] = thinkingInstruction
        ? [
            ...context.messages.slice(0, 1),
            { role: 'system', content: thinkingInstruction } satisfies ChatMessage,
            ...context.messages.slice(1)
          ]
        : context.messages;

      registerStream(project.id, abortController, targetRef);

      let released = false;
      const releaseAll = () => {
        if (released) return;
        released = true;
        releaseStream(project.id, targetRef);
        releaseLock();
      };

      const stream = new ReadableStream<Uint8Array>({
        async start(controllerStream) {
          let buffered = '';
          let streamError: unknown = null;

          try {
            for await (const chunk of streamAssistantCompletion({
              messages: messagesForCompletion,
              signal: abortController.signal,
              provider
            })) {
              buffered += chunk.content;
              controllerStream.enqueue(encodeChunk(chunk.content));
            }
          } catch (error) {
            streamError = error;
          }

          try {
            if (store.mode === 'pg') {
              const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
              const { rtAppendNodeToRefShadowV1 } = await import('@/src/store/pg/nodes');
              await rtCreateProjectShadow({
                projectId: project.id,
                name: project.name ?? 'Untitled',
                description: project.description
              });
              const assistantNode = {
                id: uuidv4(),
                type: 'message',
                role: 'assistant',
                content: buffered,
                timestamp: Date.now(),
                parent: userNode?.id ?? null,
                createdOnBranch: targetRef,
                interrupted: abortController.signal.aborted || streamError !== null
              };
              await rtAppendNodeToRefShadowV1({
                projectId: project.id,
                refName: targetRef,
                kind: assistantNode.type,
                role: assistantNode.role,
                contentJson: assistantNode,
                nodeId: assistantNode.id,
                commitMessage: 'assistant_message',
                attachDraft: false
              });
            } else {
              const assistantNode = await appendNodeToRefNoCheckout(project.id, targetRef, {
                type: 'message',
                role: 'assistant',
                content: buffered,
                interrupted: abortController.signal.aborted || streamError !== null
              });

              if (store.shadowWriteToPg) {
                try {
                  const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
                  const { rtAppendNodeToRefShadowV1 } = await import('@/src/store/pg/nodes');
                  await rtCreateProjectShadow({
                    projectId: project.id,
                    name: project.name ?? 'Untitled',
                    description: project.description
                  });
                  await rtAppendNodeToRefShadowV1({
                    projectId: project.id,
                    refName: targetRef,
                    kind: assistantNode.type,
                    role: assistantNode.role,
                    contentJson: assistantNode,
                    nodeId: assistantNode.id,
                    commitMessage: 'assistant_message',
                    attachDraft: false
                  });
                } catch (error) {
                  console.error('[pg-shadow-write] Failed to append assistant node', error);
                }
              }
            }
          } catch (error) {
            streamError = streamError ?? error;
          } finally {
            releaseAll();
          }

          if (streamError) {
            controllerStream.error(streamError);
            return;
          }
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
          Connection: 'keep-alive'
        }
      });
    } catch (error) {
      releaseStream(project.id, targetRef);
      releaseLock();
      throw error;
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
