import { abortStream } from '@/src/server/stream-registry';

interface RouteContext {
  params: { id: string };
}

export async function POST(_request: Request, { params }: RouteContext) {
  const aborted = abortStream(params.id);
  return Response.json({ aborted });
}
