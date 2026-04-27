const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const useApi = () => {
  /**
   * @param {string} endpoint
   * @param {string} method
   * @param {object|FormData|null} body
   * @param {{ tokenOverride?: string | null, skipAuthRedirect?: boolean }} [options]
   */
  const apiRequest = async (
    endpoint,
    method = "GET",
    body = null,
    requestOptions = {},
  ) => {
    const { tokenOverride = null, skipAuthRedirect = false } = requestOptions;
    const token =
      tokenOverride !== null && tokenOverride !== undefined
        ? tokenOverride
        : localStorage.getItem("token");

    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const fetchOpts = { method, headers };

    if (body) {
      if (body instanceof FormData) {
        fetchOpts.body = body;
      } else {
        headers["Content-Type"] = "application/json";
        fetchOpts.body = JSON.stringify(body);
      }
    }

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, fetchOpts);

      // 204: No Content (avoid attempting to parse body)
      if (response.status === 204) {
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");

      const safeReadPayload = async () => {
        const rawText = await response.text();
        if (!rawText || rawText.trim() === "") return null;
        if (!isJson) return rawText;
        try {
          return JSON.parse(rawText);
        } catch {
          // Fallback: return text if JSON is malformed/empty
          return rawText;
        }
      };

      if (response.status === 401) {
        const payload401 = await safeReadPayload();
        if (!skipAuthRedirect) {
          localStorage.removeItem("token");
          window.location.href = "/login";
          return null;
        }
        return Promise.reject(
          typeof payload401 === "object"
            ? payload401
            : { detail: String(payload401) },
        );
      }

      const payload = await safeReadPayload();

      if (!response.ok) {
        return Promise.reject(
          payload ?? { detail: `Request failed (${response.status})` },
        );
      }

      if (!isJson) {
        if (!payload || String(payload).trim() === "") {
          return null;
        }
        return Promise.reject(
          new Error(
            `Expected JSON but received ${contentType || "unknown content-type"}`,
          ),
        );
      }

      return payload;
    } catch (error) {
      console.error("API Error:", error);
      throw error;
    }
  };

  return { apiRequest };
};
