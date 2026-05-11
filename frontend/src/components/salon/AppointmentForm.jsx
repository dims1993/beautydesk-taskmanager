import { useState, useEffect, useMemo, useRef } from "react";
import { useApi } from "../../hooks/useApi";
import {
  Sparkles,
  MessageCircle,
  User,
  Phone,
  Calendar,
  CheckCircle2,
  X,
  ChevronRight,
  Plus,
} from "lucide-react";
import { totalsForSelectedServiceIds } from "../../utils/appointmentServices";

const SWIPE_REVEAL_PX = 88;

/** True for phones / touch-first devices (swipe row). Desktop uses explicit "Quitar". */
function useTouchPrimaryUi() {
  const [touchPrimary, setTouchPrimary] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const noHover = window.matchMedia("(hover: none)");
    const apply = () => setTouchPrimary(coarse.matches || noHover.matches);
    apply();
    coarse.addEventListener("change", apply);
    noHover.addEventListener("change", apply);
    return () => {
      coarse.removeEventListener("change", apply);
      noHover.removeEventListener("change", apply);
    };
  }, []);
  return touchPrimary;
}

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

function normalizePhoneDigits(raw) {
  if (raw == null) return "";
  return String(raw).replace(/\D/g, "");
}

function findClientByPhoneInList(clientList, rawPhone) {
  const key = normalizePhoneDigits(rawPhone);
  if (!key || !Array.isArray(clientList)) return null;
  return (
    clientList.find((c) => normalizePhoneDigits(c?.telefono) === key) || null
  );
}

