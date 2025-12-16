import { appendNode } from '@git/nodes';
import { getProject } from '@git/projects';
import { chatRequestSchema } from '@/src/server/schemas';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { buildChatContext } from '@/src/server/context';
import { encodeChunk, resolveLLMProvider, streamAssistantCompletion } from '@/src/server/llm';
import { registerStream, releaseStream } from '@/src/server/stream-registry';
import { getProviderTokenLimit } from '@/src/server/providerCapabilities';

interface RouteContext {
  params: { id: string };
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }

    const body = await request.json().catch(() => null);
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { message, intent, llmProvider } = parsed.data;
    const provider = resolveLLMProvider(llmProvider);
    const tokenLimit = await getProviderTokenLimit(provider);

    await appendNode(project.id, { type: 'message', role: 'user', content: message, contextWindow: [], tokensUsed: undefined });

    const context = await buildChatContext(project.id, { tokenLimit });

    const controller = new AbortController();
    registerStream(project.id, controller);

    let buffered = '';
    try {
      for await (const chunk of streamAssistantCompletion({ messages: context.messages, signal: controller.signal, provider })) {
        buffered += chunk.content;
      }
    } finally {
      releaseStream(project.id);
    }

    await appendNode(project.id, {
      type: 'message',
      role: 'assistant',
      content: buffered,
      interrupted: controller.signal.aborted
    });

    const stream = new ReadableStream({
      start(controllerStream) {
        controllerStream.enqueue(encodeChunk(buffered));
        controllerStream.close();
      }
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/plain' } });
  } catch (error) {
    return handleRouteError(error);
  }
}
