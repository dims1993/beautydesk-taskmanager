import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  ChevronRight,
  Loader2,
  LocateFixed,
  MapPin,
  Scissors,
  Sparkles,
  User,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { getPendingPlanFromSession, planLabel } from "../../utils/billingPlan";

/** Misma regla que `RegisterOwnerWizardRequest` en la API. */
const OWNER_WIZARD_PASSWORD_MIN_LEN = 8;

/** Requisitos de contraseña aún no cumplidos (texto para el usuario). */
function ownerWizardPasswordMissingMessages(password) {
  const len = (password ?? "").length;
  const min = OWNER_WIZARD_PASSWORD_MIN_LEN;
  if (len >= min) return [];
  const need = min - len;
  if (len === 0) {
    return [
      `Añade al menos ${min} caracteres; sin eso no puedes continuar.`,
    ];
  }
  return [
    `Te ${need === 1 ? "falta" : "faltan"} ${need} carácter${need === 1 ? "" : "es"} para el mínimo de ${min} (vas ${len}/${min}).`,
  ];
}

const CATEGORY_OPTIONS = [
  { key: "PELUQUERO", label: "Peluquería" },
  { key: "BARBERO", label: "Barbería" },
  { key: "UNAS", label: "Uñas" },
  { key: "ESTETICA", label: "Estética" },
  { key: "SPA", label: "Spa" },
  { key: "MASAJE", label: "Masaje" },
  { key: "DEPILACION", label: "Depilación" },
  { key: "ESTETICISTA", label: "Otros" },
];

function uiThemeForPrimaryCategory(primaryCategory) {
  const key = String(primaryCategory || "").trim().toUpperCase();
  if (["PELUQUERO", "BARBERO", "SPA"].includes(key)) return "hair";
  return "nails";
}

function formatRegisterError(err) {
  if (!err) return "Error al registrar.";
  if (typeof err.detail === "string") return err.detail;
  if (Array.isArray(err.detail)) {
    return err.detail
      .map((d) => (typeof d === "string" ? d : d.msg || JSON.stringify(d)))
      .join(" ");
  }
  return err.message || "Error al registrar.";
}

