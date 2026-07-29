import { getToken } from "./auth";

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://pre-caveauone.vercel.app";

export async function apiFetch(path: string, init?: RequestInit) {
  const token = await getToken();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${BASE_URL}/api/v2${cleanPath}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let errorMessage = `API Error ${res.status}`;
    try {
      const json = await res.json();
      if (json.error) errorMessage = json.error;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  return res.json();
}
