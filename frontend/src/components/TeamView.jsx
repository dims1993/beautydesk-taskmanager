import React, { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";
import { Trash2, UserPlus, Users } from "lucide-react"; // Importamos iconos para mejorar la UI

const TeamView = () => {
  const { apiRequest } = useApi();
  const [team, setTeam] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Estado para el formulario de nuevo miembro
  const [newMember, setNewMember] = useState({
    email: "",
    username: "",
    role: "staff",
  });
  const [isAdding, setIsAdding] = useState(false);

  // Cargar equipo al montar
  useEffect(() => {
    fetchTeam();
  }, []);

  const fetchTeam = async () => {
    try {
      const data = await apiRequest("/users/team");
      setTeam(data);
    } catch (err) {
      console.error("Error al cargar el equipo:", err);
      setError("No se pudo cargar la lista de equipo.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    setIsAdding(true);
    setError("");
    try {
      await apiRequest("/users/team", "POST", newMember);
      setNewMember({ email: "", username: "", role: "staff" });
      fetchTeam(); // Recargar lista
    } catch (err) {
      setError(err.detail || "Error al añadir miembro");
    } finally {
      setIsAdding(false);
    }
  };

  // --- NUEVA FUNCIÓN PARA ELIMINAR ACCESO ---
  const handleDeleteMember = async (id, name) => {
    if (window.confirm(`¿Estás seguro de retirar el acceso a ${name}?`)) {
      try {
        await apiRequest(`/users/team/${id}`, "DELETE");
        setTeam(team.filter((m) => m.id !== id)); // Optimización: filtramos localmente
      } catch (err) {
        alert("No se pudo eliminar al miembro del equipo");
      }
    }
  };

  if (isLoading)
    return (
      <div className="p-10 text-center animate-pulse text-[#a39485]">
        Cargando equipo...
      </div>
    );

  return (
    <div className="space-y-8 animate-fadeIn max-w-4xl mx-auto pb-10">
      {/* TÍTULO Y CABECERA */}
      <div className="text-center space-y-2">
        <div className="flex justify-center text-[#dcc7b1] mb-2">
          <Users size={28} strokeWidth={1.5} />
        </div>
        <h2 className="text-2xl font-black text-[#5d5045] tracking-tight">
          Gestión de Equipo
        </h2>
        <p className="text-[#a39485] text-sm">
          Autoriza o revoca accesos de Google para tu salón
        </p>
      </div>

      {/* FORMULARIO PARA AÑADIR */}
      <div className="bg-white/80 p-6 rounded-[2.5rem] border border-[#eee8e2] shadow-sm">
        <div className="flex items-center gap-2 mb-4 ml-2">
          <UserPlus size={12} className="text-[#a39485]" />
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[#a39485]">
            Añadir Nuevo Profesional
          </h3>
        </div>
        <form
          onSubmit={handleAddMember}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <input
            type="email"
            placeholder="Correo de Google"
            className="px-5 py-3 rounded-2xl bg-[#f8f5f2] border-none text-sm focus:ring-2 focus:ring-[#dcc7b1] outline-none font-medium"
            value={newMember.email}
            onChange={(e) =>
              setNewMember({ ...newMember, email: e.target.value })
            }
            required
          />
          <input
            type="text"
            placeholder="Nombre (ej: Saray)"
            className="px-5 py-3 rounded-2xl bg-[#f8f5f2] border-none text-sm focus:ring-2 focus:ring-[#dcc7b1] outline-none font-medium"
            value={newMember.username}
            onChange={(e) =>
              setNewMember({ ...newMember, username: e.target.value })
            }
            required
          />
          <button
            type="submit"
            disabled={isAdding}
            className="bg-[#5d5045] text-white font-bold py-3 rounded-2xl hover:bg-[#a39485] transition-all disabled:opacity-50 uppercase text-[10px] tracking-widest"
          >
            {isAdding ? "Procesando..." : "Autorizar Acceso"}
          </button>
        </form>
        {error && (
          <p className="text-red-400 text-[10px] mt-3 ml-2 font-bold">
            {error}
          </p>
        )}
      </div>

      {/* LISTADO DE EQUIPO CON BOTÓN ELIMINAR */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {team.map((member) => (
          <div
            key={member.id}
            className="bg-white p-5 rounded-[2.5rem] border border-[#eee8e2] flex items-center justify-between group hover:shadow-md transition-all hover:border-[#dcc7b1]"
          >
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-[#f8f5f2] text-[#dcc7b1] flex items-center justify-center font-black border border-[#eee8e2] group-hover:bg-[#5d5045] group-hover:text-white transition-colors">
                {member.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <h4 className="font-black text-[#5d5045] text-sm uppercase tracking-tighter">
                  {member.username}
                </h4>
                <p className="text-[#a39485] text-[10px] font-medium">
                  {member.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`text-[8px] font-black uppercase px-3 py-1 rounded-full ${
                  member.role === "admin"
                    ? "bg-[#5d5045] text-white"
                    : "bg-[#f8f5f2] text-[#a39485]"
                }`}
              >
                {member.role}
              </span>

              {/* BOTÓN ELIMINAR (Solo aparece si no es el admin principal o el propio usuario logueado si quisieras) */}
              {member.role !== "admin" && (
                <button
                  onClick={() => handleDeleteMember(member.id, member.username)}
                  className="p-2 text-[#a39485] hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TeamView;
