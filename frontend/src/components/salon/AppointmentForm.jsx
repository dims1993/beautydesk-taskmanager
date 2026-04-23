import { useState, useEffect, useMemo } from "react";
import { useApi } from "../../hooks/useApi";
import {
  Sparkles,
  MessageCircle,
  User,
  Phone,
  CheckCircle2,
  X,
  ChevronRight,
  Plus,
  Minus,
} from "lucide-react";
import { totalsForSelectedServiceIds } from "../../utils/appointmentServices";

/**
 * Digits-only international number for wa.me (no leading +).
 * Handles Spanish 9-digit numbers, +34 / 0034, avoids double country code.
 */
function normalizePhoneForWhatsApp(raw) {
  if (raw == null || typeof raw !== "string") return "";
  let d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0034") && d.length >= 12) {
    d = "34" + d.slice(4);
  }
  if (d.startsWith("34") && d.length >= 11) return d;
  if (d.length === 9 && /^[6789]\d{8}$/.test(d)) return `34${d}`;
  if (d.length < 10 || d.length > 15) return "";
  return d;
}

/** Text for wa.me after creating an appointment (salon + billing address from profile). */
function buildAppointmentWhatsAppText(clientName, startAt, currentUser) {
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime())) return "";
  const datePart = d.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const salon = (currentUser?.organization_name || "").trim();
  const address = [
    currentUser?.organization_billing_address_line1,
    currentUser?.organization_billing_address_line2,
    currentUser?.organization_city,
  ]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(", ");
  const where = [salon, address].filter(Boolean).join(" ").trim();
  const at = where || "nuestro salón";
  return `Hola ${clientName}, te confirmo tu cita en ${at} para el ${datePart}, ${timePart}. ¡Te esperamos!`;
}

