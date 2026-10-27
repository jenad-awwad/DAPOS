import { ApiError, clearToken, getToken, notifyUnauthorized } from "./api";
import { API_URL } from "./api-url";

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && !path.startsWith("/auth/login")) {
        await clearToken();
        notifyUnauthorized();
      }
      throw new ApiError(
        typeof data.error === "string" ? data.error : "Request failed",
        response.status,
      );
    }

    return data as T;
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        `Cannot reach API at ${API_URL}. Start the backend (npm run dev in backend/).`,
      );
    }
    throw err;
  }
}
