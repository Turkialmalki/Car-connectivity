import { backendConfig } from './config';
import { currentAccessToken, supabase } from './supabase';
import { logger } from '@/utils/logger';

/**
 * Thin HTTP client for the connected-services API.
 *
 * Every request carries the current Supabase access token. A 401 is treated as
 * "the token has aged out", not as "the user is gone": the client refreshes
 * once and retries, and only a second failure surfaces as an error. Without
 * that, an app left in a pocket for an hour would greet the user with an
 * authentication error instead of their car.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}

const baseUrl = (): string => {
  if (!backendConfig.apiUrl) {
    throw new Error('EXPO_PUBLIC_API_URL is not configured.');
  }
  return backendConfig.apiUrl;
};

const send = async <T>(path: string, init: RequestInit, token: string | null): Promise<T> => {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: unknown } })
      .error;
    throw new ApiError(
      error?.message ?? `Request failed with ${response.status}`,
      response.status,
      error?.code,
      error?.details,
    );
  }

  return body as T;
};

export const apiRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = await currentAccessToken();

  try {
    return await send<T>(path, init, token);
  } catch (error) {
    if (!(error instanceof ApiError) || !error.isUnauthorized) throw error;

    logger.info('Access token rejected; refreshing once before failing');
    const { data, error: refreshError } = await supabase().auth.refreshSession();
    if (refreshError || !data.session) throw error;

    return send<T>(path, init, data.session.access_token);
  }
};
