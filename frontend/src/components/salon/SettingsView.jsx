import React, { useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getPendingPlanFromSession } from "../../utils/billingPlan";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  CreditCard,
  Mail,
  Palette,
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
    <div className="rounded-[2.5rem] border border-[var(--bt-border)] bg-white/90 shadow-sm backdrop-blur-md overflow-hidden">
      <button
        type="button"
        id={headerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-6 text-left transition-colors hover:bg-black/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bt-primary)]/30 focus-visible:ring-inset"
      >
        <div className="min-w-0 flex-1 flex items-start gap-3">
          {Icon ? (
            <Icon
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bt-primary)]"
              strokeWidth={2}
            />
          ) : null}
          <div className="min-w-0">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--bt-primary)]">
              {title}
            </h3>
            {description ? (
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--bt-muted)]">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[var(--bt-muted)] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        hidden={!open}
        className={open ? "border-t border-[var(--bt-border)]/80" : ""}
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

  const currentUiTheme = String(currentUser?.organization_ui_theme || "nails")
    .trim()
    .toLowerCase();
  const [uiTheme, setUiTheme] = useState(currentUiTheme);
  const [uiThemeBusy, setUiThemeBusy] = useState(false);
  const [uiThemeOk, setUiThemeOk] = useState(false);
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
  const [hoursShiftType, setHoursShiftType] = useState("intensive"); // intensive | split
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursMsg, setHoursMsg] = useState("");

  const [closedDates, setClosedDates] = useState(null);
  const [closedDatesLoading, setClosedDatesLoading] = useState(false);
  const [closedDatesSaving, setClosedDatesSaving] = useState(false);
  const [closedDatesMsg, setClosedDatesMsg] = useState("");
  const [newClosedDate, setNewClosedDate] = useState("");
  const [holidaySuggesting, setHolidaySuggesting] = useState(false);

  const formatDateEs = (iso) => {
    const s = String(iso || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return s;
    return `${m[3]}/${m[2]}/${m[1]}`;
  };

  const dayLabel = (dow) =>
    ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][
      Number(dow) || 0
    ];

  const normalizeHoursDays = (days) => {
    const out = [];
    for (let dow = 0; dow < 7; dow++) {
      const row = Array.isArray(days)
        ? days.find((d) => Number(d?.day_of_week) === dow)
        : null;
      const isOpen = row ? !!row.is_open : dow !== 6;
      let mode = String(row?.mode || "").trim().toLowerCase();
      let intervals = Array.isArray(row?.intervals) ? row.intervals : null;

      // Backward compat: open_time/close_time
      if (!Array.isArray(intervals) || intervals.length === 0) {
        const ot = String(row?.open_time || "09:00");
        const ct = String(row?.close_time || "20:00");
        intervals = [{ start: ot, end: ct }];
        mode = "intensive";
      }

      if (mode !== "intensive" && mode !== "split") {
        mode = intervals.length === 2 ? "split" : "intensive";
      }

      // Ensure split has 2 intervals (typical lunch break default)
      if (mode === "split" && intervals.length === 1) {
        intervals = [
          { start: intervals[0]?.start || "09:00", end: "14:00" },
          { start: "16:00", end: intervals[0]?.end || "20:00" },
        ];
      }
      if (mode === "intensive" && intervals.length !== 1) {
        intervals = [
          {
            start: String(intervals[0]?.start || "09:00"),
            end: String(intervals[intervals.length - 1]?.end || "20:00"),
          },
        ];
      }

      out.push({
        day_of_week: dow,
        is_open: isOpen,
        mode,
        intervals,
      });
    }
    return out;
  };

  const applyShiftTypeToAll = (type) => {
    const t = String(type || "intensive").toLowerCase();
    setHoursShiftType(t);
    setHours((prev) => {
      if (!Array.isArray(prev) || prev.length !== 7) return prev;
      return prev.map((d) => {
        if (!d?.is_open) return { ...d, mode: t };
        const current = Array.isArray(d?.intervals) ? d.intervals : [];
        if (t === "split") {
          const base =
            current.length >= 1
              ? current[0]
              : { start: "09:00", end: "20:00" };
          return {
            ...d,
            mode: "split",
            intervals:
              current.length >= 2
                ? current
                : [
                    { start: base.start || "09:00", end: "14:00" },
                    { start: "16:00", end: base.end || "20:00" },
                  ],
          };
        }
        // intensive
        const start = current[0]?.start || "09:00";
        const end =
          current.length >= 2 ? current[current.length - 1]?.end : current[0]?.end;
        return { ...d, mode: "intensive", intervals: [{ start, end: end || "20:00" }] };
      });
    });
  };

  const addIntervalForDay = (dayIdx) => {
    setHours((prev) => {
      if (!Array.isArray(prev) || prev.length !== 7) return prev;
      return prev.map((d, idx) => {
        if (idx !== dayIdx) return d;
        const intervals = Array.isArray(d?.intervals) ? d.intervals : [];
        const lastEnd = intervals.length
          ? String(intervals[intervals.length - 1]?.end || "14:00")
          : "14:00";
        // naive default: 2h break then 4h open
        const nextStart = lastEnd < "20:00" ? lastEnd : "16:00";
        const nextEnd = nextStart < "20:00" ? "20:00" : nextStart;
        return {
          ...d,
          mode: "split",
          intervals: [...intervals, { start: nextStart, end: nextEnd }],
        };
      });
    });
  };

  const removeIntervalForDay = (dayIdx, intervalIdx) => {
    setHours((prev) => {
      if (!Array.isArray(prev) || prev.length !== 7) return prev;
      return prev.map((d, idx) => {
        if (idx !== dayIdx) return d;
        const intervals = Array.isArray(d?.intervals) ? d.intervals : [];
        const next = intervals.filter((_, i) => i !== intervalIdx);
        return { ...d, mode: "split", intervals: next };
      });
    });
  };

  const updateIntervalForDay = (dayIdx, intervalIdx, patch) => {
    setHours((prev) => {
      if (!Array.isArray(prev) || prev.length !== 7) return prev;
      return prev.map((d, idx) => {
        if (idx !== dayIdx) return d;
        const intervals = Array.isArray(d?.intervals) ? d.intervals : [];
        const next = intervals.map((it, i) =>
          i === intervalIdx ? { ...it, ...patch } : it,
        );
        return { ...d, mode: "split", intervals: next };
      });
    });
  };

  const loadHours = async () => {
    if (!isOwnerWithOrg) return;
    setHoursLoading(true);
    setHoursMsg("");
    try {
      const r = await apiRequest("/users/me/organization/salon-hours", "GET");
      const normalized = normalizeHoursDays(r?.days);
      setHours(normalized);
      const anySplit = normalized.some((d) => d?.is_open && d?.mode === "split");
      setHoursShiftType(anySplit ? "split" : "intensive");
    } catch (err) {
      onError?.(formatErr(err));
    } finally {
      setHoursLoading(false);
    }
  };

  const loadClosedDates = async () => {
    if (!isOwnerWithOrg) return;
    setClosedDatesLoading(true);
    setClosedDatesMsg("");
    try {
      const r = await apiRequest("/users/me/organization/closed-dates", "GET");
      setClosedDates(Array.isArray(r?.dates) ? r.dates : []);
    } catch (err) {
      onError?.(formatErr(err));
    } finally {
      setClosedDatesLoading(false);
    }
  };

  const saveClosedDates = async () => {
    if (!Array.isArray(closedDates)) return;
    setClosedDatesSaving(true);
    setClosedDatesMsg("");
    try {
      await apiRequest("/users/me/organization/closed-dates", "PATCH", {
        dates: closedDates,
      });
      setClosedDatesMsg("Festivos guardados.");
      await onRefresh?.();
    } catch (err) {
      setClosedDatesMsg(formatErr(err));
      onError?.(formatErr(err));
    } finally {
      setClosedDatesSaving(false);
    }
  };

  const suggestHolidays = async () => {
    if (!isOwnerWithOrg) return;
    setHolidaySuggesting(true);
    setClosedDatesMsg("");
    try {
      const year = new Date().getFullYear();
      const r = await apiRequest(
        `/users/me/organization/holiday-suggestions?year=${year}`,
        "GET",
      );
      const dates = Array.isArray(r?.dates) ? r.dates : [];
      setClosedDates((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        return Array.from(new Set([...base, ...dates])).sort();
      });
      setClosedDatesMsg("Festivos sugeridos cargados. Revisa y guarda.");
    } catch (err) {
      setClosedDatesMsg(formatErr(err));
      onError?.(formatErr(err));
    } finally {
      setHolidaySuggesting(false);
    }
  };

  const saveHours = async () => {
    if (!Array.isArray(hours) || hours.length !== 7) return;
    setHoursSaving(true);
    setHoursMsg("");
    try {
      await apiRequest("/users/me/organization/salon-hours", "PATCH", {
        days: hours.map((d) => ({
          day_of_week: Number(d.day_of_week) || 0,
          is_open: !!d.is_open,
          mode: String(d.mode || hoursShiftType || "intensive").toLowerCase(),
          intervals: Array.isArray(d.intervals) ? d.intervals : [],
        })),
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
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--bt-muted)]">
          Cuenta
        </p>
        <h2 className="font-serif text-2xl text-[var(--bt-primary)] mt-1">
          Ajustes
        </h2>
      </div>

      {/* Fijo: perfil */}
      <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-[var(--bt-border)] space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--bt-primary)] flex items-center gap-2">
          <User className="w-4 h-4" />
          Tu perfil
        </h3>
        <div className="grid gap-3 text-[11px] text-[var(--bt-primary)]">
          <div className="flex items-center gap-2 text-[var(--bt-muted)]">
            <Mail className="w-4 h-4 shrink-0" />
            <span className="font-bold">{currentUser?.email || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-[var(--bt-muted)]">
            <Shield className="w-4 h-4 shrink-0" />
            <span className="font-black uppercase tracking-widest">
              {String(currentUser?.role || "").replace(/_/g, " ")}
            </span>
          </div>
          {currentUser?.phone && (
            <div className="flex items-center gap-2 text-[var(--bt-muted)]">
              <Phone className="w-4 h-4 shrink-0" />
              <span>{currentUser.phone}</span>
            </div>
          )}
          {currentUser?.organization_id != null && (
            <p className="text-[10px] text-[var(--bt-muted)] pt-2">
              Negocio vinculado (ID organización: {currentUser.organization_id})
            </p>
          )}
        </div>
      </div>

      {/* Interfaz / paleta */}
      {currentUser?.organization_id != null &&
        String(currentUser?.role || "").toUpperCase() === "OWNER" && (
          <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-[var(--bt-border)] space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--bt-primary)] flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Interfaz
            </h3>
            <p className="text-[11px] text-[var(--bt-muted)] leading-relaxed">
              Puedes cambiar la paleta aunque tu servicio principal sugiera otra.
            </p>
            <div className="grid gap-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--bt-muted)] ml-1">
                Paleta
              </label>
              <select
                value={uiTheme}
                onChange={(e) => {
                  setUiThemeOk(false);
                  setUiTheme(e.target.value);
                }}
                className="w-full bg-[var(--bt-bg)] border border-[var(--bt-border)] py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest text-[var(--bt-primary)] focus:outline-none focus:border-[var(--bt-primary)]"
              >
                <option value="nails">Uñas / estética (actual)</option>
                <option value="hair">Peluquería / barbería / spa</option>
              </select>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-1">
              <button
                type="button"
                disabled={uiThemeBusy || uiTheme === currentUiTheme}
                onClick={async () => {
                  setUiThemeBusy(true);
                  setUiThemeOk(false);
                  try {
                    await apiRequest("/users/me/organization/ui-theme", "PATCH", {
                      ui_theme: uiTheme,
                    });
                    setUiThemeOk(true);
                    await onRefresh?.();
                  } catch (err) {
                    onError?.(formatErr(err));
                  } finally {
                    setUiThemeBusy(false);
                  }
                }}
                className="inline-flex items-center justify-center rounded-full bg-[var(--bt-primary)] px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                {uiThemeBusy ? "Guardando…" : "Guardar interfaz"}
              </button>
              {uiThemeOk && (
                <p className="text-[10px] font-bold text-emerald-700 uppercase">
                  Interfaz actualizada.
                </p>
              )}
            </div>
          </div>
        )}

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
              className="w-full bg-[var(--bt-primary)] text-white py-4 rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-50 hover:bg-[var(--bt-primary-hover)]"
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
            <p className="text-[11px] text-[var(--bt-muted)] leading-relaxed">
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
          <p className="text-[10px] text-[var(--bt-muted)] leading-relaxed mb-4">
            Tu cuenta solo ve los servicios de tu organización.
          </p>
          {services.length > 0 && (
            <div className="mb-4 space-y-3 pb-4 border-b border-[var(--bt-border)]">
              {services.map((s) =>
                editingService?.id === s.id ? (
                  <form
                    key={s.id}
                    onSubmit={submitEditService}
                    className="rounded-2xl border border-[var(--bt-border-strong)] bg-[var(--bt-bg)] p-4 space-y-3"
                  >
                    <p className="text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)]">
                      Editar servicio
                    </p>
                    <input
                      type="text"
                      required
                      placeholder="Nombre"
                      className="w-full bg-white border border-[var(--bt-border)] py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
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
                      className="w-full bg-white border border-[var(--bt-border)] py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
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
                        <label className="block text-[8px] font-black uppercase text-[var(--bt-muted)] mb-1">
                          Minutos
                        </label>
                        <input
                          type="number"
                          min={5}
                          className="w-full bg-white border border-[var(--bt-border)] py-2.5 px-3 rounded-xl text-[10px] font-black"
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
                        <label className="block text-[8px] font-black uppercase text-[var(--bt-muted)] mb-1">
                          Precio (€)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          className="w-full bg-white border border-[var(--bt-border)] py-2.5 px-3 rounded-xl text-[10px] font-black"
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
                        className="flex-1 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest text-[var(--bt-muted)] border border-[var(--bt-border)] bg-white disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={svcEditSaving}
                        className="flex-1 py-2.5 rounded-full bg-[var(--bt-primary)] text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 hover:bg-[var(--bt-primary-hover)]"
                      >
                        {svcEditSaving ? "Guardando…" : "Guardar"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div
                    key={s.id}
                    className="flex flex-col gap-3 rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[var(--bt-primary)] truncate">
                        {s.name}
                      </p>
                      <p className="text-[10px] text-[var(--bt-muted)] mt-0.5">
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
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--bt-border)] bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] transition hover:border-[var(--bt-primary)] disabled:opacity-50"
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
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] mb-1">
              Añadir servicio
            </p>
            <input
              type="text"
              placeholder="Nombre del servicio"
              className="w-full bg-[var(--bt-bg)] border border-[var(--bt-border)] py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
              value={svcForm.name}
              onChange={(e) =>
                setSvcForm({ ...svcForm, name: e.target.value })
              }
            />
            <input
              type="text"
              placeholder="Descripción (opcional)"
              className="w-full bg-[var(--bt-bg)] border border-[var(--bt-border)] py-3 px-4 rounded-2xl text-[10px] font-black tracking-widest"
              value={svcForm.description}
              onChange={(e) =>
                setSvcForm({ ...svcForm, description: e.target.value })
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label
                  htmlFor="settings-svc-duration"
                  className="block text-[9px] font-black uppercase tracking-widest text-[var(--bt-muted)] ml-1"
                >
                  Duración del servicio
                </label>
                <p className="text-[9px] text-[var(--bt-muted)] ml-1 leading-snug">
                  Tiempo en{" "}
                  <span className="font-bold text-[var(--bt-primary)]">minutos</span> (ej.
                  45 para una manicura).
                </p>
                <input
                  id="settings-svc-duration"
                  type="number"
                  min={5}
                  inputMode="numeric"
                  placeholder="Ej. 45"
                  aria-label="Duración en minutos"
                  className="w-full bg-[var(--bt-bg)] border border-[var(--bt-border)] py-3 px-4 rounded-2xl text-[10px] font-black"
                  value={svcForm.duration}
                  onChange={(e) =>
                    setSvcForm({ ...svcForm, duration: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="settings-svc-price"
                  className="block text-[9px] font-black uppercase tracking-widest text-[var(--bt-muted)] ml-1"
                >
                  Precio del servicio
                </label>
                <p className="text-[9px] text-[var(--bt-muted)] ml-1 leading-snug">
                  Importe en{" "}
                  <span className="font-bold text-[var(--bt-primary)]">euros (€)</span>;
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
                  className="w-full bg-[var(--bt-bg)] border border-[var(--bt-border)] py-3 px-4 rounded-2xl text-[10px] font-black"
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
              className="w-full bg-[var(--bt-primary)] text-white py-3 rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-50 mt-2 hover:bg-[var(--bt-primary-hover)]"
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
            <p className="text-[10px] text-[var(--bt-muted)] leading-relaxed">
              Recomendación: configura el horario antes de usar el agente de WhatsApp.
            </p>
            <button
              type="button"
              onClick={loadHours}
              disabled={hoursLoading}
              className="shrink-0 rounded-full border border-[var(--bt-border)] bg-white px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] disabled:opacity-50"
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
            <p className="text-[10px] text-[var(--bt-muted)]">
              Pulsa <strong>Cargar</strong> para ver tu horario actual.
            </p>
          )}

          {Array.isArray(hours) && hours.length === 7 && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-[var(--bt-border)] bg-white p-4">
                <label className="block text-[8px] font-black uppercase text-[var(--bt-muted)] mb-1">
                  Tipo de jornada
                </label>
                <select
                  value={hoursShiftType}
                  onChange={(e) => applyShiftTypeToAll(e.target.value)}
                  className="w-full rounded-xl border border-[var(--bt-border)] bg-[var(--bt-bg)] px-3 py-3 text-[10px] font-black tracking-widest text-[var(--bt-primary)] focus:outline-none focus:border-[var(--bt-primary)]"
                >
                  <option value="intensive">Jornada intensiva (sin descanso)</option>
                  <option value="split">Jornada partida (descanso / comida)</option>
                </select>
                {hoursShiftType === "split" && (
                  <p className="mt-2 text-[10px] text-[var(--bt-muted)]">
                    Configura 2 tramos por día (mañana y tarde) para que el sistema no
                    ofrezca citas durante el descanso.
                  </p>
                )}
              </div>
              {hours.map((d, idx) => (
                <div
                  key={d.day_of_week ?? idx}
                  className="rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black tracking-widest text-[var(--bt-primary)]">
                      {dayLabel(d.day_of_week)}
                    </p>
                    <label className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[var(--bt-muted)]">
                      <input
                        type="checkbox"
                        checked={!!d.is_open}
                        onChange={(e) =>
                          setHours((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    is_open: e.target.checked,
                                    mode: hoursShiftType,
                                    intervals: e.target.checked
                                      ? hoursShiftType === "split"
                                        ? Array.isArray(x?.intervals) &&
                                          x.intervals.length === 2
                                          ? x.intervals
                                          : [
                                              { start: "09:00", end: "14:00" },
                                              { start: "16:00", end: "20:00" },
                                            ]
                                        : [
                                            {
                                              start:
                                                (Array.isArray(x?.intervals) &&
                                                  x.intervals[0]?.start) ||
                                                "09:00",
                                              end:
                                                (Array.isArray(x?.intervals) &&
                                                  x.intervals[x.intervals.length - 1]
                                                    ?.end) ||
                                                "20:00",
                                            },
                                          ]
                                      : x.intervals,
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                      Abierto
                    </label>
                  </div>
                  {hoursShiftType === "split" ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--bt-muted)]">
                          Tramos de apertura
                        </p>
                        <button
                          type="button"
                          disabled={!d.is_open}
                          onClick={() => addIntervalForDay(idx)}
                          className="rounded-full border border-[var(--bt-border)] bg-white px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] disabled:opacity-50 hover:bg-[var(--bt-bg)]"
                        >
                          + Añadir tramo
                        </button>
                      </div>

                      {Array.isArray(d?.intervals) && d.intervals.length > 0 ? (
                        <div className="space-y-2">
                          {d.intervals.map((it, itIdx) => (
                            <div
                              key={`${d.day_of_week}-${itIdx}`}
                              className="rounded-2xl border border-[var(--bt-border)] bg-white p-3"
                            >
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <p className="text-[9px] font-black tracking-widest text-[var(--bt-primary)]">
                                  Tramo {itIdx + 1}
                                </p>
                                <button
                                  type="button"
                                  disabled={!d.is_open || d.intervals.length <= 2}
                                  onClick={() => removeIntervalForDay(idx, itIdx)}
                                  className="rounded-full border border-[var(--bt-border)] bg-white px-3 py-1 text-[8px] font-black uppercase tracking-widest text-red-600 disabled:opacity-50 hover:bg-red-50"
                                  title={
                                    d.intervals.length <= 2
                                      ? "Mínimo 2 tramos en jornada partida"
                                      : "Eliminar tramo"
                                  }
                                >
                                  Eliminar
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[8px] font-black uppercase text-[var(--bt-muted)] mb-1">
                                    Abre
                                  </label>
                                  <input
                                    type="time"
                                    value={it?.start || "09:00"}
                                    disabled={!d.is_open}
                                    onChange={(e) =>
                                      updateIntervalForDay(idx, itIdx, {
                                        start: e.target.value,
                                      })
                                    }
                                    className="w-full rounded-xl border border-[var(--bt-border)] bg-[var(--bt-bg)] px-3 py-2 text-[10px] font-black text-[var(--bt-primary)] disabled:opacity-50"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[8px] font-black uppercase text-[var(--bt-muted)] mb-1">
                                    Cierra
                                  </label>
                                  <input
                                    type="time"
                                    value={it?.end || "20:00"}
                                    disabled={!d.is_open}
                                    onChange={(e) =>
                                      updateIntervalForDay(idx, itIdx, {
                                        end: e.target.value,
                                      })
                                    }
                                    className="w-full rounded-xl border border-[var(--bt-border)] bg-[var(--bt-bg)] px-3 py-2 text-[10px] font-black text-[var(--bt-primary)] disabled:opacity-50"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-[var(--bt-muted)]">
                          Añade al menos 2 tramos (por ejemplo 09:00-14:00 y 16:00-20:00).
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[var(--bt-muted)] mb-1">
                          Apertura
                        </label>
                        <input
                          type="time"
                          value={d?.intervals?.[0]?.start || "09:00"}
                          disabled={!d.is_open}
                          onChange={(e) =>
                            setHours((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      mode: "intensive",
                                      intervals: [
                                        {
                                          start: e.target.value,
                                          end: x?.intervals?.[0]?.end || "20:00",
                                        },
                                      ],
                                    }
                                  : x,
                              ),
                            )
                          }
                          className="w-full rounded-xl border border-[var(--bt-border)] bg-white px-3 py-2 text-[10px] font-black text-[var(--bt-primary)] disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[var(--bt-muted)] mb-1">
                          Cierre
                        </label>
                        <input
                          type="time"
                          value={d?.intervals?.[0]?.end || "20:00"}
                          disabled={!d.is_open}
                          onChange={(e) =>
                            setHours((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      mode: "intensive",
                                      intervals: [
                                        {
                                          start: x?.intervals?.[0]?.start || "09:00",
                                          end: e.target.value,
                                        },
                                      ],
                                    }
                                  : x,
                              ),
                            )
                          }
                          className="w-full rounded-xl border border-[var(--bt-border)] bg-white px-3 py-2 text-[10px] font-black text-[var(--bt-primary)] disabled:opacity-50"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={saveHours}
                disabled={hoursSaving}
                className="w-full rounded-full bg-[var(--bt-primary)] py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50 hover:bg-[var(--bt-primary-hover)]"
              >
                {hoursSaving ? "Guardando…" : "Guardar horario"}
              </button>
            </div>
          )}

          <div className="mt-6 rounded-[2rem] border border-[var(--bt-border)] bg-white p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--bt-primary)]">
                  Festivos y cierres
                </p>
                <p className="text-[10px] text-[var(--bt-muted)] mt-1">
                  Fechas en las que el negocio está cerrado (no se ofrecerán citas).
                </p>
              </div>
              <button
                type="button"
                onClick={loadClosedDates}
                disabled={closedDatesLoading}
                className="shrink-0 rounded-full border border-[var(--bt-border)] bg-white px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] disabled:opacity-50"
              >
                {closedDatesLoading ? "Cargando…" : "Cargar"}
              </button>
            </div>

            {closedDatesMsg && (
              <p
                className={`mb-3 text-[10px] font-bold ${
                  closedDatesMsg === "Festivos guardados." ||
                  closedDatesMsg.includes("sugeridos")
                    ? "text-green-700"
                    : "text-red-600"
                }`}
              >
                {closedDatesMsg}
              </p>
            )}

            {!Array.isArray(closedDates) ? (
              <p className="text-[10px] text-[var(--bt-muted)]">
                Pulsa <strong>Cargar</strong> para ver tus festivos/cierres.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={newClosedDate}
                    onChange={(e) => setNewClosedDate(e.target.value)}
                    className="rounded-xl border border-[var(--bt-border)] bg-[var(--bt-bg)] px-3 py-2 text-[10px] font-black text-[var(--bt-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = String(newClosedDate || "").trim();
                      if (!v) return;
                      setClosedDates((prev) =>
                        Array.from(new Set([...(prev || []), v])).sort(),
                      );
                      setNewClosedDate("");
                    }}
                    className="rounded-full bg-[var(--bt-primary)] px-4 py-2 text-[9px] font-black uppercase tracking-widest text-white hover:bg-[var(--bt-primary-hover)]"
                  >
                    Añadir fecha
                  </button>
                  <button
                    type="button"
                    onClick={suggestHolidays}
                    disabled={holidaySuggesting}
                    className="rounded-full border border-[var(--bt-border)] bg-white px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] disabled:opacity-50 hover:bg-[var(--bt-bg)]"
                    title="Cargar festivos sugeridos por país (se pueden editar)"
                  >
                    {holidaySuggesting ? "Cargando…" : "Cargar festivos"}
                  </button>
                </div>

                {closedDates.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {closedDates.map((d) => (
                      <div
                        key={d}
                        className="flex items-center justify-between gap-2 rounded-xl border border-[var(--bt-border)] bg-[var(--bt-bg)] px-3 py-2"
                      >
                        <span className="text-[10px] font-black text-[var(--bt-primary)]">
                          {formatDateEs(d)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setClosedDates((prev) =>
                              (prev || []).filter((x) => x !== d),
                            )
                          }
                          className="rounded-lg border border-[var(--bt-border)] bg-white px-2 py-1 text-[8px] font-black uppercase tracking-widest text-red-600 hover:bg-red-50"
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-[var(--bt-muted)]">
                    No hay fechas cerradas configuradas.
                  </p>
                )}

                <button
                  type="button"
                  onClick={saveClosedDates}
                  disabled={closedDatesSaving}
                  className="w-full rounded-full bg-[var(--bt-primary)] py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50 hover:bg-[var(--bt-primary-hover)]"
                >
                  {closedDatesSaving ? "Guardando…" : "Guardar festivos"}
                </button>
              </div>
            )}
          </div>
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
            <p className="text-center text-[9px] font-black uppercase tracking-[0.35em] text-[var(--bt-muted)] mb-2">
              Eliminar servicio
            </p>
            <h3
              id="settings-delete-svc-title"
              className="font-serif text-lg text-center text-[var(--bt-primary)] mb-3 leading-snug"
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
              className="w-full sm:w-auto rounded-full border border-[var(--bt-border)] bg-white px-6 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--bt-muted)] transition hover:bg-[var(--bt-bg)] disabled:opacity-50"
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
