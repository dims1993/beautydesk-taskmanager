import { useState } from "react";

const CalendarView = ({
  allAppointments = [],
  services = [],
  onUpdateStatus,
  onAddClick,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);

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
        d.getFullYear() === currentDate.getFullYear()
      );
    });
  };

  const handleDayClick = (day) => {
    setSelectedDay(selectedDay === day ? null : day);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* SECCIÓN CALENDARIO */}
      <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-[#e5e0d8]">
        <div className="flex justify-between items-center mb-6 px-2">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#5d5045]">
            {monthName} <span className="opacity-40">{year}</span>
          </h3>
          <div className="flex gap-4">
            <button
              onClick={() =>
                setCurrentDate(
                  new Date(currentDate.setMonth(currentDate.getMonth() - 1)),
                )
              }
              className="text-[#a39485] hover:text-[#5d5045]"
            >
              ←
            </button>
            <button
              onClick={() =>
                setCurrentDate(
                  new Date(currentDate.setMonth(currentDate.getMonth() + 1)),
                )
              }
              className="text-[#a39485] hover:text-[#5d5045]"
            >
              →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center">
          {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
            <span key={d} className="text-[9px] font-black text-[#a39485] mb-2">
              {d}
            </span>
          ))}

          {[...Array(startingDay)].map((_, i) => (
            <div key={`empty-${i}`}></div>
          ))}

          {[...Array(daysInMonth)].map((_, i) => {
            const day = i + 1;
            const dayApps = getAppsForDay(day);
            const isSelected = selectedDay === day;
            const isToday =
              new Date().getDate() === day &&
              new Date().getMonth() === currentDate.getMonth();

            return (
              <button
                key={day}
                onClick={() => handleDayClick(day)}
                className={`aspect-square rounded-2xl flex flex-col items-center justify-center transition-all relative border ${
                  isSelected
                    ? "bg-[#5d5045] border-[#5d5045] text-white scale-105 shadow-md z-10"
                    : isToday
                      ? "bg-[#fcfaf8] border-[#dcc7b1] text-[#5d5045]"
                      : "bg-white border-[#eee8e2] hover:border-[#dcc7b1] text-[#5d5045]"
                }`}
              >
                <span
                  className={`text-[11px] font-bold ${isToday && !isSelected ? "text-[#dcc7b1]" : ""}`}
                >
                  {day}
                </span>
                <div className="flex gap-0.5 mt-1">
                  {dayApps.some((a) => a.staff_id === 1) && (
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-[#dcc7b1]"}`}
                    ></div>
                  )}
                  {dayApps.some((a) => a.staff_id === 2) && (
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-[#c9b7a7]" : "bg-[#5d5045]"}`}
                    ></div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* PANEL DE DETALLES MEJORADO */}
      {selectedDay && (
        <div className="bg-[#5d5045] rounded-[2.5rem] p-8 text-white shadow-2xl animate-slideUp">
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
              className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              + Nueva Cita
            </button>
          </div>

          <div className="space-y-4">
            {getAppsForDay(selectedDay).length > 0 ? (
              getAppsForDay(selectedDay)
                .sort((a, b) => new Date(a.start_time) - new Date(b.start_time)) // Ordenar por hora
                .map((appo) => {
                  const service = safeServices.find(
                    (s) => s.id === appo.service_id,
                  );
                  const isSaray = appo.staff_id === 1;

                  return (
                    <div
                      key={appo.id}
                      className="bg-white/5 rounded-3xl p-5 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4">
                        <div className="bg-white/10 px-3 py-2 rounded-xl text-center min-w-[65px]">
                          <p className="text-xs font-black tracking-tighter">
                            {new Date(appo.start_time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="font-bold text-base leading-tight">
                            {appo.client_name}
                          </p>
                          <div className="flex gap-2 items-center mt-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#dcc7b1]">
                              {service?.name || "Servicio"}
                            </span>
                            <span className="text-[10px] opacity-30">•</span>
                            <span
                              className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${isSaray ? "bg-[#dcc7b1]/20 text-[#dcc7b1]" : "bg-white/20 text-white"}`}
                            >
                              {isSaray ? "Saray" : "Stefany"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => onUpdateStatus(appo.id, "completada")}
                          className="h-10 w-10 flex items-center justify-center bg-white/10 hover:bg-green-500/20 hover:text-green-300 rounded-xl transition-all border border-white/5"
                          title="Completar"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => onUpdateStatus(appo.id, "cancelada")}
                          className="h-10 w-10 flex items-center justify-center bg-white/10 hover:bg-red-500/20 hover:text-red-300 rounded-xl transition-all border border-white/5"
                          title="Cancelar"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="text-center py-10 opacity-30">
                <p className="text-[10px] font-black uppercase tracking-widest">
                  Día libre sin citas
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
