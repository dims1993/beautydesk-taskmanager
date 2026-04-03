import React, { useMemo, useState } from "react";
import { Building2, Mail, Phone, Shield, User } from "lucide-react";
import { useApi } from "../../hooks/useApi";

function formatErr(err) {
  if (!err) return "Error";
  if (typeof err.detail === "string") return err.detail;
  if (Array.isArray(err.detail)) {
    return err.detail.map((d) => d.msg || JSON.stringify(d)).join(" ");
  }
  return err.message || "Error";
}

export default function SettingsView({
  currentUser,
  onRefresh,
  onError,
  services = [],
}) {
  const { apiRequest } = useApi();
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

  return (
    <div className="animate-fadeIn space-y-8 pb-16">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#8c857d]">
          Cuenta
        </p>
        <h2 className="font-serif text-2xl text-[#5d5045] mt-1">Ajustes</h2>
      </div>

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

      {!needsFiscal && String(currentUser?.role || "").toUpperCase() === "OWNER" && (
        <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-[#e5e0d8] space-y-3">
          <p className="text-[11px] text-[#8c857d] leading-relaxed">
            Los datos fiscales de tu negocio ya están registrados. Si necesitas
            cambios administrativos, contacta con soporte.
          </p>
        </div>
      )}

      {isOwnerWithOrg && (
        <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-[#e5e0d8] space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[#5d5045]">
            Servicios de tu negocio
          </h3>
          <p className="text-[10px] text-[#8c857d] leading-relaxed">
            Tu cuenta solo ve los servicios de tu organización. Añade aquí los
            que ofrezcas para poder crear citas.
          </p>
          {services.length > 0 && (
            <ul className="text-[11px] text-[#5d5045] space-y-1 list-disc list-inside">
              {services.map((s) => (
                <li key={s.id}>
                  <span className="font-bold">{s.name}</span> — {s.duration} min —{" "}
                  {s.price}€
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={submitService} className="grid gap-2 pt-2 border-t border-[#eee8e2]">
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
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={5}
                placeholder="Minutos"
                className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-3 px-4 rounded-2xl text-[10px] font-black"
                value={svcForm.duration}
                onChange={(e) =>
                  setSvcForm({ ...svcForm, duration: e.target.value })
                }
              />
              <input
                type="number"
                min={0}
                step={0.5}
                placeholder="Precio €"
                className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-3 px-4 rounded-2xl text-[10px] font-black"
                value={svcForm.price}
                onChange={(e) =>
                  setSvcForm({ ...svcForm, price: e.target.value })
                }
              />
            </div>
            <button
              type="submit"
              disabled={svcSaving || !svcForm.name.trim()}
              className="w-full bg-[#5d5045] text-[#f5ebe0] py-3 rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              {svcSaving ? "Guardando…" : "Añadir servicio"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
