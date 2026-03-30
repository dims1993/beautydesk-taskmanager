import React, { useState } from "react";
import { useApi } from "../hooks/useApi";
import {
  User,
  Mail,
  Lock,
  ArrowLeft,
  Sparkles,
  ChevronRight,
} from "lucide-react";

const RegisterView = ({ onBack, onSuccess }) => {
  const { apiRequest } = useApi();
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    role: "client",
    business_type: "SALON", // New state for business_type
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await apiRequest("/users/register", "POST", formData);
      onSuccess("¡Cuenta creada! Por favor, inicia sesión.");
    } catch (err) {
      setError(err.detail || "Error al registrar. Intenta con otro usuario.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-0 md:p-10 font-sans selection:bg-[#f5ebe0]">
      {/* Contenedor Principal: En móvil ocupa todo el ancho, en desktop es un card */}
      <div className="w-full max-w-6xl min-h-screen md:min-h-[700px] grid grid-cols-1 lg:grid-cols-2 bg-white md:rounded-[3rem] shadow-2xl overflow-hidden border-none md:border md:border-[#eaddcf]">
        {/* Lado Visual: Ahora visible en Móvil como un Header alto */}
        <div className="relative h-[35vh] lg:h-auto overflow-hidden">
          <img
            src="/work-nails.webp"
            alt="Interior del salón"
            className="absolute inset-0 w-full h-full object-cover transform scale-110 md:scale-100"
          />
          {/* Overlay más oscuro en móvil para el texto superior */}
          <div className="absolute inset-0 bg-gradient-to-t from-white via-[#5d5045]/20 to-[#5d5045]/60 lg:bg-gradient-to-br lg:from-[#5d5045]/80 lg:to-transparent" />

          <div className="relative h-full p-8 md:p-16 flex flex-col justify-between text-white">
            <div className="space-y-2 md:space-y-4">
              <Sparkles className="w-8 h-8 md:w-10 md:h-10 opacity-90" />
              <h2 className="text-3xl md:text-6xl font-serif leading-tight">
                Únete a la <br />
                <span className="italic">excelencia.</span>
              </h2>
            </div>
            {/* Ocultamos este texto pequeño en móvil para limpiar la imagen */}
            <p className="hidden md:block text-sm font-light tracking-widest uppercase opacity-70">
              BeautyTask © 2026 • El estándar de oro
            </p>
          </div>
        </div>

        {/* Lado Derecho: Formulario con bordes redondeados negativos en móvil */}
        <div className="relative -mt-10 lg:mt-0 bg-white rounded-t-[3rem] lg:rounded-none p-8 md:p-20 space-y-8 md:space-y-10 flex flex-col justify-center">
          {/* Botón Volver - Ajustado para móvil */}
          <button
            onClick={onBack}
            className="absolute top-6 right-8 p-2 bg-[#FAF9F6] lg:bg-transparent rounded-full text-[#8c857d] hover:text-[#5d5045] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="space-y-2 mt-4 lg:mt-0">
            <p className="text-[10px] uppercase tracking-[0.4em] text-[#8c857d] font-black">
              Registro
            </p>
            <h3 className="text-3xl md:text-4xl font-serif text-[#5d5045]">
              Comenzar ahora
            </h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-[9px] font-black uppercase p-4 rounded-2xl border border-red-100 italic">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5] group-focus-within:text-[#5d5045]" />
                <input
                  type="text"
                  placeholder="NOMBRE DE USUARIO"
                  required
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 md:py-5 pl-12 pr-4 rounded-2xl text-[10px] md:text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all"
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                />
              </div>

              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5] group-focus-within:text-[#5d5045]" />
                <input
                  type="email"
                  placeholder="CORREO ELECTRÓNICO"
                  required
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 md:py-5 pl-12 pr-4 rounded-2xl text-[10px] md:text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all"
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>

              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5] group-focus-within:text-[#5d5045]" />
                <input
                  type="password"
                  placeholder="CONTRASEÑA"
                  required
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 md:py-5 pl-12 pr-4 rounded-2xl text-[10px] md:text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all"
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                />
              </div>

              {/* New select for business_type */}
              <div className="relative group">
                <select
                  value={formData.business_type}
                  onChange={(e) =>
                    setFormData({ ...formData, business_type: e.target.value })
                  }
                  required
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 md:py-5 pl-12 pr-4 rounded-2xl text-[10px] md:text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all"
                >
                  <option value="SALON">Salón</option>
                  <option value="LAWYER">Abogado</option>
                  <option value="MECHANIC">Mecánico</option>
                  <option value="GYM">Gimnasio</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#5d5045] text-[#f5ebe0] py-4 md:py-5 rounded-full text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#4a3f36] transition-all shadow-xl shadow-[#5d5045]/10 active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? "PROCESANDO..." : "Crear Cuenta"}
              {!isLoading && <ChevronRight className="w-4 h-4" />}
            </button>
          </form>

          <p className="text-[10px] md:text-[11px] text-[#8c857d] text-center font-medium pt-4">
            ¿Ya tienes cuenta?{" "}
            <button
              onClick={onBack}
              className="text-[#5d5045] font-black uppercase tracking-widest hover:underline underline-offset-8 ml-1"
            >
              Log in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterView;
