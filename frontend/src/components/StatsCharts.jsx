import React, { useState } from "react";
import xlsx from "json-as-xlsx";

const StatsCharts = ({ appointments = [], services = [], currentUser }) => {
  const [viewDate, setViewDate] = useState(new Date());
  const [isLocked, setIsLocked] = useState(false); // Estado temporal de bloqueo

  // --- CONFIGURACIÓN ---
  const PERSONAL_GOAL = 2000;
  const BAR_CHART_HEIGHT = 120;
  // ---------------------

  const isSaray =
    currentUser?.username?.toLowerCase().includes("saray") ||
    currentUser?.email?.toLowerCase().includes("saray");

  // 1. FILTRADO Y CÁLCULO
  const stats = appointments.reduce(
    (acc, app) => {
      const appDate = new Date(app.start_time);
      const isSameMonth =
        appDate.getMonth() === viewDate.getMonth() &&
        appDate.getFullYear() === viewDate.getFullYear();
      const isCompleted =
        app.status === "completed" || app.status === "completada";

      if (isSameMonth && isCompleted) {
        const monto = parseFloat(app.final_price) || 0;
        const metodo = (app.payment_method || "").toLowerCase().trim();
        if (metodo === "tarjeta") acc.metodos.tarjeta += monto;
        else acc.metodos.efectivo += monto;

        const servicioObj = services.find((s) => s.id === app.service_id);
        const nombreServicio = servicioObj ? servicioObj.name : "Otros";
        acc.servicios[nombreServicio] =
          (acc.servicios[nombreServicio] || 0) + monto;

        acc.total += monto;
        acc.rawApps.push({ ...app, serviceName: nombreServicio });
      }
      return acc;
    },
    {
      metodos: { efectivo: 0, tarjeta: 0 },
      servicios: {},
      total: 0,
      rawApps: [],
    },
  );

  const percentage = Math.min((stats.total / PERSONAL_GOAL) * 100, 100);
  const monthName = viewDate.toLocaleString("es-ES", {
    month: "long",
    year: "numeric",
  });
  const formatMoney = (amount) =>
    amount.toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const serviceLabels = Object.keys(stats.servicios);
  const maxServiceValue = Math.max(...Object.values(stats.servicios), 1);

  const nextMonth = () =>
    setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() + 1)));
  const prevMonth = () =>
    setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() - 1)));

  const handleLockBox = () => {
    if (
      window.confirm(
        `¿Estás segura de cerrar la caja de ${monthName}? Una vez cerrada, los datos se considerarán definitivos.`,
      )
    ) {
      setIsLocked(true);
      // Aquí en el futuro haríamos un fetch al backend para guardar el cierre
    }
  };

  const exportToExcel = () => {
    const data = [
      {
        sheet: "Cierre de Caja",
        columns: [
          {
            label: "Fecha",
            value: (row) =>
              new Date(row.start_time).toLocaleDateString("es-ES"),
          },
          { label: "Cliente", value: "client_name" },
          { label: "Servicio", value: "serviceName" },
          {
            label: "Método",
            value: (row) => (row.payment_method || "efectivo").toUpperCase(),
          },
          {
            label: "Total (€)",
            value: (row) => parseFloat(row.final_price || 0),
          },
        ],
        content: stats.rawApps,
      },
    ];
    xlsx(data, { fileName: `Cierre_${monthName.replace(" ", "_")}` });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* 1. SALUDO Y TOTAL */}
      <div
        className={`p-8 rounded-[2.5rem] text-white shadow-xl ${isSaray ? "bg-[#dcc7b1]" : "bg-[#5d5045]"}`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[10px] font-black uppercase opacity-70 tracking-widest mb-1">
              {isSaray ? "Saray" : "Staff"} • Mi Salón
            </p>
            <p className="text-3xl font-black text-white">
              Llevas {formatMoney(stats.total)}€
            </p>
            <p className="text-[10px] font-bold opacity-60 uppercase mt-1">
              {monthName}
            </p>
          </div>
          <div className="text-4xl">{isLocked ? "🔒" : "💅"}</div>
        </div>
      </div>

      {/* 2. INGRESOS POR MÉTODO + CIERRE DE CAJA */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#eee8e2]">
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={prevMonth}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#f8f5f2]"
          >
            ←
          </button>
          <div className="text-center">
            <h5 className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a39485]">
              Ingresos por Método
            </h5>
            <p className="text-[11px] font-bold text-[#5d5045] capitalize">
              {monthName}
            </p>
          </div>
          <button
            onClick={nextMonth}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#f8f5f2]"
          >
            →
          </button>
        </div>

        <div className="space-y-6 mb-8">
          {/* Barras horizontales */}
          <div>
            <div className="flex justify-between text-[10px] font-black mb-2 px-1">
              <span className="text-[#a39485]">EFECTIVO</span>
              <span className="text-[#5d5045]">
                {formatMoney(stats.metodos.efectivo)}€
              </span>
            </div>
            <div className="h-3 bg-[#f8f5f2] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#dcc7b1] transition-all duration-1000"
                style={{
                  width: `${stats.total > 0 ? (stats.metodos.efectivo / stats.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] font-black mb-2 px-1">
              <span className="text-[#a39485]">TARJETA</span>
              <span className="text-[#5d5045]">
                {formatMoney(stats.metodos.tarjeta)}€
              </span>
            </div>
            <div className="h-3 bg-[#f8f5f2] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#5d5045] transition-all duration-1000"
                style={{
                  width: `${stats.total > 0 ? (stats.metodos.tarjeta / stats.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* BOTÓN CIERRE DE CAJA (DEBAJO DE LOS MÉTODOS) */}
        {!isLocked ? (
          <button
            onClick={handleLockBox}
            className="w-full py-3 bg-[#5d5045] text-white rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-[#5d5045]/20"
          >
            🔒 Confirmar y Cerrar Caja
          </button>
        ) : (
          <div className="w-full py-3 bg-green-50 text-green-600 rounded-2xl text-[9px] font-black uppercase text-center border border-green-100">
            ✅ Caja de {monthName} cerrada y bloqueada
          </div>
        )}
      </div>

      {/* 3. GRÁFICA DE SERVICIOS (CON EJE Y SUELO SEPARADO) */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#eee8e2]">
        <h5 className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a39485] mb-10 text-center">
          Rendimiento por Servicio
        </h5>

        <div className="relative">
          {/* Contenedor de la gráfica y el Eje Y */}
          <div className="relative h-48 flex">
            {/* EJE Y (Precios a la izquierda) */}
            <div className="flex flex-col justify-between h-full pb-0.5 text-right pr-3 border-r border-[#f8f5f2]">
              {[1, 0.75, 0.5, 0.25, 0].map((factor) => (
                <span
                  key={factor}
                  className="text-[7px] font-bold text-[#b5a798] leading-none"
                >
                  {Math.round(maxServiceValue * factor)}€
                </span>
              ))}
            </div>

            {/* ÁREA DE DIBUJO (Barras y Líneas horizontales) */}
            <div className="relative flex-1 h-full">
              {/* Líneas de cuadrícula de fondo */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {[1, 0.75, 0.5, 0.25, 0].map((factor) => (
                  <div
                    key={factor}
                    className="w-full border-b border-[#f8f5f2] h-0"
                  ></div>
                ))}
              </div>

              {/* Las Barras */}
              <div className="relative z-10 flex items-end justify-around h-full px-2">
                {serviceLabels.length > 0
                  ? serviceLabels.map((label, index) => (
                      <div
                        key={index}
                        className="flex flex-col items-center flex-1 group relative h-full justify-end"
                      >
                        {/* Tooltip con el dinero */}
                        <span className="absolute -top-6 text-[9px] font-bold text-[#5d5045] bg-white px-2 py-1 rounded-lg shadow-sm border border-[#eee8e2] opacity-0 group-hover:opacity-100 transition-opacity z-20 whitespace-nowrap">
                          {stats.servicios[label].toLocaleString("es-ES")}€
                        </span>

                        <div
                          className={`w-full max-w-[24px] rounded-t-sm transition-all duration-1000 shadow-sm ${
                            index % 2 === 0 ? "bg-[#dcc7b1]" : "bg-[#5d5045]"
                          }`}
                          style={{
                            height: `${(stats.servicios[label] / maxServiceValue) * 100}%`,
                          }}
                        ></div>
                      </div>
                    ))
                  : null}
              </div>
            </div>
          </div>

          {/* EJE X (Nombres de servicios debajo de la línea del 0) */}
          <div className="flex ml-[40px] mt-4 justify-around">
            {serviceLabels.map((label, index) => (
              <div key={index} className="flex-1 text-center px-1">
                <p className="text-[7px] font-black uppercase text-[#a39485] leading-tight break-words">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* 4. ANILLO DE PROGRESO */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#eee8e2] flex flex-col items-center">
        <h5 className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a39485] mb-6">
          Meta: {PERSONAL_GOAL}€
        </h5>
        <div className="relative w-32 h-32 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="#f8f5f2"
              strokeWidth="10"
              fill="transparent"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke={isSaray ? "#dcc7b1" : "#5d5045"}
              strokeWidth="10"
              fill="transparent"
              strokeDasharray={351.8}
              strokeDashoffset={351.8 - (351.8 * percentage) / 100}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
          <span className="absolute text-xl font-black text-[#5d5045]">
            {Math.round(percentage)}%
          </span>
        </div>
      </div>

      {/* 5. BOTÓN EXPORTAR (AL FINAL DEL TODO) */}
      <button
        onClick={exportToExcel}
        className="w-full py-5 bg-white border-2 border-[#eee8e2] text-[#5d5045] rounded-[2rem] text-[10px] font-black uppercase hover:bg-[#f8f5f2] transition-all flex items-center justify-center gap-3 shadow-sm"
      >
        <span>📥</span> Descargar Informe Excel de {monthName}
      </button>
    </div>
  );
};

export default StatsCharts;
