import React, { useMemo, useState } from "react";
import { X, Sunrise, MessageCircle, ExternalLink } from "lucide-react";
import { serviceNamesForAppointment } from "../../utils/appointmentServices";
import { buildWaMeUrl, normalizePhoneForWhatsApp } from "../../utils/whatsapp";

function formatTimeEs(isoOrString) {
  const d = new Date(isoOrString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function startOfTodayKey() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString().slice(0, 10);
}

function greetingForNow() {
  const h = new Date().getHours();
  if (h >= 20) return "Buenas noches";
  if (h >= 13) return "Buenas tardes";
  return "Buenos días";
}

function buildReminderText(appo, services, currentUser) {
  const greet = greetingForNow();
  const salon = (currentUser?.organization_name || "").trim();
  const where = salon || "nuestro salón";
  const time = formatTimeEs(appo.start_time) || "hoy";
  const svcs = serviceNamesForAppointment(appo, services).join(" + ");
  const client = (appo.client_name || "").trim() || "Hola";
  return `${greet} ${client}. Te recordamos tu cita hoy a las ${time} para ${svcs} en ${where}. Si necesitas cambiarla, responde a este mensaje.`;
}

export default function MorningWhatsAppRemindersModal({
  isOpen,
  onClose,
  appointmentsToday = [],
  services = [],
  currentUser = null,
}) {
  const [step, setStep] = useState("prompt"); // prompt | list
  const greet = useMemo(() => greetingForNow(), []);

  const todayKey = useMemo(() => startOfTodayKey(), []);

  const rows = useMemo(() => {
    const safe = Array.isArray(appointmentsToday) ? appointmentsToday : [];
    return safe
      .map((a) => {
        const phoneDigits = normalizePhoneForWhatsApp(a?.client_phone || "");
        const text = buildReminderText(a, services, currentUser);
        const url = buildWaMeUrl({ phoneDigits, text });
        return {
          id: a?.id,
          name: a?.client_name || "Cliente",
          time: formatTimeEs(a?.start_time),
          phoneDigits,
          url,
        };
      })
      .filter((r) => r.id != null);
  }, [appointmentsToday, services, currentUser]);

  const count = rows.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-6">
      <div
        className="absolute inset-0 bg-[var(--bt-primary)]/20 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div className="relative w-full min-w-0 max-w-lg rounded-[3rem] border border-[var(--bt-border)] bg-white overflow-x-clip overflow-y-visible shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <div className="p-8 md:p-10 min-w-0">
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[var(--bt-muted)]">
                Recordatorios
              </p>
              <h3 className="text-2xl font-serif text-[var(--bt-primary)] flex items-center gap-2">
                <Sunrise className="w-5 h-5 text-[#c4a484]" />
                {greet}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="h-10 w-10 flex items-center justify-center hover:bg-[var(--bt-bg)] rounded-full transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5 text-[var(--bt-muted)]" />
            </button>
          </div>

          {step === "prompt" ? (
            <div className="space-y-6">
              <div className="rounded-[2.5rem] border border-[var(--bt-border)] bg-[var(--bt-bg)] p-6">
                <p className="text-sm font-bold text-[var(--bt-primary)]">
                  Hoy tienes{" "}
                  <span className="font-black text-[#c4a484]">{count}</span>{" "}
                  {count === 1 ? "cita" : "citas"}.
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--bt-muted)]">
                  ¿Te gustaría preparar los recordatorios por WhatsApp ahora?
                  Abriremos WhatsApp con el texto listo para que tú solo confirmes
                  el envío.
                </p>
                <p className="mt-3 text-[9px] font-black uppercase tracking-widest text-[var(--bt-muted)]">
                  {todayKey}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setStep("list")}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--bt-primary)] text-white py-4 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[var(--bt-primary-hover)] transition-all"
                >
                  <MessageCircle className="w-4 h-4" />
                  Sí, preparar WhatsApp
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 inline-flex items-center justify-center rounded-2xl bg-white border border-[var(--bt-border)] py-4 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--bt-muted)] hover:border-[var(--bt-border-strong)] transition-all"
                >
                  No, gracias
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-[2.5rem] border border-[var(--bt-border)] bg-[var(--bt-bg)] p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--bt-primary)]">
                  Recordatorios de hoy
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--bt-muted)]">
                  Pulsa en cada cita para abrir WhatsApp con el mensaje listo.
                </p>
              </div>

              <div className="space-y-3 max-h-[55vh] overflow-auto pr-1">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-3xl border border-[var(--bt-border)] bg-white p-5 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--bt-muted)]">
                        {r.time || "Hoy"}
                      </p>
                      <p className="font-bold text-[var(--bt-primary)] truncate">
                        {r.name}
                      </p>
                      {!r.phoneDigits && (
                        <p className="mt-1 text-[10px] font-bold text-red-600">
                          Falta un teléfono válido en la cita.
                        </p>
                      )}
                    </div>
                    <a
                      href={r.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`shrink-0 inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] ${
                        r.url
                          ? "bg-[var(--bt-primary)] text-white hover:bg-[var(--bt-primary-hover)]"
                          : "bg-[var(--bt-accent)] text-[var(--bt-muted)] cursor-not-allowed pointer-events-none"
                      }`}
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir
                    </a>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full inline-flex items-center justify-center rounded-2xl bg-white border border-[var(--bt-border)] py-4 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--bt-muted)] hover:border-[var(--bt-border-strong)] transition-all"
              >
                Listo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

