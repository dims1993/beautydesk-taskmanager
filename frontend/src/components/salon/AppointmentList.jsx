import {
  Check,
  Clock,
  Calendar as CalendarIcon,
  Archive,
  Edit3,
} from "lucide-react";
import { useAppointmentActionModals } from "../../hooks/useAppointmentActionModals";

const AppointmentList = ({
  appointments = [],
  services,
  onUpdateStatus,
  onRefresh,
}) => {
  const { openEdit, openPayment, openArchive, appointmentModals } =
    useAppointmentActionModals(services, onUpdateStatus, onRefresh);

  const formatTimeRange = (startTime, durationMinutes = 30) => {
    const start = new Date(startTime);
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
      <div className="flex flex-col items-center justify-center py-32 bg-[#FAF9F6] rounded-[3rem] border border-dashed border-[#eaddcf]">
        <CalendarIcon className="w-8 h-8 text-[#c4bdb5] mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#8c857d]">
          No hay citas programadas esta semana
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {safeAppointments.map((appo) => {
          const service = services.find((s) => s.id === appo.service_id);
          const duration = service?.duration || 30;

          return (
            <div
              key={appo.id}
              className="group bg-white p-8 md:p-10 rounded-[3rem] border border-[#eaddcf] shadow-sm hover:shadow-2xl hover:shadow-[#5d5045]/5 transition-all duration-500"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="bg-[#5d5045] text-[#f5ebe0] px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest">
                      {formatTimeRange(appo.start_time, duration)}
                    </span>
                    <div className="flex items-center gap-1.5 text-[9px] font-black text-[#c4a484] uppercase tracking-widest">
                      <Clock className="w-3 h-3" />
                      {duration} MIN
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h4 className="font-serif text-2xl md:text-3xl text-[#5d5045]">
                      {appo.client_name}
                    </h4>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-black text-[#8c857d] uppercase tracking-[0.2em]">
                        {service?.name || "Servicio Premium"}
                      </p>
                      <span className="w-1 h-1 bg-[#eaddcf] rounded-full" />
                      <p className="text-[10px] font-black text-[#5d5045] tracking-widest">
                        {service?.price}€
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-[#f5f1ed] w-fit">
                    <CalendarIcon className="w-3.5 h-3.5 text-[#c4bdb5]" />
                    <p className="text-[9px] text-[#8c857d] font-black tracking-[0.1em]">
                      {formatDate(appo.start_time)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end md:self-center">
                  <button
                    onClick={() => openEdit(appo)}
                    className="w-14 h-14 flex items-center justify-center bg-[#FAF9F6] text-[#c4bdb5] hover:text-[#5d5045] rounded-full border border-[#eaddcf] transition-all"
                  >
                    <Edit3 className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => openPayment(appo)}
                    className="w-14 h-14 flex items-center justify-center bg-white text-[#8c857d] hover:bg-[#5d5045] hover:text-white rounded-full border border-[#eaddcf] transition-all shadow-sm"
                  >
                    <Check className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => openArchive(appo)}
                    className="w-14 h-14 flex items-center justify-center bg-white text-[#c4bdb5] hover:text-red-400 hover:border-red-100 rounded-full border border-[#eaddcf] transition-all"
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
