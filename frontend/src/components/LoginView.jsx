import { useState } from "react";

const LoginView = ({ onLogin }) => {
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [error, setError] = useState("");

  // Usamos la URL de producción o localhost
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const handleLogin = async (e, demoCredentials = null) => {
    if (e) e.preventDefault();
    setError("");

    // Si pulsamos el botón mágico, usamos las credenciales demo, si no, las del estado
    const username = demoCredentials
      ? demoCredentials.username
      : loginData.username;
    const password = demoCredentials
      ? demoCredentials.password
      : loginData.password;

    const params = new URLSearchParams();
    params.append("username", username.trim().toLowerCase());
    params.append("password", password.trim());

    try {
      const response = await fetch(`${API_URL}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("token", data.access_token);
        onLogin();
      } else {
        setError(data.detail || "Credenciales incorrectas");
      }
    } catch (err) {
      setError("Servidor fuera de servicio");
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f5f2] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-[3rem] shadow-2xl border border-white/20 overflow-hidden">
        <div className="bg-[#e8ddd0] p-12 text-center">
          <span className="text-4xl mb-4 block">🌿</span>
          <h2 className="text-2xl font-black text-[#5d5045] uppercase tracking-[0.3em]">
            BeautyTask
          </h2>
        </div>
        <form onSubmit={handleLogin} className="p-10 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-[#a39485] uppercase tracking-widest ml-2">
              Usuario
            </label>
            <input
              required={!loginData.username} // No es requerido si vamos a usar el botón demo
              className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none"
              placeholder="tu_usuario"
              value={loginData.username}
              onChange={(e) =>
                setLoginData({ ...loginData, username: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-[#a39485] uppercase tracking-widest ml-2">
              Contraseña
            </label>
            <input
              required={!loginData.password}
              type="password"
              className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none"
              placeholder="••••••••"
              value={loginData.password}
              onChange={(e) =>
                setLoginData({ ...loginData, password: e.target.value })
              }
            />
          </div>
          {error && (
            <p className="text-red-400 text-[10px] font-bold text-center uppercase">
              {error}
            </p>
          )}

          <div className="space-y-4">
            <button
              type="submit"
              className="w-full py-5 bg-[#5d5045] text-white rounded-2xl font-bold uppercase text-[11px] tracking-[0.3em] hover:bg-[#4a3f35] transition-all"
            >
              Entrar al Salón
            </button>

            {/* BOTÓN MÁGICO */}
            <button
              type="button"
              onClick={() =>
                handleLogin(null, { username: "demo", password: "demo123" })
              }
              className="w-full py-3 border-2 border-dashed border-[#5d5045]/20 text-[#5d5045]/50 rounded-2xl font-bold uppercase text-[9px] tracking-[0.2em] hover:bg-[#5d5045]/5 hover:text-[#5d5045] transition-all"
            >
              ✨ Acceso Rápido Demo ✨
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginView;
