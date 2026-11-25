import i18n from '../i18n';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/**
 * A failed API call. `status` is 0 when the server couldn't be reached.
 * `code` is the machine-readable error code from the body (`{ code, message }`),
 * which the UI maps to translated text where it needs to react to it.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  /** Human-readable message sent by the server, if any. */
  readonly serverMessage?: string;

  constructor(status: number, options: { code?: string; serverMessage?: string } = {}) {
    super(options.serverMessage ?? (status === 0 ? 'Network error' : `Request failed (${status})`));
    this.name = 'ApiError';
    this.status = status;
    this.code = options.code;
    this.serverMessage = options.serverMessage;
  }
}

/**
 * Thin fetch wrapper. Sends the session cookie and the UI language, parses
 * JSON, and turns non-2xx responses into `ApiError`.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Accept-Language', i18n.language);
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { credentials: 'include', ...init, headers });
  } catch {
    throw new ApiError(0);
  }

  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, {
      code: typeof body?.code === 'string' ? body.code : undefined,
      serverMessage: typeof body?.message === 'string' ? body.message : undefined,
    });
  }
  return body as T;
}

/** JSON body helper: `request(path, json('POST', data))`. */
export const json = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
