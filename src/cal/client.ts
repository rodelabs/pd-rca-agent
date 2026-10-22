import { HttpError, withRetry } from "../lib/retry.js";

/**
 * Stub for the internal Cal debug-id lookup system. Replace the fetch below
 * with Cal's real endpoint/auth once you have API access.
 * Returns null when Cal has nothing for this id; throws only after retries are exhausted.
 */
export async function lookupDebugId(debugId: string): Promise<string | null> {
  return withRetry(async () => {
    const res = await fetch(`${process.env.CAL_BASE_URL}/api/debug/${debugId}`, {
      headers: { Authorization: `Bearer ${process.env.CAL_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new HttpError(res.status, `Cal responded ${res.status}`);

    const data = await res.json();
    return data.errorDetail ?? null;
  });
}
