// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { badRequest, forbidden, handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';
import { createSupabaseServerActionClient } from '@/src/server/supabase/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const changePasswordSchema = z
  .object({
    newPassword: z.string().min(8).max(500),
    confirmPassword: z.string().min(8).max(500)
  })
  .strict();

function assertSameOrigin(request: Request) {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  const matches = (value: string) => {
    try {
      return new URL(value).origin === expectedOrigin;
    } catch {
      return false;
    }
  };

  if (origin) {
    if (origin !== expectedOrigin) throw forbidden('Invalid origin');
    return;
  }

  if (referer) {
    if (!matches(referer)) throw forbidden('Invalid referer');
  }
}

export async function PUT(request: Request) {
  try {
    await requireUser();
    assertSameOrigin(request);
    const body = await request.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }
    if (parsed.data.newPassword !== parsed.data.confirmPassword) {
      throw badRequest('Passwords do not match');
    }

    const supabase = createSupabaseServerActionClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw badRequest('Sign in required');
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
    if (error) {
      throw badRequest(error.message);
    }

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
