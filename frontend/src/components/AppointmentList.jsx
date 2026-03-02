import { useApi } from "../hooks/useApi";

const AppointmentList = ({ appointments, services, onUpdateStatus }) => {
  // Función para calcular y formatear el rango: "14:00 - 14:45"
  const formatTimeRange = (startTime, durationMinutes = 30) => {
    const start = new Date(startTime);
    const end = new Date(start.getTime() + durationMinutes * 60000);

    const options = { hour: "2-digit", minute: "2-digit" };
    return `${start.toLocaleTimeString("es-ES", options)} - ${end.toLocaleTimeString("es-ES", options)}`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  if (appointments.length === 0) {
    return (
      <div className="text-center py-20 bg-white/40 rounded-[3rem] border-2 border-dashed border-[#e8ddd0]">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#a39485]">
          No hay citas agendadas
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {appointments.map((appo) => {
        const service = services.find((s) => s.id === appo.service_id);
        // Suponiendo que tu objeto servicio tiene un campo 'duration'
        const duration = service?.duration || 30;

        return (
          <div
            key={appo.id}
            className="bg-white p-8 rounded-[2.5rem] border border-[#eee8e2] shadow-sm hover:border-[#dcc7b1] transition-all"
          >
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                {/* ETIQUETA DE HORARIO DINÁMICO */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-[#5d5045] text-white px-3 py-1 rounded-full text-[10px] font-black tracking-tighter">
                    {formatTimeRange(appo.start_time, duration)}
                  </span>
                  <span className="text-[9px] font-black text-[#dcc7b1] uppercase tracking-widest">
                    {duration} MIN
                  </span>
                </div>

                <h4 className="font-bold text-[#5d5045] text-xl">
                  {appo.client_name}
                </h4>

                <p className="text-[10px] font-black text-[#b5a798] uppercase tracking-widest mt-1">
                  ✨ {service?.name || "Servicio"} • {service?.price}€
                </p>

                <p className="text-[11px] text-[#a39485] font-medium italic mt-2">
                  📅 {formatDate(appo.start_time)}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onUpdateStatus(appo.id, "completed")}
                  className="w-12 h-12 flex items-center justify-center bg-[#f8f5f2] hover:bg-[#5d5045] hover:text-white rounded-2xl transition-all border border-[#eee8e2]"
                  title="Completar"
                >
                  ✓
                </button>

                <button
                  onClick={() => {
                    if (window.confirm("¿Archivar esta cita?")) {
                      onUpdateStatus(appo.id, "cancelled");
                    }
                  }}
                  className="w-12 h-12 flex items-center justify-center bg-white hover:text-red-400 rounded-2xl border border-[#eee8e2] transition-all"
                  title="Archivar"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AppointmentList;
