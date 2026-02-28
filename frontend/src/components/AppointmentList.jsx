import { useApi } from "../hooks/useApi";

// Recibimos onUpdateStatus en lugar de onUpdate
const AppointmentList = ({ appointments, services, onUpdateStatus }) => {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
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
        return (
          <div
            key={appo.id}
            className="bg-white p-8 rounded-[2.5rem] border border-[#eee8e2] shadow-sm hover:border-[#dcc7b1] transition-all"
          >
            <div className="flex justify-between items-center">
              <div>
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
                {/* BOTÓN COMPLETAR: Ahora llama a la función de App.jsx */}
                <button
                  onClick={() => onUpdateStatus(appo.id, "completed")}
                  className="w-12 h-12 flex items-center justify-center bg-[#f8f5f2] hover:bg-[#5d5045] hover:text-white rounded-2xl transition-all border border-[#eee8e2]"
                >
                  ✓
                </button>

                {/* BOTÓN ARCHIVAR: Ahora llama a la función de App.jsx con 'deleted' */}
                <button
                  onClick={() => {
                    if (window.confirm("¿Archivar esta cita?")) {
                      onUpdateStatus(appo.id, "deleted");
                    }
                  }}
                  className="w-12 h-12 flex items-center justify-center bg-white hover:text-red-400 rounded-2xl border border-[#eee8e2] transition-all"
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
