import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { buildChatContext, type ChatMessage } from '@/src/server/context';
import { editMessageSchema } from '@/src/server/schemas';
import { acquireProjectRefLock, withProjectLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';
import { getProviderTokenLimit } from '@/src/server/providerCapabilities';
import { resolveLLMProvider, streamAssistantCompletion } from '@/src/server/llm';
import { getThinkingSystemInstruction, type ThinkingSetting } from '@/src/shared/thinking';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';
import { v4 as uuidv4 } from 'uuid';

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

    const { content, branchName, fromRef, nodeId, llmProvider, thinking } = parsed.data as typeof parsed.data & {
      thinking?: ThinkingSetting;
    };
    const currentBranch = await getPreferredBranch(params.id);
    const targetBranch = branchName?.trim() || `edit-${Date.now()}`;
    const sourceRef = fromRef?.trim() || currentBranch;

    return await withProjectLock(params.id, async () => {
      const releaseRefLock = await acquireProjectRefLock(params.id, sourceRef);
      try {
        if (store.mode === 'pg') {
          const { rtGetHistoryShadowV1 } = await import('@/src/store/pg/reads');
          const { rtCreateRefFromNodeParentShadowV1 } = await import('@/src/store/pg/branches');
          const { rtSetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
          const { rtAppendNodeToRefShadowV1 } = await import('@/src/store/pg/nodes');

          const sourceRows = await rtGetHistoryShadowV1({ projectId: params.id, refName: sourceRef, limit: 500 });
          const sourceNodes = sourceRows.map((r) => r.nodeJson).filter(Boolean) as any[];
          const targetNode = sourceNodes.find((node) => String(node.id) === nodeId);
          if (!targetNode) {
            throw badRequest(`Node ${nodeId} not found on ref ${sourceRef}`);
          }
          if (targetNode.type !== 'message') {
            throw badRequest('Only message nodes can be edited');
          }

          await rtCreateRefFromNodeParentShadowV1({
            projectId: params.id,
            sourceRefName: sourceRef,
            newRefName: targetBranch,
            nodeId
          });

          await rtSetCurrentRefShadowV1({ projectId: params.id, refName: targetBranch });

          const lastTargetRows = await rtGetHistoryShadowV1({ projectId: params.id, refName: targetBranch, limit: 1 });
          const lastTargetNode = (lastTargetRows[0]?.nodeJson as any) ?? null;
          const parentId = lastTargetNode?.id ? String(lastTargetNode.id) : null;

          const editedNode = {
            id: uuidv4(),
            type: 'message',
            role: targetNode.role,
            content,
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
              const provider = resolveLLMProvider(llmProvider);
              const tokenLimit = await getProviderTokenLimit(provider);
              const context = await buildChatContext(params.id, { tokenLimit, ref: targetBranch });
              const thinkingInstruction = getThinkingSystemInstruction(thinking);
              const messagesForCompletion: ChatMessage[] = thinkingInstruction
                ? [
                    ...context.messages.slice(0, 1),
                    { role: 'system', content: thinkingInstruction } satisfies ChatMessage,
                    ...context.messages.slice(1)
                  ]
                : context.messages;

              let buffered = '';
              for await (const chunk of streamAssistantCompletion({ messages: messagesForCompletion, provider, thinking })) {
                buffered += chunk.content;
              }

              assistantNode = {
                id: uuidv4(),
                type: 'message',
                role: 'assistant',
                content: buffered,
                timestamp: Date.now(),
                parent: editedNode.id,
                createdOnBranch: targetBranch,
                interrupted: false
              };

              await rtAppendNodeToRefShadowV1({
                projectId: params.id,
                refName: targetBranch,
                kind: assistantNode.type,
                role: assistantNode.role,
                contentJson: assistantNode,
                nodeId: assistantNode.id,
                commitMessage: 'assistant_message',
                attachDraft: false
              });
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

        try {
          const commitHash = await getCommitHashForNode(project.id, sourceRef, nodeId, { parent: true });
          await createBranch(project.id, targetBranch, commitHash);
        } catch (err) {
          const message = (err as Error)?.message ?? 'Failed to create edit branch';
          throw badRequest(message);
        }

        const node = await appendNode(
          project.id,
          {
            type: 'message',
            role: targetNode.role,
            content
          },
          { ref: targetBranch }
        );

      let assistantNode: any = null;
      if (node.type === 'message' && node.role === 'user') {
        try {
          const provider = resolveLLMProvider(llmProvider);
          const tokenLimit = await getProviderTokenLimit(provider);
          const context = await buildChatContext(project.id, { tokenLimit, ref: targetBranch });
          const thinkingInstruction = getThinkingSystemInstruction(thinking);
          const messagesForCompletion: ChatMessage[] = thinkingInstruction
            ? [
                ...context.messages.slice(0, 1),
                { role: 'system', content: thinkingInstruction } satisfies ChatMessage,
                ...context.messages.slice(1)
              ]
            : context.messages;

          let buffered = '';
          for await (const chunk of streamAssistantCompletion({ messages: messagesForCompletion, provider, thinking })) {
            buffered += chunk.content;
          }

          assistantNode = await appendNode(
            project.id,
            {
              type: 'message',
              role: 'assistant',
              content: buffered,
              interrupted: false
            },
            { ref: targetBranch }
          );
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
