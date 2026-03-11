import React, { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";

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

  if (isLoading)
    return (
      <div className="p-10 text-center animate-pulse text-[#a39485]">
        Cargando equipo...
      </div>
    );

  return (
    <div className="space-y-8 animate-fadeIn max-w-4xl mx-auto">
      {/* TÍTULO Y CABECERA */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-black text-[#5d5045] tracking-tight">
          Gestión de Equipo
        </h2>
        <p className="text-[#a39485] text-sm">
          Autoriza correos de Google para que accedan al salón
        </p>
      </div>

      {/* FORMULARIO PARA AÑADIR (Estilo Minimalista) */}
      <div className="bg-white/80 p-6 rounded-[2.5rem] border border-[#eee8e2] shadow-sm">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-[#a39485] mb-4 ml-2">
          Añadir Nuevo Profesional
        </h3>
        <form
          onSubmit={handleAddMember}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <input
            type="email"
            placeholder="Correo de Google"
            className="px-5 py-3 rounded-2xl bg-[#f8f5f2] border-none text-sm focus:ring-2 focus:ring-[#dcc7b1] outline-none"
            value={newMember.email}
            onChange={(e) =>
              setNewMember({ ...newMember, email: e.target.value })
            }
            required
          />
          <input
            type="text"
            placeholder="Nombre (ej: Saray)"
            className="px-5 py-3 rounded-2xl bg-[#f8f5f2] border-none text-sm focus:ring-2 focus:ring-[#dcc7b1] outline-none"
            value={newMember.username}
            onChange={(e) =>
              setNewMember({ ...newMember, username: e.target.value })
            }
            required
          />
          <button
            type="submit"
            disabled={isAdding}
            className="bg-[#5d5045] text-white font-bold py-3 rounded-2xl hover:bg-[#a39485] transition-all disabled:opacity-50"
          >
            {isAdding ? "Añadiendo..." : "Autorizar Acceso"}
          </button>
        </form>
        {error && (
          <p className="text-red-400 text-[10px] mt-3 ml-2 font-bold">
            {error}
          </p>
        )}
      </div>

      {/* LISTADO DE EQUIPO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {team.map((member) => (
          <div
            key={member.id}
            className="bg-white p-5 rounded-[2rem] border border-[#eee8e2] flex items-center justify-between group hover:shadow-md transition-all"
          >
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-[#dcc7b1] flex items-center justify-center text-white font-black">
                {member.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <h4 className="font-bold text-[#5d5045] text-sm">
                  {member.username}
                </h4>
                <p className="text-[#a39485] text-[10px]">{member.email}</p>
              </div>
            </div>
            <div className="text-right">
              <span
                className={`text-[8px] font-black uppercase px-3 py-1 rounded-full ${member.role === "admin" ? "bg-[#5d5045] text-white" : "bg-[#f8f5f2] text-[#a39485]"}`}
              >
                {member.role}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TeamView;
