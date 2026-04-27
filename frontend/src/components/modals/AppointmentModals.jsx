import React, { useState, useEffect } from "react";
import {
  X,
  Fingerprint,
  CreditCard,
  Banknote,
  CheckCircle2,
  Archive,
  Timer,
  Layers,
  Trash2,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";

function toDatetimeLocalValue(isoOrString) {
  if (!isoOrString) return "";
  const d = new Date(isoOrString);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatApiError(err) {
  if (!err || typeof err !== "object") return "No se pudo guardar.";
  const { detail } = err;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((x) => x.msg || JSON.stringify(x)).join(" ");
  }
  return err.message || "No se pudo guardar.";
}

// --- COMPONENTE BASE PARA EL BACKDROP Y CONTENEDOR ---
const ModalWrapper = ({ isOpen, onClose, children, title, subtitle }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
      <div
        className="absolute inset-0 bg-[var(--bt-primary)]/20 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div className="relative w-full min-w-0 max-w-md rounded-[3rem] border border-[var(--bt-border)] bg-white overflow-x-clip overflow-y-visible shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <div className="p-8 md:p-10 min-w-0">
          <div className="flex justify-between items-start mb-8">
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[var(--bt-muted)]">
                {subtitle}
              </p>
              <h3 className="text-2xl font-serif text-[var(--bt-primary)]">
                {title}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="h-10 w-10 flex items-center justify-center hover:bg-[var(--bt-bg)] rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-[var(--bt-muted)]" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

/* --- 1. MODAL DE PAGO (REDISEÑADO) --- */
export const PaymentModal = ({ isOpen, onClose, appointment, onConfirm }) => {
  const { apiRequest } = useApi();
  const [price, setPrice] = useState(0);
  const [method, setMethod] = useState("efectivo");
  const [quickNote, setQuickNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState("");

  useEffect(() => {
    if (appointment) setPrice(appointment.price || 0);
  }, [appointment]);

  useEffect(() => {
    if (!isOpen) return;
    setQuickNote("");
    setNoteSaving(false);
    setNoteError("");
  }, [isOpen, appointment?.id]);

  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onClose}
      title="Cerrar Ticket"
      subtitle="Finalizar"
    >
      <div className="space-y-8">
        <div className="p-6 bg-[var(--bt-bg)] rounded-[2rem] border border-[var(--bt-border)] flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center shadow-sm">
            <Fingerprint className="w-5 h-5 text-[var(--bt-primary)]" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--bt-muted)]">
              Cliente
            </p>
            <p className="text-sm font-bold text-[var(--bt-primary)] uppercase tracking-widest">
              {appointment?.client_name}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <label className="px-2 text-[9px] font-black text-[var(--bt-muted)] uppercase tracking-[0.3em]">
              Importe Final
            </label>
            <div className="relative">
              <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[var(--bt-primary)] font-bold text-sm">
                €
              </span>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full min-w-0 pl-12 pr-6 py-5 bg-[var(--bt-bg)] border-b border-[var(--bt-border)] outline-none focus:border-[var(--bt-primary)] text-base font-bold tracking-wide text-[var(--bt-primary)] transition-all"
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="px-2 text-[9px] font-black text-[var(--bt-muted)] uppercase tracking-[0.3em]">
              Método de Pago
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setMethod("efectivo")}
                className={`flex flex-col items-center gap-3 p-6 rounded-3xl border transition-all ${method === "efectivo" ? "bg-[var(--bt-primary)] border-[var(--bt-primary)] text-white shadow-lg" : "bg-white border-[var(--bt-border)] text-[var(--bt-muted)] hover:border-[var(--bt-primary)]"}`}
              >
                <Banknote className="w-5 h-5" />
                <span className="text-[9px] font-black uppercase tracking-widest">
                  Efectivo
                </span>
              </button>
              <button
                onClick={() => setMethod("tarjeta")}
                className={`flex flex-col items-center gap-3 p-6 rounded-3xl border transition-all ${method === "tarjeta" ? "bg-[var(--bt-primary)] border-[var(--bt-primary)] text-white shadow-lg" : "bg-white border-[var(--bt-border)] text-[var(--bt-muted)] hover:border-[var(--bt-primary)]"}`}
              >
                <CreditCard className="w-5 h-5" />
                <span className="text-[9px] font-black uppercase tracking-widest">
                  Tarjeta
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-[var(--bt-border)] bg-[var(--bt-bg)] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--bt-muted)] mb-2">
            Nota rápida (opcional)
          </p>
          <textarea
            value={quickNote}
            onChange={(e) => setQuickNote(e.target.value)}
            rows={3}
            placeholder="Ej. Prefiere uñas cortas, alergia, color habitual…"
            className="w-full rounded-2xl border border-[var(--bt-border)] bg-white px-4 py-3 text-[11px] text-[var(--bt-primary)] outline-none focus:border-[var(--bt-primary)]"
          />
          {!!noteError && (
            <p className="mt-2 text-[10px] font-bold text-red-600">{noteError}</p>
          )}
          <p className="mt-2 text-[10px] text-[var(--bt-muted)]">
            Esta nota aparecerá también en <strong>Contactos</strong> →{" "}
            <strong>Notas</strong>.
          </p>
        </div>

        <button
          onClick={async () => {
            const txt = String(quickNote || "").trim();
            const clientId = appointment?.client_id;
            setNoteError("");
            if (txt && clientId) {
              setNoteSaving(true);
              try {
                await apiRequest(`/clients/${clientId}/notes`, "POST", { text: txt });
              } catch (err) {
                setNoteSaving(false);
                setNoteError(formatApiError(err));
                return;
              } finally {
                setNoteSaving(false);
              }
            }
            onConfirm(appointment.id, price, method);
          }}
          disabled={noteSaving}
          className="w-full py-6 bg-[var(--bt-primary)] text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.4em] shadow-xl hover:bg-[var(--bt-primary-hover)] transition-all flex items-center justify-center gap-3"
        >
          {noteSaving ? "Guardando…" : "Confirmar Pago"}{" "}
          <CheckCircle2 className="w-4 h-4" />
        </button>
      </div>
    </ModalWrapper>
  );
};

