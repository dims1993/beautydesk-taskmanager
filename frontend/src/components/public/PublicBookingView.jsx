import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function publicApi(path, method, body) {
  const opts = { method, headers: {} };
  if (body != null) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  const raw = await res.text();
  let data = null;
  if (raw && raw.trim()) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { detail: raw };
    }
  }
  if (!res.ok) {
    const d = data?.detail;
    const msg =
      typeof d === "string"
        ? d
        : Array.isArray(d)
          ? d.map((x) => x?.msg || JSON.stringify(x)).join(" ")
          : data?.message || `Error ${res.status}`;
    throw new Error(msg || `Error ${res.status}`);
  }
  return data;
}

function tomorrowISODate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function PublicBookingView() {
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get("token") || "").trim();
  const deposit = String(searchParams.get("deposit") || "").toLowerCase();
  const appointmentId = String(searchParams.get("appointment_id") || "").trim();

  const [config, setConfig] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [day, setDay] = useState(tomorrowISODate);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsErr, setSlotsErr] = useState("");
  const [picked, setPicked] = useState(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [booking, setBooking] = useState(false);
  const [bookErr, setBookErr] = useState("");

  const serviceIds = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const loadConfig = useCallback(async () => {
    setLoadErr("");
    try {
      const c = await publicApi(
        `/public/booking/config?token=${encodeURIComponent(token)}`,
        "GET",
        null,
      );
      setConfig(c);
    } catch (e) {
      setLoadErr(e?.message || "No se pudo cargar la página de reserva.");
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadConfig();
  }, [token, loadConfig]);

  const toggleService = (id) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setSlots([]);
    setPicked(null);
  };

  const fetchSlots = async () => {
    setSlotsErr("");
    setSlots([]);
    setPicked(null);
    if (serviceIds.length === 0) {
      setSlotsErr("Selecciona al menos un servicio.");
      return;
    }
    setSlotsLoading(true);
    try {
      const r = await publicApi("/public/booking/slots", "POST", {
        token,
        day,
        service_ids: serviceIds,
        min_notice_minutes: 30,
      });
      setSlots(Array.isArray(r?.slots) ? r.slots : []);
    } catch (e) {
      setSlotsErr(e?.message || "No se pudieron cargar los huecos.");
    } finally {
      setSlotsLoading(false);
    }
  };

  const submitBook = async () => {
    setBookErr("");
    if (!picked) {
      setBookErr("Elige un hueco en la agenda.");
      return;
    }
    if (!firstName.trim() || !phone.trim()) {
      setBookErr("Nombre y teléfono son obligatorios.");
      return;
    }
    setBooking(true);
    try {
      const startIso = picked.start_time;
      const r = await publicApi("/public/booking/book", "POST", {
        token,
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        phone: phone.trim(),
        email: email.trim() || null,
        service_ids: serviceIds,
        start_time: startIso,
        preferred_staff_id: picked.staff_id,
        notes: notes.trim() || null,
        min_notice_minutes: 30,
      });
      const pay = String(r?.payment_url || "").trim();
      if (!pay) throw new Error("No se recibió el enlace de pago.");
      window.location.href = pay;
    } catch (e) {
      setBookErr(e?.message || "No se pudo completar la reserva.");
    } finally {
      setBooking(false);
    }
  };

  if (deposit === "success") {
    return (
      <div className="min-h-screen bg-[#f7f4f1] text-[#2b2621] px-4 py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-[#d9ead9] bg-white p-8 shadow-sm text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[#2d6a3e] mb-2">
            Pago recibido
          </p>
          <h1 className="font-serif text-xl mb-3">Reserva confirmada</h1>
          {appointmentId ? (
            <p className="text-xs text-[#8a7f76] mb-2">Referencia: cita #{appointmentId}</p>
          ) : null}
          <p className="text-sm text-[#6d6359] mb-6">
            Tu cita quedará registrada en la agenda del salón. Si no ves el cargo
            reflejado, revisa el correo de Stripe.
          </p>
          <Link
            to="/"
            className="inline-flex rounded-full bg-[#2b2621] px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:opacity-90"
          >
            Cerrar
          </Link>
        </div>
      </div>
    );
  }

  if (deposit === "cancel") {
    const backTo = token
      ? `/reservar?token=${encodeURIComponent(token)}`
      : "/";
    return (
      <div className="min-h-screen bg-[#f7f4f1] text-[#2b2621] px-4 py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-[#e6ded6] bg-white p-8 shadow-sm text-center">
          <h1 className="font-serif text-xl mb-3">Pago cancelado</h1>
          <p className="text-sm text-[#6d6359] mb-6">
            No se ha cobrado el depósito. Puedes volver a elegir horario y
            reintentar.
          </p>
          <Link
            to={backTo}
            className="inline-flex rounded-full bg-[#2b2621] px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:opacity-90"
          >
            {token ? "Volver a reservar" : "Volver al inicio"}
          </Link>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#f7f4f1] text-[#2b2621] px-4 py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-[#e6ded6] bg-white p-8 shadow-sm text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[#8a7f76] mb-2">
            Reserva online
          </p>
          <h1 className="font-serif text-xl mb-3">Enlace incompleto</h1>
          <p className="text-sm text-[#6d6359] mb-6">
            Falta el identificador del salón en la URL. Pide al negocio el enlace
            correcto de reserva.
          </p>
          <Link
            to="/"
            className="inline-flex rounded-full border border-[#e6ded6] px-5 py-2 text-[10px] font-black uppercase tracking-widest text-[#2b2621] hover:bg-[#f7f4f1]"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f4f1] text-[#2b2621] px-4 py-10 md:py-16">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="text-[10px] font-black uppercase tracking-widest text-[#8a7f76] hover:text-[#2b2621]"
          >
            ← Inicio
          </Link>
        </div>

        <div className="rounded-[2rem] border border-[#e6ded6] bg-white p-6 md:p-10 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#8a7f76] mb-1">
            Reserva con depósito (25%)
          </p>
          <h1 className="font-serif text-2xl md:text-3xl text-[#2b2621] mb-2">
            {config?.organization_name || "Reservar cita"}
          </h1>
          <p className="text-sm text-[#6d6359] leading-relaxed mb-6">
            Elige servicios y horario. Para fijar la cita deberás completar un pago
            online (tarjeta o Bizum) como depósito.
          </p>

          {loadErr ? (
            <p className="text-sm font-bold text-red-600 mb-4">{loadErr}</p>
          ) : null}

          {config && !config.stripe_ready ? (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Este salón aún no tiene activados los cobros online. Vuelve más
              tarde o contacta por teléfono o WhatsApp.
            </div>
          ) : null}

          {!config && !loadErr ? (
            <p className="text-sm text-[#8a7f76]">Cargando…</p>
          ) : null}

          {config ? (
            <div className="space-y-8">
              <section>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-[#8a7f76] mb-3">
                  Servicios
                </h2>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {(config.services || []).map((s) => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#e6ded6] bg-[#faf8f6] px-4 py-3 hover:border-[#cfc4bc]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleService(s.id)}
                        className="mt-1"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-[#2b2621]">
                          {s.name}
                        </span>
                        <span className="text-xs text-[#8a7f76]">
                          {s.duration} min · {Number(s.price).toFixed(2)} €
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-[#8a7f76] mb-3">
                  Día y huecos
                </h2>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8a7f76] mb-1">
                      Fecha
                    </label>
                    <input
                      type="date"
                      value={day}
                      onChange={(e) => {
                        setDay(e.target.value);
                        setSlots([]);
                        setPicked(null);
                      }}
                      className="w-full rounded-2xl border border-[#e6ded6] bg-white px-4 py-3 text-sm outline-none focus:border-[#2b2621]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={fetchSlots}
                    disabled={slotsLoading || !config.stripe_ready}
                    className="rounded-full bg-[#2b2621] px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
                  >
                    {slotsLoading ? "Buscando…" : "Ver huecos"}
                  </button>
                </div>
                {slotsErr ? (
                  <p className="mt-2 text-sm font-bold text-red-600">{slotsErr}</p>
                ) : null}
                {slots.length > 0 ? (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {slots.map((sl, idx) => {
                      const key = `${sl.staff_id}-${sl.start_time}-${idx}`;
                      const active =
                        picked &&
                        picked.staff_id === sl.staff_id &&
                        picked.start_time === sl.start_time;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setPicked(sl)}
                          className={[
                            "rounded-2xl border px-2 py-3 text-center text-xs font-bold transition",
                            active
                              ? "border-[#2b2621] bg-[#2b2621] text-white"
                              : "border-[#e6ded6] bg-white text-[#2b2621] hover:border-[#cfc4bc]",
                          ].join(" ")}
                        >
                          {String(sl.start_time || "").replace("T", " ").slice(0, 16)}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              <section>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-[#8a7f76] mb-3">
                  Tus datos
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    placeholder="Nombre *"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="rounded-2xl border border-[#e6ded6] bg-white px-4 py-3 text-sm outline-none focus:border-[#2b2621]"
                  />
                  <input
                    placeholder="Apellidos"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="rounded-2xl border border-[#e6ded6] bg-white px-4 py-3 text-sm outline-none focus:border-[#2b2621]"
                  />
                  <input
                    placeholder="Teléfono *"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="rounded-2xl border border-[#e6ded6] bg-white px-4 py-3 text-sm outline-none focus:border-[#2b2621]"
                  />
                  <input
                    placeholder="Email (opcional)"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-2xl border border-[#e6ded6] bg-white px-4 py-3 text-sm outline-none focus:border-[#2b2621]"
                  />
                </div>
                <textarea
                  placeholder="Notas (opcional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-3 w-full rounded-2xl border border-[#e6ded6] bg-white px-4 py-3 text-sm outline-none focus:border-[#2b2621]"
                />
              </section>

              {bookErr ? (
                <p className="text-sm font-bold text-red-600">{bookErr}</p>
              ) : null}

              <button
                type="button"
                onClick={submitBook}
                disabled={booking || !config.stripe_ready}
                className="w-full rounded-full bg-[#2b2621] py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-40"
              >
                {booking ? "Redirigiendo al pago…" : "Continuar al pago del depósito"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
