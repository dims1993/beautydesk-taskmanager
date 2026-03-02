import React, { useState } from "react";

const TeamView = ({ allAppointments, services }) => {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);

  // --- LÓGICA DE NAVEGACIÓN SEMANAL ---
  const getWeekDates = (offset) => {
    const today = new Date();
    // Ajustamos al lunes de la semana actual
    const dayOfWeek = today.getDay() || 7; // lunes es 1, domingo es 7
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek - 1) + offset * 7);
    monday.setHours(0, 0, 0, 0);

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      weekDays.push(day);
    }
    return weekDays;
  };

  const weekDays = getWeekDates(currentWeekOffset);
  const startOfWeekLabel = weekDays[0].toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
  const endOfWeekLabel = weekDays[6].toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });

  // --- FORMATEO DE HORA Y DURACIÓN ---
  const getAppoTimeRange = (appo) => {
    const service = services.find((s) => s.id === appo.service_id);
    const duration = service?.duration || 30;
    const start = new Date(appo.start_time);
    const end = new Date(start.getTime() + duration * 60000);

    const options = { hour: "2-digit", minute: "2-digit" };
    return `${start.toLocaleTimeString("es-ES", options)} - ${end.toLocaleTimeString("es-ES", options)}`;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* SELECTOR DE SEMANA */}
      <div className="flex items-center justify-between bg-white p-4 rounded-[2rem] border border-[#eee8e2] shadow-sm">
        <button
          onClick={() => setCurrentWeekOffset((prev) => prev - 1)}
          className="w-10 h-10 flex items-center justify-center bg-[#f8f5f2] rounded-xl hover:bg-[#dcc7b1] transition-all"
        >
          ←
        </button>

        <div className="text-center">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a39485]">
            Semana del Salón
          </h3>
          <p className="text-xs font-bold text-[#5d5045]">
            {startOfWeekLabel} al {endOfWeekLabel}
          </p>
        </div>

        <button
          onClick={() => setCurrentWeekOffset((prev) => prev + 1)}
          className="w-10 h-10 flex items-center justify-center bg-[#f8f5f2] rounded-xl hover:bg-[#dcc7b1] transition-all"
        >
          →
        </button>
      </div>

      {/* VISTA POR DÍAS */}
      <div className="space-y-4">
        {weekDays.map((dayDate) => {
          const dateString = dayDate.toISOString().split("T")[0];

          // Filtramos citas de este día específico (solo scheduled y completed)
          const dailyApps = allAppointments
            .filter(
              (a) =>
                a.start_time.startsWith(dateString) &&
                (a.status === "scheduled" || a.status === "completed"),
            )
            .sort((a, b) => new Date(a.start_time) - new Date(b.start_time)); // ORDENADAS POR HORA

          return (
            <div
              key={dateString}
              className="bg-white/60 rounded-[2.5rem] p-6 border border-white/40"
            >
              <h4 className="text-[10px] font-black text-[#a39485] uppercase mb-4 border-b border-[#e8ddd0] pb-2 flex justify-between">
                <span>
                  {dayDate.toLocaleDateString("es-ES", {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                {dailyApps.length === 0 && (
                  <span className="opacity-40 italic font-normal text-[8px]">
                    Sin citas
                  </span>
                )}
              </h4>

              <div className="grid grid-cols-2 gap-4">
                {[1, 2].map((staffId) => (
                  <div key={staffId} className="space-y-2">
                    <p
                      className={`text-[8px] font-black uppercase text-center mb-3 py-1 rounded-lg ${staffId === 1 ? "bg-[#dcc7b1]/20 text-[#a39485]" : "bg-[#5d5045]/10 text-[#5d5045]"}`}
                    >
                      {staffId === 1 ? "Saray" : "Stefany"}
                    </p>

                    {dailyApps
                      .filter((a) => a.staff_id === staffId)
                      .map((appo) => (
                        <div
                          key={appo.id}
                          className={`p-3 rounded-2xl border border-[#eee8e2] transition-all ${
                            appo.status === "completed"
                              ? "bg-[#f8f5f2] opacity-60"
                              : "bg-white shadow-sm"
                          }`}
                        >
                          <div className="text-[9px] font-black text-[#5d5045] mb-1">
                            {getAppoTimeRange(appo)}
                          </div>
                          <div className="text-[10px] font-bold text-[#5d5045] truncate">
                            {appo.client_name}
                          </div>
                          <div className="text-[8px] uppercase font-bold text-[#b5a798] mt-1">
                            {services.find((s) => s.id === appo.service_id)
                              ?.name || "Servicio"}
                          </div>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TeamView;
