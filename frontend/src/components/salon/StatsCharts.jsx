import React, { useEffect, useMemo, useState } from "react";
import {
  CircleCheck,
  FileSpreadsheet,
  Inbox,
  Lock,
  Sparkles,
} from "lucide-react";
import * as XLSX from "xlsx/xlsx.mjs";
import { useApi } from "../../hooks/useApi";

function formatApiErr(err) {
  if (!err) return "Error";
  if (typeof err.detail === "string") return err.detail;
  if (Array.isArray(err.detail))
    return err.detail.map((d) => d.msg || JSON.stringify(d)).join(" ");
  return err.message || "Error";
}

const CAJA_DAYS_STORAGE_PREFIX = "beautydesk_caja_dias_cerrados_v1";

function dateKeyLocal(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function loadClosedDayKeys(userId) {
  if (userId == null) return {};
  try {
    const raw = localStorage.getItem(`${CAJA_DAYS_STORAGE_PREFIX}_${userId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveClosedDayKeys(userId, map) {
  if (userId == null) return;
  try {
    localStorage.setItem(
      `${CAJA_DAYS_STORAGE_PREFIX}_${userId}`,
      JSON.stringify(map),
    );
  } catch {
    /* ignore */
  }
}

const StatsCharts = ({ appointments = [], services = [], currentUser }) => {
  const { apiRequest } = useApi();
  const [viewDate, setViewDate] = useState(() => new Date());
  const [closedDayKeys, setClosedDayKeys] = useState({});
  const [cajaHydrated, setCajaHydrated] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmingLock, setConfirmingLock] = useState(false);
  const [showNoExportDataModal, setShowNoExportDataModal] = useState(false);
  const [lockErrorMessage, setLockErrorMessage] = useState(null);

  const PERSONAL_GOAL = 2000;
  const currentStaffId = currentUser?.id;
  const currentStaffName =
    currentUser?.nombre || currentUser?.username || "Staff";

  useEffect(() => {
    if (currentStaffId == null) {
      setClosedDayKeys({});
      setCajaHydrated(false);
      return;
    }
    setClosedDayKeys(loadClosedDayKeys(currentStaffId));
    setCajaHydrated(true);
  }, [currentStaffId]);

  useEffect(() => {
    if (currentStaffId == null || !cajaHydrated) return;
    saveClosedDayKeys(currentStaffId, closedDayKeys);
  }, [closedDayKeys, currentStaffId, cajaHydrated]);

  const viewDayKey = useMemo(() => dateKeyLocal(viewDate), [viewDate]);
  const isLocked = !!closedDayKeys[viewDayKey];

  const staffBelongsToCurrentUser = (app) =>
    currentStaffId != null &&
    Number(app.staff_id) === Number(currentStaffId);

  const isAppointmentCompleted = (app) => {
    const s = String(app.status ?? "").toLowerCase();
    return s === "completed" || s === "completada";
  };

  const findServiceById = (serviceId) =>
    services.find((s) => Number(s.id) === Number(serviceId));

  // --- 1. LÓGICA DE FILTRADO (DÍA Y MES) ---

  // Filtramos las citas del día seleccionado para el total y para el Excel
  const appsDelDia = appointments.filter((app) => {
    const appDate = new Date(app.start_time);
    const isSameDay =
      appDate.getDate() === viewDate.getDate() &&
      appDate.getMonth() === viewDate.getMonth() &&
      appDate.getFullYear() === viewDate.getFullYear();
    return (
      isSameDay &&
      isAppointmentCompleted(app) &&
      staffBelongsToCurrentUser(app)
    );
  });

  const statsHoy = appsDelDia.reduce(
    (acc, app) => {
      const monto = parseFloat(app.final_price) || 0;
      const metodo = (app.payment_method || "").toLowerCase().trim();
      if (metodo === "tarjeta") acc.metodos.tarjeta += monto;
      else acc.metodos.efectivo += monto;
      acc.total += monto;
      return acc;
    },
    { metodos: { efectivo: 0, tarjeta: 0 }, total: 0 },
  );

  // Stats para la gráfica y el progreso (MENSUAL)
  const statsMes = appointments.reduce(
    (acc, app) => {
      const appDate = new Date(app.start_time);
      const isSameMonth =
        appDate.getMonth() === viewDate.getMonth() &&
        appDate.getFullYear() === viewDate.getFullYear();

      if (
        isSameMonth &&
        isAppointmentCompleted(app) &&
        staffBelongsToCurrentUser(app)
      ) {
        const monto = parseFloat(app.final_price) || 0;
        const servicioObj = findServiceById(app.service_id);
        const nombreServicio = servicioObj ? servicioObj.name : "Otros";
        acc.servicios[nombreServicio] =
          (acc.servicios[nombreServicio] || 0) + monto;
        acc.total += monto;
      }
      return acc;
    },
    { servicios: {}, total: 0 },
  );

  // --- 2. FUNCIONES DE EXPORTACIÓN ---

  // --- LÓGICA DE EXPORTACIÓN MENSUAL ---

  const exportToExcel = () => {
    // 1. Filtramos TODAS las citas del mes que estamos viendo
    const appsDelMes = appointments.filter((app) => {
      const appDate = new Date(app.start_time);
      const isSameMonth =
        appDate.getMonth() === viewDate.getMonth() &&
        appDate.getFullYear() === viewDate.getFullYear();

      return (
        isSameMonth &&
        isAppointmentCompleted(app) &&
        staffBelongsToCurrentUser(app)
      );
    });

    if (appsDelMes.length === 0) {
      setShowNoExportDataModal(true);
      return;
    }

    // 2. Ordenar por fecha (de la más antigua a la más reciente)
    const appsOrdenadas = [...appsDelMes].sort(
      (a, b) => new Date(a.start_time) - new Date(b.start_time),
    );

    // 3. Formatear datos para el gestor
    const dataToExport = appsOrdenadas.map((app) => ({
      Día: new Date(app.start_time).toLocaleDateString("es-ES"),
      Hora: new Date(app.start_time).toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      Cliente: app.client_name || "N/A",
      Servicio: findServiceById(app.service_id)?.name || "Otro",
      Método: (app.payment_method || "efectivo").toUpperCase(),
      "Total (€)": parseFloat(app.final_price || 0),
    }));

    // 4. Añadir una fila de TOTAL al final para el gestor
    const totalMes = appsOrdenadas.reduce(
      (sum, app) => sum + (parseFloat(app.final_price) || 0),
      0,
    );
    dataToExport.push({
      Día: "",
      Hora: "",
      Cliente: "",
      Servicio: "",
      Método: "TOTAL MES:",
      "Total (€)": totalMes,
    });

    // 5. Crear el archivo
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    // Ajustar ancho de columnas para que el Gestor lo vea bien
    const wscols = [
      { wch: 12 },
      { wch: 10 },
      { wch: 25 },
      { wch: 20 },
      { wch: 15 },
      { wch: 12 },
    ];
    worksheet["!cols"] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Cierre ${monthName}`);

    // 6. Nombre del archivo: Cierre_Saray_Marzo_2026.xlsx
    const fileName = `Informe_${currentStaffName}_${monthName.replace(" ", "_")}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // --- 3. FORMATEO Y NAVEGACIÓN ---

  const percentage = Math.min((statsMes.total / PERSONAL_GOAL) * 100, 100);
  const monthName = viewDate.toLocaleString("es-ES", { month: "long" });
  const dayLabel = viewDate.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const formatMoney = (amount) =>
    amount.toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const serviceLabels = Object.keys(statsMes.servicios);
  const maxServiceValue = Math.max(...Object.values(statsMes.servicios), 1);

  const handleConfirmLock = async () => {
    const pwd = password.trim();
    if (!pwd) return;
    setConfirmingLock(true);
    try {
      await apiRequest("/users/me/organization/verify-cash-close", "POST", {
        password: pwd,
      });
      setClosedDayKeys((prev) => ({
        ...prev,
        [viewDayKey]: true,
      }));
      setShowPasswordModal(false);
      setPassword("");
    } catch (e) {
      setLockErrorMessage(formatApiErr(e));
    } finally {
      setConfirmingLock(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* CABECERA DIARIA */}
      <div className="p-8 rounded-[2.5rem] text-white shadow-xl bg-[#5d5045]">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[10px] font-black uppercase opacity-70 tracking-widest mb-1">
              {currentStaffName} • Mi Salón
            </p>
            <p className="text-3xl font-black text-white">
              Hoy: {formatMoney(statsHoy.total)}€
            </p>
            <p className="text-[10px] font-bold opacity-60 uppercase mt-1 capitalize">
              {dayLabel}
            </p>
          </div>
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10"
            aria-hidden
          >
            {isLocked ? (
              <Lock
                className="h-7 w-7 text-[#f5ebe0]"
                strokeWidth={1.5}
              />
            ) : (
              <Sparkles
                className="h-7 w-7 text-[#f5ebe0]"
                strokeWidth={1.5}
              />
            )}
          </div>
        </div>
      </div>

      {/* MÉTODOS Y CIERRE */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#eee8e2]">
        <div className="flex justify-between items-center mb-8">
          <button
            type="button"
            onClick={() =>
              setViewDate((prev) => {
                const d = new Date(prev);
                d.setDate(d.getDate() - 1);
                return d;
              })
            }
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#f8f5f2]"
          >
            ←
          </button>
          <div className="text-center">
            <h5 className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a39485]">
              Caja Diaria
            </h5>
            <p className="text-[11px] font-bold text-[#5d5045] capitalize">
              {dayLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setViewDate((prev) => {
                const d = new Date(prev);
                d.setDate(d.getDate() + 1);
                return d;
              })
            }
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#f8f5f2]"
          >
            →
          </button>
        </div>

        <div className="space-y-6 mb-8">
          <div>
            <div className="flex justify-between text-[10px] font-black mb-2 px-1">
              <span className="text-[#a39485]">EFECTIVO</span>
              <span className="text-[#5d5045]">
                {formatMoney(statsHoy.metodos.efectivo)}€
              </span>
            </div>
            <div className="h-3 bg-[#f8f5f2] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#dcc7b1] transition-all duration-1000"
                style={{
                  width: `${statsHoy.total > 0 ? (statsHoy.metodos.efectivo / statsHoy.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] font-black mb-2 px-1">
              <span className="text-[#a39485]">TARJETA</span>
              <span className="text-[#5d5045]">
                {formatMoney(statsHoy.metodos.tarjeta)}€
              </span>
            </div>
            <div className="h-3 bg-[#f8f5f2] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#5d5045] transition-all duration-1000"
                style={{
                  width: `${statsHoy.total > 0 ? (statsHoy.metodos.tarjeta / statsHoy.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>

        {!isLocked ? (
          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            className="flex w-full items-center justify-center gap-2 py-3 bg-[#5d5045] text-white rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all"
          >
            <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Confirmar y Cerrar Caja
          </button>
        ) : (
          <div className="flex w-full items-center justify-center gap-2 py-3 bg-green-50 text-green-600 rounded-2xl text-[9px] font-black uppercase border border-green-100">
            <CircleCheck
              className="h-4 w-4 shrink-0 text-green-600"
              strokeWidth={2}
              aria-hidden
            />
            Caja cerrada correctamente
          </div>
        )}
      </div>

      {/* GRÁFICA DE SERVICIOS (MENSUAL) */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#eee8e2]">
        <h5 className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a39485] mb-10 text-center uppercase">
          Rendimiento Mensual ({monthName})
        </h5>
        <div className="relative">
          <div className="relative h-48 flex">
            <div className="flex flex-col justify-between h-full pb-0.5 text-right pr-3 border-r border-[#f8f5f2]">
              {[1, 0.75, 0.5, 0.25, 0].map((f) => (
                <span
                  key={f}
                  className="text-[7px] font-bold text-[#b5a798] leading-none"
                >
                  {Math.round(maxServiceValue * f)}€
                </span>
              ))}
            </div>
            <div className="relative flex-1 h-full px-2 flex items-end justify-around">
              {serviceLabels.map((label, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center group relative h-full justify-end"
                >
                  <span className="absolute -top-6 text-[9px] font-bold text-[#5d5045] bg-white px-2 py-1 rounded-lg shadow-sm border border-[#eee8e2] opacity-0 group-hover:opacity-100 transition-opacity z-20 whitespace-nowrap">
                    {formatMoney(statsMes.servicios[label])}€
                  </span>
                  <div
                    className={`w-full max-w-[24px] rounded-t-sm transition-all duration-1000 ${i % 2 === 0 ? "bg-[#dcc7b1]" : "bg-[#5d5045]"}`}
                    style={{
                      height: `${(statsMes.servicios[label] / maxServiceValue) * 100}%`,
                    }}
                  ></div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex ml-[40px] mt-4 justify-around">
            {serviceLabels.map((l, i) => (
              <p
                key={i}
                className="flex-1 text-[7px] font-black uppercase text-[#a39485] text-center leading-tight"
              >
                {l}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* PROGRESO MENSUAL */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#eee8e2] flex flex-col items-center">
        <h5 className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a39485] mb-8">
          Progreso Mensual
        </h5>
        <div className="relative w-40 h-40 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="80"
              cy="80"
              r="70"
              stroke="#f8f5f2"
              strokeWidth="12"
              fill="transparent"
            />
            <circle
              cx="80"
              cy="80"
              r="70"
              stroke="#5d5045"
              strokeWidth="12"
              fill="transparent"
              strokeDasharray={439.8}
              strokeDashoffset={439.8 - (439.8 * percentage) / 100}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute text-center">
            <p className="text-[10px] font-black text-[#a39485] uppercase mb-0.5">
              Acumulado
            </p>
            <p className="text-xl font-black text-[#5d5045] leading-none">
              {formatMoney(statsMes.total)}€
            </p>
            <div className="h-[1px] bg-[#eee8e2] w-12 mx-auto my-2"></div>
            <p className="text-[10px] font-bold text-[#b5a798]">
              Meta: {PERSONAL_GOAL}€
            </p>
          </div>
        </div>
      </div>

      {/* BOTÓN EXCEL (FINAL) */}
      <button
        type="button"
        onClick={exportToExcel}
        className="w-full py-5 bg-[#5d5045] text-white rounded-[2rem] text-[10px] font-black uppercase hover:bg-black transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95"
      >
        <FileSpreadsheet className="h-5 w-5 shrink-0" strokeWidth={2} />
        Descargar Informe Mensual: {monthName}
      </button>

      {/* MODAL CONTRASEÑA */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-cierre-title"
            className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl"
          >
            <h4
              id="modal-cierre-title"
              className="text-[11px] font-black uppercase tracking-widest text-[#5d5045] mb-2 text-center"
            >
              Validar Cierre
            </h4>
            {!currentUser?.cash_close_password_configured && (
              <p className="mb-3 text-center text-[10px] leading-snug text-amber-800">
                {String(currentUser?.role || "").toUpperCase() === "OWNER"
                  ? "Configura la contraseña de cierre de caja en la guía inicial o en Ajustes para poder cerrar la caja."
                  : "El titular debe configurar la contraseña de cierre de caja (guía inicial o Ajustes) antes de poder cerrar la caja."}
              </p>
            )}
            <input
              type="password"
              className="w-full p-4 bg-[#f8f5f2] border-none rounded-2xl mb-4 text-center outline-none"
              placeholder="••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="flex-1 py-3 text-[10px] font-black uppercase text-[#a39485]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={confirmingLock}
                onClick={handleConfirmLock}
                className="flex-1 py-3 bg-[#5d5045] text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                {confirmingLock ? "…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SIN DATOS PARA INFORME */}
      {showNoExportDataModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="presentation"
          onClick={() => setShowNoExportDataModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-sin-informe-title"
            className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f8f5f2] text-[#5d5045] ring-1 ring-[#eaddcf]">
              <Inbox className="h-7 w-7" strokeWidth={1.75} />
            </div>
            <p className="text-[9px] font-black uppercase tracking-[0.35em] text-[#a39485] mb-2">
              Informe mensual
            </p>
            <h4
              id="modal-sin-informe-title"
              className="font-serif text-lg text-[#5d5045] mb-4 leading-snug"
            >
              No hay registros de caja para {monthName}
            </h4>
            <p className="text-[12px] leading-relaxed text-[#6d6359] mb-8">
              Aún no hay citas completadas con venta registrada en este mes.
              Completa citas y márcalas como completadas con importe para poder
              descargar el informe.
            </p>
            <button
              type="button"
              onClick={() => setShowNoExportDataModal(false)}
              className="w-full rounded-full bg-[#5d5045] py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#f5ebe0] shadow-lg transition hover:bg-[#4a3f36]"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* MODAL ERROR AL VALIDAR CIERRE */}
      {lockErrorMessage != null && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="presentation"
          onClick={() => setLockErrorMessage(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-error-cierre-title"
            className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h4
              id="modal-error-cierre-title"
              className="text-[11px] font-black uppercase tracking-widest text-[#5d5045] mb-4"
            >
              No se pudo validar
            </h4>
            <p className="text-[12px] leading-relaxed text-[#6d6359] mb-8">
              {lockErrorMessage}
            </p>
            <button
              type="button"
              onClick={() => setLockErrorMessage(null)}
              className="w-full rounded-full bg-[#5d5045] py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#f5ebe0] shadow-lg transition hover:bg-[#4a3f36]"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatsCharts;
