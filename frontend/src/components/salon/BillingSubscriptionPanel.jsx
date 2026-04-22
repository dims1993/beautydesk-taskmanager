import React, { useEffect, useState } from "react";
import { CreditCard, ExternalLink } from "lucide-react";
import { useApi } from "../../hooks/useApi";

const PLANS = [
  { id: "esencial", label: "Esencial" },
  { id: "profesional", label: "Profesional" },
  { id: "premium", label: "Premium" },
];

function formatErr(err) {
  if (!err) return "Error";
  if (typeof err.detail === "string") return err.detail;
  if (Array.isArray(err.detail))
    return err.detail.map((d) => d.msg || JSON.stringify(d)).join(" ");
  return err.message || "Error";
}

export default function BillingSubscriptionPanel({
  currentUser,
  onRefresh,
  onError,
}) {
  const { apiRequest } = useApi();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [localMsg, setLocalMsg] = useState("");
  const [targetPlan, setTargetPlan] = useState("profesional");

  const hasSub = Boolean(currentUser?.has_stripe_subscription);
  const currentPlan = (currentUser?.subscription_plan || "esencial").toLowerCase();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await apiRequest("/billing/status");
        if (!cancelled) setStatus(s);
      } catch {
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiRequest]);

  useEffect(() => {
    try {
      const p = sessionStorage.getItem("beautydesk_pending_checkout_plan");
      if (p && ["esencial", "profesional", "premium"].includes(p)) {
        setTargetPlan(p);
        setLocalMsg(
          `Plan seleccionado desde la web: ${p}. Elige «Ir a pagar con Stripe» cuando estés listo.`,
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const clearPending = () => {
    try {
      sessionStorage.removeItem("beautydesk_pending_checkout_plan");
    } catch {
      /* ignore */
    }
  };

  const goCheckout = async () => {
    setBusy(true);
    setLocalMsg("");
    try {
      const r = await apiRequest("/billing/checkout-session", "POST", {
        plan: targetPlan,
      });
      clearPending();
      if (r?.url) window.location.href = r.url;
    } catch (err) {
      const msg = formatErr(err);
      onError?.(msg);
      setLocalMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  const goChangePlan = async () => {
    setBusy(true);
    setLocalMsg("");
    try {
      await apiRequest("/billing/change-plan", "POST", { plan: targetPlan });
      clearPending();
      setLocalMsg("Plan actualizado. Los permisos se refrescan al instante.");
      await onRefresh?.();
    } catch (err) {
      const msg = formatErr(err);
      onError?.(msg);
      setLocalMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  const goPortal = async () => {
    setBusy(true);
    setLocalMsg("");
    try {
      const r = await apiRequest("/billing/portal-session", "POST", {});
      if (r?.url) window.location.href = r.url;
    } catch (err) {
      const msg = formatErr(err);
      onError?.(msg);
      setLocalMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <p className="text-[10px] text-[#a39485] animate-pulse">
        Cargando estado de pagos…
      </p>
    );
  }

  const stripeOk = status?.stripe_configured;
  const priceOk = status?.prices?.[targetPlan];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-[#e5e0d8] bg-[#faf8f5] px-4 py-3">
        <CreditCard className="h-5 w-5 shrink-0 text-[#5d5045] mt-0.5" />
        <div className="space-y-1 text-[11px] text-[#5d5045] leading-relaxed">
          <p>
            <span className="font-black uppercase tracking-widest text-[10px] text-[#8c857d]">
              Plan actual
            </span>
            :{" "}
            <span className="font-serif text-base capitalize">{currentPlan}</span>
            {hasSub ? (
              <span className="text-[#8c857d]"> · Suscripción Stripe activa</span>
            ) : (
              <span className="text-[#8c857d]">
                {" "}
                · Sin suscripción online (permisos de Esencial hasta que contrates)
              </span>
            )}
          </p>
          {!stripeOk && (
            <p className="text-amber-900 text-[10px] leading-snug">
              El servidor aún no tiene{" "}
              <code className="bg-amber-100 px-1 rounded">STRIPE_SECRET_KEY</code>{" "}
              configurada. Los botones de pago no funcionarán hasta entonces.
            </p>
          )}
        </div>
      </div>

      {typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("billing") ===
          "success" && (
          <p className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
            Pago recibido. Si los permisos no se actualizan en unos segundos,
            recarga la página.
          </p>
        )}

      {localMsg && (
        <p className="text-[10px] text-[#6b6158] whitespace-pre-wrap">{localMsg}</p>
      )}

      <div className="space-y-2">
        <label className="text-[9px] font-black uppercase tracking-widest text-[#a39485]">
          Elegir plan objetivo
        </label>
        <select
          value={targetPlan}
          onChange={(e) => setTargetPlan(e.target.value)}
          className="w-full rounded-2xl border border-[#eaddcf] bg-white py-3 px-4 text-[11px] font-bold text-[#5d5045]"
        >
          {PLANS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {!hasSub ? (
          <button
            type="button"
            disabled={busy || !stripeOk || !priceOk}
            onClick={goCheckout}
            className="flex-1 rounded-full bg-[#5d5045] py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#f5ebe0] shadow-lg transition hover:bg-[#4a3f36] disabled:opacity-40"
          >
            {busy ? "…" : "Ir a pagar con Stripe"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !stripeOk || !priceOk}
            onClick={goChangePlan}
            className="flex-1 rounded-full bg-[#5d5045] py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#f5ebe0] shadow-lg transition hover:bg-[#4a3f36] disabled:opacity-40"
          >
            {busy ? "…" : "Cambiar plan (prorrateo)"}
          </button>
        )}
        <button
          type="button"
          disabled={busy || !stripeOk || !hasSub}
          onClick={goPortal}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-[#eaddcf] bg-white py-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-[#5d5045] hover:bg-[#f8f5f2] disabled:opacity-40"
        >
          Facturación y métodos
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="text-[9px] leading-relaxed text-[#a39485]">
        El webhook de Stripe actualiza el plan en la base de datos; los permisos
        vienen de <code className="text-[#5d5045]">plan_entitlements</code> en{" "}
        <code className="text-[#5d5045]">/users/me</code>. En local, usa{" "}
        <code className="text-[#5d5045]">stripe listen --forward-to localhost:8000/billing/webhook</code>
        .
      </p>
    </div>
  );
}
