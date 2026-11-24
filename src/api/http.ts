const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thin fetch wrapper. Sends the organizer's session cookie, parses JSON and
 * turns non-2xx responses into `ApiError` (using the body's `message` if any).
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { credentials: 'include', ...init, headers });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body.message === 'string'
        ? body.message
        : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}
