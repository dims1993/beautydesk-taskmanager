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

function formatEsDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
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
  const subStatus = (currentUser?.stripe_subscription_status || "").toLowerCase();
  const currentPlan = (currentUser?.subscription_plan || "esencial").toLowerCase();
  const trialConsumed = Boolean(currentUser?.billing_trial_consumed);

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
        )}** (sin pago online aún). Con el botón de abajo abres Stripe: **tarjeta obligatoria**; en la **primera** contratación aplica prueba con cargo 0€ hasta el fin del periodo y el cobro mensual programado al terminar la prueba si no cancelas antes.`,
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
      <p className="text-[10px] text-[var(--bt-muted)] animate-pulse">
        Cargando estado de pagos…
      </p>
    );
  }

  const stripeOk = status?.stripe_configured;
  const priceMap = status?.prices;
  const priceForTarget = priceMap?.[targetPlan];
  const priceOk = priceForTarget === true;
  /** Stripe OK pero no hay ID de precio (env) para el plan elegido: el CTA se deshabilita. */
  const priceBlocked =
    Boolean(stripeOk) && priceMap && priceForTarget !== true;
  const sameTargetAsCurrent = targetPlan === currentPlan;
  const trialDays = Number(status?.trial_period_days ?? 10) || 10;
  const canOfferTrial =
    !hasSub && !trialConsumed && trialDays > 0 && (status?.first_checkout_uses_trial !== false);
  const trialing = subStatus === "trialing";
  const trialEndLabel = formatEsDate(currentUser?.stripe_trial_ends_at);

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
                <strong key={i} className="font-serif text-[var(--bt-primary)]">
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
              className="mt-2 text-[9px] font-black uppercase tracking-widest text-[var(--bt-primary)] underline"
            >
              Cerrar aviso
            </button>
          )}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-2xl border border-[var(--bt-border)] bg-[var(--bt-bg)] px-4 py-3">
        <CreditCard className="h-5 w-5 shrink-0 text-[var(--bt-primary)] mt-0.5" />
        <div className="space-y-1 text-[11px] text-[var(--bt-primary)] leading-relaxed">
          <p>
            <span className="font-black uppercase tracking-widest text-[10px] text-[var(--bt-muted)]">
              Plan en la app
            </span>
            :{" "}
            <span className="font-serif text-base capitalize">{currentPlan}</span>
            {hasSub ? (
              <span className="text-[var(--bt-muted)]">
                {trialing
                  ? " · Prueba activa: tarjeta registrada, primer cargo al final del periodo de prueba"
                  : " · Suscripción Stripe activa"}
              </span>
            ) : (
              <span className="text-[var(--bt-muted)]">
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

      {trialing && trialEndLabel && (
        <p className="text-[10px] leading-relaxed text-[#1e3a2f] bg-[#f0f9f4] border border-[#b8e0c8] rounded-2xl px-4 py-3">
          <strong>Periodo de prueba</strong> (Stripe) en curso. Fin de prueba:{" "}
          <strong>{trialEndLabel}</strong>. Mientras dure, el cargo periódico
          del plan queda <strong>0€</strong>; al terminar, se programa el cargo
          mensual si no has cancelado (portal de Stripe o{" "}
          <span className="whitespace-nowrap">«Facturación y métodos»</span>).
        </p>
      )}

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
        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--bt-muted)]">
          Objetivo (plan de la oferta o cambio)
        </label>
        <select
          value={targetPlan}
          onChange={(e) => setTargetPlan(e.target.value)}
          className="w-full rounded-2xl border border-[var(--bt-border)] bg-white py-3 px-4 text-[11px] font-bold text-[var(--bt-primary)]"
        >
          {PLANS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="text-[9px] text-[var(--bt-muted)]">
          Plan de la app ahora: <strong>{planLabel(currentPlan)}</strong>
          {hasSub ? " (pagado vía Stripe)" : ""}. Ajusta el desplegable si quieres
          otro destino.
        </p>
        {priceBlocked && !hasSub && (
          <p
            className="text-[10px] text-amber-950 bg-amber-50 border border-amber-200/80 rounded-2xl px-4 py-3 leading-relaxed"
            role="status"
          >
            No se puede abrir el checkout con <strong>{planLabel(targetPlan)}</strong>{" "}
            hasta que en el servidor exista el ID de precio de Stripe (variable
            <code className="bg-amber-100/80 px-1 rounded text-[var(--bt-primary)]">
              STRIPE_PRICE_
              {String(targetPlan).toUpperCase()}
            </code>
            ). Con Esencial a veces basta; para Profesional/Premium hay que
            añadirlos en .env. El botón de prueba permanece desactivado si falta
            ese precio.
          </p>
        )}
      </div>

      {canOfferTrial && (
        <p className="text-[9px] leading-relaxed text-[var(--bt-primary)] bg-white border border-[var(--bt-border)] rounded-2xl px-4 py-3">
          <strong>Primera contratación:</strong> en Stripe se registra un método
          de pago (verificación/SCA, importe 0€ en el inicio) y comienza el
          periodo de prueba de {trialDays} días. Al terminar, se aplica el cargo
          mensual del plan si la suscripción sigue activa.
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        {!hasSub ? (
          <button
            type="button"
            disabled={busy || !stripeOk || !priceOk}
            title={
              !stripeOk
                ? "Configura STRIPE_SECRET_KEY en el servidor"
                : !priceOk
                  ? "Falta el precio de Stripe para el plan elegido (STRIPE_PRICE_…)"
                  : undefined
            }
            onClick={goCheckout}
            className="flex-1 rounded-full bg-[var(--bt-primary)] py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-lg transition hover:bg-[var(--bt-primary-hover)] disabled:opacity-40"
          >
            {busy
              ? "…"
              : canOfferTrial
                ? `Prueba ${trialDays} días — continuar con Stripe`
                : "Ir a pagar con Stripe"}
          </button>
        ) : (
          <button
            type="button"
            disabled={
              busy || !stripeOk || !priceOk || (sameTargetAsCurrent && hasSub)
            }
            onClick={goChangePlan}
            className="flex-1 rounded-full bg-[var(--bt-primary)] py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-lg transition hover:bg-[var(--bt-primary-hover)] disabled:opacity-40"
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
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-[var(--bt-border)] bg-white py-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-[var(--bt-primary)] hover:bg-[var(--bt-bg)] disabled:opacity-40"
        >
          Facturación y métodos
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="text-[9px] leading-relaxed text-[var(--bt-muted)]">
        El webhook de Stripe actualiza el plan en la base de datos; los permisos
        vienen de <code className="text-[var(--bt-primary)]">plan_entitlements</code> en{" "}
        <code className="text-[var(--bt-primary)]">/users/me</code>. En local, usa{" "}
        <code className="text-[var(--bt-primary)]">stripe listen --forward-to localhost:8000/billing/webhook</code>
        .
      </p>
    </div>
  );
}
