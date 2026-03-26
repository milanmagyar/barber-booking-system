const API_URL = "http://localhost:3001";
const API_KEY = "secret-backend-api-key-2026";

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));

    throw new Error(error.error || "API error");
  }

  return res.json();
}
