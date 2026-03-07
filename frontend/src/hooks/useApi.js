const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const useApi = () => {
  const apiRequest = async (endpoint, method = "GET", body = null) => {
    const token = localStorage.getItem("token");

    // Configuramos los headers básicos
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    let options = { method, headers };

    if (body) {
      // SI EL BODY ES FORMDATA (Para el Login)
      if (body instanceof FormData) {
        options.body = body;
        // IMPORTANTE: No ponemos Content-Type, el navegador lo hará solo
      } else {
        // SI EL BODY ES JSON (Para el resto de la app)
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
      }
    }

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, options);

      if (response.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/login";
        return null;
      }

      const data = await response.json();
      return response.ok ? data : Promise.reject(data);
    } catch (error) {
      console.error("API Error:", error);
      throw error;
    }
  };

  return { apiRequest };
};
