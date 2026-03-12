import React, { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  LayoutDashboard,
  Building2,
  Users,
  Trash2,
} from "lucide-react";

const SuperAdminPanel = () => {
  const { apiRequest } = useApi();
  const [formData, setFormData] = useState({
    salon_name: "",
    email: "",
    username: "",
  });
  const [organizations, setOrganizations] = useState([]);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isLoading, setIsLoading] = useState(false);

  const fetchOrgs = async () => {
    try {
      const data = await apiRequest("/users/organizations");
      setOrganizations(data);
    } catch (err) {
      console.error("Error cargando organizaciones", err);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  // --- FUNCIÓN PARA CREAR (CORREGIDA) ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus({ type: "", message: "" });

    try {
      await apiRequest("/users/create-tenant", "POST", formData);
      setStatus({
        type: "success",
        message: `¡Éxito! Salón "${formData.salon_name}" y Admin creados.`,
      });
      setFormData({ salon_name: "", email: "", username: "" });
      fetchOrgs(); // <--- IMPORTANTE: Para que aparezca en la lista al momento
    } catch (err) {
      setStatus({
        type: "error",
        message: err.detail || "Error al crear el salón. Verifica los datos.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // --- FUNCIÓN PARA ELIMINAR (MOVIDA FUERA DE SUBMIT) ---
  const handleDelete = async (id, name) => {
    if (
      window.confirm(
        `¿Estás seguro de eliminar el salón "${name}"? Esto borrará todos sus datos.`,
      )
    ) {
      try {
        await apiRequest(`/users/organizations/${id}`, "DELETE");
        fetchOrgs(); // Refrescamos la lista
        setStatus({
          type: "success",
          message: "Organización eliminada correctamente",
        });
      } catch (err) {
        setStatus({
          type: "error",
          message: "No se pudo eliminar la organización",
        });
      }
    }
  };
  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-fadeIn py-10 px-4">
      {/* --- CABECERA CON BOTÓN DE SALIDA --- */}
      <div className="relative flex flex-col items-center">
        {/* Botón Volver */}
        <Link
          to="/app"
          className="absolute left-0 top-0 flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[#eee8e2] text-[#a39485] hover:text-[#5d5045] hover:border-[#dcc7b1] transition-all group shadow-sm"
        >
          <ArrowLeft
            size={14}
            strokeWidth={3}
            className="group-hover:-translate-x-1 transition-transform"
          />
          <span className="text-[10px] font-black uppercase tracking-widest">
            Agenda
          </span>
        </Link>

        <div className="text-center space-y-2 mt-12 lg:mt-0">
          <div className="flex justify-center mb-2 text-[#dcc7b1]">
            <LayoutDashboard size={32} strokeWidth={1.5} />
          </div>
        </div>
        <h2 className="text-4xl font-black text-[#5d5045] tracking-tighter">
          Master Control
        </h2>
        <p className="text-[#a39485] font-medium text-sm italic">
          Gestión Global de Organizaciones y Licencias
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* --- COLUMNA IZQUIERDA: FORMULARIO --- */}
        <div className="lg:col-span-5">
          <div className="bg-white p-8 rounded-[3rem] border border-[#eee8e2] shadow-xl shadow-[#5d5045]/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#dcc7b1]/10 rounded-full -mr-12 -mt-12" />

            <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[#5d5045] mb-4">
                Nuevo Registro
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a39485] ml-4 mb-2 block">
                    Salón
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre del salón"
                    className="w-full px-6 py-4 rounded-2xl bg-[#f8f5f2] border-2 border-transparent focus:border-[#dcc7b1] focus:bg-white transition-all outline-none text-sm font-medium"
                    value={formData.salon_name}
                    onChange={(e) =>
                      setFormData({ ...formData, salon_name: e.target.value })
                    }
                    required
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a39485] ml-4 mb-2 block">
                    Email Admin
                  </label>
                  <input
                    type="email"
                    placeholder="correo@gmail.com"
                    className="w-full px-6 py-4 rounded-2xl bg-[#f8f5f2] border-2 border-transparent focus:border-[#dcc7b1] focus:bg-white transition-all outline-none text-sm font-medium"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#5d5045] text-white font-black py-4 rounded-2xl hover:bg-[#4a3f36] transform hover:-translate-y-1 transition-all shadow-lg disabled:opacity-50 uppercase tracking-widest text-[10px]"
              >
                {isLoading ? "Creando..." : "Alta de Organización"}
              </button>
            </form>

            {status.message && (
              <div
                className={`mt-6 p-4 rounded-2xl text-center text-[10px] font-black uppercase animate-bounce ${
                  status.type === "success"
                    ? "bg-green-50 text-green-600"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {status.message}
              </div>
            )}
          </div>
        </div>

        {/* --- COLUMNA DERECHA: LISTADO --- */}
        {/* --- COLUMNA DERECHA: LISTADO DE ORGANIZACIONES --- */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex justify-between items-center px-4">
            <h3 className="text-[10px] font-black text-[#a39485] uppercase tracking-[0.3em]">
              Organizaciones Activas ({organizations.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {organizations.map((org) => (
              <div
                key={org.id}
                className="bg-white p-6 rounded-[2rem] border border-[#eee8e2] flex justify-between items-center group hover:shadow-md transition-all hover:border-[#dcc7b1]"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-[#f8f5f2] rounded-2xl text-[#dcc7b1] group-hover:bg-[#5d5045] group-hover:text-white transition-colors">
                    <Building2 size={20} />
                  </div>

                  <div className="space-y-1">
                    <p className="font-black text-[#5d5045] text-base tracking-tighter uppercase">
                      {org.name}
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] bg-[#f8f5f2] text-[#a39485] px-2 py-1 rounded-md font-bold uppercase">
                        ID: {org.id.toString().slice(0, 8)}
                      </span>
                      <div className="flex items-center gap-1 text-[9px] text-[#dcc7b1] font-black uppercase italic">
                        <Users size={10} />
                        <span>{org.user_count} Usuarios</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* PUNTO DE ESTADO */}
                  <div className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.4)]" />

                  {/* BOTÓN ELIMINAR */}
                  <button
                    onClick={() => handleDelete(org.id, org.name)}
                    className="p-2.5 text-[#a39485] hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    title="Eliminar Organización"
                  >
                    <Trash2 size={16} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            ))}

            {/* Estado vacío */}
            {organizations.length === 0 && (
              <div className="text-center py-20 bg-white/50 rounded-[3rem] border border-dashed border-[#dcc7b1]">
                <p className="text-[10px] font-black text-[#a39485] uppercase tracking-widest">
                  No hay salones registrados
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-center pt-10">
        <p className="text-[9px] text-[#a39485] uppercase tracking-[0.5em] font-black opacity-50">
          BeautyTask Management System v1.0
        </p>
      </div>
    </div>
  );
};

export default SuperAdminPanel;
