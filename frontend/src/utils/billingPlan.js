/** Plan ids alineados con la API y `subscription_plan` en /users/me (minúsculas). */

export const BILLING_PLAN_IDS = ["esencial", "profesional", "premium"];

const PLAN_ORDER = { esencial: 0, profesional: 1, premium: 2 };

const PLAN_LABELS = {
  esencial: "Esencial",
  profesional: "Profesional",
  premium: "Premium",
};

export function isValidPlanId(s) {
  if (!s || typeof s !== "string") return false;
  return BILLING_PLAN_IDS.includes(s.trim().toLowerCase());
}

export function planLabel(id) {
  if (!id) return "—";
  const k = String(id).trim().toLowerCase();
  return PLAN_LABELS[k] || k;
}

/**
 * Diferencia de nivel entre dos planes. >0 = subir, <0 = bajar, 0 = mismo.
 */
export function comparePlans(previousId, targetId) {
  const a = String(previousId || "esencial").trim().toLowerCase();
  const b = String(targetId || "esencial").trim().toLowerCase();
  const oa = PLAN_ORDER[a] ?? 0;
  const ob = PLAN_ORDER[b] ?? 0;
  return ob - oa;
}

export function getPendingPlanFromSession() {
  try {
    const p = sessionStorage.getItem("beautydesk_pending_checkout_plan");
    return isValidPlanId(p) ? p.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}