const AppointmentForm = ({
  services,
  currentUser,
  onSuccess,
  onError,
  initialDate,
  clients = [],
  disabledReason = null,
}) => {
  const { apiRequest } = useApi();
  const [loading, setLoading] = useState(false);
  const [lastCreated, setLastCreated] = useState(null);

  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    client_phone: "",
    start_time: initialDate || "",
    staff_id: currentUser?.id || "",
  });

  const [selectedServiceIds, setSelectedServiceIds] = useState([]);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (services.length === 0) {
      setSelectedServiceIds([]);
      return;
    }
    setSelectedServiceIds((prev) => {
      const valid = prev.filter((id) =>
        services.some((s) => String(s.id) === String(id)),
      );
      if (valid.length > 0) return valid;
      return [String(services[0].id)];
    });
  }, [services]);

  const serviceTotals = useMemo(
    () => totalsForSelectedServiceIds(selectedServiceIds, services),
    [selectedServiceIds, services],
  );

  useEffect(() => {
    if (formData.client_name.length > 1) {
      const filtered = clients.filter((c) =>
        `${c.nombre} ${c.apellidos || ""}`
          .toLowerCase()
          .includes(formData.client_name.toLowerCase()),
      );
      setSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [formData.client_name, clients]);

  const selectClientFromList = (client) => {
    setFormData({
      ...formData,
      client_name: `${client.nombre} ${client.apellidos || ""}`.trim(),
      client_email: client.email || "",
      client_phone: client.telefono || "",
    });
    setShowSuggestions(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (disabledReason) {
      onError?.(disabledReason);
      return;
    }
    setLoading(true);
    setLastCreated(null);

    try {
      const existingClient = clients.find(
        (c) =>
          `${c.nombre} ${c.apellidos || ""}`.trim().toLowerCase() ===
          formData.client_name.toLowerCase(),
      );

      let finalClientId = existingClient?.id || null;
      const phoneForWhatsApp = (
        (formData.client_phone || "").trim() ||
        (existingClient?.telefono || "").trim()
      ).trim();

      if (!existingClient) {
        if (!formData.client_phone) {
          throw { detail: "El teléfono es obligatorio para clientes nuevos" };
        }
        const nameParts = formData.client_name.split(" ");
        const nombre = nameParts[0];
        const apellidos = nameParts.slice(1).join(" ");

        const newClient = await apiRequest("/clients/", "POST", {
          nombre,
          apellidos,
          telefono: formData.client_phone,
          email: formData.client_email || null,
        });

        finalClientId = newClient.id;
      }

      const payload = {
        client_name: formData.client_name,
        client_phone: formData.client_phone || null,
        client_email: formData.client_email || null,
        client_id: finalClientId,
        start_time: formData.start_time,
        staff_id: formData.staff_id || currentUser?.id || 1,
        service_ids: selectedServiceIds.map((id) => parseInt(id, 10)),
      };

      await apiRequest("/appointments/", "POST", payload);

      setLastCreated({
        name: formData.client_name,
        phone: phoneForWhatsApp,
        startAt: formData.start_time,
      });

      setFormData({
        client_name: "",
        client_email: "",
        client_phone: "",
        start_time: "",
      });
      setSelectedServiceIds(
        services[0]?.id != null ? [String(services[0].id)] : [],
      );

      onSuccess();
    } catch (err) {
      onError(err.detail || "Error al procesar la cita");
    } finally {
      setLoading(false);
    }
  };

  const isNewClient =
    formData.client_name.length > 2 &&
    !clients.some(
      (c) =>
        `${c.nombre} ${c.apellidos || ""}`.trim().toLowerCase() ===
        formData.client_name.toLowerCase(),
    );

  return (
    <div className="min-w-0 max-w-full bg-white rounded-[3rem] shadow-2xl shadow-[#5d5045]/10 border border-[#eaddcf] overflow-x-clip overflow-y-visible sticky top-8 z-40 transition-all duration-500">
      {/* Cabecera Editorial */}
      <div className="bg-[#FAF9F6] p-10 border-b border-[#eaddcf] text-center space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#8c857d]">
          Concierge
        </p>
        <h2 className="text-3xl font-serif text-[#5d5045]">
          Reserva de <span className="italic opacity-80">Experiencias</span>
        </h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className={`min-w-0 max-w-full p-8 md:p-10 space-y-6 relative ${disabledReason ? "pointer-events-none opacity-50" : ""}`}
      >
        {disabledReason && (
          <div className="pointer-events-auto absolute inset-0 z-50 flex items-start justify-center pt-8 px-4 bg-white/80 backdrop-blur-[2px] rounded-b-[3rem]">
            <p className="text-center text-[10px] font-black uppercase tracking-widest text-[#5d5045] max-w-xs leading-relaxed border border-amber-200 bg-amber-50 rounded-2xl px-4 py-4">
              {disabledReason}
            </p>
          </div>
        )}
        {/* AVISO DE WHATSAPP (Rediseñado) */}
        {lastCreated && (
          <div className="p-6 bg-[#f5f1ed] rounded-3xl border border-[#eaddcf] animate-in fade-in slide-in-from-top-4 duration-500 relative">
            <button
              onClick={() => setLastCreated(null)}
              className="absolute top-4 right-4 text-[#8c857d] hover:text-[#5d5045]"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="w-5 h-5 text-[#5d5045]" />
              <p className="text-[10px] font-black uppercase tracking-widest text-[#5d5045]">
                Confirmación Lista
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const msg = buildAppointmentWhatsAppText(
                  lastCreated.name,
                  lastCreated.startAt,
                  currentUser,
                );
                const waDigits = normalizePhoneForWhatsApp(lastCreated.phone);
                if (!waDigits) {
                  onError?.(
                    "No hay un teléfono válido para WhatsApp. Si es un cliente existente, edítalo en Clientes y añade el móvil.",
                  );
                  return;
                }
                window.open(
                  `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}`,
                  "_blank",
                  "noopener,noreferrer",
                );
                setLastCreated(null);
              }}
              className="w-full py-4 bg-[#5d5045] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 hover:bg-[#4a3f36] transition-all"
            >
              <MessageCircle className="w-4 h-4" /> Enviar WhatsApp
            </button>
          </div>
        )}

        {/* Campo: Cliente */}
        <div className="space-y-3 relative">
          <label className="flex justify-between items-center px-2 text-[10px] font-black text-[#8c857d] uppercase tracking-[0.2em]">
            <span>Cliente</span>
            {isNewClient && (
              <span className="text-[#c4a484] flex items-center gap-1 font-black">
                <Sparkles className="w-3 h-3" /> Nuevo Cliente
              </span>
            )}
          </label>
          <div className="relative">
            <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5]" />
            <input
              required
              className="w-full min-w-0 pl-14 pr-6 py-5 bg-[#FAF9F6] border border-[#eaddcf] rounded-2xl outline-none focus:border-[#5d5045] focus:bg-white transition-all text-base font-bold tracking-wider text-[#5d5045] placeholder:text-[#c4bdb5]"
              placeholder="NOMBRE COMPLETO"
              value={formData.client_name}
              onChange={(e) =>
                setFormData({ ...formData, client_name: e.target.value })
              }
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-[60] w-full mt-2 bg-white border border-[#eaddcf] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              {suggestions.map((c, i) => (
                <div
                  key={i}
                  onClick={() => selectClientFromList(c)}
                  className="px-6 py-4 hover:bg-[#FAF9F6] cursor-pointer border-b border-[#f5f1ed] last:border-0 flex justify-between items-center transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-[#5d5045] uppercase tracking-wider">
                      {c.nombre} {c.apellidos}
                    </span>
                    <span className="text-[9px] text-[#8c857d] font-medium tracking-[0.1em]">
                      {c.telefono}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#eaddcf]" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campo: Teléfono */}
        <div className="space-y-3">
          <label className="px-2 text-[10px] font-black text-[#8c857d] uppercase tracking-[0.2em]">
            Teléfono {isNewClient && "*"}
          </label>
          <div className="relative">
            <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5]" />
            <input
              required={isNewClient}
              className={`w-full min-w-0 pl-14 pr-6 py-5 border rounded-2xl outline-none transition-all text-base font-bold tracking-wider ${isNewClient ? "bg-[#fdf8f3] border-[#c4a484]/30" : "bg-[#FAF9F6] border-[#eaddcf]"} focus:border-[#5d5045]`}
              placeholder="600 000 000"
              value={formData.client_phone}
              onChange={(e) =>
                setFormData({ ...formData, client_phone: e.target.value })
              }
            />
          </div>
        </div>

        {/* Servicios (varias líneas) + resumen duración / precio */}
        <div className="min-w-0 w-full max-w-full space-y-3 overflow-x-clip">
          <div className="flex items-center justify-between gap-2 px-2">
            <label className="text-[10px] font-black text-[#8c857d] uppercase tracking-[0.2em]">
              Servicios
            </label>
            <button
              type="button"
              disabled={!!disabledReason || services.length === 0}
              onClick={() => {
                const fallback = services[0]?.id;
                if (fallback == null) return;
                setSelectedServiceIds((prev) => [
                  ...prev,
                  String(fallback),
                ]);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#eaddcf] bg-[#FAF9F6] text-[#5d5045] hover:border-[#5d5045] disabled:opacity-40"
              title="Añadir otro servicio"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
          <div className="space-y-2 min-w-0">
            {selectedServiceIds.map((sid, index) => (
              <div
                key={`${sid}-${index}`}
                className="flex min-w-0 w-full max-w-full items-stretch gap-2"
              >
                <select
                  className="min-w-0 flex-1 max-w-full box-border px-4 py-5 sm:px-6 bg-[#FAF9F6] border border-[#eaddcf] rounded-2xl outline-none cursor-pointer text-base font-bold tracking-wider text-[#5d5045] appearance-none focus:border-[#5d5045] transition-all"
                  value={sid}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedServiceIds((prev) => {
                      const next = [...prev];
                      next[index] = v;
                      return next;
                    });
                  }}
                  required
                >
                  {services.length === 0 ? (
                    <option value="">Sin servicios — Ajustes</option>
                  ) : (
                    services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name.toUpperCase()} · {s.duration} min · {s.price}€
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  disabled={
                    !!disabledReason || selectedServiceIds.length <= 1
                  }
                  onClick={() =>
                    setSelectedServiceIds((prev) =>
                      prev.length <= 1
                        ? prev
                        : prev.filter((_, i) => i !== index),
                    )
                  }
                  className="shrink-0 flex h-auto w-11 items-center justify-center rounded-2xl border border-[#eaddcf] bg-white text-[#a39485] hover:border-red-200 hover:text-red-500 disabled:opacity-40"
                  title="Quitar servicio"
                >
                  <Minus className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
          {selectedServiceIds.length > 0 && services.length > 0 && (
            <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-[#c4a484]">
              Total estimado: {serviceTotals.minutes} min ·{" "}
              {serviceTotals.price}€
            </p>
          )}
        </div>

        {/* Horario: ancho completo, mismo padding que el resto (iOS / Safari) */}
        <div className="min-w-0 w-full max-w-full space-y-3 overflow-x-clip">
          <label className="px-2 text-[10px] font-black text-[#8c857d] uppercase tracking-[0.2em]">
            Horario
          </label>
          <input
            required
            type="datetime-local"
            className="block box-border w-full min-w-0 max-w-full px-4 py-5 sm:px-6 bg-[#FAF9F6] border border-[#eaddcf] rounded-2xl outline-none text-base font-bold tracking-wide text-[#5d5045] focus:border-[#5d5045] transition-all [color-scheme:light]"
            style={{ fontSize: "16px" }}
            value={formData.start_time}
            onChange={(e) =>
              setFormData({ ...formData, start_time: e.target.value })
            }
          />
        </div>

        {/* Botón de Acción Principal */}
        <button
          type="submit"
          disabled={
            loading ||
            !!disabledReason ||
            services.length === 0 ||
            selectedServiceIds.length === 0
          }
          className="w-full py-6 mt-4 bg-[#5d5045] text-[#f5ebe0] rounded-2xl font-black uppercase text-[11px] tracking-[0.4em] shadow-xl shadow-[#5d5045]/20 disabled:opacity-50 transition-all hover:bg-[#4a3f36] active:scale-[0.98]"
        >
          {loading ? "PROCESANDO..." : "CONFIRMAR CITA"}
        </button>
      </form>
    </div>
  );
};

export default AppointmentForm;
