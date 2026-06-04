/** Client fetch helper that unwraps the `{ data, error }` API envelope. */
export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  let json: { data?: T; error?: string } | null = null;
  try {
    json = (await res.json()) as { data?: T; error?: string };
  } catch {
    json = null;
  }
  if (!res.ok || !json || json.error) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return json.data as T;
}
