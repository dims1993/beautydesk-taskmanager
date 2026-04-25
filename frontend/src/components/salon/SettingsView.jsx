import React, { useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getPendingPlanFromSession } from "../../utils/billingPlan";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  CreditCard,
  Mail,
  Pencil,
  Phone,
  Scissors,
  Clock,
  Shield,
  Trash2,
  User,
} from "lucide-react";
import BillingSubscriptionPanel from "./BillingSubscriptionPanel";
import { useApi } from "../../hooks/useApi";

function formatErr(err) {
  if (!err) return "Error";
  if (typeof err.detail === "string") return err.detail;
  if (Array.isArray(err.detail)) {
    return err.detail.map((d) => d.msg || JSON.stringify(d)).join(" ");
  }
  return err.message || "Error";
}

/**
 * Collapsible settings block (ready for more sections: servicios, facturación, etc.).
 */
function SettingsAccordion({
  title,
  description,
  defaultOpen = false,
  icon: Icon,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const baseId = useId();
  const headerId = `settings-acc-h-${baseId}`;
  const panelId = `settings-acc-p-${baseId}`;

  return (
    <div className="rounded-[2.5rem] border border-[#e5e0d8] bg-white/90 shadow-sm backdrop-blur-md overflow-hidden">
      <button
        type="button"
        id={headerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-6 text-left transition-colors hover:bg-black/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d5045]/30 focus-visible:ring-inset"
      >
        <div className="min-w-0 flex-1 flex items-start gap-3">
          {Icon ? (
            <Icon
              className="mt-0.5 h-4 w-4 shrink-0 text-[#5d5045]"
              strokeWidth={2}
            />
          ) : null}
          <div className="min-w-0">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#5d5045]">
              {title}
            </h3>
            {description ? (
              <p className="mt-1 text-[10px] leading-relaxed text-[#8c857d]">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[#8c857d] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        hidden={!open}
        className={open ? "border-t border-[#e5e0d8]/80" : ""}
      >
        {open ? (
          <div className="px-6 pb-6 pt-4">
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function SettingsView({
  currentUser,
  onRefresh,
  onError,
  services = [],
}) {
  const [searchParams] = useSearchParams();
  const [subscriptionOpenDefault] = useState(() => {
    const b = searchParams.get("billing");
    if (b === "1" || b === "focus") return true;
    return Boolean(getPendingPlanFromSession());
  });
  const { apiRequest } = useApi();

  const focus = String(searchParams.get("focus") || "").toLowerCase();
  const focusServices = focus === "services";
  const focusHours = focus === "hours";
  const needsFiscal =
    String(currentUser?.role || "").toUpperCase() === "OWNER" &&
    (currentUser?.organization_id == null ||
      currentUser?.organization_id === undefined);

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
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const [savedOk, setSavedOk] = useState(false);

  const [svcForm, setSvcForm] = useState({
    name: "",
    description: "",
    duration: 45,
    price: 25,
  });
  const [svcSaving, setSvcSaving] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [svcEditSaving, setSvcEditSaving] = useState(false);
  const [svcDeletingId, setSvcDeletingId] = useState(null);
  const [serviceToDelete, setServiceToDelete] = useState(null);

  const [hours, setHours] = useState(null);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursMsg, setHoursMsg] = useState("");

  const dayLabel = (dow) =>
    ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][
      Number(dow) || 0
    ];

  const loadHours = async () => {
    if (!isOwnerWithOrg) return;
    setHoursLoading(true);
    setHoursMsg("");
    try {
      const r = await apiRequest("/users/me/organization/salon-hours", "GET");
      setHours(Array.isArray(r?.days) ? r.days : []);
    } catch (err) {
      onError?.(formatErr(err));
    } finally {
      setHoursLoading(false);
    }
  };

  const saveHours = async () => {
    if (!Array.isArray(hours) || hours.length !== 7) return;
    setHoursSaving(true);
    setHoursMsg("");
    try {
      await apiRequest("/users/me/organization/salon-hours", "PATCH", {
        days: hours,
      });
      setHoursMsg("Horario guardado.");
      await onRefresh?.();
    } catch (err) {
      setHoursMsg(formatErr(err));
      onError?.(formatErr(err));
    } finally {
      setHoursSaving(false);
    }
  };

  const isOwnerWithOrg =
    String(currentUser?.role || "").toUpperCase() === "OWNER" &&
    currentUser?.organization_id != null;

  const canSubmitBilling = useMemo(() => {
    return (
      billing.organization_name.trim() &&
      billing.legal_name.trim() &&
      billing.billing_address_line1.trim() &&
      billing.city.trim() &&
      billing.postal_code.trim() &&
      billing.country.trim()
    );
  }, [billing]);

  const submitBilling = async (e) => {
    e.preventDefault();
    setLocalError("");
    setSavedOk(false);
    if (!canSubmitBilling) {
      setLocalError("Completa los campos obligatorios.");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/users/register/billing", "POST", {
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
      });
      setSavedOk(true);
      await onRefresh?.();
    } catch (err) {
      setLocalError(formatErr(err));
      onError?.(formatErr(err));
    } finally {
      setSaving(false);
    }
  };

  const submitService = async (e) => {
    e.preventDefault();
    if (!svcForm.name.trim()) return;
    setSvcSaving(true);
    try {
      await apiRequest("/services/", "POST", {
        name: svcForm.name.trim(),
        description: svcForm.description.trim() || null,
        duration: Number(svcForm.duration) || 30,
        price: Number(svcForm.price) || 0,
      });
      setSvcForm({ name: "", description: "", duration: 45, price: 25 });
      await onRefresh?.();
    } catch (err) {
      onError?.(formatErr(err));
    } finally {
      setSvcSaving(false);
    }
  };

  const submitEditService = async (e) => {
    e.preventDefault();
    if (!editingService?.id || !String(editingService.name || "").trim()) return;
    setSvcEditSaving(true);
    try {
      await apiRequest(`/services/${editingService.id}`, "PATCH", {
        name: String(editingService.name).trim(),
        description: String(editingService.description || "").trim() || null,
        duration: Number(editingService.duration) || 30,
        price: Number(editingService.price) || 0,
      });
      setEditingService(null);
      await onRefresh?.();
    } catch (err) {
      onError?.(formatErr(err));
    } finally {
      setSvcEditSaving(false);
    }
  };

  const confirmDeleteService = async () => {
    if (!serviceToDelete?.id) return;
    const id = serviceToDelete.id;
    setSvcDeletingId(id);
    try {
      await apiRequest(`/services/${id}`, "DELETE");
      setServiceToDelete(null);
      if (editingService?.id === id) setEditingService(null);
      await onRefresh?.();
    } catch (err) {
      onError?.(formatErr(err));
    } finally {
      setSvcDeletingId(null);
    }
  };

  return (
    <div className="animate-fadeIn space-y-6 pb-16">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#8c857d]">
          Cuenta
        </p>
        <h2 className="font-serif text-2xl text-[#5d5045] mt-1">Ajustes</h2>
      </div>

      {/* Fijo: perfil */}
      <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-[#e5e0d8] space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-[#5d5045] flex items-center gap-2">
          <User className="w-4 h-4" />
          Tu perfil
        </h3>
        <div className="grid gap-3 text-[11px] text-[#5d5045]">
          <div className="flex items-center gap-2 text-[#8c857d]">
            <Mail className="w-4 h-4 shrink-0" />
            <span className="font-bold">{currentUser?.email || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-[#8c857d]">
            <Shield className="w-4 h-4 shrink-0" />
            <span className="font-black uppercase tracking-widest">
              {String(currentUser?.role || "").replace(/_/g, " ")}
            </span>
          </div>
          {currentUser?.phone && (
            <div className="flex items-center gap-2 text-[#8c857d]">
              <Phone className="w-4 h-4 shrink-0" />
              <span>{currentUser.phone}</span>
            </div>
          )}
          {currentUser?.organization_id != null && (
            <p className="text-[10px] text-[#8c857d] pt-2">
              Negocio vinculado (ID organización: {currentUser.organization_id})
            </p>
          )}
        </div>
      </div>

      {needsFiscal && (
        <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-950 flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Completa los datos fiscales del negocio
          </h3>
          <p className="text-[11px] text-amber-950/90 leading-relaxed">
            Falta esta información para activar tu agenda, clientes y citas en
            tu propio espacio. Los datos demo no se mezclan con tu cuenta.
          </p>
          {localError && (
            <p className="text-[10px] font-bold text-red-600 uppercase">
              {localError}
            </p>
          )}
          {savedOk && (
            <p className="text-[10px] font-bold text-emerald-700 uppercase">
              Datos guardados. Ya puedes usar la app con tu organización.
            </p>
          )}
          <form onSubmit={submitBilling} className="space-y-3">
            <select
              value={billing.business_type}
              onChange={(e) =>
                setBilling({ ...billing, business_type: e.target.value })
              }
              className="w-full bg-white border border-amber-200 py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
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
              className="w-full bg-white border border-amber-200 py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
              value={billing.organization_name}
              onChange={(e) =>
                setBilling({ ...billing, organization_name: e.target.value })
              }
            />
            <input
              type="text"
              placeholder="RAZÓN SOCIAL / NOMBRE FISCAL"
              className="w-full bg-white border border-amber-200 py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
              value={billing.legal_name}
              onChange={(e) =>
                setBilling({ ...billing, legal_name: e.target.value })
              }
            />
            <input
              type="text"
              placeholder="DIRECCIÓN FACTURACIÓN (LÍNEA 1)"
              className="w-full bg-white border border-amber-200 py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
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
              className="w-full bg-white border border-amber-200 py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
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
                className="w-full bg-white border border-amber-200 py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
                value={billing.city}
                onChange={(e) =>
                  setBilling({ ...billing, city: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="CÓDIGO POSTAL"
                className="w-full bg-white border border-amber-200 py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
                value={billing.postal_code}
                onChange={(e) =>
                  setBilling({ ...billing, postal_code: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="PROVINCIA"
                className="w-full bg-white border border-amber-200 py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
                value={billing.province}
                onChange={(e) =>
                  setBilling({ ...billing, province: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="PAÍS"
                className="w-full bg-white border border-amber-200 py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
                value={billing.country}
                onChange={(e) =>
                  setBilling({ ...billing, country: e.target.value })
                }
              />
            </div>
            <input
              type="text"
              placeholder="NIF / CIF (OPCIONAL)"
              className="w-full bg-white border border-amber-200 py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
              value={billing.tax_id}
              onChange={(e) =>
                setBilling({ ...billing, tax_id: e.target.value })
              }
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="tel"
                placeholder="TEL. FACTURACIÓN (OPCIONAL)"
                className="w-full bg-white border border-amber-200 py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
                value={billing.billing_phone}
                onChange={(e) =>
                  setBilling({ ...billing, billing_phone: e.target.value })
                }
              />
              <input
                type="email"
                placeholder="EMAIL FACTURACIÓN (OPCIONAL)"
                className="w-full bg-white border border-amber-200 py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
                value={billing.billing_email}
                onChange={(e) =>
                  setBilling({ ...billing, billing_email: e.target.value })
                }
              />
            </div>
            <button
              type="submit"
              disabled={saving || !canSubmitBilling}
              className="w-full bg-[#5d5045] text-[#f5ebe0] py-4 rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar datos fiscales"}
            </button>
          </form>
        </div>
      )}

      {!needsFiscal &&
        String(currentUser?.role || "").toUpperCase() === "OWNER" && (
          <SettingsAccordion
            title="Facturación"
            description="Estado de los datos fiscales registrados para tu negocio."
            icon={Building2}
            defaultOpen={false}
          >
            <p className="text-[11px] text-[#8c857d] leading-relaxed">
              Los datos fiscales de tu negocio ya están registrados. Si necesitas
              cambios administrativos, contacta con soporte.
            </p>
          </SettingsAccordion>
        )}

      {isOwnerWithOrg && (
        <SettingsAccordion
          title="Suscripción y pago"
          description="Contrata o cambia tu plan con Stripe; los permisos se aplican según el plan activo."
          icon={CreditCard}
          defaultOpen={subscriptionOpenDefault}
        >
          <BillingSubscriptionPanel
            currentUser={currentUser}
            onRefresh={onRefresh}
            onError={onError}
          />
        </SettingsAccordion>
      )}

      {isOwnerWithOrg && (
        <SettingsAccordion
          title="Servicios del negocio"
          description={
            services.length > 0
              ? `${services.length} servicio${services.length === 1 ? "" : "s"} configurado${services.length === 1 ? "" : "s"}. Abre para añadir o revisar.`
              : "Añade los servicios que ofreces para poder crear citas."
          }
          icon={Scissors}
          defaultOpen={focusServices}
        >
          <p className="text-[10px] text-[#8c857d] leading-relaxed mb-4">
            Tu cuenta solo ve los servicios de tu organización.
          </p>
          {services.length > 0 && (
            <div className="mb-4 space-y-3 pb-4 border-b border-[#eee8e2]">
              {services.map((s) =>
                editingService?.id === s.id ? (
                  <form
                    key={s.id}
                    onSubmit={submitEditService}
                    className="rounded-2xl border border-[#dcc7b1] bg-[#faf8f5] p-4 space-y-3"
                  >
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#5d5045]">
                      Editar servicio
                    </p>
                    <input
                      type="text"
                      required
                      placeholder="Nombre"
                      className="w-full bg-white border border-[#eaddcf] py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
                      value={editingService.name}
                      onChange={(e) =>
                        setEditingService({
                          ...editingService,
                          name: e.target.value,
                        })
                      }
                    />
                    <input
                      type="text"
                      placeholder="Descripción (opcional)"
                      className="w-full bg-white border border-[#eaddcf] py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
                      value={editingService.description}
                      onChange={(e) =>
                        setEditingService({
                          ...editingService,
                          description: e.target.value,
                        })
                      }
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8c857d] mb-1">
                          Minutos
                        </label>
                        <input
                          type="number"
                          min={5}
                          className="w-full bg-white border border-[#eaddcf] py-2.5 px-3 rounded-xl text-[10px] font-black"
                          value={editingService.duration}
                          onChange={(e) =>
                            setEditingService({
                              ...editingService,
                              duration: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8c857d] mb-1">
                          Precio (€)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          className="w-full bg-white border border-[#eaddcf] py-2.5 px-3 rounded-xl text-[10px] font-black"
                          value={editingService.price}
                          onChange={(e) =>
                            setEditingService({
                              ...editingService,
                              price: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingService(null)}
                        disabled={svcEditSaving}
                        className="flex-1 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest text-[#8c857d] border border-[#eaddcf] bg-white disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={svcEditSaving}
                        className="flex-1 py-2.5 rounded-full bg-[#5d5045] text-[#f5ebe0] text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        {svcEditSaving ? "Guardando…" : "Guardar"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div
                    key={s.id}
                    className="flex flex-col gap-3 rounded-2xl border border-[#eee8e2] bg-[#FAF9F6] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[#5d5045] truncate">
                        {s.name}
                      </p>
                      <p className="text-[10px] text-[#8c857d] mt-0.5">
                        {s.duration} min — {s.price}€
                        {s.description ? (
                          <span className="block mt-1 text-[9px] opacity-90">
                            {s.description}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingService({
                            id: s.id,
                            name: s.name,
                            description: s.description || "",
                            duration: s.duration,
                            price: s.price,
                          })
                        }
                        disabled={svcDeletingId != null}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#eaddcf] bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#5d5045] transition hover:border-[#5d5045] disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setServiceToDelete({ id: s.id, name: s.name })
                        }
                        disabled={svcDeletingId != null}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-100 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                        {svcDeletingId === s.id ? "…" : "Eliminar"}
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
          <form
            onSubmit={submitService}
            className="grid gap-2 pt-1"
          >
            <p className="text-[9px] font-black uppercase tracking-widest text-[#5d5045] mb-1">
              Añadir servicio
            </p>
            <input
              type="text"
              placeholder="Nombre del servicio"
              className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
              value={svcForm.name}
              onChange={(e) =>
                setSvcForm({ ...svcForm, name: e.target.value })
              }
            />
            <input
              type="text"
              placeholder="Descripción (opcional)"
              className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
              value={svcForm.description}
              onChange={(e) =>
                setSvcForm({ ...svcForm, description: e.target.value })
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label
                  htmlFor="settings-svc-duration"
                  className="block text-[9px] font-black uppercase tracking-widest text-[#8c857d] ml-1"
                >
                  Duración del servicio
                </label>
                <p className="text-[9px] text-[#a39485] ml-1 leading-snug">
                  Tiempo en{" "}
                  <span className="font-bold text-[#5d5045]">minutos</span> (ej.
                  45 para una manicura).
                </p>
                <input
                  id="settings-svc-duration"
                  type="number"
                  min={5}
                  inputMode="numeric"
                  placeholder="Ej. 45"
                  aria-label="Duración en minutos"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-3 px-4 rounded-2xl text-[10px] font-black"
                  value={svcForm.duration}
                  onChange={(e) =>
                    setSvcForm({ ...svcForm, duration: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="settings-svc-price"
                  className="block text-[9px] font-black uppercase tracking-widest text-[#8c857d] ml-1"
                >
                  Precio del servicio
                </label>
                <p className="text-[9px] text-[#a39485] ml-1 leading-snug">
                  Importe en{" "}
                  <span className="font-bold text-[#5d5045]">euros (€)</span>;
                  puedes usar decimales (ej. 25 o 32,50).
                </p>
                <input
                  id="settings-svc-price"
                  type="number"
                  min={0}
                  step={0.5}
                  inputMode="decimal"
                  placeholder="Ej. 25"
                  aria-label="Precio en euros"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-3 px-4 rounded-2xl text-[10px] font-black"
                  value={svcForm.price}
                  onChange={(e) =>
                    setSvcForm({ ...svcForm, price: e.target.value })
                  }
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={svcSaving || !svcForm.name.trim()}
              className="w-full bg-[#5d5045] text-[#f5ebe0] py-3 rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-50 mt-2"
            >
              {svcSaving ? "Guardando…" : "Añadir servicio"}
            </button>
          </form>
        </SettingsAccordion>
      )}

      {isOwnerWithOrg && (
        <SettingsAccordion
          title="Horario del salón"
          description="Define a qué horas está abierto el negocio para calcular huecos disponibles y automatizar reservas."
          icon={Clock}
          defaultOpen={focusHours}
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <p className="text-[10px] text-[#8c857d] leading-relaxed">
              Recomendación: configura el horario antes de usar el agente de WhatsApp.
            </p>
            <button
              type="button"
              onClick={loadHours}
              disabled={hoursLoading}
              className="shrink-0 rounded-full border border-[#eaddcf] bg-white px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#5d5045] disabled:opacity-50"
            >
              {hoursLoading ? "Cargando…" : "Cargar"}
            </button>
          </div>

          {hoursMsg && (
            <p
              className={`mb-3 text-[10px] font-bold ${
                hoursMsg === "Horario guardado."
                  ? "text-green-700"
                  : "text-red-600"
              }`}
            >
              {hoursMsg}
            </p>
          )}

          {!hours && (
            <p className="text-[10px] text-[#8c857d]">
              Pulsa <strong>Cargar</strong> para ver tu horario actual.
            </p>
          )}

          {Array.isArray(hours) && hours.length === 7 && (
            <div className="space-y-3">
              {hours.map((d, idx) => (
                <div
                  key={d.day_of_week ?? idx}
                  className="rounded-2xl border border-[#eee8e2] bg-[#FAF9F6] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black tracking-widest text-[#5d5045]">
                      {dayLabel(d.day_of_week)}
                    </p>
                    <label className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[#8c857d]">
                      <input
                        type="checkbox"
                        checked={!!d.is_open}
                        onChange={(e) =>
                          setHours((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, is_open: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                      Abierto
                    </label>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[8px] font-black uppercase text-[#8c857d] mb-1">
                        Apertura
                      </label>
                      <input
                        type="time"
                        value={d.open_time || "09:00"}
                        disabled={!d.is_open}
                        onChange={(e) =>
                          setHours((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, open_time: e.target.value } : x,
                            ),
                          )
                        }
                        className="w-full rounded-xl border border-[#eaddcf] bg-white px-3 py-2 text-[10px] font-black text-[#5d5045] disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-black uppercase text-[#8c857d] mb-1">
                        Cierre
                      </label>
                      <input
                        type="time"
                        value={d.close_time || "20:00"}
                        disabled={!d.is_open}
                        onChange={(e) =>
                          setHours((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? { ...x, close_time: e.target.value }
                                : x,
                            ),
                          )
                        }
                        className="w-full rounded-xl border border-[#eaddcf] bg-white px-3 py-2 text-[10px] font-black text-[#5d5045] disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={saveHours}
                disabled={hoursSaving}
                className="w-full rounded-full bg-[#5d5045] py-3 text-[10px] font-black uppercase tracking-widest text-[#f5ebe0] disabled:opacity-50"
              >
                {hoursSaving ? "Guardando…" : "Guardar horario"}
              </button>
            </div>
          )}
        </SettingsAccordion>
      )}

      {serviceToDelete && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="presentation"
          onClick={() => {
            if (svcDeletingId == null) setServiceToDelete(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-delete-svc-title"
            className="w-full max-w-sm rounded-[2.5rem] bg-white p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100">
              <AlertTriangle className="h-7 w-7" strokeWidth={1.75} />
            </div>
            <p className="text-center text-[9px] font-black uppercase tracking-[0.35em] text-[#a39485] mb-2">
              Eliminar servicio
            </p>
            <h3
              id="settings-delete-svc-title"
              className="font-serif text-lg text-center text-[#5d5045] mb-3 leading-snug"
            >
              ¿Eliminar «{serviceToDelete.name}»?
            </h3>
            <p className="text-[12px] leading-relaxed text-[#6d6359] text-center mb-8">
              Esta acción no se puede deshacer. Si hay citas asociadas a este
              servicio, no podrás eliminarlo hasta que las gestiones.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setServiceToDelete(null)}
                disabled={svcDeletingId != null}
                className="w-full sm:w-auto rounded-full border border-[#eaddcf] bg-white px-6 py-3 text-[10px] font-black uppercase tracking-widest text-[#8c857d] transition hover:bg-[#faf8f5] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteService}
                disabled={svcDeletingId != null}
                className="w-full sm:w-auto rounded-full bg-red-600 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-red-700 disabled:opacity-50"
              >
                {svcDeletingId != null ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
