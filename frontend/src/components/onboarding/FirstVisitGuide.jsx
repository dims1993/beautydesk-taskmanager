import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import {
  BarChart3,
  Calendar,
  ChevronRight,
  Clock,
  Lock,
  Settings,
  Sparkles,
  UserSquare2,
  X,
  Scissors,
  CircleCheck,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";

const STATS_INTRO = {
  stepKey: "stats_intro",
  tabId: "stats",
  icon: BarChart3,
  title: "Estadísticas",
  body: (
    <>
      Aquí podrás revisar <strong>gráficos e indicadores</strong> del salón, la{" "}
      <strong>caja diaria</strong> y el informe mensual. Conforme deslices hacia
      abajo tendrás un histórico de tu progreso y las citas archivadas.{" "}
      <strong>histórico</strong> y las citas archivadas.
    </>
  ),
};

const CASH_PASSWORD_STEP = {
  stepKey: "cash_password",
  kind: "cash_password",
  tabId: "stats",
  icon: Lock,
  title: "Contraseña de cierre de caja",
  body: (
    <>
      Como titular, necesito que definas una contraseña que servirá para{" "}
      <strong>confirmar el cierre de caja</strong> en esta misma sección. Todo
      el equipo la usará al cerrar la caja del día.
    </>
  ),
};

const BASE_TOUR = [
  {
    stepKey: "agenda",
    tabId: "agenda",
    icon: Clock,
    title: "Agenda y reservas",
    body: (
      <>
        Bienvenido a tu <strong>Agenda</strong> de reservas: en Reserva de
        Experiencias puedes crear <strong>nuevas reservas</strong>; una vez
        registrada una nueva experiencia en el apartado inferior podrás ver las{" "}
        <strong>citas próximas de la semana</strong>. Es será tu vista diaria.
      </>
    ),
  },
  {
    stepKey: "calendario",
    tabId: "calendario",
    icon: Calendar,
    title: "Calendario",
    body: (
      <>
        El <strong>calendario mensual</strong> te permite ver todo el mes y
        pulsar un día para ir a reservar. Si tu plan lo permite podrás{" "}
        <strong>conectar Google Calendar</strong> y sincronizar citas con tu
        agenda de Google.
      </>
    ),
  },
  STATS_INTRO,
  {
    stepKey: "clientes",
    tabId: "clientes",
    icon: UserSquare2,
    title: "Clientes",
    body: (
      <>
        Tu agenda de <strong>contactos</strong>: añade clientes y así los
        elegirás al crear una cita, con teléfono y datos siempre a mano.
      </>
    ),
  },
  {
    stepKey: "ajustes",
    tabId: "ajustes",
    icon: Settings,
    title: "Ajustes",
    body: (
      <>
        Perfil, datos fiscales si faltan y{" "}
        <strong>Servicios del negocio</strong>: abre ese apartado y{" "}
        <strong>añade tus primeros servicios</strong> (nombre, duración y
        precio) — sin servicios no podrás crear citas.
      </>
    ),
  },
];

function buildTourSteps(currentUser) {
  const isOwner =
    String(currentUser?.role || "").toUpperCase() === "OWNER" &&
    currentUser?.organization_id != null;
  const cashDone = !!currentUser?.cash_close_password_configured;
  const insertCash = isOwner && !cashDone;

  const out = [];
  for (const s of BASE_TOUR) {
    out.push(s);
    if (s.stepKey === "stats_intro" && insertCash) {
      out.push(CASH_PASSWORD_STEP);
    }
  }
  return out;
}

function queryNavTabButton(tabId) {
  const desktop = document.getElementById("app-nav-desktop");
  const mobile = document.getElementById("app-nav-mobile");
  const isDesktop = window.matchMedia("(min-width: 768px)").matches;
  const root = isDesktop ? desktop : mobile;
  if (!root) return null;
  return root.querySelector(`button[data-nav-tab="${tabId}"]`);
}

function formatApiErr(err) {
  if (!err) return "Error";
  if (typeof err.detail === "string") return err.detail;
  if (Array.isArray(err.detail))
    return err.detail.map((d) => d.msg || JSON.stringify(d)).join(" ");
  return err.message || "Error";
}

function CashPasswordFields({ onSuccess }) {
  const { apiRequest } = useApi();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (a.length < 4) {
      setErr("Mínimo 4 caracteres.");
      return;
    }
    if (a !== b) {
      setErr("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/users/me/organization/cash-close-password", "PATCH", {
        password: a,
        confirm_password: b,
      });
      setA("");
      setB("");
      onSuccess?.();
    } catch (e2) {
      setErr(formatApiErr(e2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {err && <p className="text-[10px] font-bold text-red-600">{err}</p>}
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Contraseña"
        className="w-full rounded-2xl border-none bg-[#f8f5f2] p-3 text-center text-[12px] outline-none ring-1 ring-[#eaddcf] focus:ring-[#5d5045]"
        value={a}
        onChange={(e) => setA(e.target.value)}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Repetir contraseña"
        className="w-full rounded-2xl border-none bg-[#f8f5f2] p-3 text-center text-[12px] outline-none ring-1 ring-[#eaddcf] focus:ring-[#5d5045]"
        value={b}
        onChange={(e) => setB(e.target.value)}
      />
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-full bg-[#5d5045] py-3 text-[10px] font-black uppercase tracking-widest text-[#f5ebe0] disabled:opacity-50"
      >
        {saving ? "Guardando…" : "Guardar y continuar"}
      </button>
    </form>
  );
}

/**
 * Guided tour: switches app tab per step and anchors the explanation to the nav icon.
 */
export default function FirstVisitGuide({
  onComplete,
  setActiveTab,
  onTourOpenChange,
  currentUser,
  onUserRefresh,
}) {
  const [phase, setPhase] = useState("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [tourStepsSnapshot, setTourStepsSnapshot] = useState(null);

  const tourSteps = tourStepsSnapshot || [];

  const [anchor, setAnchor] = useState(() => ({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    placement: "below",
  }));

  const updateAnchor = useCallback(() => {
    const step = tourSteps[stepIndex];
    if (!step || phase !== "tour") return;
    const el = queryNavTabButton(step.tabId);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const cardMaxW = Math.min(400, vw - 24);
    const isCash = step.kind === "cash_password";
    const estCardH = isCash ? 420 : 300;
    let left = r.left + r.width / 2;
    let placement = "below";
    let top;

    if (r.bottom + margin + estCardH > vh - 16) {
      placement = "above";
      top = r.top - margin;
    } else {
      placement = "below";
      top = r.bottom + margin;
    }
    left = Math.max(cardMaxW / 2 + 12, Math.min(vw - cardMaxW / 2 - 12, left));
    setAnchor({
      left,
      top,
      width: r.width,
      height: r.height,
      placement,
    });
  }, [phase, stepIndex, tourSteps]);

  useLayoutEffect(() => {
    if (phase !== "tour") return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(updateAnchor);
    });
    return () => cancelAnimationFrame(id);
  }, [phase, stepIndex, updateAnchor]);

  useEffect(() => {
    if (phase !== "tour") return;
    const onResize = () => updateAnchor();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [phase, updateAnchor]);

  useEffect(() => {
    if (phase !== "tour") return;
    const tabId = tourSteps[stepIndex]?.tabId;
    if (tabId) setActiveTab(tabId);
  }, [phase, stepIndex, setActiveTab, tourSteps]);

  useEffect(() => {
    onTourOpenChange?.(phase === "tour");
  }, [phase, onTourOpenChange]);

  const finish = () => {
    setTourStepsSnapshot(null);
    onTourOpenChange?.(false);
    onComplete?.();
  };

  const startTour = () => {
    const snap = buildTourSteps(currentUser);
    setTourStepsSnapshot(snap);
    setStepIndex(0);
    setPhase("tour");
    if (snap[0]?.tabId) setActiveTab(snap[0].tabId);
  };

  const slide = tourSteps[stepIndex];
  const Icon = slide?.icon;
  const isLast = stepIndex === tourSteps.length - 1;
  const isCashStep = slide?.kind === "cash_password";

  const tooltipStyle = {
    left: anchor.left,
    top: anchor.top,
    transform:
      anchor.placement === "below"
        ? "translate(-50%, 0)"
        : "translate(-50%, -100%)",
  };

  return (
    <>
      {phase === "tour" && (
        <div
          className="fixed inset-0 z-[200] bg-[#2c2620]/50 backdrop-blur-[1px]"
          aria-hidden
        />
      )}

      {phase === "intro" && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center p-4 md:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-intro-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-[#2c2620]/55 backdrop-blur-[2px]"
            aria-label="Cerrar"
            onClick={finish}
          />
          <div className="relative w-full max-w-lg">
            <button
              type="button"
              onClick={finish}
              className="absolute -top-1 -right-1 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#8c857d] shadow-md ring-1 ring-[#eaddcf] transition hover:bg-white hover:text-[#5d5045] md:-right-2 md:-top-2"
              aria-label="Omitir guía"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
            <div className="relative flex flex-col items-center justify-center rounded-[2rem] border border-[#eaddcf] bg-[#faf8f5]/95 px-8 py-14 text-center shadow-[0_24px_80px_rgba(93,80,69,0.18)] backdrop-blur-md md:px-12 md:py-16">
              <Sparkles
                className="mb-5 h-9 w-9 text-[#5d5045] opacity-90"
                strokeWidth={1.5}
              />
              <p className="mb-2 text-[9px] font-black uppercase tracking-[0.5em] text-[#a39a91]">
                Bienvenido a BeautyDesk
              </p>
              <h2
                id="onboarding-intro-title"
                className="mb-8 font-serif text-2xl leading-snug text-[#5d5045] md:text-3xl"
              >
                Te llevamos por cada sección: cambiaremos de pestaña y te
                explicamos qué hacer en cada una.
              </h2>

              <div className="w-full max-w-md rounded-[1.5rem] border border-[#eaddcf] bg-white/80 px-5 py-4 text-left mb-8">
                <p className="text-[9px] font-black uppercase tracking-[0.35em] text-[#8c857d]">
                  Tareas pendientes recomendadas
                </p>
                <div className="mt-3 space-y-2">
                  {[
                    {
                      key: "cash",
                      icon: Lock,
                      label: "Configura la clave de cierre de caja",
                      done: !!currentUser?.cash_close_password_configured,
                    },
                    {
                      key: "services",
                      icon: Scissors,
                      label: "Añade tu primer servicio",
                      done: !!currentUser?.has_services_configured,
                    },
                    {
                      key: "hours",
                      icon: Clock,
                      label: "Define el horario del salón",
                      done: !!currentUser?.salon_hours_configured,
                    },
                  ].map((t) => {
                    const Icon2 = t.icon;
                    return (
                      <div
                        key={t.key}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-[#eee8e2] bg-[#faf8f5] px-4 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white ring-1 ring-[#eaddcf] text-[#5d5045]">
                            <Icon2 className="h-4 w-4" strokeWidth={2} />
                          </div>
                          <p className="min-w-0 truncate text-[10px] font-black tracking-widest text-[#5d5045]">
                            {t.label}
                          </p>
                        </div>
                        {t.done ? (
                          <CircleCheck
                            className="h-5 w-5 text-green-600 shrink-0"
                            strokeWidth={2}
                          />
                        ) : (
                          <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-[#a39485]">
                            Pendiente
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[10px] text-[#8c857d] leading-relaxed">
                  Consejo: configura el <strong>horario</strong> para que el agente
                  de WhatsApp pueda proponerte huecos reales según el día.
                </p>
              </div>
              <button
                type="button"
                onClick={startTour}
                className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-[#5d5045] px-12 py-4 text-[11px] font-black uppercase tracking-[0.35em] text-[#f5ebe0] shadow-[0_12px_40px_rgba(93,80,69,0.35)] transition hover:bg-[#4a3f36] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d5045] focus-visible:ring-offset-2"
              >
                <span className="relative z-10">Empezar</span>
                <span
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/12 to-transparent opacity-0 transition group-hover:opacity-100"
                  aria-hidden
                />
              </button>
              <button
                type="button"
                onClick={finish}
                className="mt-6 text-[9px] font-bold uppercase tracking-widest text-[#8c857d] underline-offset-4 hover:text-[#5d5045] hover:underline"
              >
                Omitir
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "tour" && slide && Icon && (
        <div
          className="fixed z-[220] w-[min(100vw-24px,400px)] max-h-[min(78vh,480px)] overflow-y-auto rounded-[1.5rem] border border-[#eaddcf] bg-white/98 px-5 py-5 shadow-[0_20px_60px_rgba(93,80,69,0.25)] pointer-events-auto"
          style={tooltipStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-step-title"
        >
          <div className="pointer-events-auto">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f5ebe0] text-[#5d5045] ring-2 ring-[#5d5045]/20">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[9px] font-black uppercase tracking-[0.35em] text-[#8c857d]">
                    Estás aquí · {stepIndex + 1}/{tourSteps.length}
                  </p>
                  <h3
                    id="tour-step-title"
                    className="font-serif text-lg leading-tight text-[#5d5045] md:text-xl"
                  >
                    {slide.title}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={finish}
                className="shrink-0 rounded-full p-1.5 text-[#8c857d] hover:bg-[#f5ebe0] hover:text-[#5d5045]"
                aria-label="Cerrar guía"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {slide.body && (
              <div className="mb-4 text-left text-[13px] leading-relaxed text-[#6d6359] md:text-[14px]">
                {slide.body}
              </div>
            )}
            {isCashStep && (
              <div className="mb-4">
                <CashPasswordFields
                  onSuccess={() => {
                    setStepIndex((i) => i + 1);
                    onUserRefresh?.();
                  }}
                />
              </div>
            )}
            {!isCashStep && (
              <p className="mb-4 text-[10px] text-[#a39a91] leading-snug">
                Usa los iconos del menú inferior (móvil) o superior (escritorio)
                para moverte; en esta guía también avanzamos por ti al pulsar{" "}
                <strong>Siguiente</strong>.
              </p>
            )}
            <div className="mb-4 flex justify-center gap-1.5">
              {tourSteps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === stepIndex ? "w-6 bg-[#5d5045]" : "w-1.5 bg-[#eaddcf]"
                  }`}
                  aria-hidden
                />
              ))}
            </div>
            {!isCashStep && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={finish}
                  className="text-center text-[9px] font-bold uppercase tracking-widest text-[#8c857d] hover:text-[#5d5045] sm:text-left"
                >
                  Omitir guía
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isLast) finish();
                    else setStepIndex((i) => i + 1);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#5d5045] px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#f5ebe0] shadow-lg transition hover:bg-[#4a3f36]"
                >
                  {isLast ? "Listo" : "Siguiente sección"}
                  {!isLast ? (
                    <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
                  ) : null}
                </button>
              </div>
            )}
            {isCashStep && (
              <button
                type="button"
                onClick={finish}
                className="mt-2 w-full text-center text-[9px] font-bold uppercase tracking-widest text-[#8c857d] hover:text-[#5d5045]"
              >
                Omitir este paso (configurar luego en Ajustes)
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "tour" && slide && <TourNavHighlight tabId={slide.tabId} />}
    </>
  );
}

function TourNavHighlight({ tabId }) {
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    const el = queryNavTabButton(tabId);
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [tabId]);

  if (!rect) return null;

  return (
    <div
      className="pointer-events-none fixed z-[215] rounded-full border-2 border-[#5d5045] shadow-[0_0_0_6px_rgba(93,80,69,0.15)] animate-pulse"
      style={{
        left: rect.left - 4,
        top: rect.top - 4,
        width: rect.width + 8,
        height: rect.height + 8,
      }}
      aria-hidden
    />
  );
}
