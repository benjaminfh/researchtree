// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { chatRequestSchema } from '@/src/server/schemas';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { buildChatContext } from '@/src/server/context';
import { completeAssistantWithCanvasTools, encodeChunk, streamAssistantCompletion } from '@/src/server/llm';
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
import { getPreviousResponseId, setPreviousResponseId } from '@/src/server/llmState';
import { buildUnifiedDiff } from '@/src/server/canvasDiff';
import { toJsonValue } from '@/src/server/json';

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

function buildCanvasDiffMessage(diff: string): string {
  return [
    'Canvas update (do not display to user). Apply this diff to your internal canvas state:',
    '```diff',
    diff.trim(),
    '```'
  ].join('\n');
}

function buildUserMessage(input: { message?: string | null; question?: string | null; highlight?: string | null }): string {
  const highlight = input.highlight?.trim() ?? '';
  const question = input.question?.trim() ?? '';
  const message = input.message?.trim() ?? '';

  const parts: string[] = [];

  if (highlight) {
    parts.push('Highlighted passage:', `"""${highlight}"""`);
  }

  if (question) {
    parts.push('Question:', question);
  }

  if (message && parts.length === 0) {
    return message;
  }

  if (message) {
    parts.push('Additional message:', message);
  }

  return parts.join('\n\n');
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const requestId = uuidv4();
    const user = await requireUser();
    const store = getStoreConfig();
    const canvasToolsEnabled = store.mode === 'pg' && process.env.RT_CANVAS_TOOLS === 'true';
    await requireProjectAccess({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { message, question, highlight, intent, llmProvider, ref, thinking, webSearch } = parsed.data as typeof parsed.data & {
      thinking?: ThinkingSetting;
      webSearch?: boolean;
    };
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
    const previousResponseId =
      provider === 'openai_responses'
        ? await getPreviousResponseId(params.id, { id: targetRefId, name: targetRefName }).catch(() => null)
        : null;

    console.info('[chat] start', { requestId, userId: user.id, projectId: params.id, provider, ref: targetRefName, webSearch });
    const releaseLock = await acquireProjectRefLock(params.id, targetRefName);
    const abortController = new AbortController();

    try {
      const getCanvasDiffData = async (includeMessage: boolean) => {
        if (store.mode !== 'pg') {
          return { hasChanges: false, diff: '', message: '' };
        }
        const { rtGetCanvasHashesShadowV2, rtGetCanvasPairShadowV2 } = await import('@/src/store/pg/reads');
        if (!targetRefId) {
          return { hasChanges: false, diff: '', message: '' };
        }
        const hashes = await rtGetCanvasHashesShadowV2({ projectId: params.id, refId: targetRefId });
        const hasChanges = Boolean(hashes.draftHash && hashes.draftHash !== hashes.artefactHash);
        if (!hasChanges) {
          return { hasChanges: false, diff: '', message: '' };
        }
        if (!includeMessage) {
          return { hasChanges, diff: '', message: '' };
        }
        const pair = await rtGetCanvasPairShadowV2({ projectId: params.id, refId: targetRefId });
        const diff = buildUnifiedDiff(pair.artefactContent ?? '', pair.draftContent ?? '');
        const message = diff.trim().length > 0 ? buildCanvasDiffMessage(diff) : '';
        return { hasChanges, diff, message };
      };

      const context = await buildChatContext(params.id, { tokenLimit, ref: targetRefName });
      const userCanvasDiff = await getCanvasDiffData(canvasToolsEnabled);
      const messagesForCompletion = [
        ...context.messages,
        ...(userCanvasDiff.message ? [{ role: 'user' as const, content: userCanvasDiff.message }] : []),
        { role: 'user' as const, content: userContent }
      ];

      registerStream(params.id, abortController, targetRefName);

      let released = false;
      const releaseAll = () => {
        if (released) return;
        released = true;
        releaseStream(params.id, targetRefName);
        releaseLock();
      };

      if (canvasToolsEnabled) {
        const stream = new ReadableStream<Uint8Array>({
          async start(controllerStream) {
            let streamError: unknown = null;
            let persistedUser = false;
            let persistedUserNodeId: string | null = null;
            const streamBlocks: ThinkingContentBlock[] = [];
            let rawResponse: unknown = null;
            let responseId: string | null = null;
            let assistantBlocks: ThinkingContentBlock[] = [];
            let assistantText = '';

            const enqueueContentBlocks = (blocks: ThinkingContentBlock[]) => {
              for (const block of blocks) {
                if (!block || typeof block !== 'object') continue;
                if (block.type === 'thinking') {
                  const thinking = typeof block.thinking === 'string' ? block.thinking : '';
                  if (thinking) {
                    controllerStream.enqueue(
                      encodeChunk(`${JSON.stringify({ type: 'thinking', content: thinking, append: false })}\n`)
                    );
                  }
                  const signature = typeof block.signature === 'string' ? block.signature : '';
                  if (signature) {
                    controllerStream.enqueue(
                      encodeChunk(`${JSON.stringify({ type: 'thinking_signature', content: signature, append: false })}\n`)
                    );
                  }
                  continue;
                }
                if (block.type === 'thinking_signature') {
                  const signature = typeof block.signature === 'string' ? block.signature : '';
                  if (signature) {
                    controllerStream.enqueue(
                      encodeChunk(`${JSON.stringify({ type: 'thinking_signature', content: signature, append: false })}\n`)
                    );
                  }
                  continue;
                }
                if (block.type === 'text') {
                  const text = typeof block.text === 'string' ? block.text : '';
                  if (text) {
                    controllerStream.enqueue(
                      encodeChunk(`${JSON.stringify({ type: 'text', content: text, append: false })}\n`)
                    );
                  }
                }
              }
            };

            const ensureUserPersisted = async () => {
              if (persistedUser) return;

              if (store.mode === 'pg') {
                const { rtGetHistoryShadowV2 } = await import('@/src/store/pg/reads');
                const { rtAppendNodeToRefShadowV2 } = await import('@/src/store/pg/nodes');
                const last = await rtGetHistoryShadowV2({ projectId: params.id, refId: targetRefId!, limit: 1 }).catch(() => []);
                const lastNode = (last[0]?.nodeJson as any) ?? null;
                const parentId = lastNode?.id ? String(lastNode.id) : null;

                if (userCanvasDiff.message) {
                  const hiddenNode = {
                    id: uuidv4(),
                    type: 'message',
                    role: 'user',
                    content: userCanvasDiff.message,
                    contentBlocks: buildTextBlock(userCanvasDiff.message),
                    uiHidden: true,
                    timestamp: Date.now(),
                    parent: parentId,
                    createdOnBranch: targetRefName,
                    contextWindow: [],
                    tokensUsed: undefined
                  };
                  await rtAppendNodeToRefShadowV2({
                    projectId: params.id,
                    refId: targetRefId!,
                    kind: hiddenNode.type,
                    role: hiddenNode.role,
                    contentJson: hiddenNode,
                    nodeId: hiddenNode.id,
                    commitMessage: 'canvas_diff',
                    attachDraft: false
                  });
                }

                const nodeId = persistedUserNodeId ?? uuidv4();
                persistedUserNodeId = nodeId;
                const userNode = {
                  id: nodeId,
                  type: 'message',
                  role: 'user',
                  content: userContent,
                  contentBlocks: buildTextBlock(userContent),
                  timestamp: Date.now(),
                  parent: parentId,
                  createdOnBranch: targetRefName,
                  contextWindow: [],
                  tokensUsed: undefined
                };
                await rtAppendNodeToRefShadowV2({
                  projectId: params.id,
                  refId: targetRefId!,
                  kind: userNode.type,
                  role: userNode.role,
                  contentJson: userNode,
                  nodeId: userNode.id,
                  commitMessage: 'user_message',
                  attachDraft: userCanvasDiff.hasChanges
                });
                persistedUser = true;
                return;
              }

              const { getProject } = await import('@git/projects');
              const { appendNodeToRefNoCheckout } = await import('@git/nodes');
              const project = await getProject(params.id);
              if (!project) {
                throw notFound('Project not found');
              }
              await appendNodeToRefNoCheckout(project.id, targetRefName, {
                type: 'message',
                role: 'user',
                content: userContent,
                contentBlocks: buildTextBlock(userContent),
                contextWindow: [],
                tokensUsed: undefined
              });
              persistedUser = true;
            };

            try {
              await ensureUserPersisted();
              const result = await completeAssistantWithCanvasTools({
                messages: messagesForCompletion,
                signal: abortController.signal,
                provider,
                model: modelName,
                thinking: effectiveThinking,
                webSearch,
                apiKey,
                previousResponseId,
                projectId: params.id,
                refId: targetRefId!
              });
              rawResponse = result.rawResponse ?? null;
              responseId = result.responseId ?? null;

              const fallbackText = result.text ?? '';
              const fallbackBlocks = fallbackText ? buildTextBlock(fallbackText) : [];
              assistantBlocks = buildContentBlocksForProvider({
                provider,
                rawResponse,
                fallbackText,
                fallbackBlocks
              });
              assistantText = deriveTextFromBlocks(assistantBlocks) || fallbackText;
              if (!assistantText.trim()) {
                throw new Error('LLM returned empty response');
              }
              const responseBlocks = assistantBlocks.length > 0 ? assistantBlocks : fallbackBlocks;
              enqueueContentBlocks(responseBlocks);
              streamBlocks.push(...responseBlocks);
            } catch (error) {
              streamError = error;
            }

            try {
              if (persistedUser && streamBlocks.length > 0) {
                const assistantCanvasDiff = await getCanvasDiffData(canvasToolsEnabled);
                const contentBlocks =
                  assistantBlocks.length > 0
                    ? assistantBlocks
                    : buildContentBlocksForProvider({
                        provider,
                        rawResponse,
                        fallbackText: deriveTextFromBlocks(streamBlocks),
                        fallbackBlocks: streamBlocks
                      });
                const contentText = deriveTextFromBlocks(contentBlocks) || assistantText || '';
                const rawResponseForStorage = toJsonValue(rawResponse);
                if (store.mode === 'pg') {
                  const { rtAppendNodeToRefShadowV2 } = await import('@/src/store/pg/nodes');
                  const assistantNode = {
                    id: uuidv4(),
                    type: 'message',
                    role: 'assistant',
                    content: contentText,
                    contentBlocks,
                    timestamp: Date.now(),
                    parent: persistedUserNodeId,
                    createdOnBranch: targetRefName,
                    modelUsed: modelName,
                    responseId: responseId ?? undefined,
                    interrupted: abortController.signal.aborted || streamError !== null,
                    rawResponse: rawResponseForStorage
                  };
                  await rtAppendNodeToRefShadowV2({
                    projectId: params.id,
                    refId: targetRefId!,
                    kind: assistantNode.type,
                    role: assistantNode.role,
                    contentJson: assistantNode,
                    nodeId: assistantNode.id,
                    commitMessage: 'assistant_message',
                    attachDraft: assistantCanvasDiff.hasChanges,
                    rawResponse: rawResponseForStorage
                  });
                  if (assistantCanvasDiff.message) {
                    const hiddenNode = {
                      id: uuidv4(),
                      type: 'message',
                      role: 'user',
                      content: assistantCanvasDiff.message,
                      contentBlocks: buildTextBlock(assistantCanvasDiff.message),
                      uiHidden: true,
                      timestamp: Date.now(),
                      parent: assistantNode.id,
                      createdOnBranch: targetRefName,
                      contextWindow: [],
                      tokensUsed: undefined
                    };
                    await rtAppendNodeToRefShadowV2({
                      projectId: params.id,
                      refId: targetRefId!,
                      kind: hiddenNode.type,
                      role: hiddenNode.role,
                      contentJson: hiddenNode,
                      nodeId: hiddenNode.id,
                      commitMessage: 'canvas_diff',
                      attachDraft: false
                    });
                  }
                }
                if (provider === 'openai_responses' && responseId) {
                  await setPreviousResponseId(params.id, { id: targetRefId, name: targetRefName }, responseId);
                }
              }
            } catch (error) {
              streamError = streamError ?? error;
            } finally {
              releaseAll();
            }

            if (streamError) {
              const message = streamError instanceof Error ? streamError.message : String(streamError);
              console.error('[chat] tool loop error', {
                requestId,
                userId: user.id,
                projectId: params.id,
                provider,
                ref: targetRefName,
                message
              });
              controllerStream.error(streamError);
              return;
            }
            console.info('[chat] tool loop complete', {
              requestId,
              userId: user.id,
              projectId: params.id,
              provider,
              ref: targetRefName
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
      }

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
          let responseId: string | null = null;

          const ensureUserPersisted = async () => {
            if (persistedUser) return;

            if (store.mode === 'pg') {
              const { rtGetHistoryShadowV2 } = await import('@/src/store/pg/reads');
              const { rtAppendNodeToRefShadowV2 } = await import('@/src/store/pg/nodes');
              const last = await rtGetHistoryShadowV2({ projectId: params.id, refId: targetRefId!, limit: 1 }).catch(() => []);
              const lastNode = (last[0]?.nodeJson as any) ?? null;
              const parentId = lastNode?.id ? String(lastNode.id) : null;

              const nodeId = persistedUserNodeId ?? uuidv4();
              persistedUserNodeId = nodeId;

              if (userCanvasDiff.message) {
                const hiddenNode = {
                  id: uuidv4(),
                  type: 'message',
                  role: 'user',
                  content: userCanvasDiff.message,
                  contentBlocks: buildTextBlock(userCanvasDiff.message),
                  uiHidden: true,
                  timestamp: Date.now(),
                  parent: parentId,
                  createdOnBranch: targetRefName,
                  contextWindow: [],
                  tokensUsed: undefined
                };
                await rtAppendNodeToRefShadowV2({
                  projectId: params.id,
                  refId: targetRefId!,
                  kind: hiddenNode.type,
                  role: hiddenNode.role,
                  contentJson: hiddenNode,
                  nodeId: hiddenNode.id,
                  commitMessage: 'canvas_diff',
                  attachDraft: false
                });
              }

              const userNode = {
                id: nodeId,
                type: 'message',
                role: 'user',
                content: userContent,
                contentBlocks: buildTextBlock(userContent),
                timestamp: Date.now(),
                parent: parentId,
                createdOnBranch: targetRefName,
                contextWindow: [],
                tokensUsed: undefined
              };
              await rtAppendNodeToRefShadowV2({
                projectId: params.id,
                refId: targetRefId!,
                kind: userNode.type,
                role: userNode.role,
                contentJson: userNode,
                nodeId: userNode.id,
                commitMessage: 'user_message',
                attachDraft: userCanvasDiff.hasChanges
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

            await appendNodeToRefNoCheckout(gitProjectId, targetRefName, {
              type: 'message',
              role: 'user',
              content: userContent,
              contentBlocks: buildTextBlock(userContent),
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
              apiKey,
              previousResponseId
            })) {
              if (chunk.type === 'raw_response') {
                rawResponse = chunk.payload ?? null;
                if (rawResponse && typeof rawResponse === 'object' && (rawResponse as any).responseId) {
                  responseId = String((rawResponse as any).responseId);
                }
                continue;
              }
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
              const assistantCanvasDiff = await getCanvasDiffData(canvasToolsEnabled);
              const contentBlocks = buildContentBlocksForProvider({
                provider,
                rawResponse,
                fallbackText: buffered,
                fallbackBlocks: streamBlocks
              });
              const contentText = deriveTextFromBlocks(contentBlocks) || buffered;
              const rawResponseForStorage = toJsonValue(rawResponse);
              if (store.mode === 'pg') {
                const { rtAppendNodeToRefShadowV2 } = await import('@/src/store/pg/nodes');
                const assistantNode = {
                  id: uuidv4(),
                  type: 'message',
                  role: 'assistant',
                  content: contentText,
                  contentBlocks,
                  timestamp: Date.now(),
                  parent: persistedUserNodeId,
                  createdOnBranch: targetRefName,
                  modelUsed: modelName,
                  responseId: responseId ?? undefined,
                  interrupted: abortController.signal.aborted || streamError !== null,
                  rawResponse: rawResponseForStorage
                };
                await rtAppendNodeToRefShadowV2({
                  projectId: params.id,
                  refId: targetRefId!,
                  kind: assistantNode.type,
                  role: assistantNode.role,
                  contentJson: assistantNode,
                  nodeId: assistantNode.id,
                  commitMessage: 'assistant_message',
                  attachDraft: assistantCanvasDiff.hasChanges,
                  rawResponse: rawResponseForStorage
                });
                if (assistantCanvasDiff.message) {
                  const hiddenNode = {
                    id: uuidv4(),
                    type: 'message',
                    role: 'user',
                    content: assistantCanvasDiff.message,
                    contentBlocks: buildTextBlock(assistantCanvasDiff.message),
                    uiHidden: true,
                    timestamp: Date.now(),
                    parent: assistantNode.id,
                    createdOnBranch: targetRefName,
                    contextWindow: [],
                    tokensUsed: undefined
                  };
                  await rtAppendNodeToRefShadowV2({
                    projectId: params.id,
                    refId: targetRefId!,
                    kind: hiddenNode.type,
                    role: hiddenNode.role,
                    contentJson: hiddenNode,
                    nodeId: hiddenNode.id,
                    commitMessage: 'canvas_diff',
                    attachDraft: false
                  });
                }
              } else if (gitProjectId) {
                const { appendNodeToRefNoCheckout } = await import('@git/nodes');
                await appendNodeToRefNoCheckout(gitProjectId, targetRefName, {
                  type: 'message',
                  role: 'assistant',
                  content: contentText,
                  contentBlocks,
                  modelUsed: modelName,
                  responseId: responseId ?? undefined,
                  interrupted: abortController.signal.aborted || streamError !== null,
                  rawResponse: rawResponseForStorage
                });
              }
              if (provider === 'openai_responses' && responseId) {
                await setPreviousResponseId(params.id, { id: targetRefId, name: targetRefName }, responseId);
              }
            }
          } catch (error) {
            streamError = streamError ?? error;
          } finally {
            releaseAll();
          }

          if (streamError) {
            const message = streamError instanceof Error ? streamError.message : String(streamError);
            const isAbort =
              abortController.signal.aborted || (streamError as { name?: string | null })?.name === 'AbortError';
              console.error('[chat] stream error', {
                requestId,
                userId: user.id,
                projectId: params.id,
                provider,
                ref: targetRefName,
                yieldedAny,
                bufferedLength: buffered.length,
                message
              });
            if (!isAbort) {
              controllerStream.enqueue(encodeChunk(`${JSON.stringify({ type: 'error', message })}\n`));
            }
            controllerStream.close();
            return;
          }
          console.info('[chat] complete', {
            requestId,
            userId: user.id,
            projectId: params.id,
            provider,
            ref: targetRefName,
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
      releaseStream(params.id, targetRefName);
      releaseLock();
      throw error;
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
