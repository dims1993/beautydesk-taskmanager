import React, { useState } from "react";
import { useApi } from "../hooks/useApi";

const SuperAdminPanel = () => {
  const { apiRequest } = useApi();
  const [formData, setFormData] = useState({
    salon_name: "",
    email: "",
    username: "",
  });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus({ type: "", message: "" });

    try {
      // Ajusta la URL según el prefijo de tu router (ej: /users/create-tenant)
      await apiRequest("/users/create-tenant", "POST", formData);

      setStatus({
        type: "success",
        message: `¡Éxito! Salón "${formData.salon_name}" y Admin creados.`,
      });
      setFormData({ salon_name: "", email: "", username: "" });
    } catch (err) {
      setStatus({
        type: "error",
        message: err.detail || "Error al crear el salón. Verifica los datos.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fadeIn py-10">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black text-[#5d5045] tracking-tighter">
          Panel Maestro
        </h2>
        <p className="text-[#a39485] font-medium text-sm italic">
          Creación de Nuevas Organizaciones y Administradores
        </p>
      </div>

      <div className="bg-white p-8 rounded-[3rem] border border-[#eee8e2] shadow-xl shadow-[#5d5045]/5 relative overflow-hidden">
        {/* Decoración sutil */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#dcc7b1]/10 rounded-full -mr-16 -mt-16" />

        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-[#a39485] ml-4 mb-2 block">
                Nombre del Salón / Negocio
              </label>
              <input
                type="text"
                placeholder="Ej: Salón de Belleza Silvia"
                className="w-full px-6 py-4 rounded-2xl bg-[#f8f5f2] border-2 border-transparent focus:border-[#dcc7b1] focus:bg-white transition-all outline-none text-sm font-medium"
                value={formData.salon_name}
                onChange={(e) =>
                  setFormData({ ...formData, salon_name: e.target.value })
                }
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[#a39485] ml-4 mb-2 block">
                  Email del Administrador
                </label>
                <input
                  type="email"
                  placeholder="correo-google@gmail.com"
                  className="w-full px-6 py-4 rounded-2xl bg-[#f8f5f2] border-2 border-transparent focus:border-[#dcc7b1] focus:bg-white transition-all outline-none text-sm font-medium"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[#a39485] ml-4 mb-2 block">
                  Nombre del Dueño (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Silvia"
                  className="w-full px-6 py-4 rounded-2xl bg-[#f8f5f2] border-2 border-transparent focus:border-[#dcc7b1] focus:bg-white transition-all outline-none text-sm font-medium"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#5d5045] text-white font-black py-4 rounded-2xl hover:bg-[#4a3f36] transform hover:-translate-y-1 transition-all shadow-lg shadow-[#5d5045]/20 disabled:opacity-50 uppercase tracking-widest text-xs"
          >
            {isLoading ? "Procesando..." : "Dar de Alta Salón"}
          </button>
        </form>

        {status.message && (
          <div
            className={`mt-6 p-4 rounded-2xl text-center text-xs font-bold animate-bounce ${
              status.type === "success"
                ? "bg-green-50 text-green-600 border border-green-100"
                : "bg-red-50 text-red-600 border border-red-100"
            }`}
          >
            {status.message}
          </div>
        )}
      </div>

      <div className="text-center">
        <p className="text-[9px] text-[#a39485] uppercase tracking-[0.3em] font-bold">
          BeautyTask Management System v1.0
        </p>
      </div>
    </div>
  );
};

export default SuperAdminPanel;
