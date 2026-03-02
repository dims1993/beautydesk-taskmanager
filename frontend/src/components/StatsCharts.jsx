import React, { useState } from "react";
import * as XLSX from "xlsx/xlsx.mjs";

const StatsCharts = ({ appointments = [], services = [], currentUser }) => {
  const [viewDate, setViewDate] = useState(new Date());
  const [isLocked, setIsLocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState("");

  const PERSONAL_GOAL = 2000;
  const currentStaffId = currentUser?.id;
  const currentStaffName =
    currentUser?.nombre || currentUser?.username || "Staff";

  // --- 1. LÓGICA DE FILTRADO (DÍA Y MES) ---

  // Filtramos las citas del día seleccionado para el total y para el Excel
  const appsDelDia = appointments.filter((app) => {
    const appDate = new Date(app.start_time);
    const isSameDay =
      appDate.getDate() === viewDate.getDate() &&
      appDate.getMonth() === viewDate.getMonth() &&
      appDate.getFullYear() === viewDate.getFullYear();
    const isCompleted =
      app.status === "completed" || app.status === "completada";
    const belongsToMe = app.staff_id === currentStaffId;
    return isSameDay && isCompleted && belongsToMe;
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
      const isCompleted =
        app.status === "completed" || app.status === "completada";
      const belongsToMe = app.staff_id === currentStaffId;

      if (isSameMonth && isCompleted && belongsToMe) {
        const monto = parseFloat(app.final_price) || 0;
        const servicioObj = services.find((s) => s.id === app.service_id);
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
      const isCompleted =
        app.status === "completed" || app.status === "completada";
      const belongsToMe = app.staff_id === currentStaffId;

      return isSameMonth && isCompleted && belongsToMe;
    });

    if (appsDelMes.length === 0) {
      alert(`No hay citas completadas en ${monthName} para exportar.`);
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
      Servicio: services.find((s) => s.id === app.service_id)?.name || "Otro",
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

  const handleConfirmLock = () => {
    if (password.length > 0) {
      setIsLocked(true);
      setShowPasswordModal(false);
      setPassword("");
      // exportToExcel(); // Descomenta esta línea si quieres que se descargue solo al poner la clave
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
          <div className="text-4xl">{isLocked ? "🔒" : "💅"}</div>
        </div>
      </div>

      {/* MÉTODOS Y CIERRE */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#eee8e2]">
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() =>
              setViewDate(new Date(viewDate.setDate(viewDate.getDate() - 1)))
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
            onClick={() =>
              setViewDate(new Date(viewDate.setDate(viewDate.getDate() + 1)))
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
            onClick={() => setShowPasswordModal(true)}
            className="w-full py-3 bg-[#5d5045] text-white rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all"
          >
            🔒 Confirmar y Cerrar Caja
          </button>
        ) : (
          <div className="w-full py-3 bg-green-50 text-green-600 rounded-2xl text-[9px] font-black uppercase text-center border border-green-100">
            ✅ Caja cerrada correctamente
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
        onClick={exportToExcel}
        className="w-full py-5 bg-[#5d5045] text-white rounded-[2rem] text-[10px] font-black uppercase hover:bg-black transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95"
      >
        <span>📊</span> Descargar Informe Mensual: {monthName}
      </button>

      {/* MODAL CONTRASEÑA */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl">
            <h4 className="text-[11px] font-black uppercase tracking-widest text-[#5d5045] mb-2 text-center">
              Validar Cierre
            </h4>
            <input
              type="password"
              className="w-full p-4 bg-[#f8f5f2] border-none rounded-2xl mb-4 text-center outline-none"
              placeholder="••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="flex-1 py-3 text-[10px] font-black uppercase text-[#a39485]"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmLock}
                className="flex-1 py-3 bg-[#5d5045] text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatsCharts;
