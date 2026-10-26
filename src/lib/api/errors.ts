import { t } from '../i18n';

export type ApiErrorKind = 'auth' | 'rate_limit' | 'credit' | 'server' | 'network' | 'unknown';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

/** Map a non-2xx response from the Messages API to an ApiError. */
export function apiErrorFromResponse(status: number, body: string): ApiError {
  const message = extractMessage(body) ?? t('errorRequestStatus', String(status));
  if (status === 401) return new ApiError('auth', message, status);
  if (status === 429) return new ApiError('rate_limit', message, status);
  if (status === 400 && /credit balance/i.test(body))
    return new ApiError('credit', message, status);
  if (status >= 500) return new ApiError('server', message, status);
  return new ApiError('unknown', message, status);
}

/** Normalize any thrown value to an ApiError (fetch failures become "network"). */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof TypeError) {
    return new ApiError('network', err.message || t('errorNetwork'));
  }
  return new ApiError('unknown', err instanceof Error ? err.message : String(err));
}

function extractMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message;
  } catch {
    return body.trim() || undefined;
  }
}
