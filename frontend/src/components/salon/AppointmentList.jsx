import {
  Check,
  Clock,
  Calendar as CalendarIcon,
  Archive,
  Edit3,
} from "lucide-react";
import { useAppointmentActionModals } from "../../hooks/useAppointmentActionModals";
import {
  durationMinutesForAppointment,
  serviceNamesForAppointment,
  totalPriceForAppointment,
} from "../../utils/appointmentServices";

const AppointmentList = ({
  appointments = [],
  services,
  onUpdateStatus,
  onRefresh,
}) => {
  const { openEdit, openPayment, openArchive, appointmentModals } =
    useAppointmentActionModals(services, onUpdateStatus, onRefresh);

  const formatTimeRange = (appo, durationMinutes) => {
    const start = new Date(appo.start_time);
    const end = new Date(start.getTime() + durationMinutes * 60000);
    const options = { hour: "2-digit", minute: "2-digit" };
    return `${start.toLocaleTimeString("es-ES", options)} — ${end.toLocaleTimeString("es-ES", options)}`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString)
      .toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
      .toUpperCase();
  };

  const safeAppointments = Array.isArray(appointments) ? appointments : [];

  if (safeAppointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 sm:py-32 px-5 sm:px-8 md:px-6 bg-[var(--bt-bg)] rounded-[3rem] border border-dashed border-[var(--bt-border)]">
        <CalendarIcon className="w-8 h-8 text-[var(--bt-icon)] mb-4 shrink-0" />
        <p className="max-w-[20rem] text-[10px] font-black uppercase leading-relaxed tracking-[0.3em] text-[var(--bt-muted)] text-balance">
          No hay citas programadas esta semana
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {safeAppointments.map((appo) => {
          const duration = durationMinutesForAppointment(appo, services);
          const names = serviceNamesForAppointment(appo, services).join(" · ");
          const priceTotal = totalPriceForAppointment(appo, services);

          return (
            <div
              key={appo.id}
              className="group bg-white p-8 md:p-10 rounded-[3rem] border border-[var(--bt-border)] shadow-sm hover:shadow-2xl hover:shadow-[var(--bt-primary)]/5 transition-all duration-500"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="bg-[var(--bt-primary)] text-white px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest">
                      {formatTimeRange(appo, duration)}
                    </span>
                    <div className="flex items-center gap-1.5 text-[9px] font-black text-[#c4a484] uppercase tracking-widest">
                      <Clock className="w-3 h-3" />
                      {duration} MIN
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h4 className="font-serif text-2xl md:text-3xl text-[var(--bt-primary)]">
                      {appo.client_name}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10px] font-black text-[var(--bt-muted)] uppercase tracking-[0.2em] max-w-[min(100%,28rem)]">
                        {names || "Servicio"}
                      </p>
                      <span className="w-1 h-1 bg-[var(--bt-border)] rounded-full shrink-0" />
                      <p className="text-[10px] font-black text-[var(--bt-primary)] tracking-widest">
                        {priceTotal}€
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-black/5 w-fit">
                    <CalendarIcon className="w-3.5 h-3.5 text-[var(--bt-icon)]" />
                    <p className="text-[9px] text-[var(--bt-muted)] font-black tracking-[0.1em]">
                      {formatDate(appo.start_time)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end md:self-center">
                  <button
                    onClick={() => openEdit(appo)}
                    className="w-14 h-14 flex items-center justify-center bg-[var(--bt-bg)] text-[var(--bt-icon)] hover:text-[var(--bt-primary)] rounded-full border border-[var(--bt-border)] transition-all"
                  >
                    <Edit3 className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => openPayment(appo)}
                    className="w-14 h-14 flex items-center justify-center bg-white text-[var(--bt-muted)] hover:bg-[var(--bt-primary)] hover:text-white rounded-full border border-[var(--bt-border)] transition-all shadow-sm"
                  >
                    <Check className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => openArchive(appo)}
                    className="w-14 h-14 flex items-center justify-center bg-white text-[var(--bt-icon)] hover:text-red-400 hover:border-red-100 rounded-full border border-[var(--bt-border)] transition-all"
                  >
                    <Archive className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {appointmentModals}
    </>
  );
};

export default AppointmentList;
