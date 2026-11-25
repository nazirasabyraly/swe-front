import { ApiError } from '../http';

/** Simulated network latency so loading states are visible in mock mode. */
export function mockDelay(ms = 250): Promise<void> {
  const wait = import.meta.env.MODE === 'test' ? 0 : ms;
  return new Promise((resolve) => setTimeout(resolve, wait));
}

export function mockError(status: number, code: string, message: string): ApiError {
  return new ApiError(status, { code, serverMessage: message });
}

let counter = 0;
export const mockId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
