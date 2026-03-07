import React, { useState } from "react";
import { useApi } from "../hooks/useApi";
import { Sparkles, Lock, User, ArrowRight, Home } from "lucide-react";
import { Link } from "react-router-dom";

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

      const data = await apiRequest("/token", "POST", formData);

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
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-0 md:p-10 font-sans selection:bg-[#f5ebe0]">
      <div className="w-full max-w-6xl min-h-screen md:min-h-[700px] grid grid-cols-1 lg:grid-cols-2 bg-white md:rounded-[3rem] shadow-2xl overflow-hidden border-none md:border md:border-[#eaddcf]">
        {/* Lado Visual: Conexión con la marca */}
        <div className="relative h-[35vh] lg:h-auto overflow-hidden">
          <img
            src="/nails1.webp"
            alt="Detalle de manicura profesional"
            className="absolute inset-0 w-full h-full object-cover transform scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-white via-[#5d5045]/20 to-[#5d5045]/60 lg:bg-gradient-to-br lg:from-[#5d5045]/80 lg:to-[#5d5045]/40" />

          <div className="relative h-full p-8 md:p-16 flex flex-col justify-between text-white">
            <div className="space-y-2 md:space-y-4">
              <Sparkles className="w-8 h-8 md:w-10 md:h-10 opacity-90 text-[#f5ebe0]" />
              <h2 className="text-3xl md:text-6xl font-serif leading-tight">
                Tu estudio, <br />
                <span className="italic">bajo control.</span>
              </h2>
            </div>
            <p className="hidden md:block text-[10px] font-black tracking-[0.3em] uppercase opacity-70">
              BeautyTask Management System
            </p>
          </div>
        </div>

        {/* Lado Derecho: Formulario de Acceso */}
        <div className="relative -mt-10 lg:mt-0 bg-white rounded-t-[3rem] lg:rounded-none p-8 md:p-20 space-y-8 flex flex-col justify-center">
          {/* Botón Home para volver a la Landing */}
          <Link
            to="/"
            className="absolute top-6 right-8 p-3 bg-[#FAF9F6] lg:bg-transparent rounded-full text-[#8c857d] hover:text-[#5d5045] transition-colors group"
          >
            <Home className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </Link>

          <div className="space-y-2 mt-4 lg:mt-0 text-center lg:text-left">
            <p className="text-[10px] uppercase tracking-[0.4em] text-[#8c857d] font-black">
              Acceso Profesional
            </p>
            <h3 className="text-3xl md:text-4xl font-serif text-[#5d5045]">
              Bienvenido
            </h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-[10px] font-black uppercase p-4 rounded-2xl border border-red-100 text-center italic animate-shake">
                {error}
              </div>
            )}

            <div className="space-y-3">
              {/* Input Usuario */}
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5] group-focus-within:text-[#5d5045] transition-colors" />
                <input
                  type="text"
                  placeholder="NOMBRE DE USUARIO"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-5 pl-12 pr-4 rounded-2xl text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all placeholder:text-[#c4bdb5] text-[#5d5045]"
                />
              </div>

              {/* Input Password */}
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5] group-focus-within:text-[#5d5045] transition-colors" />
                <input
                  type="password"
                  placeholder="CONTRASEÑA"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-5 pl-12 pr-4 rounded-2xl text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all placeholder:text-[#c4bdb5] text-[#5d5045]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#5d5045] text-[#f5ebe0] py-5 rounded-full text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#4a3f36] transition-all shadow-xl shadow-[#5d5045]/20 active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? "VALIDANDO..." : "Entrar al Salón"}
              {!isLoading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="text-center space-y-6">
            <div className="h-px bg-gradient-to-r from-transparent via-[#eaddcf] to-transparent w-full"></div>
            <p className="text-[11px] text-[#8c857d] font-medium tracking-wide">
              ¿No tienes cuenta?{" "}
              <button
                onClick={onGoToRegister}
                className="text-[#5d5045] font-black uppercase tracking-widest hover:text-[#4a3f36] transition-colors underline decoration-1 underline-offset-8 ml-1"
              >
                Registrar mi negocio
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
