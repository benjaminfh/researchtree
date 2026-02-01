// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { headers } from 'next/headers';

function readOriginFromEnv(): string | null {
  const raw = (process.env.RT_APP_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!url.host) return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function inferProtocol(host: string): 'http' | 'https' {
  const normalized = host.trim().toLowerCase();
  const hostWithoutPort = normalized.split(':')[0] ?? normalized;
  if (!hostWithoutPort) return 'http';
  if (hostWithoutPort === 'localhost') return 'http';
  if (hostWithoutPort.endsWith('.local')) return 'http';
  if (hostWithoutPort === '127.0.0.1') return 'http';
  if (hostWithoutPort === '0.0.0.0') return 'http';
  return 'https';
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first ? first : null;
}

export function getRequestOrigin(): string | null {
  const fromEnv = readOriginFromEnv();
  if (fromEnv) return fromEnv;

  const headerList = headers();
  const host = firstHeaderValue(headerList.get('x-forwarded-host') ?? headerList.get('host'));
  if (!host) return null;

  const protoHeader = firstHeaderValue(headerList.get('x-forwarded-proto'));
  const proto = protoHeader === 'http' || protoHeader === 'https' ? protoHeader : inferProtocol(host);

  return `${proto}://${host}`;
}