const RegisterOwnerWizard = ({
  onBack,
  onSwitchAccountType,
  /** Si viene de la landing con ?plan=, nombre legible del plan (p. ej. "Profesional"). */
  selectedPlanName = null,
}) => {
  const { apiRequest } = useApi();
  const [phase, setPhase] = useState("form"); // form | verify | trial_checkout
  const [wizardStep, setWizardStep] = useState(1);
  const [registrationToken, setRegistrationToken] = useState(null);

  const [business, setBusiness] = useState({
    business_name: "",
    address: "",
    city: "",
    postal_code: "",
    country: "España",
  });

  const [primaryCategory, setPrimaryCategory] = useState(null);
  const [extraSelected, setExtraSelected] = useState(() => new Set());

  const [personal, setPersonal] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    password: "",
    acceptFreemium: false,
  });

  const [codeDigits, setCodeDigits] = useState(["", "", "", "", "", ""]);
  const codeRefs = useRef([]);

  const [error, setError] = useState("");
  const [geoHint, setGeoHint] = useState("");
  const [geoFillBusy, setGeoFillBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [acceptTrialPayment, setAcceptTrialPayment] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [billingPublicStatus, setBillingPublicStatus] = useState(null);

  const checkoutPlan = getPendingPlanFromSession() || "esencial";
  const checkoutPlanLabel = planLabel(checkoutPlan);
  const trialDays =
    billingPublicStatus && typeof billingPublicStatus.trial_period_days === "number"
      ? billingPublicStatus.trial_period_days
      : 10;
  const stripeOk = Boolean(billingPublicStatus?.stripe_configured);
  const priceOkForPlan =
    !billingPublicStatus?.prices ||
    billingPublicStatus.prices[checkoutPlan] !== false;

  useEffect(() => {
    if (phase !== "trial_checkout") return undefined;
    let cancelled = false;
    (async () => {
      try {
        const s = await apiRequest("/billing/status", "GET");
        if (!cancelled) setBillingPublicStatus(s);
      } catch {
        if (!cancelled) {
          setBillingPublicStatus({ trial_period_days: 10, stripe_configured: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, apiRequest]);

  const applySessionToken = (data) => {
    if (!data?.access_token) return;
    localStorage.setItem("token", data.access_token);
    if (data.role) localStorage.setItem("role", data.role);
    if (data.organization_id != null) {
      localStorage.setItem("organization_id", String(data.organization_id));
    }
    if (data.integrations_access != null) {
      localStorage.setItem(
        "integrations_access",
        data.integrations_access ? "1" : "0",
      );
    }
  };

  const goStripeCheckout = async () => {
    if (!acceptTrialPayment) {
      setError(
        "Debes aceptar las condiciones del periodo de prueba y el cobro posterior.",
      );
      return;
    }
    setCheckoutBusy(true);
    setError("");
    try {
      const r = await apiRequest("/billing/checkout-session", "POST", {
        plan: checkoutPlan,
      });
      if (r?.url) {
        window.location.href = r.url;
        return;
      }
      setError("No hemos recibido la URL de pago. Inténtalo de nuevo.");
    } catch (err) {
      setError(formatRegisterError(err));
    } finally {
      setCheckoutBusy(false);
    }
  };

  const categoriesPayload = useMemo(() => {
    if (!primaryCategory) return [];
    const list = [primaryCategory];
    extraSelected.forEach((k) => {
      if (k !== primaryCategory && !list.includes(k)) list.push(k);
    });
    return list;
  }, [primaryCategory, extraSelected]);

  const toggleExtra = useCallback(
    (key) => {
      if (!primaryCategory) {
        setError("Elige primero tu servicio principal.");
        return;
      }
      if (key === primaryCategory) return;
      setExtraSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [primaryCategory],
  );

  const selectPrimary = useCallback((key) => {
    setError("");
    setPrimaryCategory(key);
    setExtraSelected((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // Live preview: as soon as the user selects the main service, switch palette.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const prev = root.getAttribute("data-ui-theme");
    const theme = uiThemeForPrimaryCategory(primaryCategory);
    root.setAttribute("data-ui-theme", theme);
    return () => {
      if (prev) root.setAttribute("data-ui-theme", prev);
      else root.removeAttribute("data-ui-theme");
    };
  }, [primaryCategory]);

  const fillAddressFromDeviceLocation = useCallback(async () => {
    setError("");
    setGeoHint("");
    if (!navigator.geolocation) {
      setError(
        "Tu navegador no permite obtener la ubicación. Escribe la dirección manualmente.",
      );
      return;
    }
    setGeoFillBusy(true);
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 18_000,
          maximumAge: 0,
        });
      });
      const { latitude, longitude } = pos.coords;
      const q = new URLSearchParams({
        lat: String(latitude),
        lon: String(longitude),
      });
      const parts = await apiRequest(
        `/public/reverse-geocode?${q.toString()}`,
        "GET",
        null,
        { skipAuthRedirect: true },
      );
      setBusiness((b) => ({
        ...b,
        address: (parts.address || "").trim() || b.address,
        city: (parts.city || "").trim() || b.city,
        postal_code: (parts.postal_code || "").trim() || b.postal_code,
        country: (parts.country || "").trim() ? parts.country.trim() : b.country,
      }));
      setGeoHint(
        "Hemos rellenado calle, ciudad y código postal según tu posición. Revísalo: debe coincidir con la del negocio.",
      );
    } catch (err) {
      const code = err && typeof err.code === "number" ? err.code : null;
      if (code === 1) {
        setError(
          "Ubicación denegada. Activa el permiso en el navegador o escribe la dirección a mano.",
        );
      } else if (code === 2) {
        setError(
          "No se pudo determinar la posición. Prueba en exterior o escribe la dirección.",
        );
      } else if (code === 3) {
        setError(
          "Tiempo agotado al pedir la ubicación. Inténtalo de nuevo o escribe la dirección.",
        );
      } else {
        setError(formatRegisterError(err));
      }
    } finally {
      setGeoFillBusy(false);
    }
  }, [apiRequest]);

  const canNextStep1 = useMemo(() => {
    return (
      business.business_name.trim() &&
      business.address.trim() &&
      business.city.trim() &&
      business.postal_code.trim() &&
      business.country.trim()
    );
  }, [business]);

  const canNextStep2 = Boolean(primaryCategory);

  const ownerPasswordIssues = useMemo(
    () => ownerWizardPasswordMissingMessages(personal.password),
    [personal.password],
  );
  const ownerPasswordOk =
    personal.password.length >= OWNER_WIZARD_PASSWORD_MIN_LEN;

  const canSubmitStep3 = useMemo(() => {
    if (personal.password.length < OWNER_WIZARD_PASSWORD_MIN_LEN) return false;
    if (!personal.acceptFreemium) return false;
    return (
      personal.first_name.trim() &&
      personal.last_name.trim() &&
      personal.email.trim() &&
      personal.phone.trim()
    );
  }, [personal]);

  const submitWizard = async (e) => {
    e.preventDefault();
    setError("");
    if (!canSubmitStep3) {
      setError(
        `Completa todos los campos, contraseña mínimo ${OWNER_WIZARD_PASSWORD_MIN_LEN} caracteres y acepta términos y privacidad.`,
      );
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiRequest("/users/register/owner-wizard", "POST", {
        business_name: business.business_name.trim(),
        address: business.address.trim(),
        city: business.city.trim(),
        postal_code: business.postal_code.trim(),
        country: business.country.trim(),
        primary_category: primaryCategory,
        categories: categoriesPayload,
        first_name: personal.first_name.trim(),
        last_name: personal.last_name.trim(),
        email: personal.email.trim(),
        phone: personal.phone.trim(),
        password: personal.password,
        accept_terms_and_privacy: personal.acceptFreemium,
      });
      if (!res?.registration_token) {
        setError("Respuesta inesperada del servidor.");
        return;
      }
      setRegistrationToken(res.registration_token);
      setPhase("verify");
      setCodeDigits(["", "", "", "", "", ""]);
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(formatRegisterError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const confirmCode = async (e) => {
    e.preventDefault();
    const code = codeDigits.join("");
    if (code.length !== 6) {
      setError("Introduce el código de 6 dígitos.");
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      const data = await apiRequest(
        "/users/register/owner-wizard/confirm",
        "POST",
        {
          registration_token: registrationToken,
          code,
        },
        { skipAuthRedirect: true },
      );
      if (!data?.access_token) {
        setError("Respuesta inesperada del servidor.");
        return;
      }
      applySessionToken(data);
      setAcceptTrialPayment(false);
      setBillingPublicStatus(null);
      setPhase("trial_checkout");
    } catch (err) {
      setError(formatRegisterError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const onCodeChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setCodeDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }
  };

  const onCodeKeyDown = (index, e) => {
    if (e.key === "Backspace" && !codeDigits[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  const onCodePaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const next = [...codeDigits];
    for (let i = 0; i < 6; i += 1) {
      next[i] = text[i] || "";
    }
    setCodeDigits(next);
    const focusAt = Math.min(text.length, 5);
    codeRefs.current[focusAt]?.focus();
  };

  const stepTitle =
    phase === "verify"
      ? "Verificación"
      : phase === "trial_checkout"
        ? "Prueba y pago"
        : wizardStep === 1
          ? "Tu negocio"
          : wizardStep === 2
            ? "Servicios"
            : "Tu cuenta";

  const displayStep = useMemo(() => {
    if (phase === "trial_checkout") return 5;
    if (phase === "verify") return 4;
    return wizardStep;
  }, [phase, wizardStep]);

  const progressPercent = (displayStep / 5) * 100;

  const reserveBackSpace =
    phase === "form" && wizardStep === 1 ? "pr-14 md:pr-16" : "";

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-0 md:p-10 font-sans selection:bg-[#f5ebe0]">
      <div className="w-full max-w-6xl min-h-screen md:min-h-[700px] grid grid-cols-1 lg:grid-cols-2 bg-white md:rounded-[3rem] shadow-2xl overflow-hidden border-none md:border md:border-[#eaddcf]">
        <div className="relative h-[24vh] lg:h-auto overflow-hidden">
          <img
            src="/work-nails.webp"
            alt="Interior del salón"
            className="absolute inset-0 w-full h-full object-cover transform scale-110 md:scale-100"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-white via-[#5d5045]/20 to-[#5d5045]/60 lg:bg-gradient-to-br lg:from-[#5d5045]/80 lg:to-transparent" />
          <div className="relative h-full p-8 md:p-16 flex flex-col justify-between text-white">
            <div className="space-y-2 md:space-y-4">
              <Sparkles className="w-8 h-8 md:w-10 md:h-10 opacity-90" />
              <h2 className="text-2xl md:text-6xl font-serif leading-tight">
                Configura tu <br />
                <span className="italic">BeautyDesk.</span>
              </h2>
            </div>
            <p className="hidden md:block text-sm font-light tracking-widest uppercase opacity-70">
              Freemium · PASO {displayStep} DE 5
            </p>
          </div>
        </div>

        <div className="relative -mt-10 lg:mt-0 bg-white rounded-t-[3rem] lg:rounded-none p-8 md:p-12 lg:p-16 space-y-6 flex flex-col justify-start max-h-[100vh] lg:max-h-none overflow-y-auto lg:justify-center">
          {phase === "form" && wizardStep === 1 && (
            <button
              type="button"
              onClick={onBack}
              className="absolute top-6 right-8 p-2 bg-[#FAF9F6] lg:bg-transparent rounded-full text-[#8c857d] hover:text-[#5d5045] transition-colors z-10"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {selectedPlanName && phase === "form" && (
            <p className="rounded-2xl border border-[#c9e7db] bg-[#f4faf7] px-4 py-3 text-[10px] leading-relaxed text-[#1e3a2f]">
              Has elegido el plan{" "}
              <span className="font-serif font-semibold text-[#5d5045]">
                {selectedPlanName}
              </span>
              . Tras verificar el correo, en el último paso añadirás el método de
              pago (prueba y suscripción) con total transparencia.
            </p>
          )}

          <div
            className={`space-y-2 shrink-0 ${reserveBackSpace} ${phase === "form" && wizardStep === 1 ? "mt-2 lg:mt-0" : "mt-4 lg:mt-0"}`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <p className="text-[9px] font-black tracking-[0.25em] text-[#5d5045] whitespace-nowrap">
                PASO {displayStep} DE 5
              </p>
              <p className="text-[9px] font-bold text-[#8c857d] tabular-nums sm:text-right">
                {Math.round(progressPercent)}% completado
              </p>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-[#eaddcf]"
              role="progressbar"
              aria-valuenow={Math.round(progressPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progreso del registro"
            >
              <div
                className="h-full rounded-full bg-[#5d5045] transition-[width] duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.4em] text-[#8c857d] font-black">
              Registro · {stepTitle}
            </p>
            <h3 className="text-3xl md:text-4xl font-serif text-[#5d5045]">
              {phase === "verify" && "Esperando el código"}
              {phase === "trial_checkout" && "Método de pago y periodo de prueba"}
              {phase === "form" && wizardStep === 1 && "Cuéntanos sobre tu negocio"}
              {phase === "form" && wizardStep === 2 && "¿Qué servicios ofreces?"}
              {phase === "form" && wizardStep === 3 && "Cuéntanos sobre ti"}
            </h3>
          </div>

          {phase === "form" && wizardStep === 1 && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (canNextStep1) setWizardStep(2);
              }}
            >
              {error && (
                <div className="bg-red-50 text-red-600 text-[9px] font-black uppercase p-4 rounded-2xl border border-red-100 italic">
                  {error}
                </div>
              )}
              <div className="flex gap-3 text-left">
                <Building2
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#c4bdb5]"
                  aria-hidden
                />
                <p className="min-w-0 text-[10px] leading-snug text-[#8c857d]">
                  Busca o introduce el nombre de tu empresa y la ubicación.
                </p>
              </div>
              <button
                type="button"
                disabled={geoFillBusy}
                onClick={fillAddressFromDeviceLocation}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#dcc7b1] bg-[#faf8f5] py-3.5 px-4 text-[9px] font-black uppercase tracking-widest text-[#5d5045] transition-all hover:border-[#5d5045]/50 hover:bg-[#f5ebe0] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {geoFillBusy ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <LocateFixed className="h-4 w-4 shrink-0" aria-hidden />
                )}
                Usar mi ubicación actual (dirección)
              </button>
              <p className="text-[9px] leading-snug text-[#8c857d] px-1 -mt-1">
                El navegador pedirá permiso. Solo rellenamos ubicación del local,
                no el nombre del negocio.
              </p>
              {geoHint && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/90 px-3 py-2.5 text-[9px] font-semibold leading-snug text-emerald-900">
                  {geoHint}
                </div>
              )}
              <input
                type="text"
                placeholder="NOMBRE DEL NEGOCIO"
                className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                value={business.business_name}
                onChange={(e) =>
                  setBusiness({ ...business, business_name: e.target.value })
                }
              />
              <div className="relative">
                <MapPin className="absolute left-4 top-4 w-4 h-4 text-[#c4bdb5]" />
                <input
                  type="text"
                  placeholder="DIRECCIÓN"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 pl-12 pr-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                  value={business.address}
                  onChange={(e) =>
                    setBusiness({ ...business, address: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="CIUDAD"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                  value={business.city}
                  onChange={(e) =>
                    setBusiness({ ...business, city: e.target.value })
                  }
                />
                <input
                  type="text"
                  placeholder="CÓDIGO POSTAL"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                  value={business.postal_code}
                  onChange={(e) =>
                    setBusiness({ ...business, postal_code: e.target.value })
                  }
                />
              </div>
              <input
                type="text"
                placeholder="PAÍS"
                className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                value={business.country}
                onChange={(e) =>
                  setBusiness({ ...business, country: e.target.value })
                }
              />
              <button
                type="submit"
                disabled={!canNextStep1}
                className="w-full bg-[#5d5045] text-[#f5ebe0] py-4 md:py-5 rounded-full text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#4a3f36] transition-all shadow-xl disabled:opacity-50"
              >
                Continuar
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {phase === "form" && wizardStep === 2 && (
            <div className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-[9px] font-black uppercase p-4 rounded-2xl border border-red-100 italic">
                  {error}
                </div>
              )}
              <div className="flex gap-3 text-left">
                <Scissors
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#c4bdb5]"
                  aria-hidden
                />
                <div className="min-w-0 max-w-full space-y-2 text-[10px] leading-snug text-[#8c857d]">
                  <p>
                    Primero toca tu{" "}
                    <span className="font-black text-[#5d5045]">
                      servicio principal
                    </span>
                    .
                  </p>
                  <p>Después marca los demás servicios que ofreces.</p>
                </div>
              </div>
              {primaryCategory && (
                <button
                  type="button"
                  onClick={() => {
                    setPrimaryCategory(null);
                    setExtraSelected(new Set());
                    setError("");
                  }}
                  className="text-[9px] font-black uppercase tracking-widest text-[#5d5045] underline underline-offset-4"
                >
                  Cambiar servicio principal
                </button>
              )}
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map(({ key, label }) => {
                  const isPrimary = primaryCategory === key;
                  const isOn = isPrimary || extraSelected.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        if (primaryCategory === null) {
                          selectPrimary(key);
                          return;
                        }
                        if (isPrimary) return;
                        toggleExtra(key);
                      }}
                      className={`rounded-full px-4 py-2.5 text-[9px] font-black uppercase tracking-widest border transition-all ${
                        isPrimary
                          ? "bg-[#5d5045] text-[#f5ebe0] border-[#5d5045] ring-2 ring-[#5d5045]/30"
                          : isOn
                            ? "bg-[#f5ebe0] text-[#5d5045] border-[#5d5045]"
                            : "bg-[#FAF9F6] text-[#8c857d] border-[#eaddcf] hover:border-[#5d5045]/40"
                      }`}
                    >
                      {label}
                      {isPrimary ? " · principal" : ""}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="flex-1 py-4 rounded-full border border-[#eaddcf] text-[10px] font-black uppercase tracking-widest text-[#8c857d]"
                >
                  Atrás
                </button>
                <button
                  type="button"
                  disabled={!canNextStep2}
                  onClick={() => setWizardStep(3)}
                  className="flex-1 bg-[#5d5045] text-[#f5ebe0] py-4 rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {phase === "form" && wizardStep === 3 && (
            <form onSubmit={submitWizard} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-[9px] font-black uppercase p-4 rounded-2xl border border-red-100 italic">
                  {error}
                </div>
              )}
              <div className="flex gap-3 text-left">
                <User
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#c4bdb5]"
                  aria-hidden
                />
                <p className="min-w-0 text-[10px] leading-snug text-[#8c857d]">
                  Usaremos estos datos para tu cuenta y para contactarte si hace
                  falta.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="NOMBRE"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                  value={personal.first_name}
                  onChange={(e) =>
                    setPersonal({ ...personal, first_name: e.target.value })
                  }
                />
                <input
                  type="text"
                  placeholder="APELLIDO"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                  value={personal.last_name}
                  onChange={(e) =>
                    setPersonal({ ...personal, last_name: e.target.value })
                  }
                />
              </div>
              <input
                type="email"
                placeholder="EMAIL"
                className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                value={personal.email}
                onChange={(e) =>
                  setPersonal({ ...personal, email: e.target.value })
                }
              />
              <input
                type="tel"
                placeholder="TELÉFONO"
                className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                value={personal.phone}
                onChange={(e) =>
                  setPersonal({ ...personal, phone: e.target.value })
                }
              />
              <input
                type="password"
                placeholder={`CONTRASEÑA (MÍN. ${OWNER_WIZARD_PASSWORD_MIN_LEN} CARACTERES)`}
                autoComplete="new-password"
                className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                value={personal.password}
                onChange={(e) =>
                  setPersonal({ ...personal, password: e.target.value })
                }
              />
              {ownerPasswordOk ? (
                <p className="text-[9px] font-bold leading-snug text-emerald-700 px-1">
                  Contraseña con la longitud mínima requerida.
                </p>
              ) : (
                <div
                  className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2.5 text-[9px] font-bold leading-snug text-red-700"
                  role="status"
                  aria-live="polite"
                >
                  <p className="uppercase tracking-widest text-[8px] text-red-600/90 mb-1.5">
                    Contraseña incompleta
                  </p>
                  <ul className="list-disc space-y-1 pl-4 normal-case tracking-normal font-semibold">
                    {ownerPasswordIssues.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="flex items-start gap-3 cursor-pointer text-[10px] font-bold text-[#5d5045] leading-relaxed">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-[#eaddcf]"
                  checked={personal.acceptFreemium}
                  onChange={(e) =>
                    setPersonal({
                      ...personal,
                      acceptFreemium: e.target.checked,
                    })
                  }
                />
                <span className="text-left">
                  Registrándote en la cuenta Freemium aceptas la{" "}
                  <Link
                    to="/legal/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#5d5045] underline underline-offset-4 font-black"
                  >
                    política de privacidad
                  </Link>{" "}
                  y los{" "}
                  <Link
                    to="/legal/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#5d5045] underline underline-offset-4 font-black"
                  >
                    términos y condiciones
                  </Link>
                  .
                </span>
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="flex-1 py-4 rounded-full border border-[#eaddcf] text-[10px] font-black uppercase tracking-widest text-[#8c857d]"
                >
                  Atrás
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !canSubmitStep3}
                  className="flex-1 bg-[#5d5045] text-[#f5ebe0] py-4 rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando…
                    </>
                  ) : (
                    "Enviar código"
                  )}
                </button>
              </div>
            </form>
          )}

          {phase === "verify" && (
            <form onSubmit={confirmCode} className="space-y-6">
              {error && (
                <div className="bg-red-50 text-red-600 text-[9px] font-black uppercase p-4 rounded-2xl border border-red-100 italic">
                  {error}
                </div>
              )}
              <p className="text-left text-[11px] leading-snug text-[#8c857d]">
                Revisa tu bandeja de entrada. Introduce el código de 6 dígitos
                que te hemos enviado a{" "}
                <span className="font-black text-[#5d5045]">
                  {personal.email}
                </span>
                .
              </p>
              <div
                className="flex justify-center gap-2 md:gap-3"
                onPaste={onCodePaste}
              >
                {codeDigits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      codeRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => onCodeChange(i, e.target.value)}
                    onKeyDown={(e) => onCodeKeyDown(i, e)}
                    className="w-10 h-12 md:w-12 md:h-14 text-center text-xl font-black rounded-xl border-2 border-[#eaddcf] bg-[#FAF9F6] text-[#5d5045] focus:border-[#5d5045] focus:outline-none"
                  />
                ))}
              </div>
              <button
                type="submit"
                disabled={isLoading || codeDigits.join("").length !== 6}
                className="w-full bg-[#5d5045] text-[#f5ebe0] py-4 rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verificando…
                  </>
                ) : (
                  "Confirmar código"
                )}
              </button>
            </form>
          )}

          {phase === "trial_checkout" && (
            <div className="space-y-5">
              {error && (
                <div className="bg-red-50 text-red-600 text-[9px] font-black uppercase p-4 rounded-2xl border border-red-100 italic">
                  {error}
                </div>
              )}
              <div className="flex gap-3 text-left">
                <CreditCard
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#c4bdb5]"
                  aria-hidden
                />
                <p className="min-w-0 text-[10px] leading-relaxed text-[#8c857d]">
                  Plan:{" "}
                  <span className="font-black text-[#5d5045]">
                    {checkoutPlanLabel}
                  </span>
                  . Con la tarjeta se programa la suscripción: primero
                  <span className="text-[#5d5045] font-black"> 0€</span> en la
                  factura de prueba ({trialDays} días), y a continuación, si no
                  cancelas, el cobro recurrente que verás en Stripe.
                </p>
              </div>
              <div className="rounded-2xl border border-[#eaddcf] bg-[#FAF9F6] p-4 text-left space-y-2 text-[10px] text-[#5d5045] leading-relaxed">
                <p className="font-black uppercase tracking-widest text-[9px] text-[#8c857d]">
                  Resumen
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[#8c857d]">
                  <li>
                    En la primera factura, el importe de la prueba es{" "}
                    <span className="text-[#5d5045] font-black">0€</span>: la
                    suscripción queda programada, la tarjeta se guarda en Stripe
                    y no hay cobro durante esos {trialDays} días.
                  </li>
                  <li>
                    Cumplidos los {trialDays} días,{" "}
                    <span className="text-[#5d5045] font-black">
                      se cobra la cuota del plan
                    </span>{" "}
                    de forma periódica, salvo que canceles antes en el portal
                    de facturación de Stripe.
                  </li>
                </ul>
              </div>
              {!stripeOk && (
                <p className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl p-3 leading-relaxed">
                  El registro no puede completarse sin validar el método de
                  pago. El servicio de pago (Stripe) no está disponible; revisa
                  la configuración del servidor o inténtalo más tarde. Puedes
                  recargar la página cuando el pago esté activo.
                </p>
              )}
              {stripeOk && !priceOkForPlan && (
                <p className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl p-3 leading-relaxed">
                  Falta el precio de Stripe para el plan {checkoutPlanLabel} en
                  el servidor. Hasta entonces no se puede abrir el checkout. Es
                  necesario un administrador que configure el precio
                  (variable STRIPE_PRICE_…) correspondiente.
                </p>
              )}
              {stripeOk && priceOkForPlan && (
                <>
                  <label className="flex items-start gap-3 cursor-pointer text-[10px] font-bold text-[#5d5045] leading-relaxed">
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-[#eaddcf]"
                      checked={acceptTrialPayment}
                      onChange={(e) => setAcceptTrialPayment(e.target.checked)}
                    />
                    <span className="text-left">
                      He leído y acepto que inicio un periodo de prueba; que la
                      tarjeta queda vinculada a través de Stripe; y que, pasados
                      los {trialDays} días, se aplicará el cobro de la
                      suscripción a{" "}
                      <span className="font-black">{checkoutPlanLabel}</span> de
                      forma periódica, salvo que canceles a tiempo (según las
                      condiciones que muestre Stripe en el checkout).
                    </span>
                  </label>
                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={goStripeCheckout}
                      disabled={checkoutBusy || !acceptTrialPayment}
                      className="w-full bg-[#5d5045] text-[#f5ebe0] py-4 rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {checkoutBusy ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Conectando con Stripe…
                        </>
                      ) : (
                        "Añadir tarjeta y continuar en Stripe"
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {phase === "form" && (
            <div className="space-y-3 pt-2">
              {typeof onSwitchAccountType === "function" && (
                <p className="text-[9px] text-[#8c857d] text-center font-medium">
                  <button
                    type="button"
                    onClick={onSwitchAccountType}
                    className="text-[#5d5045] font-black uppercase tracking-widest hover:underline underline-offset-8"
                  >
                    ¿Cliente o super admin? Registro clásico
                  </button>
                </p>
              )}
              <p className="text-[10px] md:text-[11px] text-[#8c857d] text-center font-medium">
                ¿Ya tienes cuenta?{" "}
                <button
                  type="button"
                  onClick={onBack}
                  className="text-[#5d5045] font-black uppercase tracking-widest hover:underline underline-offset-8 ml-1"
                >
                  Iniciar sesión
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegisterOwnerWizard;
