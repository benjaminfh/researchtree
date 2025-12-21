import { handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';

type ProviderKey = 'openai' | 'gemini' | 'anthropic';

export async function GET() {
  try {
    await requireUser();
    const { rtGetUserLlmKeyStatusV1, rtGetUserLlmKeyV1 } = await import('@/src/store/pg/userLlmKeys');

    const status = await rtGetUserLlmKeyStatusV1().catch(() => null);

    async function check(provider: ProviderKey) {
      try {
        const key = await rtGetUserLlmKeyV1({ provider });
        return { readable: Boolean(key && key.trim()), error: null as string | null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { readable: false, error: message };
      }
    }

    const [openai, gemini, anthropic] = await Promise.all([check('openai'), check('gemini'), check('anthropic')]);

    return Response.json({
      providers: {
        openai: { configured: status?.hasOpenAI ?? null, ...openai },
        gemini: { configured: status?.hasGemini ?? null, ...gemini },
        anthropic: { configured: status?.hasAnthropic ?? null, ...anthropic }
      },
      updatedAt: status?.updatedAt ?? null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

