import React, { useState, useEffect } from "react";
import { useApi } from "../../hooks/useApi";
import { Trash2, UserPlus, Users } from "lucide-react"; // Importamos iconos para mejorar la UI

function roleBadgeClass(role) {
  const r = String(role || "").toUpperCase();
  if (r === "OWNER") return "bg-[#5d5045] text-[#f5ebe0]";
  if (r === "SUPER_ADMIN") return "bg-amber-100 text-amber-900 ring-1 ring-amber-200/80";
  return "bg-[#f8f5f2] text-[#a39485] ring-1 ring-[#eee8e2]";
}

function formatRoleLabel(role) {
  const r = String(role || "").toUpperCase();
  if (r === "OWNER") return "Titular";
  if (r === "STAFF") return "Staff";
  if (r === "SUPER_ADMIN") return "Super admin";
  return r || "—";
}

const TeamView = ({ currentUser = null }) => {
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

  const teamInvitesAllowed = Boolean(currentUser?.plan_entitlements?.team_invites);
  const maxStaffLabel = currentUser?.plan_entitlements?.max_staff_users;

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
    if (!teamInvitesAllowed) return;
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
          Invita profesionales según tu plan (Profesional: hasta 2; Premium:
          ilimitado).
        </p>
      </div>

      {!teamInvitesAllowed && (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-center text-[11px] leading-relaxed text-amber-950">
          Tu plan <strong>Esencial</strong> no incluye equipo adicional. Sube a{" "}
          <strong>Profesional</strong> o <strong>Premium</strong> para invitar
          staff.
        </div>
      )}

      {teamInvitesAllowed && typeof maxStaffLabel === "number" && (
        <p className="text-center text-[10px] text-[#a39485]">
          Profesionales adicionales permitidos en tu plan:{" "}
          <span className="font-black text-[#5d5045]">{maxStaffLabel}</span>
        </p>
      )}

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
            className="px-5 py-3 rounded-2xl bg-[#f8f5f2] border-none text-sm focus:ring-2 focus:ring-[#dcc7b1] outline-none font-medium disabled:opacity-50"
            value={newMember.email}
            onChange={(e) =>
              setNewMember({ ...newMember, email: e.target.value })
            }
            required
            disabled={!teamInvitesAllowed}
          />
          <input
            type="text"
            placeholder="Nombre (ej: Saray)"
            className="px-5 py-3 rounded-2xl bg-[#f8f5f2] border-none text-sm focus:ring-2 focus:ring-[#dcc7b1] outline-none font-medium disabled:opacity-50"
            value={newMember.username}
            onChange={(e) =>
              setNewMember({ ...newMember, username: e.target.value })
            }
            required
            disabled={!teamInvitesAllowed}
          />
          <button
            type="submit"
            disabled={isAdding || !teamInvitesAllowed}
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
        {team.map((member) => {
          const canRemove =
            currentUser != null &&
            Number(member.id) !== Number(currentUser.id);
          return (
            <div
              key={member.id}
              className="group bg-white p-5 rounded-[2.5rem] border border-[#eee8e2] flex gap-4 items-start hover:shadow-md transition-all hover:border-[#dcc7b1]"
            >
              <div className="h-12 w-12 shrink-0 rounded-full bg-[#f8f5f2] text-[#dcc7b1] flex items-center justify-center font-black border border-[#eee8e2] group-hover:bg-[#5d5045] group-hover:text-white transition-colors">
                {(member.username || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <h4 className="font-black text-[#5d5045] text-sm uppercase tracking-tighter truncate">
                  {member.username}
                </h4>
                <p
                  className="text-[#a39485] text-[10px] font-medium truncate"
                  title={member.email}
                >
                  {member.email}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span
                    className={`inline-flex max-w-full items-center rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-widest whitespace-nowrap ${roleBadgeClass(member.role)}`}
                  >
                    {formatRoleLabel(member.role)}
                  </span>
                </div>
              </div>
              {canRemove ? (
                <button
                  type="button"
                  onClick={() => handleDeleteMember(member.id, member.username)}
                  className="shrink-0 p-2 text-[#a39485] hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  title="Retirar acceso"
                >
                  <Trash2 size={14} strokeWidth={2.5} />
                </button>
              ) : (
                <span className="shrink-0 w-9" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TeamView;
