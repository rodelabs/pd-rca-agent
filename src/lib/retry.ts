export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  shouldRetry?: (err: unknown) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { attempts = 3, baseDelayMs = 500, shouldRetry = isTransient } = opts;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !shouldRetry(err)) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1) * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Retry rate limits, 5xx, timeouts, and network failures; never 4xx auth/validation errors. */
export function isTransient(err: unknown): boolean {
  const status = (err as any)?.status ?? (err as any)?.code;
  if (typeof status === "number") return status === 429 || status >= 500;
  return true;
}