/* --- 2. MODAL DE EDICIÓN --- */
export const EditAppointmentModal = ({
  isOpen,
  onClose,
  appointment,
  services = [],
  onSaved,
}) => {
  const { apiRequest } = useApi();
  const [serviceId, setServiceId] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!isOpen || !appointment) return;
    setServiceId(String(appointment.service_id ?? ""));
    setStartLocal(toDatetimeLocalValue(appointment.start_time));
    setFormError(null);
  }, [isOpen, appointment?.id, appointment?.service_id, appointment?.start_time]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!appointment?.id || !startLocal) return;

    setSaving(true);
    setFormError(null);
    try {
      await apiRequest(`/appointments/${appointment.id}`, "PATCH", {
        service_id: Number(serviceId),
        start_time: startLocal,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setFormError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onClose}
      title="Modificar Cita"
      subtitle="Ajustes"
    >
      <form className="min-w-0 space-y-8" onSubmit={handleSubmit}>
        {appointment?.client_name && (
          <p className="text-[11px] font-bold text-[var(--bt-primary)] px-1">
            {appointment.client_name}
          </p>
        )}

        <div className="space-y-6">
          <div className="relative group">
            <label className="px-1 text-[9px] font-black text-[var(--bt-muted)] uppercase tracking-[0.3em] block mb-2">
              Servicio
            </label>
            <div className="relative">
              <Layers className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--bt-icon)]" />
              <select
                required
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full min-w-0 max-w-full pl-8 py-4 bg-transparent border-b border-[var(--bt-border)] outline-none text-base font-bold tracking-wide text-[var(--bt-primary)] appearance-none"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative group">
            <label className="px-1 text-[9px] font-black text-[var(--bt-muted)] uppercase tracking-[0.3em] block mb-2">
              Fecha y hora
            </label>
            <div className="relative min-w-0 w-full max-w-full">
              <Timer className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 shrink-0 text-[var(--bt-icon)] pointer-events-none" />
              <input
                type="datetime-local"
                required
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                className="box-border w-full min-w-0 max-w-full pl-8 py-4 bg-transparent border-b border-[var(--bt-border)] outline-none text-base font-bold tracking-wide text-[var(--bt-primary)] [color-scheme:light]"
              />
            </div>
          </div>
        </div>

        {formError && (
          <p className="text-[11px] text-red-500 font-medium px-1">{formError}</p>
        )}

        <button
          type="submit"
          disabled={saving || !appointment?.id}
          className="w-full py-6 bg-[var(--bt-primary)] text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.4em] shadow-xl transition-all disabled:opacity-50 hover:bg-[var(--bt-primary-hover)]"
        >
          {saving ? "Guardando…" : "Guardar Cambios"}
        </button>
      </form>
    </ModalWrapper>
  );
};