/** POST /clients/ cuando el teléfono ya existe (p. ej. lista `clients` aún no refrescada). */
function isDuplicateClientPhoneError(err) {
  const d =
    typeof err?.detail === "string"
      ? err.detail
      : Array.isArray(err?.detail)
        ? err.detail.map((x) => x?.msg || "").join(" ")
        : String(err?.message || "");
  const t = d.toLowerCase();
  return (
    t.includes("ya está registrado") ||
    t.includes("teléfono ya") ||
    (t.includes("already") && t.includes("phone"))
  );
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
  initialStaffId,
  clients = [],
  disabledReason = null,
  /** "sidebar" = sticky column in /app; "modal" = same UI inside overlay (no sticky). */
  variant = "sidebar",
}) => {
  const { apiRequest } = useApi();
  const [loading, setLoading] = useState(false);
  const [lastCreated, setLastCreated] = useState(null);

  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    client_phone: "",
    start_time: initialDate || "",
    staff_id: initialStaffId || currentUser?.id || "",
  });

  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [customEndEnabled, setCustomEndEnabled] = useState(false);
  const [customEndLocal, setCustomEndLocal] = useState("");

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
    setFormData((prev) => ({
      ...prev,
      start_time: initialDate || prev.start_time,
      staff_id: initialStaffId || prev.staff_id || currentUser?.id || "",
    }));
    setCustomEndEnabled(false);
    setCustomEndLocal("");
  }, [initialDate, initialStaffId, currentUser?.id]);

  useEffect(() => {
    if (!customEndEnabled) return;
    if (!formData.start_time) return;
    if (!serviceTotals.minutes) return;
    try {
      const start = new Date(formData.start_time);
      if (Number.isNaN(start.getTime())) return;
      const end = new Date(start.getTime() + serviceTotals.minutes * 60000);
      const pad = (n) => String(n).padStart(2, "0");
      const v = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
      setCustomEndLocal((prev) => prev || v);
    } catch {
      /* ignore */
    }
  }, [customEndEnabled, formData.start_time, serviceTotals.minutes]);

  const selectedServicesKey = selectedServiceIds.join(",");

  const touchPrimaryUi = useTouchPrimaryUi();
  const touchDragRef = useRef(null);
  const swipeXRef = useRef({});
  const [swipeXByIndex, setSwipeXByIndex] = useState({});
  const [swipeDraggingIndex, setSwipeDraggingIndex] = useState(null);

  swipeXRef.current = swipeXByIndex;

  useEffect(() => {
    setSwipeXByIndex({});
  }, [selectedServicesKey]);

  const handleSwipeTouchStart = (index, e) => {
    if (disabledReason || selectedServiceIds.length <= 1) return;
    const t = e.touches[0];
    if (!t) return;
    setSwipeDraggingIndex(index);
    touchDragRef.current = {
      index,
      startX: t.clientX,
      startOffset: swipeXRef.current[index] ?? -SWIPE_REVEAL_PX,
    };
  };

  const handleSwipeTouchMove = (index, e) => {
    const d = touchDragRef.current;
    if (!d || d.index !== index) return;
    const t = e.touches[0];
    if (!t) return;
    const delta = t.clientX - d.startX;
    const next = Math.min(0, Math.max(-SWIPE_REVEAL_PX, d.startOffset + delta));
    setSwipeXByIndex((s) => ({ ...s, [index]: next }));
  };

  const handleSwipeTouchEnd = (index) => {
    touchDragRef.current = null;
    setSwipeDraggingIndex(null);
    setSwipeXByIndex((s) => {
      const cur = s[index] ?? -SWIPE_REVEAL_PX;
      const snap = cur > -SWIPE_REVEAL_PX / 2 ? 0 : -SWIPE_REVEAL_PX;
      const next = {};
      selectedServiceIds.forEach((_, i) => {
        next[i] = i === index ? snap : -SWIPE_REVEAL_PX;
      });
      return next;
    });
  };

  const removeServiceLine = (index) => {
    setSelectedServiceIds((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    );
    setSwipeXByIndex({});
  };

  const selectClassName =
    "w-full min-w-0 border-0 bg-transparent py-5 text-base font-bold tracking-wider text-[var(--bt-primary)] outline-none focus:ring-0 cursor-pointer";

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
      const inputNameKey = (formData.client_name || "").trim().toLowerCase();
      const inputPhoneKey = normalizePhoneDigits(formData.client_phone);

      const existingClientByPhone = inputPhoneKey
        ? clients.find(
            (c) => normalizePhoneDigits(c?.telefono) === inputPhoneKey,
          )
        : null;

      const existingClientByName = inputNameKey
        ? clients.find(
            (c) =>
              `${c.nombre} ${c.apellidos || ""}`.trim().toLowerCase() ===
              inputNameKey,
          )
        : null;

      const existingClient = existingClientByPhone || existingClientByName;

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

        try {
          const newClient = await apiRequest("/clients/", "POST", {
            nombre,
            apellidos,
            telefono: formData.client_phone,
            email: formData.client_email || null,
          });
          finalClientId = newClient.id;
        } catch (clientErr) {
          if (!isDuplicateClientPhoneError(clientErr)) {
            throw clientErr;
          }
          const refreshed = await apiRequest("/clients/");
          const found = findClientByPhoneInList(
            Array.isArray(refreshed) ? refreshed : [],
            formData.client_phone,
          );
          if (!found?.id) {
            throw clientErr;
          }
          finalClientId = found.id;
        }
      } else if (existingClientByPhone && inputNameKey) {
        // If phone matches an existing client, keep data consistent (best-effort).
        const currentName =
          `${existingClient.nombre} ${existingClient.apellidos || ""}`
            .trim()
            .toLowerCase();
        if (currentName !== inputNameKey) {
          try {
            const nameParts = (formData.client_name || "").trim().split(" ");
            const nombre = nameParts[0] || existingClient.nombre;
            const apellidos = nameParts.slice(1).join(" ");
            await apiRequest(`/clients/${existingClient.id}`, "PATCH", {
              nombre,
              apellidos,
            });
          } catch {
            // Ignore: appointment creation must still proceed.
          }
        }
      }

      const payload = {
        client_name: formData.client_name,
        client_phone: formData.client_phone || null,
        client_email: formData.client_email || null,
        client_id: finalClientId,
        start_time: formData.start_time,
        end_time: customEndEnabled && customEndLocal ? customEndLocal : null,
        staff_id: formData.staff_id || currentUser?.id || 1,
        service_ids: selectedServiceIds.map((id) => parseInt(id, 10)),
      };

      await apiRequest("/appointments/", "POST", payload);

      setLastCreated({
        name: formData.client_name,
        phone: phoneForWhatsApp,
        startAt: formData.start_time,
      });

      // Misma persona, nueva cita: conservar contacto y profesional; solo pedir nueva fecha/hora.
      setFormData((prev) => ({
        ...prev,
        start_time: "",
        staff_id: prev.staff_id || String(currentUser?.id || ""),
      }));
      setCustomEndEnabled(false);
      setCustomEndLocal("");
      setSelectedServiceIds(
        services[0]?.id != null ? [String(services[0].id)] : [],
      );

      await Promise.resolve(onSuccess?.());
    } catch (err) {
      const detail =
        typeof err?.detail === "string"
          ? err.detail
          : Array.isArray(err?.detail)
            ? err.detail.map((x) => x?.msg || JSON.stringify(x)).join(" ")
            : err?.message;
      onError(detail || "Error al procesar la cita");
    } finally {
      setLoading(false);
    }
  };

  const isNewClient = (() => {
    const nameKey = (formData.client_name || "").trim().toLowerCase();
    const phoneKey = normalizePhoneDigits(formData.client_phone);
    if (phoneKey) {
      return !clients.some(
        (c) => normalizePhoneDigits(c?.telefono) === phoneKey,
      );
    }
    if (nameKey.length <= 2) return false;
    return !clients.some(
      (c) =>
        `${c.nombre} ${c.apellidos || ""}`.trim().toLowerCase() === nameKey,
    );
  })();

  const shellClass =
    variant === "modal"
      ? "min-w-0 max-w-full bg-white rounded-[3rem] shadow-2xl shadow-black/10 border border-[var(--bt-border)] overflow-x-clip overflow-y-visible transition-all duration-500"
      : "min-w-0 max-w-full bg-white rounded-[3rem] shadow-2xl shadow-black/10 border border-[var(--bt-border)] overflow-x-clip overflow-y-visible sticky top-8 z-40 transition-all duration-500";

  return (
    <div className={shellClass}>
      {/* Cabecera Editorial */}
      <div className="bg-[var(--bt-bg)] p-10 border-b border-[var(--bt-border)] text-center space-y-2 rounded-t-[3rem]">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--bt-muted)]">
          Concierge
        </p>
        <h2 className="text-3xl font-serif text-[var(--bt-primary)]">
          Reserva de <span className="italic opacity-80">Experiencias</span>
        </h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className={`min-w-0 max-w-full p-8 md:p-10 space-y-6 relative ${disabledReason ? "pointer-events-none opacity-50" : ""}`}
      >
        {disabledReason && (
          <div className="pointer-events-auto absolute inset-0 z-50 flex items-start justify-center pt-8 px-4 bg-white/80 backdrop-blur-[2px] rounded-b-[3rem]">
            <p className="text-center text-[10px] font-black uppercase tracking-widest text-[var(--bt-primary)] max-w-xs leading-relaxed border border-amber-200 bg-amber-50 rounded-2xl px-4 py-4">
              {disabledReason}
            </p>
          </div>
        )}
        {/* AVISO DE WHATSAPP (Rediseñado) */}
        {lastCreated && (
          <div className="p-6 bg-[var(--bt-accent)] rounded-3xl border border-[var(--bt-border)] animate-in fade-in slide-in-from-top-4 duration-500 relative">
            <button
              onClick={() => setLastCreated(null)}
              className="absolute top-4 right-4 text-[var(--bt-muted)] hover:text-[var(--bt-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="w-5 h-5 text-[var(--bt-primary)]" />
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--bt-primary)]">
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
              className="w-full py-4 bg-[var(--bt-primary)] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 hover:bg-[var(--bt-primary-hover)] transition-all"
            >
              <MessageCircle className="w-4 h-4" /> Enviar WhatsApp
            </button>
          </div>
        )}

        {/* Campo: Cliente */}
        <div className="space-y-3 relative">
          <label className="flex justify-between items-center px-2 text-[10px] font-black text-[var(--bt-muted)] uppercase tracking-[0.2em]">
            <span>Cliente</span>
            {isNewClient && (
              <span className="text-[#c4a484] flex items-center gap-1 font-black">
                <Sparkles className="w-3 h-3" /> Nuevo Cliente
              </span>
            )}
          </label>
          <div className="relative">
            <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--bt-icon)]" />
            <input
              required
              className="w-full min-w-0 pl-14 pr-6 py-5 bg-[var(--bt-bg)] border border-[var(--bt-border)] rounded-2xl outline-none focus:border-[var(--bt-primary)] focus:bg-white transition-all text-base font-bold tracking-wider text-[var(--bt-primary)] placeholder:text-[var(--bt-icon)]"
              placeholder="NOMBRE COMPLETO"
              value={formData.client_name}
              onChange={(e) =>
                setFormData({ ...formData, client_name: e.target.value })
              }
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-[60] w-full mt-2 bg-white border border-[var(--bt-border)] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              {suggestions.map((c, i) => (
                <div
                  key={i}
                  onClick={() => selectClientFromList(c)}
                  className="px-6 py-4 hover:bg-[var(--bt-bg)] cursor-pointer border-b border-black/5 last:border-0 flex justify-between items-center transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-[var(--bt-primary)] uppercase tracking-wider">
                      {c.nombre} {c.apellidos}
                    </span>
                    <span className="text-[9px] text-[var(--bt-muted)] font-medium tracking-[0.1em]">
                      {c.telefono}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--bt-border)]" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campo: Teléfono */}
        <div className="space-y-3">
          <label className="px-2 text-[10px] font-black text-[var(--bt-muted)] uppercase tracking-[0.2em]">
            Teléfono {isNewClient && "*"}
          </label>
          <div className="relative">
            <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--bt-icon)]" />
            <input
              required={isNewClient}
              className={`w-full min-w-0 pl-14 pr-6 py-5 border rounded-2xl outline-none transition-all text-base font-bold tracking-wider ${
                isNewClient
                  ? "bg-[#fdf8f3] border-[#c4a484]/30"
                  : "bg-[var(--bt-bg)] border-[var(--bt-border)]"
              } focus:border-[var(--bt-primary)]`}
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
            <label className="text-[10px] font-black text-[var(--bt-muted)] uppercase tracking-[0.2em]">
              Servicios
            </label>
            <button
              type="button"
              disabled={!!disabledReason || services.length === 0}
              onClick={() => {
                const fallback = services[0]?.id;
                if (fallback == null) return;
                setSelectedServiceIds((prev) => [...prev, String(fallback)]);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--bt-border)] bg-[var(--bt-bg)] text-[var(--bt-primary)] hover:border-[var(--bt-primary)] disabled:opacity-40"
              title="Añadir otro servicio"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
          <div className="space-y-2 min-w-0">
            {touchPrimaryUi && selectedServiceIds.length > 1 && (
              <p className="px-2 text-[9px] font-bold uppercase tracking-widest text-[var(--bt-muted)]">
                Desliza el servicio hacia la derecha para eliminarlo
              </p>
            )}
            {selectedServiceIds.map((sid, index) => {
              const offset = swipeXByIndex[index] ?? -SWIPE_REVEAL_PX;
              const canRemove =
                selectedServiceIds.length > 1 && !disabledReason;

              const selectEl = (
                <select
                  className={`${selectClassName} px-4 sm:px-6 ${touchPrimaryUi && canRemove ? "pr-4" : ""}`}
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
              );

              if (!touchPrimaryUi && canRemove) {
                return (
                  <div
                    key={`${sid}-${index}`}
                    className="flex min-w-0 w-full max-w-full items-stretch gap-2 rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] focus-within:border-[var(--bt-primary)] focus-within:bg-white"
                  >
                    <div className="min-w-0 flex-1">{selectEl}</div>
                    <button
                      type="button"
                      onClick={() => removeServiceLine(index)}
                      className="shrink-0 self-stretch px-4 text-[9px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 rounded-r-2xl"
                    >
                      Quitar
                    </button>
                  </div>
                );
              }

              if (!canRemove) {
                return (
                  <div
                    key={`${sid}-${index}`}
                    className="min-w-0 w-full rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] focus-within:border-[var(--bt-primary)] focus-within:bg-white"
                  >
                    {selectEl}
                  </div>
                );
              }

              return (
                <div
                  key={`${sid}-${index}`}
                  className="relative min-w-0 w-full max-w-full touch-pan-x overflow-hidden rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)]"
                >
                  <div
                    className="flex min-w-0 will-change-transform"
                    style={{
                      width: `calc(100% + ${SWIPE_REVEAL_PX}px)`,
                      transform: `translateX(${offset}px)`,
                      transition:
                        swipeDraggingIndex === index
                          ? "none"
                          : "transform 0.2s ease-out",
                    }}
                    onTouchStart={(e) => handleSwipeTouchStart(index, e)}
                    onTouchMove={(e) => handleSwipeTouchMove(index, e)}
                    onTouchEnd={() => handleSwipeTouchEnd(index)}
                    onTouchCancel={() => handleSwipeTouchEnd(index)}
                  >
                    <button
                      type="button"
                      onClick={() => removeServiceLine(index)}
                      className="flex w-[88px] shrink-0 items-center justify-center bg-red-500 px-1 text-[9px] font-black uppercase leading-tight tracking-tight text-white active:bg-red-600"
                    >
                      Eliminar
                    </button>
                    <div className="min-w-0 flex-1 border-l border-[var(--bt-border)] bg-[var(--bt-bg)]">
                      {selectEl}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {selectedServiceIds.length > 0 && services.length > 0 && (
            <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-[#c4a484]">
              Total estimado: {serviceTotals.minutes} min ·{" "}
              {serviceTotals.price}€
            </p>
          )}
        </div>

        {/* Horario: misma cáscara que Cliente / Teléfono (icono + pl-14) */}
        <div className="space-y-3">
          <label className="px-2 text-[10px] font-black text-[var(--bt-muted)] uppercase tracking-[0.2em]">
            Horario
          </label>
          <div className="relative min-w-0 w-full">
            <Calendar className="pointer-events-none absolute left-5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--bt-icon)]" />
            <input
              required
              type="datetime-local"
              className="appearance-none block w-full bg-[var(--bt-bg)] border border-[var(--bt-border)] rounded-2xl outline-none focus:border-[var(--bt-primary)] focus:bg-white transition-all text-base font-bold tracking-wider text-[var(--bt-primary)] [color-scheme:light] pl-14 pr-4 py-5 m-0 box-border [&::-webkit-datetime-edit]:flex [&::-webkit-datetime-edit-fields-wrapper]:p-0 [&::-webkit-datetime-edit-text]:p-0"
              style={{
                fontSize: "16px", // Evita el zoom automático en iOS
                minWidth: "0", // Fuerza a que pueda encogerse
              }}
              value={formData.start_time}
              onChange={(e) =>
                setFormData({ ...formData, start_time: e.target.value })
              }
            />
          </div>
        </div>

        {/* Optional end time override */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-2">
            <label className="text-[10px] font-black text-[var(--bt-muted)] uppercase tracking-[0.2em]">
              Tiempo fin (opcional)
            </label>
            <button
              type="button"
              onClick={() => {
                setCustomEndEnabled((s) => !s);
                if (customEndEnabled) setCustomEndLocal("");
              }}
              className="text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] underline decoration-1 underline-offset-4"
            >
              {customEndEnabled ? "Quitar fin" : "Añadir fin"}
            </button>
          </div>
          {customEndEnabled ? (
            <div className="relative min-w-0 w-full">
              <Calendar className="pointer-events-none absolute left-5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--bt-icon)]" />
              <input
                type="datetime-local"
                value={customEndLocal}
                onChange={(e) => setCustomEndLocal(e.target.value)}
                className="appearance-none block w-full bg-[var(--bt-bg)] border border-[var(--bt-border)] rounded-2xl outline-none focus:border-[var(--bt-primary)] focus:bg-white transition-all text-base font-bold tracking-wider text-[var(--bt-primary)] [color-scheme:light] pl-14 pr-4 py-5 m-0 box-border [&::-webkit-datetime-edit]:flex [&::-webkit-datetime-edit-fields-wrapper]:p-0 [&::-webkit-datetime-edit-text]:p-0"
                style={{
                  fontSize: "16px",
                  minWidth: "0",
                }}
              />
            </div>
          ) : null}
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
          className="w-full py-6 mt-4 bg-[var(--bt-primary)] text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.4em] shadow-xl shadow-black/10 disabled:opacity-50 transition-all hover:bg-[var(--bt-primary-hover)] active:scale-[0.98]"
        >
          {loading ? "PROCESANDO..." : "CONFIRMAR CITA"}
        </button>
      </form>
    </div>
  );
};

export default AppointmentForm;
