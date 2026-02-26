import { useState } from "react";

const CalendarView = ({ allAppointments }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

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

  // Ajuste para que la semana empiece en Lunes (0=Dom, 1=Lun...)
  const startingDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const monthName = currentDate.toLocaleString("es-ES", { month: "long" });
  const year = currentDate.getFullYear();

  const getAppointmentsForDay = (day) => {
    return allAppointments.filter((appo) => {
      const appoDate = new Date(appo.start_time);
      return (
        appoDate.getDate() === day &&
        appoDate.getMonth() === currentDate.getMonth() &&
        appoDate.getFullYear() === currentDate.getFullYear() &&
        appo.status === "scheduled"
      );
    });
  };

  return (
    <div className="bg-white/60 backdrop-blur-md rounded-[2.5rem] p-8 border border-white/40 shadow-sm animate-fadeIn">
      <div className="flex justify-between items-center mb-8 px-2">
        <h3 className="text-sm font-black text-[#5d5045] uppercase tracking-[0.2em]">
          {monthName} <span className="font-light opacity-50">{year}</span>
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() =>
              setCurrentDate(
                new Date(currentDate.setMonth(currentDate.getMonth() - 1)),
              )
            }
            className="w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm hover:bg-[#5d5045] hover:text-white transition-all"
          >
            ←
          </button>
          <button
            onClick={() =>
              setCurrentDate(
                new Date(currentDate.setMonth(currentDate.getMonth() + 1)),
              )
            }
            className="w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm hover:bg-[#5d5045] hover:text-white transition-all"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-4">
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
          <div
            key={d}
            className="text-center text-[9px] font-black text-[#a39485] uppercase tracking-widest pb-2"
          >
            {d}
          </div>
        ))}

        {/* Huecos vacíos inicio de mes */}
        {[...Array(startingDay)].map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square"></div>
        ))}

        {/* Días del mes */}
        {[...Array(daysInMonth)].map((_, i) => {
          const day = i + 1;
          const dayApps = getAppointmentsForDay(day);
          const isToday =
            new Date().getDate() === day &&
            new Date().getMonth() === currentDate.getMonth();

          return (
            <div
              key={day}
              className={`aspect-square relative flex flex-col items-center justify-center rounded-2xl border transition-all ${
                isToday
                  ? "bg-[#5d5045] border-[#5d5045] text-white shadow-lg"
                  : "bg-white/50 border-transparent hover:border-[#dcc7b1]"
              }`}
            >
              <span
                className={`text-xs font-bold ${isToday ? "text-white" : "text-[#5d5045]"}`}
              >
                {day}
              </span>

              {/* Puntos de actividad (Staff 1 y 2) */}
              <div className="flex gap-1 mt-1">
                {dayApps.some((a) => a.staff_id === 1) && (
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${isToday ? "bg-white" : "bg-[#dcc7b1]"}`}
                    title="Saray"
                  ></div>
                )}
                {dayApps.some((a) => a.staff_id === 2) && (
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${isToday ? "bg-[#c9b7a7]" : "bg-[#5d5045]"}`}
                    title="Stefany"
                  ></div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="mt-6 flex justify-center gap-6 border-t border-[#e8ddd0] pt-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#dcc7b1]"></div>
          <span className="text-[8px] font-black text-[#a39485] uppercase tracking-widest">
            Saray
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#5d5045]"></div>
          <span className="text-[8px] font-black text-[#a39485] uppercase tracking-widest">
            Stefany
          </span>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
