import React, { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi";
import {
  User,
  Mail,
  Lock,
  ArrowLeft,
  Sparkles,
  ChevronRight,
  Building2,
  Shield,
  Phone,
} from "lucide-react";
import GoogleLoginButton from "./GoogleLoginButton";

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

const RegisterView = ({ onBack, onCompleteRegistration }) => {
  const { apiRequest } = useApi();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const [step, setStep] = useState(1);
  const [pendingToken, setPendingToken] = useState(null);

  const [account, setAccount] = useState({
    username: "",
    email: "",
    password: "",
    role: "OWNER",
    phone: "",
    super_admin_registration_secret: "",
    acceptTerms: false,
    acceptPrivacy: false,
  });

  const [billing, setBilling] = useState({
    business_type: "SALON",
    organization_name: "",
    legal_name: "",
    billing_address_line1: "",
    billing_address_line2: "",
    city: "",
    postal_code: "",
    province: "",
    country: "España",
    tax_id: "",
    billing_phone: "",
    billing_email: "",
  });

  const [googleCredential, setGoogleCredential] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isSuperAdmin = account.role === "SUPER_ADMIN";
  const withGoogle = !!googleCredential;

  const canSubmitStep1 = useMemo(() => {
    if (!account.phone.trim()) return false;
    if (!account.acceptTerms || !account.acceptPrivacy) return false;
    if (isSuperAdmin && !account.super_admin_registration_secret.trim())
      return false;
    if (withGoogle) return true;
    return (
      account.username.trim() &&
      account.email.trim() &&
      account.password.length > 0
    );
  }, [account, withGoogle, isSuperAdmin]);

  const canSubmitStep2 = useMemo(() => {
    return (
      billing.business_type &&
      billing.organization_name.trim() &&
      billing.legal_name.trim() &&
      billing.billing_address_line1.trim() &&
      billing.city.trim() &&
      billing.postal_code.trim() &&
      billing.country.trim()
    );
  }, [billing]);

  const handleGoogleSuccess = useCallback((credentialResponse) => {
    setError("");
    if (credentialResponse?.credential) {
      setGoogleCredential(credentialResponse.credential);
    }
  }, []);

  const handleGoogleError = useCallback((err) => {
    const msg =
      (err && typeof err === "object" && "message" in err && err.message) ||
      "No se pudo usar Google";
    setError(String(msg));
  }, []);

  const clearGoogle = useCallback(() => {
    setGoogleCredential(null);
  }, []);

  const submitStep1 = async (e) => {
    e.preventDefault();
    setError("");
    if (!canSubmitStep1) {
      setError(
        "Completa teléfono, aceptaciones y credenciales (o vincula Google).",
      );
      return;
    }
    setIsLoading(true);
    try {
      const payload = {
        role: account.role,
        phone: account.phone.trim(),
        accept_terms_and_privacy:
          account.acceptTerms && account.acceptPrivacy,
        super_admin_registration_secret:
          account.super_admin_registration_secret.trim() || null,
        google_credential: googleCredential,
        username: googleCredential ? undefined : account.username.trim(),
        email: googleCredential ? undefined : account.email.trim(),
        password: googleCredential ? undefined : account.password,
      };
      const data = await apiRequest("/users/register/account", "POST", payload);
      if (!data?.access_token) {
        setError("Respuesta inesperada del servidor.");
        return;
      }
      setPendingToken(data.access_token);
      if (data.requires_billing_step) {
        setStep(2);
      } else {
        setStep(3);
      }
    } catch (err) {
      setError(formatRegisterError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const submitStep2 = async (e) => {
    e.preventDefault();
    setError("");
    if (!canSubmitStep2) {
      setError("Completa los datos fiscales obligatorios.");
      return;
    }
    if (!pendingToken) {
      setError("Sesión de registro caducada. Vuelve al paso 1.");
      return;
    }
    setIsLoading(true);
    try {
      const body = {
        business_type: billing.business_type,
        organization_name: billing.organization_name.trim(),
        legal_name: billing.legal_name.trim(),
        billing_address_line1: billing.billing_address_line1.trim(),
        billing_address_line2: billing.billing_address_line2.trim() || null,
        city: billing.city.trim(),
        postal_code: billing.postal_code.trim(),
        province: billing.province.trim() || null,
        country: billing.country.trim(),
        tax_id: billing.tax_id.trim() || null,
        billing_phone: billing.billing_phone.trim() || null,
        billing_email: billing.billing_email.trim() || null,
      };
      await apiRequest("/users/register/billing", "POST", body, {
        tokenOverride: pendingToken,
        skipAuthRedirect: true,
      });
      setStep(3);
    } catch (err) {
      setError(formatRegisterError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinishLogin = () => {
    setPendingToken(null);
    onCompleteRegistration?.();
  };

  const stepTitle =
    step === 1
      ? "Cuenta"
      : step === 2
        ? "Datos fiscales"
        : "Listo para entrar";

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
                Únete a la <br />
                <span className="italic">excelencia.</span>
              </h2>
            </div>
            <p className="hidden md:block text-sm font-light tracking-widest uppercase opacity-70">
              BeautyTask © 2026 · Paso{" "}
              {Math.min(step, account.role === "OWNER" ? 3 : 2)} de{" "}
              {account.role === "OWNER" ? 3 : 2}
            </p>
          </div>
        </div>

        <div className="relative -mt-10 lg:mt-0 bg-white rounded-t-[3rem] lg:rounded-none p-8 md:p-12 lg:p-16 space-y-6 flex flex-col justify-center max-h-[100vh] lg:max-h-none overflow-y-auto">
          {step === 1 && (
            <button
              type="button"
              onClick={onBack}
              className="absolute top-6 right-8 p-2 bg-[#FAF9F6] lg:bg-transparent rounded-full text-[#8c857d] hover:text-[#5d5045] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <div className="space-y-2 mt-4 lg:mt-0">
            <p className="text-[10px] uppercase tracking-[0.4em] text-[#8c857d] font-black">
              Registro · {stepTitle}
            </p>
            <h3 className="text-3xl md:text-4xl font-serif text-[#5d5045]">
              {step === 1 && "Crea tu cuenta"}
              {step === 2 && "Datos fiscales y de facturación"}
              {step === 3 && "Registro completado"}
            </h3>
          </div>

          {step === 1 && (
            <form onSubmit={submitStep1} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-[9px] font-black uppercase p-4 rounded-2xl border border-red-100 italic">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <label className="text-[9px] font-black uppercase tracking-widest text-[#8c857d] ml-2 block">
                  Rol en la plataforma
                </label>
                <div className="relative group">
                  <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5] pointer-events-none z-10" />
                  <select
                    value={account.role}
                    onChange={(e) =>
                      setAccount({ ...account, role: e.target.value })
                    }
                    className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 md:py-5 pl-12 pr-4 rounded-2xl text-[10px] md:text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all appearance-none"
                  >
                    <option value="OWNER">Dueño / negocio (plan inicial)</option>
                    <option value="CLIENT">Cliente final</option>
                    <option value="SUPER_ADMIN">Super administrador</option>
                  </select>
                </div>
                {isSuperAdmin && (
                  <p className="text-[9px] text-[#8c857d] leading-relaxed px-1">
                    Uso interno. Requiere la clave configurada en el servidor.
                  </p>
                )}
                {account.role === "OWNER" && (
                  <p className="text-[9px] text-[#8c857d] leading-relaxed px-1">
                    Tras crear la cuenta, completarás los datos fiscales. Los
                    planes iniciales limitan WhatsApp y Google Calendar hasta
                    activar integraciones.
                  </p>
                )}
              </div>

              <div className="relative group">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5] group-focus-within:text-[#5d5045]" />
                <input
                  type="tel"
                  placeholder="TELÉFONO"
                  required
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 md:py-5 pl-12 pr-4 rounded-2xl text-[10px] md:text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all"
                  value={account.phone}
                  onChange={(e) =>
                    setAccount({ ...account, phone: e.target.value })
                  }
                />
              </div>

              {isSuperAdmin && (
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5] group-focus-within:text-[#5d5045]" />
                  <input
                    type="password"
                    placeholder="CLAVE DE REGISTRO SUPER ADMIN"
                    autoComplete="off"
                    className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 md:py-5 pl-12 pr-4 rounded-2xl text-[10px] md:text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all"
                    value={account.super_admin_registration_secret}
                    onChange={(e) =>
                      setAccount({
                        ...account,
                        super_admin_registration_secret: e.target.value,
                      })
                    }
                  />
                </div>
              )}

              {!withGoogle && (
                <>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5] group-focus-within:text-[#5d5045]" />
                    <input
                      type="text"
                      placeholder="NOMBRE DE USUARIO"
                      required
                      className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 md:py-5 pl-12 pr-4 rounded-2xl text-[10px] md:text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all"
                      value={account.username}
                      onChange={(e) =>
                        setAccount({ ...account, username: e.target.value })
                      }
                    />
                  </div>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5] group-focus-within:text-[#5d5045]" />
                    <input
                      type="email"
                      placeholder="CORREO ELECTRÓNICO"
                      required
                      className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 md:py-5 pl-12 pr-4 rounded-2xl text-[10px] md:text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all"
                      value={account.email}
                      onChange={(e) =>
                        setAccount({ ...account, email: e.target.value })
                      }
                    />
                  </div>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5] group-focus-within:text-[#5d5045]" />
                    <input
                      type="password"
                      placeholder="CONTRASEÑA"
                      required
                      className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 md:py-5 pl-12 pr-4 rounded-2xl text-[10px] md:text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all"
                      value={account.password}
                      onChange={(e) =>
                        setAccount({ ...account, password: e.target.value })
                      }
                    />
                  </div>
                </>
              )}

              {withGoogle && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-900 flex flex-col gap-2">
                  <span>
                    Google vinculado: tu usuario será tu correo y el acceso con
                    contraseña será solo vía Google.
                  </span>
                  <button
                    type="button"
                    onClick={clearGoogle}
                    className="text-[9px] underline text-emerald-800 self-start font-bold"
                  >
                    Usar usuario, correo y contraseña manual
                  </button>
                </div>
              )}

              {googleClientId && !withGoogle && (
                <div className="space-y-2 pt-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#8c857d] text-center">
                    O vincula tu cuenta con Google
                  </p>
                  <div className="flex justify-center">
                    <GoogleLoginButton
                      clientId={googleClientId}
                      onSuccess={handleGoogleSuccess}
                      onError={handleGoogleError}
                      width={280}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-2 border-t border-[#eaddcf]">
                <label className="flex items-start gap-3 cursor-pointer text-[10px] font-bold text-[#5d5045] leading-relaxed">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-[#eaddcf]"
                    checked={account.acceptTerms}
                    onChange={(e) =>
                      setAccount({ ...account, acceptTerms: e.target.checked })
                    }
                  />
                  <span>
                    He leído y acepto los{" "}
                    <Link
                      to="/legal/terms"
                      className="text-[#5d5045] underline underline-offset-4 font-black"
                    >
                      términos y condiciones
                    </Link>
                    .
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer text-[10px] font-bold text-[#5d5045] leading-relaxed">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-[#eaddcf]"
                    checked={account.acceptPrivacy}
                    onChange={(e) =>
                      setAccount({
                        ...account,
                        acceptPrivacy: e.target.checked,
                      })
                    }
                  />
                  <span>
                    He leído la{" "}
                    <Link
                      to="/legal/privacy"
                      className="text-[#5d5045] underline underline-offset-4 font-black"
                    >
                      política de privacidad
                    </Link>
                    .
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading || !canSubmitStep1}
                className="w-full bg-[#5d5045] text-[#f5ebe0] py-4 md:py-5 rounded-full text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#4a3f36] transition-all shadow-xl shadow-[#5d5045]/10 active:scale-[0.98] disabled:opacity-50"
              >
                {isLoading ? "PROCESANDO..." : "Continuar"}
                {!isLoading && <ChevronRight className="w-4 h-4" />}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={submitStep2} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-[9px] font-black uppercase p-4 rounded-2xl border border-red-100 italic">
                  {error}
                </div>
              )}
              <p className="text-[10px] text-[#8c857d] leading-relaxed">
                Completa los datos de tu negocio para facturación. Esta
                información queda asociada a tu cuenta de titular.
              </p>

              <div className="pt-2 space-y-3 border-t border-[#eaddcf]">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#5d5045] flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Facturación
                </p>
                <select
                  value={billing.business_type}
                  onChange={(e) =>
                    setBilling({ ...billing, business_type: e.target.value })
                  }
                  required
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                >
                  <option value="SALON">Salón / estética</option>
                  <option value="LAWYER">Abogacía</option>
                  <option value="MECHANIC">Taller / mecánica</option>
                  <option value="GYM">Gimnasio / wellness</option>
                  <option value="OTHER">Otro</option>
                </select>
                <input
                  type="text"
                  placeholder="NOMBRE COMERCIAL"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                  value={billing.organization_name}
                  onChange={(e) =>
                    setBilling({
                      ...billing,
                      organization_name: e.target.value,
                    })
                  }
                />
                <input
                  type="text"
                  placeholder="RAZÓN SOCIAL / NOMBRE FISCAL"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                  value={billing.legal_name}
                  onChange={(e) =>
                    setBilling({ ...billing, legal_name: e.target.value })
                  }
                />
                <input
                  type="text"
                  placeholder="DIRECCIÓN DE FACTURACIÓN (LÍNEA 1)"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                  value={billing.billing_address_line1}
                  onChange={(e) =>
                    setBilling({
                      ...billing,
                      billing_address_line1: e.target.value,
                    })
                  }
                />
                <input
                  type="text"
                  placeholder="DIRECCIÓN (LÍNEA 2, OPCIONAL)"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                  value={billing.billing_address_line2}
                  onChange={(e) =>
                    setBilling({
                      ...billing,
                      billing_address_line2: e.target.value,
                    })
                  }
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="CIUDAD"
                    className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                    value={billing.city}
                    onChange={(e) =>
                      setBilling({ ...billing, city: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    placeholder="CÓDIGO POSTAL"
                    className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                    value={billing.postal_code}
                    onChange={(e) =>
                      setBilling({ ...billing, postal_code: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="PROVINCIA / ESTADO"
                    className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                    value={billing.province}
                    onChange={(e) =>
                      setBilling({ ...billing, province: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    placeholder="PAÍS"
                    className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                    value={billing.country}
                    onChange={(e) =>
                      setBilling({ ...billing, country: e.target.value })
                    }
                  />
                </div>
                <input
                  type="text"
                  placeholder="NIF / CIF / VAT (OPCIONAL)"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                  value={billing.tax_id}
                  onChange={(e) =>
                    setBilling({ ...billing, tax_id: e.target.value })
                  }
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="tel"
                    placeholder="TELÉFONO FACTURACIÓN (OPCIONAL)"
                    className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                    value={billing.billing_phone}
                    onChange={(e) =>
                      setBilling({ ...billing, billing_phone: e.target.value })
                    }
                  />
                  <input
                    type="email"
                    placeholder="EMAIL FACTURACIÓN (OPCIONAL)"
                    className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-4 rounded-2xl text-[10px] font-black tracking-widest focus:outline-none focus:border-[#5d5045]"
                    value={billing.billing_email}
                    onChange={(e) =>
                      setBilling({ ...billing, billing_email: e.target.value })
                    }
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !canSubmitStep2}
                className="w-full bg-[#5d5045] text-[#f5ebe0] py-4 md:py-5 rounded-full text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#4a3f36] transition-all shadow-xl shadow-[#5d5045]/10 active:scale-[0.98] disabled:opacity-50"
              >
                {isLoading ? "GUARDANDO..." : "Guardar y finalizar"}
                {!isLoading && <ChevronRight className="w-4 h-4" />}
              </button>
            </form>
          )}

          {step === 3 && (
            <div className="space-y-6 text-center lg:text-left">
              <p className="text-[11px] text-[#8c857d] leading-relaxed font-medium">
                Tu cuenta está lista. Inicia sesión con el mismo correo y
                contraseña que elegiste, o con Google si registraste con Google.
              </p>
              <button
                type="button"
                onClick={handleFinishLogin}
                className="w-full bg-[#5d5045] text-[#f5ebe0] py-4 md:py-5 rounded-full text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] hover:bg-[#4a3f36] transition-all shadow-xl shadow-[#5d5045]/10"
              >
                Ir a iniciar sesión
              </button>
            </div>
          )}

          {step === 1 && (
            <p className="text-[10px] md:text-[11px] text-[#8c857d] text-center font-medium pt-2">
              ¿Ya tienes cuenta?{" "}
              <button
                type="button"
                onClick={onBack}
                className="text-[#5d5045] font-black uppercase tracking-widest hover:underline underline-offset-8 ml-1"
              >
                Log in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegisterView;
