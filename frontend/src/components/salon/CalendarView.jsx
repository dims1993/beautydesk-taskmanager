import { useEffect, useMemo, useState } from "react";
import { Archive } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAppointmentActionModals } from "../../hooks/useAppointmentActionModals";
import {
  durationMinutesForAppointment,
  serviceNamesForAppointment,
} from "../../utils/appointmentServices";

const MINUTE_PX = 1.2; // 60 min ≈ 72px; good for scrollable day view
const GRID_STEP_MINUTES = 15;
const TOP_PAD_PX = 10; // breathing room so first hour label isn't clipped
/** Espacio bajo la rejilla para la última hora (-translate-y-1/2) y bordes redondeados (overflow-hidden). */
const BOTTOM_PAD_PX = 22;
/** Tramos clicables de 30 min alineados a :00 / :30 (misma rejilla que Google Calendar). */
const HALF_HOUR_SLOT_MINUTES = 30;
/** Mínimo de minutos libres en un hueco para intentar generar tramos (tramos reales exigen caber 30 min alineados). */
const MIN_GAP_MINUTES_FOR_ADD = 30;
// Header is rendered in a separate grid row (no pixel offsets in the timeline).

/**
 * Alternancia fuerte claro / oscuro (estilo “papel–tinta”) con variables de marca.
 * Cabecera y carril usan `soft` + `headerText`; las citas siguen en blanco con `bar` + `cardName`.
 */
const STAFF_CALENDAR_TONE_PAIRS = {
  nails: {
    light: {
      soft: "#ffffff",
      bar: "#5d5045",
      headerText: "#4a3f36",
      headerMuted: "rgba(140, 133, 125, 0.95)",
      cardName: "#4a3f36",
    },
    dark: {
      /* Mismo que el botón «+ Nueva Cita» (`--bt-primary` en `index.css`) */
      soft: "var(--bt-primary)",
      bar: "#f5ebe0",
      headerText: "#faf9f6",
      headerMuted: "rgba(250, 249, 246, 0.55)",
      cardName: "#3d322c",
      gridLine: "rgba(250, 249, 246, 0.14)",
      closedShade: "rgba(250, 249, 246, 0.08)",
    },
  },
  hair: {
    light: {
      soft: "#ffffff",
      bar: "#4a4a48",
      headerText: "#333332",
      headerMuted: "rgba(122, 122, 120, 0.95)",
      cardName: "#333332",
    },
    dark: {
      soft: "var(--bt-primary)",
      bar: "#e5e5e3",
      headerText: "#f7f7f7",
      headerMuted: "rgba(247, 247, 247, 0.5)",
      cardName: "#2a2a29",
      gridLine: "rgba(255, 255, 255, 0.12)",
      closedShade: "rgba(255, 255, 255, 0.07)",
    },
  },
};

function staffColumnAccent(uiThemeKey, colIndex) {
  const key =
    String(uiThemeKey || "nails").trim().toLowerCase() === "hair"
      ? "hair"
      : "nails";
  const pair = STAFF_CALENDAR_TONE_PAIRS[key];
  return colIndex % 2 === 0 ? pair.light : pair.dark;
}

