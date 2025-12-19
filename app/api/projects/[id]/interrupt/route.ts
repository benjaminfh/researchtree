import { abortStream } from '@/src/server/stream-registry';
import { requireUser } from '@/src/server/auth';

interface RouteContext {
  params: { id: string };
}

export async function POST(request: Request, { params }: RouteContext) {
  await requireUser();
  const { searchParams } = new URL(request.url);
  const ref = searchParams.get('ref') ?? undefined;
  const aborted = abortStream(params.id, ref);
  return Response.json({ aborted });
}
