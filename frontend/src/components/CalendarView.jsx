import { useEffect, useState } from "react";
import { Check, Archive, Edit3 } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useAppointmentActionModals } from "../hooks/useAppointmentActionModals";

const CalendarView = ({
  allAppointments = [],
  services = [],
  onUpdateStatus,
  onRefresh,
  onAddClick,
}) => {
  const { apiRequest } = useApi();
  const { openEdit, openPayment, openArchive, appointmentModals } =
    useAppointmentActionModals(services, onUpdateStatus, onRefresh);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleHasRefreshToken, setGoogleHasRefreshToken] = useState(false);
  const [googleStatusLoading, setGoogleStatusLoading] = useState(true);

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
        appo.status !== "cancelled" // No mostramos las archivadas en el calendario
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

  const pendingApps = dayApps.filter((a) => a.status === "scheduled");
  // Aquí filtramos para que en "Finalizadas" solo salgan las 'completed'
  const completedApps = dayApps.filter((a) => a.status === "completed");

  const refreshGoogleCalendarStatus = async () => {
    try {
      const status = await apiRequest("/auth/google/calendar/status");
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
    refreshGoogleCalendarStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnectGoogleCalendar = async () => {
    try {
      const res = await apiRequest("/auth/google/calendar/connect");
      const url = res?.authorization_url;
      if (!url) throw new Error("Missing authorization_url");
      console.log("Google Calendar authorization_url:", url);
      window.location.href = url;
    } catch (e) {
      console.error("Google Calendar connect failed:", e);
      alert(
        "Failed to connect Google Calendar. Check backend logs and Google OAuth redirect URI configuration.",
      );
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
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
      {/* SECCIÓN CALENDARIO */}
      <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-[#e5e0d8]">
        <div className="flex justify-between items-center mb-6 px-2">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#5d5045]">
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
              className="inline-flex items-center justify-center bg-white text-[#5d5045] border border-[#eee8e2] px-4 py-2 rounded-2xl hover:border-[#dcc7b1] transition-all text-[10px] font-black uppercase tracking-widest"
              title="Connect Google Calendar"
            >
              {googleStatusLoading
                ? "Google…"
                : googleConnected
                  ? googleHasRefreshToken
                    ? "Google Connected"
                    : "Google Connected*"
                  : "Connect Google"}
            </button>
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

      {selectedDay && (
        <div className="space-y-6">
          {/* BLOQUE DE PENDIENTES */}
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
              {pendingApps.length > 0 ? (
                pendingApps.map((appo) => {
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
                          <p className="text-xs font-black">
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
                          type="button"
                          onClick={() => openEdit(appo)}
                          className="h-10 w-10 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-xl transition-all border border-white/5"
                          title="Editar cita"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openPayment(appo)}
                          className="h-10 w-10 flex items-center justify-center bg-white/10 hover:bg-green-500/20 hover:text-green-300 rounded-xl transition-all border border-white/5"
                          title="Confirmar y cobrar"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openArchive(appo)}
                          className="h-10 w-10 flex items-center justify-center bg-white/10 hover:bg-red-500/20 hover:text-red-300 rounded-xl transition-all border border-white/5"
                          title="Archivar"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-center py-4 text-[10px] font-black uppercase opacity-30">
                  No hay citas pendientes
                </p>
              )}
            </div>
          </div>

          {/* BLOQUE DE FINALIZADAS */}
          {completedApps.length > 0 && (
            <div className="bg-white rounded-[2.5rem] p-8 border border-[#e5e0d8] shadow-sm animate-slideUp">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#a39485] mb-6">
                Finalizadas
              </h4>
              <div className="space-y-3">
                {completedApps.map((appo) => (
                  <div
                    key={appo.id}
                    className="bg-[#fcfaf8] rounded-3xl p-4 flex items-center justify-between border border-[#eee8e2]"
                  >
                    <div className="flex items-center gap-4 opacity-40">
                      <span className="text-[9px] font-black text-[#5d5045]">
                        {new Date(appo.start_time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <p className="font-bold text-sm text-[#5d5045] line-through">
                        {appo.client_name}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {/* BOTÓN RETORNO: Vuelve a 'scheduled' */}
                      <button
                        onClick={() => onUpdateStatus(appo.id, "scheduled")}
                        className="h-9 w-9 flex items-center justify-center bg-white text-[#a39485] border border-[#eee8e2] rounded-xl hover:text-[#5d5045] transition-all text-lg"
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
                ))}
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
