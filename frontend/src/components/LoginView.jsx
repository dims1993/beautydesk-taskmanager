import { useState } from "react";

const LoginView = ({ onLogin }) => {
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    const params = new URLSearchParams();
    params.append("username", loginData.username.trim().toLowerCase());
    params.append("password", loginData.password.trim());

    try {
      const response = await fetch("http://localhost:8000/token", {
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
              required
              className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none"
              placeholder="tu_usuario"
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
              required
              type="password"
              className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none"
              placeholder="••••••••"
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
          <button
            type="submit"
            className="w-full py-5 bg-[#5d5045] text-white rounded-2xl font-bold uppercase text-[11px] tracking-[0.3em] hover:bg-[#4a3f35] transition-all"
          >
            Entrar al Salón
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginView;
