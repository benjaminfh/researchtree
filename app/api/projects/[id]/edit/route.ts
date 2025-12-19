import { appendNode } from '@git/nodes';
import { createBranch } from '@git/branches';
import { getProject } from '@git/projects';
import { getCurrentBranchName, getCommitHashForNode, readNodesFromRef } from '@git/utils';
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

interface RouteContext {
  params: { id: string };
}

async function getPreferredBranch(projectId: string): Promise<string> {
  const shouldUsePrefs = getStoreConfig().usePgPrefs;
  if (!shouldUsePrefs) {
    return getCurrentBranchName(projectId);
  }
  try {
    const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
    const { rtGetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
    await rtCreateProjectShadow({ projectId, name: 'Untitled' });
    const { refName } = await rtGetCurrentRefShadowV1({ projectId, defaultRefName: 'main' });
    return refName;
  } catch {
    return getCurrentBranchName(projectId);
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
    const parsed = editMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { content, branchName, fromRef, nodeId, llmProvider, thinking } = parsed.data as typeof parsed.data & {
      thinking?: ThinkingSetting;
    };
    const currentBranch = await getPreferredBranch(project.id);
    const targetBranch = branchName?.trim() || `edit-${Date.now()}`;
    const sourceRef = fromRef?.trim() || currentBranch;

    return await withProjectLock(project.id, async () => {
      const releaseRefLock = await acquireProjectRefLock(project.id, sourceRef);
      try {
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

      if (store.shadowWriteToPg) {
        try {
          const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
          const { rtCreateRefFromNodeParentShadowV1 } = await import('@/src/store/pg/branches');
          await rtCreateProjectShadow({
            projectId: project.id,
            name: project.name ?? 'Untitled',
            description: project.description
          });
          await rtCreateRefFromNodeParentShadowV1({
            projectId: project.id,
            sourceRefName: sourceRef,
            newRefName: targetBranch,
            nodeId
          });
        } catch (error) {
          console.error('[pg-shadow-write] Failed to create edit branch', error);
        }
      }

      if (store.usePgPrefs) {
        try {
          const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
          const { rtSetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
          await rtCreateProjectShadow({ projectId: project.id, name: project.name ?? 'Untitled', description: project.description });
          await rtSetCurrentRefShadowV1({ projectId: project.id, refName: targetBranch });
        } catch (error) {
          console.error('[pg-prefs] Failed to set current branch', error);
        }
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
            refName: targetBranch,
            kind: node.type,
            role: node.role,
            contentJson: node,
            nodeId: node.id,
            commitMessage: 'edit_message',
            attachDraft: true
          });
        } catch (error) {
          console.error('[pg-shadow-write] Failed to append edited node', error);
        }
      }

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
                refName: targetBranch,
                kind: assistantNode.type,
                role: assistantNode.role,
                contentJson: assistantNode,
                nodeId: assistantNode.id,
                commitMessage: 'assistant_message',
                attachDraft: false
              });
            } catch (error) {
              console.error('[pg-shadow-write] Failed to append assistant node after edit', error);
            }
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
