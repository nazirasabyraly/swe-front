import i18n from '../i18n';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/** Every backend route lives under this prefix; client paths are written relative to it. */
export const API_PREFIX = '/api/v1';

/** Full URL for an API path, e.g. for links the browser opens itself. */
export const apiUrl = (path: string) => `${BASE_URL}${API_PREFIX}${path}`;

/**
 * A failed API call. `status` is 0 when the server couldn't be reached.
 * `code` is the machine-readable error code from the body (`{ error: { code, message, details } }`),
 * which the UI maps to translated text where it needs to react to it.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  /** Human-readable message sent by the server, if any. */
  readonly serverMessage?: string;
  /** Extra data sent with the error, e.g. field errors for `validation_error`. */
  readonly details?: unknown;

  constructor(status: number, options: { code?: string; serverMessage?: string; details?: unknown } = {}) {
    super(options.serverMessage ?? (status === 0 ? 'Network error' : `Request failed (${status})`));
    this.name = 'ApiError';
    this.status = status;
    this.code = options.code;
    this.serverMessage = options.serverMessage;
    this.details = options.details;
  }
}

// ---------- Tokens ----------

/** Wire shape of `POST /auth/login` and `/auth/refresh`, after camelCasing. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'bearer';
  /** Access token lifetime, seconds. */
  expiresIn: number;
}

const ACCESS_KEY = 'biletflow.accessToken';
const REFRESH_KEY = 'biletflow.refreshToken';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode etc.): the session just won't survive a reload.
  }
}

/** JWT pair issued by the backend. Kept in localStorage so a reload keeps the session. */
export const tokenStore = {
  get access(): string | null {
    return readStorage(ACCESS_KEY);
  },
  get refresh(): string | null {
    return readStorage(REFRESH_KEY);
  },
  set(pair: Pick<TokenPair, 'accessToken' | 'refreshToken'>) {
    writeStorage(ACCESS_KEY, pair.accessToken);
    writeStorage(REFRESH_KEY, pair.refreshToken);
  },
  clear() {
    writeStorage(ACCESS_KEY, null);
    writeStorage(REFRESH_KEY, null);
  },
};

// ---------- Casing ----------
// The backend speaks snake_case; the app uses camelCase. Bodies are converted at this boundary.

const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

function convertKeys(value: unknown, convert: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => convertKeys(item, convert));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [convert(k), convertKeys(v, convert)]));
}

export const camelizeKeys = <T>(value: unknown) => convertKeys(value, toCamel) as T;
export const snakeizeKeys = (value: unknown) => convertKeys(value, toSnake);

// ---------- Requests ----------

let refreshing: Promise<boolean> | null = null;

/** Swaps the refresh token for a new pair. Concurrent callers share one call (the backend rotates tokens). */
function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = tokenStore.refresh;
    if (!refreshToken) return false;
    try {
      const response = await fetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) {
        tokenStore.clear();
        return false;
      }
      tokenStore.set(camelizeKeys<TokenPair>(await response.json()));
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Accept-Language', i18n.language);
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const token = tokenStore.access;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  try {
    return await fetch(apiUrl(path), { ...init, headers });
  } catch {
    throw new ApiError(0);
  }
}

/** Sends a request, refreshing an expired access token once. Auth endpoints are never retried. */
async function sendWithRefresh(path: string, init: RequestInit): Promise<Response> {
  const response = await send(path, init);
  if (response.status === 401 && tokenStore.refresh && !path.startsWith('/auth/') && (await refreshTokens())) {
    return send(path, init);
  }
  return response;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const error = body?.error;
  return new ApiError(response.status, {
    code: typeof error?.code === 'string' ? error.code : undefined,
    serverMessage: typeof error?.message === 'string' ? error.message : undefined,
    details: error?.details,
  });
}

/**
 * Thin fetch wrapper. `path` is relative to `API_PREFIX` (e.g. `/events/1`).
 * Sends the bearer token and the UI language, camelCases the JSON response,
 * and turns non-2xx responses into `ApiError`.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await sendWithRefresh(path, init);
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return null as T;
  const body = await response.json().catch(() => null);
  return camelizeKeys<T>(body);
}

/** Binary download (PDF, QR image, CSV) that needs the bearer token, so can't be a plain link. */
export async function requestBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const response = await sendWithRefresh(path, init);
  if (!response.ok) throw await toApiError(response);
  return response.blob();
}

/** JSON body helper: `request(path, json('POST', data))`. Keys are sent as snake_case. */
export const json = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(snakeizeKeys(data)),
});

/** Backend list wrapper (`?limit=&offset=`). */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** For app features the backend has no endpoint for yet. Shown to the user like any server error. */
export function notSupported(feature: string): never {
  throw new ApiError(501, { code: 'not_supported', serverMessage: `${feature} is not supported by the server yet.` });
}

/** Loads a protected file (QR image, PDF) into an object URL usable in `<img src>` / `<a href>`. */
export async function objectUrl(path: string): Promise<string> {
  return URL.createObjectURL(await requestBlob(path));
}

/** Backend amounts are integer minor units (tiyn); the app shows whole tenge. */
export const fromMinor = (minor: number) => minor / 100;
export const toMinor = (tenge: number) => Math.round(tenge * 100);

/** The backend has no human order number; the start of the order id stands in for it. */
export const orderNumber = (orderId: string) => orderId.slice(0, 8).toUpperCase();
