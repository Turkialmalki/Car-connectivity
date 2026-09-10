import { NextResponse, type NextRequest } from 'next/server';

/**
 * CORS for the API.
 *
 * This is Next 16's `proxy.ts` — the same mechanism previously called
 * middleware, renamed upstream.
 *
 * The mobile app is served from its own origin, so browser builds of it are
 * cross-origin to this API. Native builds are not subject to CORS at all; this
 * exists purely so the web build works.
 *
 * The allowlist is explicit rather than `*`. Every endpoint authenticates with
 * a bearer token — never a cookie — so there is nothing here for a hostile
 * origin to ride on, but an allowlist keeps the blast radius of a mistake small
 * and makes the set of front ends a deliberate, reviewable decision.
 */
const DEFAULT_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3000',
];

const allowedOrigins = (): string[] => {
  const configured = (process.env.APP_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...configured];
};

const corsHeaders = (origin: string | null): Record<string, string> => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Max-Age': '86400',
    // The allowed origin varies per request, so caches must key on it.
    Vary: 'Origin',
  };

  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
};

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);

  // A preflight is answered here and never reaches a handler.
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
