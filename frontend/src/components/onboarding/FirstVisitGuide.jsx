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
  Settings,
  Sparkles,
  UserSquare2,
  X,
} from "lucide-react";

const TOUR_STEPS = [
  {
    tabId: "agenda",
    icon: Clock,
    title: "Agenda y reservas",
    body: (
      <>
        Has entrado en <strong>Agenda</strong>: a la izquierda creas{" "}
        <strong>nuevas reservas</strong>; aquí ves la lista de{" "}
        <strong>citas próximas de la semana</strong>. Es tu vista diaria.
      </>
    ),
  },
  {
    tabId: "calendario",
    icon: Calendar,
    title: "Calendario",
    body: (
      <>
        El <strong>calendario mensual</strong> te permite ver todo el mes y
        pulsar un día para ir a reservar. Si tu plan lo permite, en{" "}
        <strong>Ajustes</strong> podrás <strong>conectar Google Calendar</strong>{" "}
        y sincronizar citas con tu agenda de Google.
      </>
    ),
  },
  {
    tabId: "stats",
    icon: BarChart3,
    title: "Estadísticas",
    body: (
      <>
        Aquí revisas <strong>gráficos e indicadores</strong> del salón. Más
        abajo está el <strong>histórico</strong> y las citas archivadas.
      </>
    ),
  },
  {
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
    tabId: "ajustes",
    icon: Settings,
    title: "Ajustes",
    body: (
      <>
        Perfil, datos fiscales si faltan y <strong>Servicios del negocio</strong>
        : abre ese apartado y <strong>añade tus primeros servicios</strong>{" "}
        (nombre, duración y precio) — sin servicios no podrás crear citas.
      </>
    ),
  },
];

function queryNavTabButton(tabId) {
  const desktop = document.getElementById("app-nav-desktop");
  const mobile = document.getElementById("app-nav-mobile");
  const isDesktop = window.matchMedia("(min-width: 768px)").matches;
  const root = isDesktop ? desktop : mobile;
  if (!root) return null;
  return root.querySelector(`button[data-nav-tab="${tabId}"]`);
}

/**
 * Guided tour: switches app tab per step and anchors the explanation to the nav icon.
 */
export default function FirstVisitGuide({
  onComplete,
  setActiveTab,
  onTourOpenChange,
}) {
  const [phase, setPhase] = useState("intro"); // intro | tour
  const [stepIndex, setStepIndex] = useState(0);
  const [anchor, setAnchor] = useState(() => ({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    placement: "below",
  }));

  const updateAnchor = useCallback(() => {
    const step = TOUR_STEPS[stepIndex];
    if (!step || phase !== "tour") return;
    const el = queryNavTabButton(step.tabId);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const cardMaxW = Math.min(400, vw - 24);
    const estCardH = 300;
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
    left = Math.max(
      cardMaxW / 2 + 12,
      Math.min(vw - cardMaxW / 2 - 12, left),
    );
    setAnchor({
      left,
      top,
      width: r.width,
      height: r.height,
      placement,
    });
  }, [phase, stepIndex]);

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
    const tabId = TOUR_STEPS[stepIndex]?.tabId;
    if (tabId) setActiveTab(tabId);
  }, [phase, stepIndex, setActiveTab]);

  useEffect(() => {
    onTourOpenChange?.(phase === "tour");
  }, [phase, onTourOpenChange]);

  const finish = () => {
    onTourOpenChange?.(false);
    onComplete?.();
  };

  const startTour = () => {
    setPhase("tour");
    setStepIndex(0);
    setActiveTab(TOUR_STEPS[0].tabId);
  };

  const slide = TOUR_STEPS[stepIndex];
  const Icon = slide?.icon;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

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
          className="fixed z-[220] w-[min(100vw-24px,400px)] max-h-[min(70vh,420px)] overflow-y-auto rounded-[1.5rem] border border-[#eaddcf] bg-white/98 px-5 py-5 shadow-[0_20px_60px_rgba(93,80,69,0.25)] pointer-events-auto"
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
                    Estás aquí · {stepIndex + 1}/{TOUR_STEPS.length}
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
            <p className="mb-5 text-left text-[13px] leading-relaxed text-[#6d6359] md:text-[14px]">
              {slide.body}
            </p>
            <p className="mb-4 text-[10px] text-[#a39a91] leading-snug">
              Usa los iconos del menú inferior (móvil) o superior (escritorio) para
              moverte; en esta guía también avanzamos por ti al pulsar{" "}
              <strong>Siguiente</strong>.
            </p>
            <div className="mb-4 flex justify-center gap-1.5">
              {TOUR_STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === stepIndex ? "w-6 bg-[#5d5045]" : "w-1.5 bg-[#eaddcf]"
                  }`}
                  aria-hidden
                />
              ))}
            </div>
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
          </div>
        </div>
      )}

      {phase === "tour" && slide && (
        <TourNavHighlight tabId={slide.tabId} />
      )}
    </>
  );
}

/** Pulsing ring around the active nav icon (above backdrop, below tooltip). */
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
