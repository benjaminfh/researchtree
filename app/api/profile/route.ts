// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { badRequest, handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';
import { z } from 'zod';
import { getStoreConfig } from '@/src/server/storeConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const updateKeysSchema = z
  .object({
    openaiToken: z.string().max(500).optional().nullable(),
    geminiToken: z.string().max(500).optional().nullable(),
    anthropicToken: z.string().max(500).optional().nullable(),
    // Back-compat (UI used "Key" previously).
    openaiKey: z.string().max(500).optional().nullable(),
    geminiKey: z.string().max(500).optional().nullable(),
    anthropicKey: z.string().max(500).optional().nullable()
  })
  .strict();

function normalizeSecret(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET() {
  try {
    const user = await requireUser();
    const store = getStoreConfig();
    const { rtGetUserLlmKeyStatusV1 } = await import('@/src/store/pg/userLlmKeys');
    const status = await rtGetUserLlmKeyStatusV1();

    if (store.mode === 'pg' && user.email) {
      const { rtAcceptProjectInvitesShadowV1 } = await import('@/src/store/pg/members');
      await rtAcceptProjectInvitesShadowV1({ email: user.email });
    }

    return Response.json({
      user: { id: user.id, email: user.email ?? null },
      llmTokens: {
        openai: { configured: status.hasOpenAI },
        gemini: { configured: status.hasGemini },
        anthropic: { configured: status.hasAnthropic }
      },
      updatedAt: status.updatedAt
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireUser();
    const body = await request.json().catch(() => null);
    const parsed = updateKeysSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { rtSetUserLlmKeyV1 } = await import('@/src/store/pg/userLlmKeys');
    const openaiToken = parsed.data.openaiToken ?? parsed.data.openaiKey;
    const geminiToken = parsed.data.geminiToken ?? parsed.data.geminiKey;
    const anthropicToken = parsed.data.anthropicToken ?? parsed.data.anthropicKey;

    if (parsed.data.openaiToken !== undefined || parsed.data.openaiKey !== undefined) {
      await rtSetUserLlmKeyV1({ provider: 'openai', secret: normalizeSecret(openaiToken) });
    }
    if (parsed.data.geminiToken !== undefined || parsed.data.geminiKey !== undefined) {
      await rtSetUserLlmKeyV1({ provider: 'gemini', secret: normalizeSecret(geminiToken) });
    }
    if (parsed.data.anthropicToken !== undefined || parsed.data.anthropicKey !== undefined) {
      await rtSetUserLlmKeyV1({ provider: 'anthropic', secret: normalizeSecret(anthropicToken) });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
