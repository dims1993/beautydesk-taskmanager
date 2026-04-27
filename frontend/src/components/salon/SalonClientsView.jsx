import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Trash2,
  Pencil,
  Smartphone,
  Upload,
  Download,
  Phone,
  Mail,
  Clock,
  Sparkles,
  StickyNote,
  ChevronRight,
  Check,
  X,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { DeleteClientConfirmModal } from "../modals/AppointmentModals.jsx";
import {
  pickContactsFromDevice,
  contactsPickerSupported,
  parseVcfToClients,
  buildClientsVcf,
  downloadVcf,
} from "../../utils/contactSync";

/**
 * Directorio de clientes del salón (CRM): buscar, alta, edición y baja.
 * Antes: `ClientDirectory.jsx` — renombrado para dejar claro que es la ficha de clientes, no la agenda de citas.
 */
const SalonClientsView = ({
  clients = [],
  onAddClient,
  onRefresh,
  onError,
  blockedMessage = null,
}) => {
  const { apiRequest } = useApi();
  const apiRequestRef = useRef(apiRequest);
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [clientPendingDelete, setClientPendingDelete] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const deleteInFlightRef = useRef(false);
  const vcfInputRef = useRef(null);

  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [compactOnSelect, setCompactOnSelect] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [selectedClientId, setSelectedClientId] = useState(null);
  const [clientInsights, setClientInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [noteDeletingId, setNoteDeletingId] = useState(null);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const touchPrimaryUi = true; // notes swipe: mobile-first UI
  const NOTE_SWIPE_REVEAL_PX = 88;
  const noteTouchDragRef = useRef(null);
  const noteSwipeXRef = useRef({});
  const [noteSwipeXById, setNoteSwipeXById] = useState({});
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    apiRequestRef.current = apiRequest;
  }, [apiRequest]);

  const [newClient, setNewClient] = useState({
    nombre: "",
    apellidos: "",
    telefono: "",
    email: "",
  });

  const filteredClients = useMemo(() => {
    const q = (searchTerm || "").trim().toLowerCase();
    if (!q) return showAllContacts ? clients : [];
    const base = clients.filter((c) => {
      const name = `${c.nombre || ""} ${c.apellidos || ""}`.toLowerCase();
      const phone = String(c.telefono || "");
      const email = String(c.email || "").toLowerCase();
      return name.includes(q) || phone.includes(q) || email.includes(q);
    });
    return base;
  }, [clients, searchTerm, showAllContacts]);

  const visibleClients = useMemo(() => {
    if (compactOnSelect && selectedClientId) {
      const only = clients.find((c) => Number(c.id) === Number(selectedClientId));
      return only ? [only] : [];
    }
    return filteredClients;
  }, [clients, filteredClients, compactOnSelect, selectedClientId]);

  const selectedClient = useMemo(() => {
    if (!selectedClientId) return null;
    return clients.find((c) => Number(c.id) === Number(selectedClientId)) || null;
  }, [clients, selectedClientId]);

  useEffect(() => {
    setEditingNoteId(null);
    setEditingNoteText("");
    setNoteSwipeXById({});
    setDetailEditMode(false);
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) return;
    let cancelled = false;
    (async () => {
      setInsightsLoading(true);
      try {
        const data = await apiRequestRef.current(`/clients/${selectedClientId}/insights`);
        if (!cancelled) setClientInsights(data || null);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          onErrorRef.current?.("No se pudo cargar el detalle del cliente.");
        }
      } finally {
        if (!cancelled) setInsightsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClientId]);

  const refreshInsights = useCallback(async () => {
    if (!selectedClientId) return;
    setInsightsLoading(true);
    try {
      const data = await apiRequestRef.current(`/clients/${selectedClientId}/insights`);
      setClientInsights(data || null);
    } catch (err) {
      console.error(err);
      onErrorRef.current?.("No se pudo cargar el detalle del cliente.");
    } finally {
      setInsightsLoading(false);
    }
  }, [selectedClientId]);

  const handleNoteSwipeTouchStart = (noteId, e) => {
    const t = e.touches?.[0];
    if (!t) return;
    noteTouchDragRef.current = {
      noteId,
      startX: t.clientX,
      startOffset: noteSwipeXRef.current[noteId] ?? 0,
    };
  };

  const handleNoteSwipeTouchMove = (noteId, e) => {
    const d = noteTouchDragRef.current;
    if (!d || d.noteId !== noteId) return;
    const t = e.touches?.[0];
    if (!t) return;
    const delta = t.clientX - d.startX;
    const next = Math.max(
      -NOTE_SWIPE_REVEAL_PX,
      Math.min(NOTE_SWIPE_REVEAL_PX, d.startOffset + delta),
    );
    setNoteSwipeXById((s) => ({ ...s, [noteId]: next }));
  };

  const handleNoteSwipeTouchEnd = (noteId) => {
    noteTouchDragRef.current = null;
    setNoteSwipeXById((s) => {
      const cur = s[noteId] ?? 0;
      const snap =
        cur > NOTE_SWIPE_REVEAL_PX / 2
          ? NOTE_SWIPE_REVEAL_PX
          : cur < -NOTE_SWIPE_REVEAL_PX / 2
            ? -NOTE_SWIPE_REVEAL_PX
            : 0;
      return { ...s, [noteId]: snap };
    });
  };

  noteSwipeXRef.current = noteSwipeXById;

  const closeAllNoteSwipes = () => setNoteSwipeXById({});

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddClient(newClient);
    setNewClient({ nombre: "", apellidos: "", telefono: "", email: "" });
    setShowForm(false);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();

    if (!editingId || !editForm) return;

    try {
      const dataToUpdate = {
        nombre: editForm.nombre,
        apellidos: editForm.apellidos || "",
        telefono: editForm.telefono,
        email: editForm.email || "",
      };

      await apiRequest(`/clients/${editingId}`, "PATCH", dataToUpdate);

      setEditingId(null);
      setEditForm(null);

      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error("Error al actualizar:", err);
      if (onError) {
        onError("No se pudo actualizar el cliente. Revisa los datos.");
      }
    }
  };

  const openDeleteModal = (client) => {
    setClientPendingDelete(client);
  };

  const closeDeleteModal = useCallback(() => {
    if (deleteSubmitting) return;
    setClientPendingDelete(null);
  }, [deleteSubmitting]);

  const confirmDeleteClient = async () => {
    if (deleteInFlightRef.current) return;
    const client = clientPendingDelete;
    if (!client?.id) return;
    const idToDelete = Number(client.id);
    if (!Number.isFinite(idToDelete)) return;

    deleteInFlightRef.current = true;
    setDeleteSubmitting(true);
    setDeletingId(idToDelete);
    try {
      await apiRequest(`/clients/${idToDelete}`, "DELETE");
      if (editingId === idToDelete) {
        setEditingId(null);
        setEditForm(null);
      }
      setClientPendingDelete(null);
      onRefresh?.();
    } catch (err) {
      console.error("Error al eliminar:", err);
      onError?.("No se pudo eliminar el cliente.");
    } finally {
      setDeletingId(null);
      setDeleteSubmitting(false);
      deleteInFlightRef.current = false;
    }
  };

  const pendingDeleteLabel = clientPendingDelete
    ? `${clientPendingDelete.nombre} ${clientPendingDelete.apellidos || ""}`.trim()
    : "";

  const runContactImport = async (rows) => {
    setSyncMessage(null);
    if (!rows?.length) {
      setSyncMessage(
        "No hay contactos con teléfono para importar. Prueba otro archivo o selecciona otras fichas.",
      );
      return;
    }
    setSyncBusy(true);
    try {
      const payload = {
        clients: rows.map((r) => ({
          nombre: r.nombre || "Cliente",
          apellidos: r.apellidos ?? null,
          telefono: r.telefono,
          email: r.email || null,
        })),
      };
      const res = await apiRequest("/clients/import", "POST", payload);
      if (res) {
        const parts = [
          `${res.created} nuevos`,
          `${res.updated} actualizados`,
        ];
        if (res.skipped) parts.push(`${res.skipped} omitidos`);
        setSyncMessage(`Listo: ${parts.join(", ")}.`);
        onRefresh?.();
      }
    } catch (err) {
      console.error(err);
      setSyncMessage("No se pudo completar la importación. Revisa tu conexión o los datos.");
      onError?.("Error al importar contactos.");
    } finally {
      setSyncBusy(false);
    }
  };

  const handlePickDeviceContacts = async () => {
    try {
      const rows = await pickContactsFromDevice();
      await runContactImport(rows);
    } catch (e) {
      if (e?.code === "CONTACTS_UNSUPPORTED" || e?.message === "CONTACTS_UNSUPPORTED") {
        setSyncMessage(
          "Tu navegador no permite elegir contactos. Usa «Importar .vcf» (exporta contactos desde la app Contactos del teléfono).",
        );
      } else {
        console.error(e);
        setSyncMessage("Selección cancelada o no disponible.");
      }
    }
  };

  const handleVcfFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseVcfToClients(text);
      await runContactImport(rows);
    } catch (err) {
      console.error(err);
      setSyncMessage("No se pudo leer el archivo. Usa un .vcf exportado desde tu agenda.");
    }
  };

  const handleExportVcf = () => {
    setSyncMessage(null);
    if (!clients.length) {
      setSyncMessage("Aún no hay clientes para exportar.");
      return;
    }
    const vcf = buildClientsVcf(clients);
    downloadVcf("beautydesk-clientes.vcf", vcf);
    setSyncMessage(
      "Archivo descargado. Ábrelo en el móvil y elige «Crear contactos» o compártelo a Contactos.",
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <DeleteClientConfirmModal
        isOpen={!!clientPendingDelete}
        onClose={closeDeleteModal}
        onConfirm={confirmDeleteClient}
        clientLabel={pendingDeleteLabel}
        isDeleting={deleteSubmitting}
      />
      <div className="min-w-0 max-w-full bg-white rounded-[3rem] shadow-2xl shadow-black/10 border border-[var(--bt-border)] overflow-x-clip overflow-y-visible transition-all duration-500 hover:shadow-2xl hover:shadow-[var(--bt-primary)]/5">
        <div className="bg-[var(--bt-bg)] p-10 border-b border-[var(--bt-border)] text-center space-y-2 rounded-t-[3rem]">
          <h2 className="text-3xl font-serif text-[var(--bt-primary)]">
            Directorio de <span className="italic opacity-80">clientes</span>
          </h2>
        </div>

        <div className="p-8 md:p-10 space-y-6">
        {blockedMessage && (
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            {blockedMessage}
          </p>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[var(--bt-muted)]">
              Contactos
            </p>
            <p className="mt-2 text-[11px] md:text-xs font-medium leading-relaxed text-[var(--bt-muted)]">
              Busca, selecciona y consulta detalles: correo, servicios realizados,
              última visita y notas.
            </p>
          </div>
          <button
            type="button"
            disabled={!!blockedMessage}
            onClick={() => !blockedMessage && setShowForm(!showForm)}
            className="inline-flex items-center justify-center rounded-full bg-[var(--bt-primary)] px-6 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-[var(--bt-primary-hover)] disabled:opacity-40"
          >
            {showForm ? "Cerrar alta" : "Añadir cliente"}
          </button>
        </div>
        {clients.length === 0 && !blockedMessage && (
          <p className="text-[10px] text-[var(--bt-muted)] font-medium leading-relaxed">
            Aún no hay clientes. Usa el botón + para dar de alta el primero en
            tu espacio.
          </p>
        )}
        {!blockedMessage && (
          <div className="rounded-[2.5rem] border border-[var(--bt-border)] bg-white shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setSyncOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-black/[0.02]"
            >
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--bt-muted)]">
                  Sincronizar con tu agenda
                </p>
                <p className="mt-1 text-[10px] text-[var(--bt-muted)] leading-relaxed">
                  Importa/Exporta desde el teléfono o archivos .vcf.
                </p>
              </div>
              <ChevronRight
                className={[
                  "h-5 w-5 shrink-0 text-[var(--bt-muted)] transition-transform duration-300",
                  syncOpen ? "rotate-90" : "",
                ].join(" ")}
                aria-hidden
              />
            </button>

            {syncOpen ? (
              <div className="border-t border-[var(--bt-border)] bg-[var(--bt-bg)] px-6 py-6 space-y-4">
                <p className="text-[10px] text-[var(--bt-muted)] leading-relaxed">
                  Los duplicados se unen por número de teléfono.
                </p>
                <input
                  ref={vcfInputRef}
                  type="file"
                  accept=".vcf,.vcard,text/vcard"
                  className="hidden"
                  onChange={handleVcfFile}
                />
                <div className="flex flex-wrap gap-2">
                  {contactsPickerSupported() && (
                    <button
                      type="button"
                      disabled={syncBusy}
                      onClick={handlePickDeviceContacts}
                      className="inline-flex items-center gap-2 rounded-xl bg-white border border-[var(--bt-border)] px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] hover:border-[var(--bt-border-strong)] disabled:opacity-50"
                    >
                      <Smartphone className="w-3.5 h-3.5" strokeWidth={2} />
                      Elegir contactos
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={syncBusy}
                    onClick={() => vcfInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl bg-white border border-[var(--bt-border)] px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] hover:border-[var(--bt-border-strong)] disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" strokeWidth={2} />
                    Importar .vcf
                  </button>
                  <button
                    type="button"
                    disabled={syncBusy || !clients.length}
                    onClick={handleExportVcf}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--bt-primary)] text-white px-3 py-2 text-[9px] font-black uppercase tracking-widest hover:bg-[var(--bt-primary-hover)] disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" strokeWidth={2} />
                    Exportar .vcf
                  </button>
                </div>
                {syncBusy && (
                  <p className="text-[10px] font-bold text-[var(--bt-border-strong)]">
                    Importando…
                  </p>
                )}
                {syncMessage && !syncBusy && (
                  <p className="text-[10px] font-medium text-[var(--bt-primary)] leading-relaxed">
                    {syncMessage}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}

        <div className="rounded-[2.5rem] border border-[var(--bt-border)] bg-white shadow-sm p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--bt-muted)]">
                Contactos
              </p>
              <p className="mt-1 text-[10px] text-[var(--bt-muted)]">
                Filtra por nombre, teléfono o email.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAllContacts((v) => !v);
                setCompactOnSelect(false);
              }}
              className="shrink-0 rounded-full border border-[var(--bt-border)] bg-white px-5 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--bt-primary)] hover:bg-[var(--bt-bg)]"
            >
              {showAllContacts ? "Ocultar todos" : "Mostrar todos"}
            </button>
          </div>
          <input
            type="text"
            placeholder="Buscar contacto…"
            value={searchTerm || ""}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mt-4 w-full rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] px-5 py-4 text-[11px] font-bold text-[var(--bt-primary)] outline-none focus:border-[var(--bt-primary)] focus:bg-white transition-all"
          />
          {!showAllContacts && !searchTerm.trim() ? (
            <p className="mt-3 text-[10px] text-[var(--bt-muted)]">
              Escribe para buscar (o pulsa «Mostrar todos»).
            </p>
          ) : null}
        </div>

        </div>
      </div>

      {showForm && !blockedMessage && (
        <form
          onSubmit={handleSubmit}
          className="bg-[var(--bt-accent)]/60 p-6 rounded-[2.5rem] border border-dashed border-[var(--bt-border-strong)] space-y-3 animate-slideDown"
        >
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Nombre"
              required
              className="p-3 rounded-xl border-none text-sm outline-none focus:ring-1 focus:ring-[var(--bt-border-strong)]"
              value={newClient.nombre || ""}
              onChange={(e) =>
                setNewClient({ ...newClient, nombre: e.target.value })
              }
            />
            <input
              placeholder="Apellidos"
              className="p-3 rounded-xl border-none text-sm outline-none focus:ring-1 focus:ring-[var(--bt-border-strong)]"
              value={newClient.apellidos || ""}
              onChange={(e) =>
                setNewClient({ ...newClient, apellidos: e.target.value })
              }
            />
          </div>
          <input
            placeholder="Teléfono"
            required
            className="w-full p-3 rounded-xl border-none text-sm outline-none focus:ring-1 focus:ring-[var(--bt-border-strong)]"
            value={newClient.telefono || ""}
            onChange={(e) =>
              setNewClient({ ...newClient, telefono: e.target.value })
            }
          />
          <input
            placeholder="Email"
            type="email"
            className="w-full p-3 rounded-xl border-none text-sm outline-none focus:ring-1 focus:ring-[var(--bt-border-strong)]"
            value={newClient.email || ""}
            onChange={(e) =>
              setNewClient({ ...newClient, email: e.target.value })
            }
          />
          <button
            type="submit"
            className="w-full bg-[var(--bt-primary)] text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--bt-primary-hover)]"
          >
            Guardar cliente
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Listado (filas) */}
        <div className="lg:col-span-5">
          <div className="rounded-[2.5rem] border border-[var(--bt-border)] bg-white p-5 shadow-sm">
            <p className="px-2 pb-3 text-[9px] font-black uppercase tracking-[0.25em] text-[var(--bt-muted)]">
              Contactos
            </p>

            {visibleClients.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--bt-border)] bg-[var(--bt-bg)] px-4 py-10 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--bt-muted)]">
                  No hay resultados
                </p>
              </div>
            ) : (
              <div className="divide-y divide-black/5 overflow-hidden rounded-2xl border border-[var(--bt-border)]">
                {compactOnSelect && selectedClient ? (
                  <div className="bg-[var(--bt-bg)] px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--bt-muted)]">
                      Vista compacta
                    </p>
                    <button
                      type="button"
                      onClick={() => setCompactOnSelect(false)}
                      className="rounded-full border border-[var(--bt-border)] bg-white px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] hover:bg-[var(--bt-bg)]"
                    >
                      Volver a la lista
                    </button>
                  </div>
                ) : null}

                {visibleClients.map((client) => {
                  const active = Number(selectedClientId) === Number(client.id);
                  return (
                    <div
                      key={client.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedClientId(client.id);
                        if (showAllContacts) setCompactOnSelect(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedClientId(client.id);
                          if (showAllContacts) setCompactOnSelect(true);
                        }
                      }}
                      className={[
                        "w-full text-left px-4 py-4 bg-white transition-colors",
                        active ? "bg-[var(--bt-bg)]" : "hover:bg-[var(--bt-bg)]",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-black text-[var(--bt-primary)] truncate">
                            {client.nombre} {client.apellidos || ""}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-medium text-[var(--bt-muted)]">
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-[var(--bt-icon)]" />
                              {client.telefono}
                            </span>
                            {client.email ? (
                              <>
                                <span className="h-1 w-1 rounded-full bg-[var(--bt-border)]" />
                                <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                                  <Mail className="h-3.5 w-3.5 text-[var(--bt-icon)]" />
                                  <span className="truncate">{client.email}</span>
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex shrink-0 gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedClientId(client.id);
                              setEditingId(client.id);
                              setEditForm({ ...client });
                              if (showAllContacts) setCompactOnSelect(true);
                            }}
                            className="rounded-xl border border-[var(--bt-border)] bg-white p-2 text-[var(--bt-muted)] hover:text-[var(--bt-primary)]"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteModal(client);
                            }}
                            disabled={deletingId === client.id}
                            className="rounded-xl border border-red-100 bg-white p-2 text-red-500 hover:bg-red-50 disabled:opacity-50"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Detalle */}
        <div className="lg:col-span-7">
          <div className="rounded-[2.5rem] border border-[var(--bt-border)] bg-white p-6 shadow-sm">
            {!selectedClient ? (
              <div className="rounded-2xl border border-dashed border-[var(--bt-border)] bg-[var(--bt-bg)] px-6 py-16 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--bt-muted)]">
                  Selecciona un contacto
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--bt-muted)]">
                      Detalle
                    </p>
                    <h3 className="mt-2 font-serif text-2xl text-[var(--bt-primary)] truncate">
                      {selectedClient.nombre} {selectedClient.apellidos || ""}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDetailEditMode((v) => {
                        const next = !v;
                        if (next) {
                          setEditingId(selectedClient.id);
                          setEditForm({ ...selectedClient });
                        } else {
                          setEditingId(null);
                          setEditForm(null);
                          setEditingNoteId(null);
                          setEditingNoteText("");
                        }
                        return next;
                      });
                    }}
                    className="hidden md:inline-flex shrink-0 rounded-full border border-[var(--bt-border)] bg-white px-5 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--bt-primary)] hover:bg-[var(--bt-bg)] disabled:opacity-50"
                    disabled={!selectedClient}
                  >
                    Editar
                  </button>
                </div>

                {editingId === selectedClient.id && editForm ? (
                  <form
                    onSubmit={handleSaveEdit}
                    className="rounded-2xl border border-[var(--bt-border)] bg-white p-5 space-y-4"
                  >
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--bt-muted)]">
                      Editar contacto
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-[var(--bt-muted)] mb-1">
                          Nombre
                        </label>
                        <input
                          value={editForm.nombre || ""}
                          onChange={(e) =>
                            setEditForm({ ...editForm, nombre: e.target.value })
                          }
                          className="w-full rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] px-4 py-3 text-[11px] font-bold text-[var(--bt-primary)] outline-none focus:border-[var(--bt-primary)]"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-[var(--bt-muted)] mb-1">
                          Apellidos
                        </label>
                        <input
                          value={editForm.apellidos || ""}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              apellidos: e.target.value,
                            })
                          }
                          className="w-full rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] px-4 py-3 text-[11px] font-medium text-[var(--bt-primary)] outline-none focus:border-[var(--bt-primary)]"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-[var(--bt-muted)] mb-1">
                          Teléfono
                        </label>
                        <input
                          value={editForm.telefono || ""}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              telefono: e.target.value,
                            })
                          }
                          className="w-full rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] px-4 py-3 text-[11px] font-medium text-[var(--bt-primary)] outline-none focus:border-[var(--bt-primary)]"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-[var(--bt-muted)] mb-1">
                          Email
                        </label>
                        <input
                          type="email"
                          value={editForm.email || ""}
                          onChange={(e) =>
                            setEditForm({ ...editForm, email: e.target.value })
                          }
                          className="w-full rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] px-4 py-3 text-[11px] font-medium text-[var(--bt-primary)] outline-none focus:border-[var(--bt-primary)]"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditForm(null);
                        }}
                        className="w-full sm:w-auto rounded-full border border-[var(--bt-border)] bg-white px-6 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--bt-muted)] hover:bg-[var(--bt-bg)]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="w-full sm:w-auto rounded-full bg-[var(--bt-primary)] px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-[var(--bt-primary-hover)]"
                      >
                        Guardar cambios
                      </button>
                    </div>
                  </form>
                ) : null}

                {/* Correo electrónico */}
                <div className="rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] p-5">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--bt-muted)]">
                    Correo electrónico
                  </p>
                  <p className="mt-2 text-[11px] font-bold text-[var(--bt-primary)]">
                    {selectedClient.email || "—"}
                  </p>
                </div>

                {/* Servicios realizados */}
                <div className="rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--bt-muted)]">
                      Servicios realizados
                    </p>
                    <Sparkles className="h-4 w-4 text-[var(--bt-icon)]" />
                  </div>
                  <div className="mt-3 space-y-2">
                    {clientInsights?.services_done?.length ? (
                      clientInsights.services_done.map((s) => (
                        <div
                          key={s.service_id}
                          className="flex items-center justify-between rounded-xl bg-white px-4 py-3 border border-black/5"
                        >
                          <span className="text-[10px] font-black tracking-widest text-[var(--bt-primary)]">
                            {s.service_name}
                          </span>
                          <span className="text-[10px] font-black text-[var(--bt-muted)]">
                            x{s.count}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] font-medium text-[var(--bt-muted)]">
                        Aún no hay servicios confirmados (pago).
                      </p>
                    )}
                  </div>
                </div>

                {/* Última visita */}
                <div className="rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--bt-muted)]">
                      Última visita
                    </p>
                    <Clock className="h-4 w-4 text-[var(--bt-icon)]" />
                  </div>
                  <p className="mt-2 text-[11px] font-bold text-[var(--bt-primary)]">
                    {clientInsights?.last_visit
                      ? new Date(clientInsights.last_visit).toLocaleString("es-ES")
                      : "—"}
                  </p>
                </div>

                {/* Notas */}
                <div className="rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[var(--bt-muted)]">
                      Notas
                    </p>
                    <StickyNote className="h-4 w-4 text-[var(--bt-icon)]" />
                  </div>

                  <div className="mt-4 space-y-2">
                    {clientInsights?.notes?.length ? (
                      clientInsights.notes.map((n) => (
                        <div
                          key={n.id}
                          className="relative overflow-hidden rounded-xl border border-black/5 bg-white"
                          onClick={() => {
                            // close swipes when tapping elsewhere
                            if (noteSwipeXRef.current[n.id]) closeAllNoteSwipes();
                          }}
                        >
                          {/* Action rails (mobile swipe) */}
                          <div className="absolute inset-y-0 left-0 w-[88px] bg-amber-500 text-white flex items-center justify-center md:hidden">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingNoteId(n.id);
                                setEditingNoteText(n.text || "");
                                setNoteSwipeXById((s) => ({ ...s, [n.id]: 0 }));
                              }}
                              className="text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2"
                            >
                              <Pencil className="h-4 w-4" /> Editar
                            </button>
                          </div>
                          <div className="absolute inset-y-0 right-0 w-[88px] bg-red-500 text-white flex items-center justify-center md:hidden">
                            <button
                              type="button"
                              disabled={noteDeletingId === n.id}
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!selectedClient?.id) return;
                                setNoteDeletingId(n.id);
                                try {
                                  await apiRequest(
                                    `/clients/${selectedClient.id}/notes/${n.id}`,
                                    "DELETE",
                                  );
                                  await refreshInsights();
                                } catch (err) {
                                  console.error(err);
                                  onErrorRef.current?.(
                                    "No se pudo eliminar la nota.",
                                  );
                                } finally {
                                  setNoteDeletingId(null);
                                  setNoteSwipeXById((s) => ({ ...s, [n.id]: 0 }));
                                }
                              }}
                              className="text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2 disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" />{" "}
                              {noteDeletingId === n.id ? "…" : "Eliminar"}
                            </button>
                          </div>

                          {/* Swipeable content */}
                          <div
                            className="touch-pan-x will-change-transform bg-white md:touch-auto"
                            style={{
                              transform: `translateX(${noteSwipeXById[n.id] ?? 0}px)`,
                              transition: noteTouchDragRef.current?.noteId === n.id
                                ? "none"
                                : "transform 0.2s ease-out",
                            }}
                            onTouchStart={(e) => handleNoteSwipeTouchStart(n.id, e)}
                            onTouchMove={(e) => handleNoteSwipeTouchMove(n.id, e)}
                            onTouchEnd={() => handleNoteSwipeTouchEnd(n.id)}
                            onTouchCancel={() => handleNoteSwipeTouchEnd(n.id)}
                          >
                            <div className="px-4 py-3">
                              {editingNoteId === n.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={editingNoteText}
                                    onChange={(e) => setEditingNoteText(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] px-4 py-3 text-[11px] font-medium text-[var(--bt-primary)] outline-none focus:border-[var(--bt-primary)] focus:bg-white"
                                  />
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingNoteId(null);
                                        setEditingNoteText("");
                                      }}
                                      className="inline-flex items-center gap-2 rounded-full border border-[var(--bt-border)] bg-white px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[var(--bt-muted)] hover:bg-[var(--bt-bg)]"
                                    >
                                      <X className="h-4 w-4" /> Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!selectedClient?.id) return;
                                        const txt = (editingNoteText || "").trim();
                                        if (!txt) {
                                          onErrorRef.current?.("La nota no puede estar vacía.");
                                          return;
                                        }
                                        try {
                                          await apiRequest(
                                            `/clients/${selectedClient.id}/notes/${n.id}`,
                                            "PATCH",
                                            { text: txt },
                                          );
                                          setEditingNoteId(null);
                                          setEditingNoteText("");
                                          await refreshInsights();
                                        } catch (err) {
                                          console.error(err);
                                          onErrorRef.current?.("No se pudo editar la nota.");
                                        }
                                      }}
                                      className="inline-flex items-center gap-2 rounded-full bg-[var(--bt-primary)] px-4 py-2 text-[9px] font-black uppercase tracking-widest text-white hover:bg-[var(--bt-primary-hover)]"
                                    >
                                      <Check className="h-4 w-4" /> Guardar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="text-[10px] font-black text-[var(--bt-primary)]">
                                      {n.text}
                                    </p>
                                    {detailEditMode ? (
                                      <div className="hidden md:flex shrink-0 gap-2">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingNoteId(n.id);
                                            setEditingNoteText(n.text || "");
                                          }}
                                          className="rounded-full border border-[var(--bt-border)] bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] hover:bg-[var(--bt-bg)]"
                                        >
                                          Editar
                                        </button>
                                        <button
                                          type="button"
                                          disabled={noteDeletingId === n.id}
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!selectedClient?.id) return;
                                            setNoteDeletingId(n.id);
                                            try {
                                              await apiRequest(
                                                `/clients/${selectedClient.id}/notes/${n.id}`,
                                                "DELETE",
                                              );
                                              await refreshInsights();
                                            } catch (err) {
                                              console.error(err);
                                              onErrorRef.current?.(
                                                "No se pudo eliminar la nota.",
                                              );
                                            } finally {
                                              setNoteDeletingId(null);
                                            }
                                          }}
                                          className="rounded-full border border-red-100 bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-red-600 hover:bg-red-50 disabled:opacity-60"
                                        >
                                          {noteDeletingId === n.id
                                            ? "…"
                                            : "Eliminar"}
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 text-[9px] font-medium text-[var(--bt-muted)]">
                                    {new Date(n.created_at).toLocaleString("es-ES")}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] font-medium text-[var(--bt-muted)]">
                        Sin notas todavía.
                      </p>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Añadir una nota…"
                      rows={3}
                      className="w-full rounded-2xl border border-[var(--bt-border)] bg-white px-4 py-3 text-[11px] font-medium text-[var(--bt-primary)] outline-none focus:border-[var(--bt-primary)]"
                    />
                    <button
                      type="button"
                      disabled={noteSaving || !noteText.trim()}
                      onClick={async () => {
                        if (!selectedClient?.id) return;
                        const txt = noteText.trim();
                        if (!txt) return;
                        setNoteSaving(true);
                        try {
                          await apiRequest(
                            `/clients/${selectedClient.id}/notes`,
                            "POST",
                            { text: txt },
                          );
                          setNoteText("");
                          await refreshInsights();
                        } catch (err) {
                          console.error(err);
                          onError?.("No se pudo guardar la nota.");
                        } finally {
                          setNoteSaving(false);
                        }
                      }}
                      className="w-full rounded-full bg-[var(--bt-primary)] py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50 hover:bg-[var(--bt-primary-hover)]"
                    >
                      {noteSaving ? "Guardando…" : "Guardar nota"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalonClientsView;
