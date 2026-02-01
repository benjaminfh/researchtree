// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';

type ProviderKey = 'openai' | 'gemini' | 'anthropic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireUser();
    const { rtGetUserLlmKeyStatusV1, rtGetUserLlmKeyServerV1 } = await import('@/src/store/pg/userLlmKeys');

    const status = await rtGetUserLlmKeyStatusV1().catch(() => null);

    async function check(provider: ProviderKey) {
      try {
        const key = await rtGetUserLlmKeyServerV1({ userId: user.id, provider });
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
