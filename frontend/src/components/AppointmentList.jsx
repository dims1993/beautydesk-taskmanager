import { useApi } from "../hooks/useApi";

const AppointmentList = ({ appointments, services, onUpdate }) => {
  const { apiRequest } = useApi();

  const handleStatusChange = async (id, status) => {
    try {
      await apiRequest(
        `/appointments/${id}/status?new_status=${status}`,
        "PATCH",
      );
      onUpdate(); // Refresca la lista en el componente padre
    } catch (err) {
      console.error("Error al actualizar:", err);
    }
  };

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
                <button
                  onClick={() => handleStatusChange(appo.id, "completada")}
                  className="w-12 h-12 flex items-center justify-center bg-[#f8f5f2] hover:bg-[#5d5045] hover:text-white rounded-2xl transition-all border border-[#eee8e2]"
                >
                  ✓
                </button>
                <button
                  onClick={() => handleStatusChange(appo.id, "cancelada")}
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
