import { abortStream } from '@/src/server/stream-registry';

interface RouteContext {
  params: { id: string };
}

export async function POST(request: Request, { params }: RouteContext) {
  const { searchParams } = new URL(request.url);
  const ref = searchParams.get('ref') ?? undefined;
  const aborted = abortStream(params.id, ref);
  return Response.json({ aborted });
}
