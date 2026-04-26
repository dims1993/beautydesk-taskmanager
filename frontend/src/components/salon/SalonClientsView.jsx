import React, { useState, useCallback, useRef } from "react";
import {
  Trash2,
  Pencil,
  Smartphone,
  Upload,
  Download,
  Phone,
  Mail,
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
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [clientPendingDelete, setClientPendingDelete] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const deleteInFlightRef = useRef(false);
  const vcfInputRef = useRef(null);

  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [newClient, setNewClient] = useState({
    nombre: "",
    apellidos: "",
    telefono: "",
    email: "",
  });

  const filteredClients = clients.filter(
    (c) =>
      `${c.nombre || ""} ${c.apellidos || ""}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (c.telefono && c.telefono.includes(searchTerm)),
  );

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
      <div className="bg-white p-6 rounded-[2.5rem] border border-[var(--bt-border)] shadow-sm space-y-4">
        {blockedMessage && (
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            {blockedMessage}
          </p>
        )}
        <div className="flex justify-between items-center">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--bt-muted)]">
            Directorio de clientes
          </h3>
          <button
            type="button"
            disabled={!!blockedMessage}
            onClick={() => !blockedMessage && setShowForm(!showForm)}
            className="bg-[var(--bt-primary)] text-white text-[18px] w-10 h-10 rounded-full hover:rotate-90 transition-all flex items-center justify-center disabled:opacity-40 disabled:hover:rotate-0"
          >
            {showForm ? "×" : "+"}
          </button>
        </div>
        {clients.length === 0 && !blockedMessage && (
          <p className="text-[10px] text-[var(--bt-muted)] font-medium leading-relaxed">
            Aún no hay clientes. Usa el botón + para dar de alta el primero en
            tu espacio.
          </p>
        )}
        {!blockedMessage && (
          <div className="rounded-2xl border border-[#e8dfd6] bg-[#faf7f4] p-4 space-y-3">
            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--bt-muted)]">
              Sincronizar con tu agenda
            </p>
            <p className="text-[10px] text-[var(--bt-muted)] leading-relaxed">
              Importa desde el teléfono o un archivo .vcf, o exporta tus clientes para
              añadirlos a Contactos. Los duplicados se unen por número de teléfono.
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
        )}
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono..."
          value={searchTerm || ""}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[var(--bt-bg)] border-none rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-[var(--bt-border-strong)] outline-none transition-all"
        />
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredClients.map((client) => (
          <div
            key={client.id}
            className={`bg-white p-6 rounded-[2.5rem] border transition-all ${
              editingId === client.id
                ? "border-[var(--bt-border-strong)] ring-2 ring-[var(--bt-border-strong)]/10"
                : "border-[var(--bt-border)]"
            } hover:border-[var(--bt-border-strong)] group relative`}
          >
            {editingId === client.id && editForm ? (
              <form
                onSubmit={handleSaveEdit}
                className="space-y-4 animate-fadeIn"
              >
                <p className="text-[9px] font-black text-[var(--bt-border-strong)] uppercase tracking-[0.2em] mb-2">
                  Editando perfil
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-[var(--bt-muted)] uppercase ml-2">
                      Nombre
                    </label>
                    <input
                      className="w-full p-2.5 bg-[var(--bt-bg)] rounded-xl text-xs font-bold text-[var(--bt-primary)] outline-none"
                      value={editForm.nombre || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, nombre: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-[var(--bt-muted)] uppercase ml-2">
                      Apellidos
                    </label>
                    <input
                      className="w-full p-2.5 bg-[var(--bt-bg)] rounded-xl text-xs text-[var(--bt-primary)] outline-none"
                      value={editForm.apellidos || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, apellidos: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-bold text-[var(--bt-muted)] uppercase ml-2">
                    Teléfono
                  </label>
                  <input
                    className="w-full p-2.5 bg-[var(--bt-bg)] rounded-xl text-xs text-[var(--bt-primary)] outline-none"
                    value={editForm.telefono || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, telefono: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-bold text-[var(--bt-muted)] uppercase ml-2">
                    Email
                  </label>
                  <input
                    className="w-full p-2.5 bg-[var(--bt-bg)] rounded-xl text-xs text-[var(--bt-primary)] outline-none"
                    value={editForm.email || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-[var(--bt-primary)] text-white text-[9px] font-black py-2.5 rounded-xl uppercase tracking-widest shadow-md hover:bg-[var(--bt-primary-hover)]"
                  >
                    Actualizar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex-1 bg-white border border-[var(--bt-border)] text-[var(--bt-muted)] text-[9px] font-black py-2.5 rounded-xl uppercase"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-[var(--bt-border-strong)] uppercase tracking-tighter">
                      Cliente
                    </p>
                    <h4 className="font-bold text-[var(--bt-primary)] text-lg">
                      {client.nombre} {client.apellidos || ""}
                    </h4>
                  </div>
                  <div className="flex shrink-0 gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(client.id);
                        setEditForm({ ...client });
                      }}
                      className="p-2.5 bg-[var(--bt-bg)] text-[var(--bt-primary)] rounded-full text-xs hover:bg-[var(--bt-primary)] hover:text-white transition-all"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openDeleteModal(client)}
                      disabled={deletingId === client.id}
                      className="p-2.5 bg-[var(--bt-bg)] text-red-400 rounded-full hover:bg-red-50 hover:text-red-500 transition-all disabled:opacity-40"
                      title="Eliminar ficha"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>
                <div className="mt-4 space-y-1">
                  <p className="text-[11px] font-medium text-[var(--bt-muted)] flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 shrink-0 text-[var(--bt-icon)]" strokeWidth={2} />
                    {client.telefono}
                  </p>
                  {client.email && (
                    <p className="text-[11px] font-medium text-[var(--bt-muted)] flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 shrink-0 text-[var(--bt-icon)]" strokeWidth={2} />
                      {client.email}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SalonClientsView;
