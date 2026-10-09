export async function readApiResponse<T = Record<string, unknown>>(
  response: Response,
  fallback: string,
): Promise<T> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${fallback} The server returned an empty or invalid response (HTTP ${response.status}). Please try again.`);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${fallback} The server returned an invalid response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const error = "error" in data ? data.error : undefined;
    throw new Error(typeof error === "string" && error ? error : `${fallback} (HTTP ${response.status}).`);
  }
  return data as T;
}
