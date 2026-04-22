import React, { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Loader2,
  MapPin,
  Scissors,
  Sparkles,
  User,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";

const CATEGORY_OPTIONS = [
  { key: "PELUQUERO", label: "Peluquería" },
  { key: "BARBERO", label: "Barbería" },
  { key: "UNAS", label: "Uñas" },
  { key: "ESTETICA", label: "Estética" },
  { key: "SPA", label: "Spa" },
  { key: "MASAJE", label: "Masaje" },
  { key: "DEPILACION", label: "Depilación" },
  { key: "ESTETICISTA", label: "Esteticista" },
];

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
  onCompleteRegistration,
  onSwitchAccountType,
  /** Si viene de la landing con ?plan=, nombre legible del plan (p. ej. "Profesional"). */
  selectedPlanName = null,
}) => {
  const { apiRequest } = useApi();
  const [phase, setPhase] = useState("form"); // form | verify | loading
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
  const [isLoading, setIsLoading] = useState(false);

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

  const canSubmitStep3 = useMemo(() => {
    if (personal.password.length < 8) return false;
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
        "Completa todos los campos, contraseña mínimo 8 caracteres y acepta términos y privacidad.",
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
      await apiRequest("/users/register/owner-wizard/confirm", "POST", {
        registration_token: registrationToken,
        code,
      });
      setPhase("loading");
      setTimeout(() => {
        onCompleteRegistration?.();
        onBack?.();
      }, 2800);
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
      : phase === "loading"
        ? "Preparando tu espacio"
        : wizardStep === 1
          ? "Tu negocio"
          : wizardStep === 2
            ? "Servicios"
            : "Tu cuenta";

  const displayStep = useMemo(() => {
    if (phase === "loading") return 5;
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
              . Tras verificar el correo e iniciar sesión, en{" "}
              <strong className="font-black uppercase tracking-widest text-[9px]">
                Ajustes → Suscripción
              </strong>{" "}
              podrás completar el pago con Stripe.
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
              {phase === "loading" && "Estamos preparando todo"}
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
                placeholder="CONTRASEÑA (MÍN. 8 CARACTERES)"
                className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                value={personal.password}
                onChange={(e) =>
                  setPersonal({ ...personal, password: e.target.value })
                }
              />
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

          {phase === "loading" && (
            <div className="space-y-8 text-center py-8">
              <div className="relative mx-auto w-28 h-28">
                <div className="absolute inset-0 rounded-full border-4 border-[#eaddcf]" />
                <div className="absolute inset-0 rounded-full border-4 border-[#5d5045] border-t-transparent animate-spin" />
                <Sparkles className="absolute inset-0 m-auto w-10 h-10 text-[#5d5045] animate-pulse" />
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[#5d5045]">
                  Preparando tu agenda
                </p>
                <p className="text-[10px] text-[#8c857d] leading-relaxed max-w-sm mx-auto">
                  Estamos afinando sillones virtuales, ordenando pomos de esmalte
                  y enseñando a los píxeles a sonreír… casi está.
                </p>
              </div>
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
