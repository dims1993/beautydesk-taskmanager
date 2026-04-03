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

      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");

      if (response.status === 401) {
        const payload401 = isJson
          ? await response.json()
          : await response.text();
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

      const payload = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        return Promise.reject(payload);
      }

      if (response.status === 204) {
        return null;
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
