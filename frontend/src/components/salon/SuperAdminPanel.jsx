import React, { useState, useEffect } from "react";
import { useApi } from "../../hooks/useApi";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  LayoutDashboard,
  Building2,
  Users,
  Trash2,
  LogIn,
  ChevronDown,
  KeyRound,
  Copy,
} from "lucide-react";

const SuperAdminPanel = () => {
  const { apiRequest } = useApi();
  const [formData, setFormData] = useState({
    salon_name: "",
    email: "",
    username: "",
  });
  const [impersonateEmail, setImpersonateEmail] = useState("");
  const [organizations, setOrganizations] = useState([]);
  const [openOrgId, setOpenOrgId] = useState(null);
  const [rotatingOrgId, setRotatingOrgId] = useState(null);
  const [freshAgentKeyByOrg, setFreshAgentKeyByOrg] = useState({});
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [impersonateLoading, setImpersonateLoading] = useState(false);

  const fetchOrgs = async () => {
    try {
      const data = await apiRequest("/users/organizations");
      setOrganizations(data);
    } catch (e) {
      console.error("Error cargando organizaciones", e);
    }
  };

  useEffect(() => {
    fetchOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      } catch {
        setStatus({
          type: "error",
          message: "No se pudo eliminar la organización",
        });
      }
    }
  };

  const handleImpersonate = async (e) => {
    e.preventDefault();
    const email = (impersonateEmail || "").trim().toLowerCase();
    if (!email) return;
    setImpersonateLoading(true);
    setStatus({ type: "", message: "" });
    try {
      const originalToken = localStorage.getItem("token");
      if (originalToken) {
        localStorage.setItem("impersonation_original_token", originalToken);
      }
      localStorage.setItem("impersonation_target_email", email);

      const res = await apiRequest("/auth/impersonate", "POST", { email });
      if (!res?.access_token) {
        throw { detail: "No se pudo impersonar (sin token)" };
      }
      localStorage.setItem("token", res.access_token);
      if (res.role) localStorage.setItem("role", res.role);
      if (res.organization_id != null) {
        localStorage.setItem("organization_id", String(res.organization_id));
      }
      setStatus({
        type: "success",
        message: `Entrando como ${email}…`,
      });
      window.location.href = "/app";
    } catch (err) {
      setStatus({
        type: "error",
        message:
          err?.detail ||
          "No se pudo entrar como ese usuario. Revisa el email.",
      });
    } finally {
      setImpersonateLoading(false);
    }
  };

  const rotateAgentKey = async (orgId) => {
    setRotatingOrgId(orgId);
    setStatus({ type: "", message: "" });
    try {
      const res = await apiRequest(
        `/users/organizations/${orgId}/agent-key/rotate`,
        "POST",
        {},
      );
      if (!res?.agent_key) throw { detail: "No se recibió la clave" };
      setFreshAgentKeyByOrg((prev) => ({ ...prev, [orgId]: res.agent_key }));
      await fetchOrgs();
      setStatus({
        type: "success",
        message: "Clave de agente generada. Cópiala ahora (solo se muestra una vez).",
      });
    } catch (err) {
      setStatus({
        type: "error",
        message: err?.detail || "No se pudo rotar la clave del agente",
      });
    } finally {
      setRotatingOrgId(null);
    }
  };

  const copyText = async (txt) => {
    try {
      await navigator.clipboard.writeText(txt);
      setStatus({ type: "success", message: "Copiado al portapapeles" });
    } catch {
      setStatus({
        type: "error",
        message: "No se pudo copiar. Selecciona y copia manualmente.",
      });
    }
  };
  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-fadeIn py-10 px-4">
      {/* --- CABECERA CON BOTÓN DE SALIDA --- */}
      <div className="relative flex flex-col items-center">
        {/* Botón Volver */}
        <Link
          to="/app"
          className="absolute left-0 top-0 flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[var(--bt-border)] text-[var(--bt-muted)] hover:text-[var(--bt-primary)] hover:border-[var(--bt-border-strong)] transition-all group shadow-sm"
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
          <div className="flex justify-center mb-2 text-[var(--bt-border-strong)]">
            <LayoutDashboard size={32} strokeWidth={1.5} />
          </div>
        </div>
        <h2 className="text-4xl font-black text-[var(--bt-primary)] tracking-tighter">
          Master Control
        </h2>
        <p className="text-[var(--bt-muted)] font-medium text-sm italic">
          Gestión Global de Organizaciones y Licencias
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* --- COLUMNA IZQUIERDA: FORMULARIO --- */}
        <div className="lg:col-span-5">
          <div className="bg-white p-8 rounded-[3rem] border border-[var(--bt-border)] shadow-xl shadow-black/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--bt-border-strong)]/10 rounded-full -mr-12 -mt-12" />

            <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--bt-primary)] mb-4">
                Nuevo Registro
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--bt-muted)] ml-4 mb-2 block">
                    Salón
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre del salón"
                    className="w-full px-6 py-4 rounded-2xl bg-[var(--bt-bg)] border-2 border-transparent focus:border-[var(--bt-border-strong)] focus:bg-white transition-all outline-none text-sm font-medium"
                    value={formData.salon_name}
                    onChange={(e) =>
                      setFormData({ ...formData, salon_name: e.target.value })
                    }
                    required
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--bt-muted)] ml-4 mb-2 block">
                    Email Admin
                  </label>
                  <input
                    type="email"
                    placeholder="correo@gmail.com"
                    className="w-full px-6 py-4 rounded-2xl bg-[var(--bt-bg)] border-2 border-transparent focus:border-[var(--bt-border-strong)] focus:bg-white transition-all outline-none text-sm font-medium"
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
                className="w-full bg-[var(--bt-primary)] text-white font-black py-4 rounded-2xl hover:bg-[var(--bt-primary-hover)] transform hover:-translate-y-1 transition-all shadow-lg disabled:opacity-50 uppercase tracking-widest text-[10px]"
              >
                {isLoading ? "Creando..." : "Alta de Organización"}
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-black/5 relative z-10">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--bt-primary)] mb-4">
                Soporte — Entrar como usuario
              </h3>
              <form onSubmit={handleImpersonate} className="space-y-4">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--bt-muted)] ml-4 mb-2 block">
                    Email del usuario
                  </label>
                  <input
                    type="email"
                    placeholder="usuario@correo.com"
                    className="w-full px-6 py-4 rounded-2xl bg-[var(--bt-bg)] border-2 border-transparent focus:border-[var(--bt-border-strong)] focus:bg-white transition-all outline-none text-sm font-medium"
                    value={impersonateEmail}
                    onChange={(e) => setImpersonateEmail(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={impersonateLoading}
                  className="w-full bg-white border border-[var(--bt-border)] text-[var(--bt-primary)] font-black py-4 rounded-2xl hover:border-[var(--bt-primary)]/30 hover:bg-[var(--bt-bg)] transition-all shadow-sm disabled:opacity-50 uppercase tracking-widest text-[10px] inline-flex items-center justify-center gap-2"
                >
                  <LogIn size={16} strokeWidth={2.5} />
                  {impersonateLoading ? "Entrando..." : "Entrar como"}
                </button>
              </form>
            </div>

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
            <h3 className="text-[10px] font-black text-[var(--bt-muted)] uppercase tracking-[0.3em]">
              Organizaciones Activas ({organizations.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {organizations.map((org) => (
              <div key={org.id} className="space-y-2">
                <div className="bg-white p-6 rounded-[2rem] border border-[var(--bt-border)] flex justify-between items-center group hover:shadow-md transition-all hover:border-[var(--bt-border-strong)]">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenOrgId((prev) => (prev === org.id ? null : org.id))
                    }
                    className="flex items-center gap-4 min-w-0 text-left"
                    title="Ver usuarios"
                  >
                    <div className="p-3 bg-[var(--bt-bg)] rounded-2xl text-[var(--bt-border-strong)] group-hover:bg-[var(--bt-primary)] group-hover:text-white transition-colors shrink-0">
                      <Building2 size={20} />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <p className="font-black text-[var(--bt-primary)] text-base tracking-tighter uppercase truncate">
                        {org.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[9px] bg-[var(--bt-bg)] text-[var(--bt-muted)] px-2 py-1 rounded-md font-bold uppercase">
                          ID: {org.id.toString().slice(0, 8)}
                        </span>
                        <div className="flex items-center gap-1 text-[9px] text-[var(--bt-border-strong)] font-black uppercase italic">
                          <Users size={10} />
                          <span>{org.user_count} Usuarios</span>
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-3 shrink-0">
                    <ChevronDown
                      className={`w-4 h-4 text-[var(--bt-muted)] transition-transform ${
                        openOrgId === org.id ? "rotate-180" : ""
                      }`}
                      strokeWidth={2.5}
                    />
                    <div className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.4)]" />
                    <button
                      onClick={() => handleDelete(org.id, org.name)}
                      className="p-2.5 text-[var(--bt-muted)] hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      title="Eliminar Organización"
                    >
                      <Trash2 size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                {openOrgId === org.id && (
                  <div className="bg-white/90 rounded-[2rem] border border-[var(--bt-border)] px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--bt-muted)]">
                          Agent Key (WhatsApp/IG)
                        </p>
                        <p className="mt-2 text-[10px] text-[var(--bt-muted)] font-medium leading-relaxed">
                          Esta clave se usa en integraciones externas para llamar a{" "}
                          <span className="font-black text-[var(--bt-primary)]">/agent/*</span>{" "}
                          con el header{" "}
                          <span className="font-black text-[var(--bt-primary)]">
                            X-Agent-Key
                          </span>
                          .
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => rotateAgentKey(org.id)}
                        disabled={rotatingOrgId === org.id}
                        className="shrink-0 inline-flex items-center gap-2 rounded-2xl border border-[var(--bt-border)] bg-white px-4 py-3 text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] hover:border-[var(--bt-border-strong)] disabled:opacity-50"
                      >
                        <KeyRound className="w-4 h-4" strokeWidth={2.5} />
                        {rotatingOrgId === org.id ? "Generando..." : "Generar"}
                      </button>
                    </div>

                    {org.has_agent_key && (
                      <div className="mt-4 rounded-2xl border border-black/5 bg-[var(--bt-bg)] px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--bt-muted)]">
                            Clave activa
                          </p>
                          <p className="text-[10px] font-black tracking-widest text-[var(--bt-primary)] truncate">
                            ••••{org.agent_key_last4 || "????"}
                          </p>
                        </div>
                        <span className="text-[9px] font-bold text-[var(--bt-muted)]">
                          (no se muestra completa)
                        </span>
                      </div>
                    )}

                    {freshAgentKeyByOrg[org.id] && (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-900">
                          Clave nueva (copiar ahora)
                        </p>
                        <div className="mt-2 flex items-stretch gap-2">
                          <input
                            readOnly
                            value={freshAgentKeyByOrg[org.id]}
                            className="min-w-0 flex-1 rounded-xl bg-white border border-amber-200 px-3 py-2 text-[10px] font-bold text-[var(--bt-primary)] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => copyText(freshAgentKeyByOrg[org.id])}
                            className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-white border border-amber-200 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-amber-900 hover:bg-amber-100"
                          >
                            <Copy className="w-4 h-4" strokeWidth={2.5} />
                            Copiar
                          </button>
                        </div>
                      </div>
                    )}

                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--bt-muted)]">
                      Usuarios (emails)
                    </p>
                    <div className="mt-3 space-y-2">
                      {(org.user_emails || []).length === 0 ? (
                        <p className="text-[10px] text-[var(--bt-muted)] font-medium">
                          No hay usuarios asociados.
                        </p>
                      ) : (
                        (org.user_emails || []).map((em) => (
                          <div
                            key={em}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-[var(--bt-bg)] px-4 py-3"
                          >
                            <span className="min-w-0 truncate text-[10px] font-black tracking-widest text-[var(--bt-primary)]">
                              {em}
                            </span>
                            <button
                              type="button"
                              onClick={() => setImpersonateEmail(em)}
                              className="shrink-0 rounded-full border border-[var(--bt-border)] bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] hover:border-[var(--bt-border-strong)]"
                            >
                              Usar
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Estado vacío */}
            {organizations.length === 0 && (
              <div className="text-center py-20 bg-white/50 rounded-[3rem] border border-dashed border-[var(--bt-border-strong)]">
                <p className="text-[10px] font-black text-[var(--bt-muted)] uppercase tracking-widest">
                  No hay salones registrados
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-center pt-10">
        <p className="text-[9px] text-[var(--bt-muted)] uppercase tracking-[0.5em] font-black opacity-50">
          BeautyTask Management System v1.0
        </p>
      </div>
    </div>
  );
};

export default SuperAdminPanel;
