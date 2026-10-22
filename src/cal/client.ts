/**
 * Stub for the internal Cal debug-id lookup system. Replace the fetch below
 * with Cal's real endpoint/auth once you have API access.
 */
export async function lookupDebugId(debugId: string): Promise<string | null> {
  const res = await fetch(`${process.env.CAL_BASE_URL}/api/debug/${debugId}`, {
    headers: { Authorization: `Bearer ${process.env.CAL_API_KEY}` },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.errorDetail ?? null;
}
