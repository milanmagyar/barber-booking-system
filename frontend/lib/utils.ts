import { clsx, type ClassValue } from "clsx";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { twMerge } from "tailwind-merge";

const API_URL = "http://localhost:3001";
const API_KEY = "secret-backend-api-key-2026";

const apiFetch = async <T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> => {
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
};

const formatDate = (date: Date) => {
  return format(date, "PPP", { locale: hu });
};

const formatTime = (date: Date) => {
  return format(date, "HH:mm", { locale: hu });
};

export { apiFetch, formatDate, formatTime };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