function parseHHMM(s) {
  const raw = String(s || "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function minutesFromIsoLocal(isoLike) {
  const raw = String(isoLike || "");
  const m = raw.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function minutesFromLocalDate(isoLike) {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

function formatLocalHHMM(isoLike) {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) {
    const m = minutesFromIsoLocal(isoLike);
    return m == null ? "" : toHHMM(m);
  }
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function formatDayMinuteLabel(dateObj, totalMinutes) {
  // Use wall-clock labels to match the salon-hours "HH:MM" inputs.
  // Avoid timezone conversions that can shift labels by 1 hour (DST/UTC offsets).
  return toHHMM(totalMinutes);
}

function toHHMM(totalMinutes) {
  const m = Math.max(0, Math.round(totalMinutes));
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function dateAtMinutes(dateObj, minutes) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
  const base = new Date(
    dateObj.getFullYear(),
    dateObj.getMonth(),
    dateObj.getDate(),
    0,
    0,
    0,
    0,
  );
  return new Date(base.getTime() + minutes * 60000);
}

/** Ranges { start, end } in minutes-from-midnight, sorted; merge overlap/touch. */
function mergeMinuteRanges(ranges) {
  const sorted = [...ranges]
    .filter((r) => r && Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const r of sorted) {
    if (!out.length) {
      out.push({ start: r.start, end: r.end });
      continue;
    }
    const last = out[out.length - 1];
    if (r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out;
}

/** Subintervals of [rangeStart, rangeEnd) not covered by merged occupied ranges. */
function freeMinuteGapsInRange(rangeStart, rangeEnd, mergedOccupied) {
  const gaps = [];
  let cur = rangeStart;
  for (const r of mergedOccupied) {
    if (r.end <= cur) continue;
    if (r.start >= rangeEnd) break;
    const rs = Math.max(r.start, rangeStart);
    const re = Math.min(r.end, rangeEnd);
    if (rs > cur) gaps.push({ start: cur, end: rs });
    cur = Math.max(cur, re);
    if (cur >= rangeEnd) return gaps;
  }
  if (cur < rangeEnd) gaps.push({ start: cur, end: rangeEnd });
  return gaps;
}

/** Parte un hueco libre en tramos de 30 min [s, s+30) alineados a múltiplos de 30 min desde medianoche. */
function splitGapIntoHalfHourSlots(gapStart, gapEnd) {
  const dur = gapEnd - gapStart;
  if (dur < HALF_HOUR_SLOT_MINUTES) return [];
  let s = Math.ceil(gapStart / HALF_HOUR_SLOT_MINUTES) * HALF_HOUR_SLOT_MINUTES;
  const zones = [];
  while (s + HALF_HOUR_SLOT_MINUTES <= gapEnd) {
    zones.push({ start: s, end: s + HALF_HOUR_SLOT_MINUTES });
    s += HALF_HOUR_SLOT_MINUTES;
  }
  return zones;
}

function dayOfWeekMon0(date) {
  const d = date instanceof Date ? date : new Date(date);
  const js = d.getDay(); // 0=Sun..6=Sat
  return (js + 6) % 7; // 0=Mon..6=Sun
}

function formatTimeRangeEs(appo, services) {
  const dm = durationMinutesForAppointment(appo, services);
  const start = new Date(appo.start_time);
  const end = new Date(start.getTime() + dm * 60000);
  const opts = { hour: "2-digit", minute: "2-digit" };
  return `${start.toLocaleTimeString("es-ES", opts)} — ${end.toLocaleTimeString("es-ES", opts)}`;
}

function memberDisplayName(member) {
  if (!member) return "";
  const raw = [member.first_name, member.last_name].filter(Boolean).join(" ").trim();
  if (raw) return raw;
  return member.nombre || member.username || member.email || "";
}

function staffLabelForAppointment(staffId, teamMembers, currentUser) {
  const id = Number(staffId);
  const fromTeam = teamMembers.find((m) => Number(m.id) === id);
  const name = memberDisplayName(fromTeam);
  if (name) return name;
  if (currentUser && Number(currentUser.id) === id) {
    return memberDisplayName(currentUser) || currentUser.username || "Tú";
  }
  return "Profesional";
}

function creatorLabelForAppointment(appo, teamMembers, currentUser) {
  if (!appo) return "Profesional";
  const directName = String(appo.created_by_name || "").trim();
  if (directName) return directName;
  const creatorId =
    appo.created_by_id != null ? appo.created_by_id : appo.staff_id;
  return staffLabelForAppointment(creatorId, teamMembers, currentUser);
}

const CalendarView = ({
  currentUser = null,
  allAppointments = [],
  services = [],
  teamMembers = [],
  salonHoursDays = [],
  /** Alineado con Ajustes → interfaz (`organization_ui_theme`: nails | hair). */
  uiTheme = "nails",
  onUpdateStatus,
  onRefresh,
  onAddClick,
}) => {
  const { apiRequest } = useApi();
  const { openEdit, openArchive, appointmentModals } =
    useAppointmentActionModals(services, onUpdateStatus, onRefresh);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleHasRefreshToken, setGoogleHasRefreshToken] = useState(false);
  const [googleStatusLoading, setGoogleStatusLoading] = useState(true);
  const [upgradeHint, setUpgradeHint] = useState("");

  const integrationsLocked =
    currentUser &&
    currentUser.integrations_access === false;

  const safeAppointments = Array.isArray(allAppointments)
    ? allAppointments
    : [];
  const safeServices = Array.isArray(services) ? services : [];

  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0,
  ).getDate();
  const firstDayOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1,
  ).getDay();
  const startingDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const monthName = currentDate.toLocaleString("es-ES", { month: "long" });
  const year = currentDate.getFullYear();

  const getAppsForDay = (day) => {
    return safeAppointments.filter((appo) => {
      if (!appo.start_time) return false;
      const d = new Date(appo.start_time);
      return (
        d.getDate() === day &&
        d.getMonth() === currentDate.getMonth() &&
        d.getFullYear() === currentDate.getFullYear() &&
        appo.status !== "cancelled" &&
        appo.status !== "deleted" // Archivadas / borradas fuera del calendario
      );
    });
  };

  const handleDayClick = (day) => {
    setSelectedDay(selectedDay === day ? null : day);
  };

  const dayApps = selectedDay
    ? getAppsForDay(selectedDay).sort(
        (a, b) => new Date(a.start_time) - new Date(b.start_time),
      )
    : [];

  const pendingApps = dayApps.filter((a) =>
    ["scheduled", "pending_deposit"].includes(String(a.status || "")),
  );
  // Aquí filtramos para que en "Finalizadas" solo salgan las 'completed'
  const completedApps = dayApps.filter((a) => a.status === "completed");

  const selectedDateObj = selectedDay
    ? new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay)
    : null;

  const hoursForSelectedDay = (() => {
    if (!selectedDateObj) return null;
    const dow = dayOfWeekMon0(selectedDateObj);
    const days = Array.isArray(salonHoursDays) ? salonHoursDays : [];
    const row = days.find((d) => Number(d?.day_of_week) === dow) || null;
    if (!row) return null;
    return row;
  })();

  const openIntervals = (() => {
    if (!hoursForSelectedDay || hoursForSelectedDay.is_open === false) return [];
    const raw = Array.isArray(hoursForSelectedDay.intervals)
      ? hoursForSelectedDay.intervals
      : [];
    const parsed = raw
      .map((it) => ({
        start: parseHHMM(it?.start),
        end: parseHHMM(it?.end),
      }))
      .filter((x) => x.start != null && x.end != null && x.end > x.start);
    return parsed.length ? parsed : [{ start: 9 * 60, end: 20 * 60 }];
  })();

  const openStartMin = openIntervals.length
    ? Math.min(...openIntervals.map((x) => x.start))
    : 9 * 60;
  const openEndMin = openIntervals.length
    ? Math.max(...openIntervals.map((x) => x.end))
    : 20 * 60;

  const appsMinMax = (() => {
    const list = Array.isArray(dayApps) ? dayApps : [];
    if (!list.length) return null;
    let minStart = null;
    let maxEnd = null;
    for (const a of list) {
      const startMin =
        minutesFromIsoLocal(a?.start_time);
      if (startMin == null) continue;
      const dur = durationMinutesForAppointment(a, safeServices);
      const endMin = startMin + Math.max(1, Number(dur) || 0);
      if (minStart == null || startMin < minStart) minStart = startMin;
      if (maxEnd == null || endMin > maxEnd) maxEnd = endMin;
    }
    if (minStart == null || maxEnd == null) return null;
    return { minStart, maxEnd };
  })();

  // Expand the visible range to include out-of-hours appointments if they exist.
  const dayStartMin = (() => {
    const base = appsMinMax ? Math.min(openStartMin, appsMinMax.minStart) : openStartMin;
    return Math.floor(base / GRID_STEP_MINUTES) * GRID_STEP_MINUTES;
  })();
  const dayEndMin = (() => {
    const base = appsMinMax ? Math.max(openEndMin, appsMinMax.maxEnd) : openEndMin;
    return Math.ceil(base / GRID_STEP_MINUTES) * GRID_STEP_MINUTES;
  })();

  const dayHeightPx = Math.max(
    240,
    (dayEndMin - dayStartMin) * MINUTE_PX + TOP_PAD_PX + BOTTOM_PAD_PX,
  );

  const selectedDayStartDate = null;

  const timeTicks = (() => {
    // Important: ticks must start exactly at dayStartMin so grid aligns with top=0.
    const end = Math.ceil(dayEndMin / GRID_STEP_MINUTES) * GRID_STEP_MINUTES;
    const start = dayStartMin;
    const out = [];
    for (let t = start; t <= end; t += GRID_STEP_MINUTES) out.push(t);
    return out;
  })();

  const hourLabels = (() => {
    // Labels at full hours within the visible range.
    const start = Math.ceil(dayStartMin / 60) * 60;
    const end = Math.floor(dayEndMin / 60) * 60;
    const out = [];
    for (let t = start; t <= end; t += 60) out.push(t);
    return out;
  })();

  const closedBlocks = (() => {
    if (!openIntervals.length) return [];
    const sorted = [...openIntervals].sort((a, b) => a.start - b.start);
    const blocks = [];
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (a && b && b.start > a.end) {
        blocks.push({ start: a.end, end: b.start });
      }
    }
    return blocks;
  })();

  const staffColumns = useMemo(() => {
    if (!selectedDay) return [];
    const byId = new Map();
    // Columns represent the salon team (owner + staff). Do NOT include SUPER_ADMIN
    // unless they are actually part of the org team list.
    for (const m of [...(teamMembers || [])].filter(Boolean)) {
      const id = Number(m?.id);
      if (!Number.isFinite(id)) continue;
      if (!byId.has(id)) byId.set(id, m);
    }
    const ids = Array.from(byId.keys()).sort((a, b) => a - b);
    return ids.map((id) => ({
      staffId: id,
      member: byId.get(id),
      apps: pendingApps
        .filter((a) => Number(a?.staff_id) === id)
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time)),
    }));
  }, [teamMembers, currentUser, selectedDay, pendingApps]);

  const staffColumnCount = staffColumns.length || 1;
  const allowHorizontalScroll = staffColumnCount > 2;

  const refreshGoogleCalendarStatus = async () => {
    try {
      const status = await apiRequest("/auth/google/calendar/status");
      if (status?.integrations_locked) {
        setGoogleConnected(false);
        setGoogleHasRefreshToken(false);
        return;
      }
      setGoogleConnected(!!status?.connected);
      setGoogleHasRefreshToken(!!status?.has_refresh_token);
    } catch (e) {
      console.error("Failed to fetch Google Calendar status:", e);
      setGoogleConnected(false);
      setGoogleHasRefreshToken(false);
    } finally {
      setGoogleStatusLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_calendar") === "locked") {
      setUpgradeHint(
        "Tu plan no incluye la conexión con Google Calendar. Actualiza integraciones o contacta con soporte.",
      );
      params.delete("google_calendar");
      const next =
        window.location.pathname +
        (params.toString() ? `?${params}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", next);
    }
  }, []);

  useEffect(() => {
    refreshGoogleCalendarStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.integrations_access]);

  const handleConnectGoogleCalendar = async () => {
    if (integrationsLocked) {
      setUpgradeHint(
        "La conexión con Google Calendar no está disponible en tu plan. Actualiza tu suscripción o pide a un administrador que active integraciones.",
      );
      return;
    }
    try {
      const res = await apiRequest("/auth/google/calendar/connect");
      const url = res?.authorization_url;
      if (!url) throw new Error("Missing authorization_url");
      console.log("Google Calendar authorization_url:", url);
      window.location.href = url;
    } catch (e) {
      console.error("Google Calendar connect failed:", e);
      const detail =
        typeof e?.detail === "string"
          ? e.detail
          : Array.isArray(e?.detail)
            ? e.detail.map((d) => d.msg).join(" ")
            : "";
      if (
        detail &&
        (detail.includes("plan") || detail.includes("Integraciones"))
      ) {
        setUpgradeHint(detail);
      } else {
        alert(
          "No se pudo conectar Google Calendar. Revisa la configuración OAuth en el servidor.",
        );
      }
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    if (integrationsLocked) {
      setUpgradeHint(
        "No puedes gestionar Google Calendar con tu plan actual.",
      );
      return;
    }
    try {
      await apiRequest("/auth/google/calendar/disconnect", "POST");
      await refreshGoogleCalendarStatus();
    } catch (e) {
      console.error("Google Calendar disconnect failed:", e);
      alert("Failed to disconnect Google Calendar.");
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {upgradeHint && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-[10px] font-bold text-amber-950 flex justify-between gap-4 items-start">
          <span>{upgradeHint}</span>
          <button
            type="button"
            className="shrink-0 text-[9px] font-black uppercase tracking-widest opacity-60 hover:opacity-100"
            onClick={() => setUpgradeHint("")}
          >
            Cerrar
          </button>
        </div>
      )}
      {/* SECCIÓN CALENDARIO */}
      <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-[var(--bt-border)]">
        <div className="flex justify-between items-center mb-6 px-2">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--bt-primary)]">
            {monthName} <span className="opacity-40">{year}</span>
          </h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={
                googleConnected
                  ? handleDisconnectGoogleCalendar
                  : handleConnectGoogleCalendar
              }
              className={`inline-flex items-center justify-center border px-4 py-2 rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest ${
                integrationsLocked
                  ? "bg-[var(--bt-accent)] text-[var(--bt-muted)] border-[var(--bt-border)] cursor-not-allowed"
                  : "bg-white text-[var(--bt-primary)] border-[var(--bt-border)] hover:border-[var(--bt-border-strong)]"
              }`}
              title={
                integrationsLocked
                  ? "Integración no disponible en tu plan"
                  : "Conectar Google Calendar"
              }
            >
              {googleStatusLoading
                ? "Google…"
                : integrationsLocked
                  ? "Google (plan)"
                  : googleConnected
                    ? googleHasRefreshToken
                      ? "Google conectado"
                      : "Google conectado*"
                    : "Conectar Google"}
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrentDate((prev) => {
                  const d = new Date(prev);
                  d.setMonth(d.getMonth() - 1);
                  return d;
                })
              }
              className="text-[var(--bt-muted)] hover:text-[var(--bt-primary)]"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrentDate((prev) => {
                  const d = new Date(prev);
                  d.setMonth(d.getMonth() + 1);
                  return d;
                })
              }
              className="text-[var(--bt-muted)] hover:text-[var(--bt-primary)]"
            >
              →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center">
          {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
            <span key={d} className="text-[9px] font-black text-[var(--bt-muted)] mb-2">
              {d}
            </span>
          ))}
          {[...Array(startingDay)].map((_, i) => (
            <div key={`empty-${i}`}></div>
          ))}
          {[...Array(daysInMonth)].map((_, i) => {
            const day = i + 1;
            const dayApps = getAppsForDay(day);
            // Dots represent appointment creators (created_by_id), not assigned staff.
            const creatorIdsDay = [
              ...new Set(
                dayApps
                  .map((a) =>
                    a?.created_by_id != null ? a.created_by_id : a?.staff_id,
                  )
                  .filter((id) => id != null),
              ),
            ].sort((a, b) => Number(a) - Number(b));
            const isSelected = selectedDay === day;
            const isToday =
              new Date().getDate() === day &&
              new Date().getMonth() === currentDate.getMonth();

            const dotPaletteSel = [
              "bg-white",
              "bg-white/85",
              "bg-[var(--bt-border-strong)]",
              "bg-[var(--bt-accent)]",
            ];
            const dotPalette = [
              "bg-[var(--bt-border-strong)]",
              "bg-[var(--bt-primary)]",
              "bg-amber-500/80",
              "bg-emerald-600/75",
            ];

            return (
              <button
                type="button"
                key={day}
                onClick={() => handleDayClick(day)}
                className={`aspect-square rounded-2xl flex flex-col items-center justify-center transition-all relative border ${
                  isSelected
                    ? "bg-[var(--bt-primary)] border-[var(--bt-primary)] text-white scale-105 shadow-md z-10"
                    : isToday
                      ? "bg-[var(--bt-bg)] border-[var(--bt-border-strong)] text-[var(--bt-primary)]"
                      : "bg-white border-[var(--bt-border)] hover:border-[var(--bt-border-strong)] text-[var(--bt-primary)]"
                }`}
              >
                <span
                  className={`text-[11px] font-bold ${isToday && !isSelected ? "text-[var(--bt-border-strong)]" : ""}`}
                >
                  {day}
                </span>
                <div className="flex gap-0.5 mt-1 flex-wrap justify-center max-w-[90%]">
                  {creatorIdsDay.slice(0, 4).map((cid, idx) => (
                    <div
                      key={cid}
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isSelected ? dotPaletteSel[idx % dotPaletteSel.length] : dotPalette[idx % dotPalette.length]
                      }`}
                      title={staffLabelForAppointment(cid, teamMembers, currentUser)}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div className="space-y-6">
          {/* BLOQUE DE PENDIENTES */}
          <div className="bg-white rounded-[2.5rem] p-8 text-[var(--bt-primary)] shadow-sm border border-[var(--bt-border)] animate-slideUp">
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50 mb-1">
                  Citas del día
                </p>
                <h4 className="text-2xl font-black">
                  {selectedDay} {monthName}
                </h4>
              </div>
              <button
                onClick={() =>
                  onAddClick &&
                  onAddClick(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth(),
                      selectedDay,
                    ),
                  )
                }
                className="bg-[var(--bt-primary)] hover:bg-[var(--bt-primary-hover)] text-white border border-[var(--bt-primary)]/20 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
              >
                + Nueva Cita
              </button>
            </div>

            <div className="space-y-4">
              {pendingApps.length > 0 ? (
                <div className="rounded-[2rem] border border-[var(--bt-border)] bg-[var(--bt-bg)] overflow-hidden">
                  <div className={allowHorizontalScroll ? "overflow-x-auto overflow-y-visible" : "overflow-visible"}>
                    <div className={allowHorizontalScroll ? "min-w-[900px]" : ""}>
                        <div className="grid grid-cols-[88px_1fr] grid-rows-[auto_1fr]">
                          {/* Top-left: empty header (aligns with staff headers) */}
                          <div className="sticky left-0 z-30 border-r border-b border-[var(--bt-border)] bg-white px-3 py-4" />

                          {/* Top-right: staff headers */}
                          <div
                            className="grid border-b border-[var(--bt-border)] bg-white"
                            style={{
                              gridTemplateColumns: allowHorizontalScroll
                                ? `repeat(${staffColumnCount}, minmax(240px, 1fr))`
                                : `repeat(${staffColumnCount}, minmax(0, 1fr))`,
                            }}
                          >
                            {staffColumns.map((col, colIndex) => {
                              const accent = staffColumnAccent(uiTheme, colIndex);
                              const staffName = staffLabelForAppointment(
                                col.staffId,
                                teamMembers,
                                currentUser,
                              );
                              return (
                                <div
                                  key={col.staffId}
                                  className="min-w-0 border-r last:border-r-0 border-[var(--bt-border)] px-5 py-4"
                                  style={{
                                    borderLeftWidth: 4,
                                    borderLeftColor: accent.bar,
                                    backgroundColor: accent.soft,
                                  }}
                                >
                                  <p
                                    className="text-[9px] font-black uppercase tracking-[0.35em]"
                                    style={{ color: accent.headerMuted }}
                                  >
                                    Profesional
                                  </p>
                                  <p
                                    className="mt-1 text-[12px] font-black tracking-widest uppercase truncate"
                                    style={{ color: accent.headerText }}
                                  >
                                    {staffName}
                                  </p>
                                </div>
                              );
                            })}
                          </div>

                          {/* Bottom-left: time gutter */}
                          <div className="sticky left-0 z-20 relative border-r border-[var(--bt-border)] bg-white">
                            <div style={{ height: dayHeightPx }} />
                            {hourLabels.map((t) => (
                              <div
                                key={t}
                                className="absolute left-0 right-0 px-3"
                                style={{
                                  top: TOP_PAD_PX + (t - dayStartMin) * MINUTE_PX,
                                }}
                              >
                                <span className="block -translate-y-1/2 text-[9px] font-black uppercase tracking-widest text-[var(--bt-muted)]">
                                  {formatDayMinuteLabel(selectedDateObj, t)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Bottom-right: timelines */}
                          <div
                            className="grid"
                            style={{
                              gridTemplateColumns: allowHorizontalScroll
                                ? `repeat(${staffColumnCount}, minmax(240px, 1fr))`
                                : `repeat(${staffColumnCount}, minmax(0, 1fr))`,
                            }}
                          >
                            {staffColumns.map((col, colIndex) => {
                              const accent = staffColumnAccent(uiTheme, colIndex);
                              return (
                                <div
                                  key={col.staffId}
                                  className="min-w-0 border-r last:border-r-0 border-[var(--bt-border)]"
                                  style={{
                                    borderLeftWidth: 4,
                                    borderLeftColor: accent.bar,
                                    backgroundColor: accent.soft,
                                  }}
                                >
                                  <div
                                    className="relative"
                                    style={{ height: dayHeightPx }}
                                  >
                                  {/* grid lines */}
                                  {timeTicks.map((t) => (
                                    <div
                                      key={t}
                                      className="absolute left-0 right-0 border-t border-[var(--bt-border)]"
                                      style={{
                                        top: TOP_PAD_PX + (t - dayStartMin) * MINUTE_PX,
                                        opacity: t % 60 === 0 ? 0.35 : 0.18,
                                        ...(accent.gridLine
                                          ? { borderTopColor: accent.gridLine }
                                          : {}),
                                      }}
                                    />
                                  ))}

                                  {/* closed blocks (split schedule gaps) */}
                                  {closedBlocks.map((blk, idx) => (
                                    <div
                                      key={`${blk.start}-${blk.end}-${idx}`}
                                      className="absolute left-0 right-0 pointer-events-none"
                                      style={{
                                        top:
                                          TOP_PAD_PX +
                                          (blk.start - dayStartMin) * MINUTE_PX,
                                        height:
                                          (blk.end - blk.start) * MINUTE_PX,
                                        backgroundColor:
                                          accent.closedShade ?? "rgba(0, 0, 0, 0.05)",
                                      }}
                                      title="Tramo cerrado"
                                    />
                                  ))}

                                  {/* Huecos libres clicables (sin icono): tramos de 30 min en :00 / :30. */}
                                  {(() => {
                                    if (!selectedDateObj) return null;
                                    const occupiedRaw = col.apps
                                      .map((a) => {
                                        const start =
                                          minutesFromIsoLocal(a?.start_time) ?? null;
                                        if (start == null) return null;
                                        const dur = durationMinutesForAppointment(
                                          a,
                                          safeServices,
                                        );
                                        const end =
                                          start + Math.max(1, Number(dur) || 0);
                                        return { start, end };
                                      })
                                      .filter(Boolean);
                                    const mergedOccupied = mergeMinuteRanges(occupiedRaw);
                                    const gaps = [];
                                    for (const o of openIntervals) {
                                      const a = Math.max(o.start, dayStartMin);
                                      const b = Math.min(o.end, dayEndMin);
                                      if (b <= a) continue;
                                      gaps.push(
                                        ...freeMinuteGapsInRange(a, b, mergedOccupied),
                                      );
                                    }
                                    const addZones = gaps
                                      .filter(
                                        (g) =>
                                          g.end - g.start >= MIN_GAP_MINUTES_FOR_ADD,
                                      )
                                      .flatMap((g) =>
                                        splitGapIntoHalfHourSlots(g.start, g.end),
                                      );
                                    return addZones.map((g) => {
                                        const top =
                                          TOP_PAD_PX +
                                          (g.start - dayStartMin) * MINUTE_PX;
                                        const heightPx = Math.max(
                                          40,
                                          (g.end - g.start) * MINUTE_PX,
                                        );
                                        return (
                                          <button
                                            key={`add-${col.staffId}-${g.start}-${g.end}`}
                                            type="button"
                                            title="Nueva cita"
                                            aria-label="Nueva cita en este hueco"
                                            className="absolute left-0 right-0 cursor-pointer rounded-lg border-0 bg-transparent p-0 outline-none transition-colors hover:bg-[var(--bt-primary)]/[0.06] focus-visible:bg-[var(--bt-primary)]/[0.08] focus-visible:ring-2 focus-visible:ring-[var(--bt-primary)]/25 focus-visible:ring-inset"
                                            style={{ top, height: heightPx }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const d = dateAtMinutes(
                                                selectedDateObj,
                                                g.start,
                                              );
                                              if (!d) return;
                                              onAddClick?.({
                                                date: d,
                                                staffId: col.staffId,
                                              });
                                            }}
                                          />
                                        );
                                    });
                                  })()}

                                  {/* appointments */}
                                  {col.apps.map((appo) => {
                                    // Place blocks using wall-clock time from the API string (HH:MM).
                                    // This matches the left-hand labels and the salon-hours configuration.
                                    const minutesFromMidnight =
                                      minutesFromIsoLocal(appo.start_time) ?? 0;
                                    const minutesFromStart =
                                      minutesFromMidnight - dayStartMin;
                                    const top =
                                      TOP_PAD_PX + minutesFromStart * MINUTE_PX;
                                    const dur = durationMinutesForAppointment(
                                      appo,
                                      safeServices,
                                    );
                                    const height = Math.max(
                                      44,
                                      dur * MINUTE_PX,
                                    );
                                    /** Citas cortas (p. ej. 20–30 min): solo nombre en la tarjeta; el resto va al title. */
                                    const nameOnlyCard = dur <= 30;
                                    const compact = !nameOnlyCard && height < 78;
                                    const ultraCompact = !nameOnlyCard && height < 58;
                                    const deposit =
                                      String(appo.status || "") ===
                                      "pending_deposit";
                                    const creatorName = creatorLabelForAppointment(
                                      appo,
                                      teamMembers,
                                      currentUser,
                                    );
                                    const servicesLine =
                                      serviceNamesForAppointment(
                                        appo,
                                        safeServices,
                                      ).join(" · ") || "";
                                    const hoverDetailTitle = [
                                      formatLocalHHMM(appo.start_time),
                                      `${dur}m`,
                                      appo.client_name,
                                      servicesLine,
                                      creatorName,
                                      deposit ? "DEPÓSITO" : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" · ");
                                    const nameColorStyle =
                                      deposit ? undefined : { color: accent.cardName };
                                    return (
                                      <div
                                        key={appo.id}
                                        className={[
                                          "absolute left-3 right-3 cursor-pointer rounded-2xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md",
                                          deposit
                                            ? "border-amber-200/60 bg-amber-50"
                                            : "border-[var(--bt-border)] bg-white",
                                        ].join(" ")}
                                        style={{
                                          top: Math.max(0, top),
                                          height,
                                          ...(deposit
                                            ? {}
                                            : {
                                                borderLeftWidth: 4,
                                                borderLeftColor: accent.bar,
                                              }),
                                        }}
                                        title={
                                          nameOnlyCard
                                            ? hoverDetailTitle
                                            : `Hora grid: ${toHHMM(minutesFromMidnight)} | raw: ${String(appo.start_time || "")} | creada por ${creatorName}`
                                        }
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => openEdit(appo)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            openEdit(appo);
                                          }
                                        }}
                                      >
                                        <div
                                          className={
                                            nameOnlyCard
                                              ? "min-h-0 p-2.5"
                                              : compact
                                                ? "p-2.5"
                                                : "p-3"
                                          }
                                        >
                                          {nameOnlyCard ? (
                                            <p
                                              className="min-w-0 font-black uppercase tracking-tight truncate text-[12px] text-[var(--bt-primary)]"
                                              style={nameColorStyle}
                                            >
                                              {appo.client_name}
                                            </p>
                                          ) : (
                                            <div className="min-w-0">
                                              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--bt-muted)]">
                                                {formatLocalHHMM(appo.start_time)}{" "}
                                                · {dur}m
                                              </p>
                                              <p
                                                className={[
                                                  "mt-1 font-black uppercase tracking-tight truncate text-[var(--bt-primary)]",
                                                  ultraCompact
                                                    ? "text-[11px]"
                                                    : "text-[12px]",
                                                  compact ? "mt-0.5" : "mt-1",
                                                ].join(" ")}
                                                style={nameColorStyle}
                                              >
                                                {appo.client_name}
                                              </p>
                                              {!ultraCompact && (
                                                <p
                                                  className={[
                                                    "text-[9px] font-black uppercase tracking-widest text-[var(--bt-border-strong)]",
                                                    compact
                                                      ? "mt-0.5 truncate"
                                                      : "mt-1 whitespace-normal break-words",
                                                  ].join(" ")}
                                                >
                                                  {servicesLine}
                                                </p>
                                              )}
                                              {!compact && (
                                                <p className="mt-1 text-[9px] font-black uppercase text-[var(--bt-muted)] truncate">
                                                  {creatorName}
                                                  {deposit ? " · DEPÓSITO" : ""}
                                                </p>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-center py-4 text-[10px] font-black uppercase opacity-30">
                  No hay citas pendientes
                </p>
              )}
            </div>
          </div>

          {/* BLOQUE DE FINALIZADAS */}
          {completedApps.length > 0 && (
            <div className="bg-white rounded-[2.5rem] p-8 border border-[var(--bt-border)] shadow-sm animate-slideUp">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--bt-muted)] mb-6">
                Finalizadas
              </h4>
              <div className="space-y-3">
                {completedApps.map((appo) => {
                  return (
                  <div
                    key={appo.id}
                    className="bg-[var(--bt-bg)] rounded-3xl p-4 flex items-center justify-between border border-[var(--bt-border)]"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 opacity-40 min-w-0">
                      <span className="text-[9px] font-black text-[var(--bt-primary)] shrink-0">
                        {formatTimeRangeEs(appo, safeServices)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-[var(--bt-primary)] line-through truncate">
                          {appo.client_name}
                        </p>
                        <p className="text-[8px] font-black uppercase tracking-wider text-[var(--bt-muted)] whitespace-normal break-words">
                          {serviceNamesForAppointment(appo, safeServices).join(
                            " · ",
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {/* BOTÓN RETORNO: Vuelve a 'scheduled' */}
                      <button
                        onClick={() => onUpdateStatus(appo.id, "scheduled")}
                        className="h-9 w-9 flex items-center justify-center bg-white text-[var(--bt-muted)] border border-[var(--bt-border)] rounded-xl hover:text-[var(--bt-primary)] transition-all text-lg"
                        title="Devolver a pendientes"
                      >
                        ↺
                      </button>
                      {/* BOTÓN ARCHIVAR: Pasa a 'cancelled' */}
                      <button
                        type="button"
                        onClick={() => openArchive(appo)}
                        className="h-9 w-9 flex items-center justify-center bg-white text-red-300 border border-red-100 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                        title="Archivar"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {appointmentModals}
    </div>
  );
};

export default CalendarView;
