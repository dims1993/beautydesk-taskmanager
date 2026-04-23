/**
 * Helpers to sync salon clients with the device address book (within web limits).
 * - Import: Contact Picker API (Chrome Android) and/or .vcf files.
 * - Export: download a .vcf the user can open with Contacts (iOS/Android/desktop).
 */

/** Digits only; strip leading Spanish country code for matching (aligns with API). */
export function normalizePhoneKey(phone) {
  if (!phone || typeof phone !== "string") return "";
  let digits = phone.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("0034")) digits = digits.slice(4);
  if (digits.length >= 11 && digits.startsWith("34")) digits = digits.slice(2);
  return digits;
}

function escapeVcfValue(str) {
  if (str == null || str === "") return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/**
 * Build a minimal vCard 3.0 bundle for BeautyDesk clients.
 * @param {Array<{ nombre: string, apellidos?: string|null, telefono: string, email?: string|null }>} clients
 */
export function buildClientsVcf(clients) {
  const lines = [];
  for (const c of clients || []) {
    const nombre = (c.nombre || "").trim();
    const apellidos = (c.apellidos || "").trim();
    const fn = [nombre, apellidos].filter(Boolean).join(" ").trim() || "Cliente";
    const nFamily = escapeVcfValue(apellidos || "");
    const nGiven = escapeVcfValue(nombre || "Cliente");
    const tel = (c.telefono || "").trim();
    const email = (c.email || "").trim();
    lines.push("BEGIN:VCARD");
    lines.push("VERSION:3.0");
    lines.push(`FN:${escapeVcfValue(fn)}`);
    lines.push(`N:${nFamily};${nGiven};;;`);
    if (tel) lines.push(`TEL;TYPE=CELL:${escapeVcfValue(tel)}`);
    if (email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVcfValue(email)}`);
    lines.push(`NOTE:${escapeVcfValue("BeautyDesk / BeautyTask")}`);
    lines.push("END:VCARD");
  }
  return lines.join("\r\n");
}

/**
 * Parse common vCard 3.0/4.0 exports into client-shaped rows (best effort).
 * @param {string} text
 * @returns {Array<{ nombre: string, apellidos: string|null, telefono: string, email: string|null }>}
 */
export function parseVcfToClients(text) {
  if (!text || typeof text !== "string") return [];
  const blocks = text.split(/BEGIN:VCARD/gi).slice(1);
  const out = [];

  for (const raw of blocks) {
    const block = raw.split(/END:VCARD/i)[0] || raw;
    const lineMap = {};
    for (const line of block.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const cont = trimmed.startsWith(" ") || trimmed.startsWith("\t");
      if (cont && Object.keys(lineMap).length) {
        const keys = Object.keys(lineMap);
        const last = keys[keys.length - 1];
        lineMap[last] += trimmed.slice(1);
        continue;
      }
      const colon = trimmed.indexOf(":");
      if (colon === -1) continue;
      const keyPart = trimmed.slice(0, colon).toUpperCase();
      const baseKey = keyPart.split(";")[0].trim();
      const value = trimmed.slice(colon + 1).trim();
      if (!lineMap[baseKey]) lineMap[baseKey] = value;
    }

    let nombre = "";
    let apellidos = null;
    const nVal = lineMap.N;
    const fnVal = lineMap.FN;
    if (nVal) {
      const parts = nVal.split(";").map((p) => p.replace(/\\,/g, ",").trim());
      apellidos = parts[0] || null;
      nombre = parts[1] || "";
    }
    if (!nombre && fnVal) {
      const fn = fnVal.replace(/\\,/g, ",").trim();
      const bits = fn.split(/\s+/).filter(Boolean);
      nombre = bits[0] || "Cliente";
      if (bits.length > 1) apellidos = bits.slice(1).join(" ");
    }
    nombre = (nombre || "Cliente").trim() || "Cliente";

    let telLine = lineMap.TEL || lineMap["ITEM1.TEL"] || "";
    if (!telLine) {
      const telKey = Object.keys(lineMap).find((k) => k.startsWith("TEL"));
      if (telKey) telLine = lineMap[telKey] || "";
    }
    const telefono = String(telLine).replace(/^tel:/i, "").trim();

    let email = lineMap.EMAIL || null;
    if (email) email = email.replace(/^mailto:/i, "").trim() || null;

    if (!telefono) continue;

    out.push({
      nombre,
      apellidos: apellidos && apellidos.trim() ? apellidos.trim() : null,
      telefono,
      email,
    });
  }
  return out;
}

export function contactsPickerSupported() {
  return (
    typeof navigator !== "undefined" &&
    "contacts" in navigator &&
    typeof navigator.contacts?.select === "function"
  );
}

/**
 * @returns {Promise<Array<{ nombre: string, apellidos: string|null, telefono: string, email: string|null }>>}
 */
export async function pickContactsFromDevice() {
  if (!contactsPickerSupported()) {
    const err = new Error("CONTACTS_UNSUPPORTED");
    err.code = "CONTACTS_UNSUPPORTED";
    throw err;
  }
  const props = ["name", "email", "tel"];
  const opts = { multiple: true };
  const contacts = await navigator.contacts.select(props, opts);
  const rows = [];
  for (const c of contacts || []) {
    const names = c.name || [];
    const full = (names[0] || "").trim();
    const bits = full.split(/\s+/).filter(Boolean);
    const nombre = bits[0] || "Cliente";
    const apellidos =
      bits.length > 1 ? bits.slice(1).join(" ") : null;
    const emails = c.email || [];
    const tels = c.tel || [];
    const email = emails[0] ? String(emails[0]).trim() : null;
    if (!tels.length) continue;
    for (const tel of tels) {
      const telefono = String(tel || "").trim();
      if (!telefono) continue;
      rows.push({ nombre, apellidos, telefono, email });
    }
  }
  return rows;
}

export function downloadVcf(filename, vcfText) {
  const blob = new Blob([vcfText], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "beautydesk-clientes.vcf";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