/* --- 3. MODAL DE ARCHIVO --- */
export const ArchiveAppointmentModal = ({ isOpen, onClose, onConfirm }) => {
  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onClose}
      title="Archivar Registro"
      subtitle="Precaución"
    >
      <div className="text-center space-y-8">
        <div className="flex justify-center">
          <div className="h-24 w-24 bg-red-50 rounded-full flex items-center justify-center animate-pulse">
            <Archive className="w-10 h-10 text-red-400" />
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-[var(--bt-primary)] font-serif text-xl italic">
            ¿Retirar de la agenda?
          </p>
          <p className="text-[var(--bt-muted)] text-[11px] font-medium leading-relaxed px-4 uppercase tracking-tighter">
            La cita dejará de ser visible en el calendario actual y se moverá al
            archivo histórico.
          </p>
        </div>
        <div className="flex flex-col gap-3 pt-4">
          <button
            onClick={onConfirm}
            className="w-full py-6 bg-red-400 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] hover:bg-red-500 transition-all"
          >
            Confirmar Archivo
          </button>
          <button
            onClick={onClose}
            className="w-full py-4 text-[var(--bt-muted)] font-black uppercase text-[9px] tracking-[0.2em] hover:text-[var(--bt-primary)]"
          >
            Mantener Reserva
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
};

/* --- Confirmar eliminación de ficha de cliente (directorio) --- */
export const DeleteClientConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  clientLabel = "",
  isDeleting = false,
}) => {
  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={isDeleting ? () => {} : onClose}
      title="Eliminar contacto"
      subtitle="Precaución"
    >
      <div className="text-center space-y-8">
        <div className="flex justify-center">
          <div className="h-24 w-24 bg-red-50 rounded-full flex items-center justify-center animate-pulse">
            <Trash2 className="w-10 h-10 text-red-400" strokeWidth={1.75} />
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-[var(--bt-primary)] font-serif text-xl italic">
            ¿Eliminar esta ficha del directorio?
          </p>
          {clientLabel ? (
            <p className="text-[var(--bt-primary)] text-sm font-black tracking-wide px-2">
              {clientLabel}
            </p>
          ) : null}
          <p className="text-[var(--bt-muted)] text-[11px] font-medium leading-relaxed px-4 uppercase tracking-tighter">
            Las citas guardadas no se borran; solo se quita el enlace entre esas
            citas y este contacto.
          </p>
        </div>
        <div className="flex flex-col gap-3 pt-4">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="w-full py-6 bg-red-400 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] hover:bg-red-500 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {isDeleting ? "Eliminando…" : "Confirmar eliminación"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="w-full py-4 text-[var(--bt-muted)] font-black uppercase text-[9px] tracking-[0.2em] hover:text-[var(--bt-primary)] disabled:opacity-40"
          >
            Conservar ficha
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
};
