import React, { useEffect, useMemo, useState } from "react";
import { CreditCard, ExternalLink } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import {
  comparePlans,
  getPendingPlanFromSession,
  isValidPlanId,
  planLabel,
} from "../../utils/billingPlan";

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
  const [pendingFromLanding, setPendingFromLanding] = useState(() =>
    getPendingPlanFromSession(),
  );

  const hasSub = Boolean(currentUser?.has_stripe_subscription);
  const currentPlan = (currentUser?.subscription_plan || "esencial").toLowerCase();

  const flowHint = useMemo(() => {
    if (!pendingFromLanding) return null;
    const t = pendingFromLanding;
    if (!isValidPlanId(t)) return null;
    if (t === currentPlan && hasSub) {
      return {
        kind: "same_paid",
        text: `Ya tienes el plan **${planLabel(t)}** con suscripción activa. Puedes gestionar facturación o cambiar de plan abajo; si no necesitas nada, puedes ignorar el plan elegido en la web.`,
      };
    }
    if (t === currentPlan && !hasSub) {
      return {
        kind: "same_unpaid",
        text: `Tu cuenta está asignada al plan **${planLabel(
          currentPlan,
        )}** (sin pago online aún). El plan que elegiste en la web coincide: confirma el pago con Stripe abajo para activar la suscripción.`,
      };
    }
    const diff = comparePlans(currentPlan, t);
    if (hasSub) {
      if (diff > 0) {
        return {
          kind: "upgrade",
          text: `Vas a **subir** de ${planLabel(currentPlan)} a **${planLabel(
            t,
          )}** (cambio con prorrateo en la suscripción).`,
        };
      }
      if (diff < 0) {
        return {
          kind: "downgrade",
          text: `Vas a **bajar** de ${planLabel(currentPlan)} a **${planLabel(
            t,
          )}** (cambio con prorrateo). Revisa en Stripe el efecto en la próxima factura.`,
        };
      }
    } else {
      return {
        kind: "new_sub",
        text: `Confirmar **${planLabel(
          t,
        )}** como plan de pago. Tu asignación actual en la app es ${planLabel(
          currentPlan,
        )} hasta que completes el checkout.`,
      };
    }
    return null;
  }, [pendingFromLanding, currentPlan, hasSub]);

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
    const p = getPendingPlanFromSession();
    if (p) {
      setTargetPlan(p);
      setLocalMsg(
        "Plan elegido desde la página de precios. Revisa el resumen y confirma con el botón de abajo.",
      );
    }
  }, []);

  const clearPending = () => {
    try {
      sessionStorage.removeItem("beautydesk_pending_checkout_plan");
    } catch {
      /* ignore */
    }
    setPendingFromLanding(null);
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

  const dismissFlowHint = () => {
    clearPending();
    setPendingFromLanding(null);
    setLocalMsg("");
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
  const sameTargetAsCurrent = targetPlan === currentPlan;

  return (
    <div className="space-y-4">
      {flowHint && (
        <div
          className={`rounded-2xl border px-4 py-3 text-[11px] leading-relaxed ${
            flowHint.kind === "downgrade"
              ? "border-amber-200 bg-amber-50/80 text-amber-950"
              : "border-[#c9e7db] bg-emerald-50/80 text-[#1e3a2f]"
          }`}
        >
          <p className="text-[#2d2a28]">
            {flowHint.text.split("**").map((part, i) =>
              i % 2 === 1 ? (
                <strong key={i} className="font-serif text-[#5d5045]">
                  {part}
                </strong>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </p>
          {flowHint.kind === "same_paid" && (
            <button
              type="button"
              onClick={dismissFlowHint}
              className="mt-2 text-[9px] font-black uppercase tracking-widest text-[#5d5045] underline"
            >
              Cerrar aviso
            </button>
          )}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-2xl border border-[#e5e0d8] bg-[#faf8f5] px-4 py-3">
        <CreditCard className="h-5 w-5 shrink-0 text-[#5d5045] mt-0.5" />
        <div className="space-y-1 text-[11px] text-[#5d5045] leading-relaxed">
          <p>
            <span className="font-black uppercase tracking-widest text-[10px] text-[#8c857d]">
              Plan en la app
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
          Objetivo (plan de la oferta o cambio)
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
        <p className="text-[9px] text-[#a39485]">
          Plan de la app ahora: <strong>{planLabel(currentPlan)}</strong>
          {hasSub ? " (pagado vía Stripe)" : ""}. Ajusta el desplegable si quieres
          otro destino.
        </p>
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
            disabled={
              busy || !stripeOk || !priceOk || (sameTargetAsCurrent && hasSub)
            }
            onClick={goChangePlan}
            className="flex-1 rounded-full bg-[#5d5045] py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#f5ebe0] shadow-lg transition hover:bg-[#4a3f36] disabled:opacity-40"
            title={
              sameTargetAsCurrent
                ? "Elige otro plan en el desplegable para cambiar"
                : undefined
            }
          >
            {busy
              ? "…"
              : sameTargetAsCurrent
                ? "Mismo plan (elige otro arriba)"
                : "Cambiar plan (prorrateo)"}
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
