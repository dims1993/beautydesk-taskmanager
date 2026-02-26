const BASE_URL = "http://localhost:8000";

export const useApi = () => {
  const apiRequest = async (endpoint, method = "GET", body = null) => {
    const token = localStorage.getItem("token");

    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    if (body) options.body = JSON.stringify(body);

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, options);

      if (response.status === 401) {
        localStorage.removeItem("token");
        window.location.reload(); // Fuerza el logout si el token expira
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
