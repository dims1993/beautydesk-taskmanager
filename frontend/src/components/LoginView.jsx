import React, { useState } from "react";
import { useApi } from "../hooks/useApi";
import { Sparkles, Lock, User, ArrowRight } from "lucide-react";

export default function LoginView({ onLogin, onGoToRegister }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { apiRequest } = useApi();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("username", username);
      formData.append("password", password);

      const data = await apiRequest("/login", "POST", formData, true);

      if (data && data.access_token) {
        localStorage.setItem("token", data.access_token);
        onLogin();
      } else {
        setError("Credenciales incorrectas");
      }
    } catch (err) {
      setError("Error al conectar con el servidor");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6 font-sans selection:bg-[#f5ebe0]">
      <div className="w-full max-w-[400px] space-y-10">
        {/* Encabezado */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-4 bg-[#f5ebe0] rounded-full border border-[#eaddcf] shadow-sm">
              <Sparkles className="w-6 h-6 text-[#5d5045]" />
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-4xl font-serif text-[#5d5045] tracking-tight">
              Bienvenido
            </h2>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#8c857d] font-bold">
              Gestión Profesional de Salón
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest p-4 rounded-2xl text-center border border-red-100 animate-pulse">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {/* Input Usuario */}
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8c857d] group-focus-within:text-[#5d5045] transition-colors" />
              <input
                type="text"
                placeholder="NOMBRE DE USUARIO"
                className="w-full bg-white border border-[#eaddcf] py-5 pl-12 pr-4 rounded-2xl text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all placeholder:text-[#c4bdb5] text-[#5d5045]"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            {/* Input Password */}
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8c857d] group-focus-within:text-[#5d5045] transition-colors" />
              <input
                type="password"
                placeholder="CONTRASEÑA"
                className="w-full bg-white border border-[#eaddcf] py-5 pl-12 pr-4 rounded-2xl text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all placeholder:text-[#c4bdb5] text-[#5d5045]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#5d5045] text-[#f5ebe0] py-5 rounded-full text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#4a3f36] transition-all shadow-xl shadow-[#5d5045]/20 active:scale-[0.96] disabled:opacity-50"
          >
            {isLoading ? "AUTENTICANDO..." : "Entrar al Estudio"}
            {!isLoading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <div className="text-center space-y-6 pt-4">
          <div className="h-px bg-gradient-to-r from-transparent via-[#eaddcf] to-transparent w-full"></div>

          <p className="text-[11px] text-[#8c857d] font-medium tracking-wide">
            ¿Nuevo en BeautyTask?{" "}
            <button
              onClick={onGoToRegister}
              className="text-[#5d5045] font-black uppercase tracking-widest hover:text-[#4a3f36] transition-colors underline decoration-1 underline-offset-8 ml-1"
            >
              Crear cuenta de estudio
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
