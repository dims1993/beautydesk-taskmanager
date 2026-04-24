export function normalizePhoneForWhatsApp(raw) {
  if (raw == null) return "";
  const str = String(raw);
  let d = str.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0034") && d.length >= 12) d = "34" + d.slice(4);
  if (d.startsWith("34") && d.length >= 11) return d;
  if (d.length === 9 && /^[6789]\d{8}$/.test(d)) return `34${d}`;
  if (d.length < 10 || d.length > 15) return "";
  return d;
}

export function buildWaMeUrl({ phoneDigits, text }) {
  if (!phoneDigits) return "";
  const msg = (text || "").trim();
  const q = msg ? `?text=${encodeURIComponent(msg)}` : "";
  return `https://wa.me/${phoneDigits}${q}`;
}

