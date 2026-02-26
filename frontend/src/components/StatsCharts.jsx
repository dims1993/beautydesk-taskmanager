import React, { useState } from "react";

const StatsCharts = ({ appointments = [], services = [], currentUser }) => {
  // 1. Estado para controlar el mes y año que visualizamos
  const [viewDate, setViewDate] = useState(new Date());

  // Funciones para navegar entre meses
  const nextMonth = () => {
    setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() + 1)));
  };

  const prevMonth = () => {
    setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() - 1)));
  };

  const monthName = viewDate.toLocaleString("es-ES", {
    month: "long",
    year: "numeric",
  });

  // 2. Procesar datos filtrando por el mes seleccionado
  const statsMap = appointments
    .filter((a) => {
      const statusNormalizado = a.status?.toString().toLowerCase().trim();
      const isCompletada =
        statusNormalizado === "completada" || statusNormalizado === "completed";

      // Filtro de fecha
      const appointmentDate = new Date(a.start_time);
      const isSameMonth =
        appointmentDate.getMonth() === viewDate.getMonth() &&
        appointmentDate.getFullYear() === viewDate.getFullYear();

      return isCompletada && isSameMonth;
    })
    .reduce((acc, appo) => {
      const service = services.find((s) => s.id === appo.service_id);
      const monto = service?.price || 0;

      let staffName = "";

      if (appo.staff_id === 1 || appo.staff_id === "1") staffName = "Saray";
      else if (appo.staff_id === 2 || appo.staff_id === "2")
        staffName = "Stefany";
      else if (appo.staff_name) staffName = appo.staff_name;
      else if (currentUser?.email?.toLowerCase().includes("saray"))
        staffName = "Saray";
      else if (currentUser?.email?.toLowerCase().includes("stefany"))
        staffName = "Stefany";
      else staffName = "Equipo General";

      acc[staffName] = (acc[staffName] || 0) + monto;
      return acc;
    }, {});

  // Aseguramos que los nombres principales aparezcan
  if (!statsMap["Saray"]) statsMap["Saray"] = 0;
  if (!statsMap["Stefany"]) statsMap["Stefany"] = 0;

  const staffData = Object.entries(statsMap)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const maxTotal = Math.max(...staffData.map((d) => d.total), 1);
  const CHART_HEIGHT = 160;

  return (
    <div className="space-y-6">
      {/* TARJETA DEL GRÁFICO */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#eee8e2]">
        {/* SELECTOR DE MES (Flechas) */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={prevMonth}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#f8f5f2] hover:bg-[#e8ddd0] transition-colors"
          >
            <span className="text-[#5d5045] font-bold">←</span>
          </button>

          <div className="text-center">
            <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a39485]">
              Rendimiento Mensual
            </h5>
            <p className="text-[12px] font-bold text-[#5d5045] capitalize">
              {monthName}
            </p>
          </div>

          <button
            onClick={nextMonth}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#f8f5f2] hover:bg-[#e8ddd0] transition-colors"
          >
            <span className="text-[#5d5045] font-bold">→</span>
          </button>
        </div>

        {/* GRÁFICO */}
        <div
          className="flex justify-around items-end w-full px-4 border-b border-[#f8f5f2]"
          style={{ height: `${CHART_HEIGHT + 40}px` }}
        >
          {staffData.map((data) => {
            const barHeight = (data.total / maxTotal) * CHART_HEIGHT;
            return (
              <div
                key={data.name}
                className="flex flex-col items-center w-1/3 group relative"
              >
                <span className="text-[11px] font-black mb-2 text-[#5d5045]">
                  {data.total}€
                </span>
                <div
                  className={`w-full max-w-[45px] rounded-t-2xl transition-all duration-1000 ${
                    data.name === "Saray" ? "bg-[#dcc7b1]" : "bg-[#5d5045]"
                  }`}
                  style={{ height: `${barHeight}px`, minHeight: "4px" }}
                ></div>
                <div className="absolute -bottom-8 w-max">
                  <span className="text-[10px] font-bold text-[#5d5045] uppercase tracking-tighter">
                    {data.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="h-6"></div>
      </div>

      {/* TOTALES POR PERSONA */}
      <div className="grid grid-cols-2 gap-4">
        {staffData.map((data) => (
          <div
            key={data.name}
            className={`p-7 rounded-[2.2rem] text-white shadow-md ${data.name === "Saray" ? "bg-[#dcc7b1]" : "bg-[#5d5045]"}`}
          >
            <p className="text-[8px] font-black uppercase opacity-60 tracking-[0.2em] mb-1">
              {data.name}
            </p>
            <p className="text-2xl font-black">{data.total}€</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatsCharts;
