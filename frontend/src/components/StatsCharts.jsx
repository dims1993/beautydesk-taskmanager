import React, { useState } from "react";

const StatsCharts = ({ appointments = [], services = [], currentUser }) => {
  const [viewDate, setViewDate] = useState(new Date());

  // --- CONFIGURACIÓN PERSONAL ---
  const PERSONAL_GOAL = 2000;
  // ------------------------------

  const nextMonth = () =>
    setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() + 1)));
  const prevMonth = () =>
    setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() - 1)));

  const monthName = viewDate.toLocaleString("es-ES", {
    month: "long",
    year: "numeric",
  });

  // 1. Calculamos solo lo de la usuaria actual
  const userTotal = appointments
    .filter((cita) => {
      const statusNormalizado = cita.status?.toString().toLowerCase().trim();
      const isCompletada =
        statusNormalizado === "completada" || statusNormalizado === "completed";

      const appointmentDate = new Date(cita.start_time);
      const isSameMonth =
        appointmentDate.getMonth() === viewDate.getMonth() &&
        appointmentDate.getFullYear() === viewDate.getFullYear();

      // Lógica para saber si la cita es de la persona logueada
      const email = currentUser?.email?.toLowerCase() || "";
      const isSarayLogueada = email.includes("saray");
      const isStefanyLogueada = email.includes("stefany");

      let isMyAppointment = false;
      if (isSarayLogueada) {
        // Es de Saray si el id es 1 o si no tiene id (equipo general)
        isMyAppointment =
          cita.staff_id === 1 || cita.staff_id === "1" || !cita.staff_id;
      } else if (isStefanyLogueada) {
        // Es de Stefany si el id es 2
        isMyAppointment = cita.staff_id === 2 || cita.staff_id === "2";
      } else {
        // Para otros usuarios, comparar por ID directamente
        isMyAppointment = cita.staff_id === currentUser?.id;
      }

      return isCompletada && isSameMonth && isMyAppointment;
    })
    .reduce((acc, cita) => {
      const service = services.find((s) => s.id === cita.service_id);
      return acc + (service?.price || 0);
    }, 0);

  const percentage = Math.min((userTotal / PERSONAL_GOAL) * 100, 100);
  const isSaray = currentUser?.email?.toLowerCase().includes("saray");

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#eee8e2] relative overflow-hidden text-center">
        {/* SELECTOR DE MES */}
        <div className="flex justify-between items-center mb-10">
          <button
            onClick={prevMonth}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#f8f5f2] hover:bg-[#e8ddd0] transition-colors"
          >
            ←
          </button>
          <div className="text-center">
            <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a39485]">
              Mi Progreso Personal
            </h5>
            <p className="text-[12px] font-bold text-[#5d5045] capitalize">
              {monthName}
            </p>
          </div>
          <button
            onClick={nextMonth}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#f8f5f2] hover:bg-[#e8ddd0] transition-colors"
          >
            →
          </button>
        </div>

        {/* GRÁFICO CIRCULAR */}
        <div className="flex flex-col items-center justify-center py-4">
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
                stroke={isSaray ? "#dcc7b1" : "#5d5045"}
                strokeWidth="12"
                fill="transparent"
                strokeDasharray={440}
                strokeDashoffset={440 - (440 * percentage) / 100}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-3xl font-black text-[#5d5045]">
                {userTotal}€
              </span>
              <span className="text-[9px] font-black uppercase opacity-40 tracking-widest">
                de {PERSONAL_GOAL}€
              </span>
            </div>
          </div>
        </div>

        <p className="mt-6 text-[11px] font-medium text-[#a39485]">
          {percentage >= 100
            ? "¡Objetivo cumplido! Increíble trabajo. ✨"
            : `Estás al ${Math.round(percentage)}% de tu meta mensual.`}
        </p>
      </div>

      <div
        className={`p-8 rounded-[2.5rem] text-white shadow-xl ${isSaray ? "bg-[#dcc7b1]" : "bg-[#5d5045]"}`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">
              Hola, {isSaray ? "Saray" : "Stefany"}
            </p>
            <p className="text-2xl font-black">Llevas {userTotal}€ este mes</p>
          </div>
          <div className="text-4xl">{percentage >= 100 ? "👑" : "💅"}</div>
        </div>
      </div>
    </div>
  );
};

export default StatsCharts;
