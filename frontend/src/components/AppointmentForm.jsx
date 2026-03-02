import { useState, useEffect } from "react"; // 1. Añadimos useEffect aquí
import { useApi } from "../hooks/useApi";

const AppointmentForm = ({
  services,
  currentUser,
  onSuccess,
  onError,
  initialDate,
}) => {
  const { apiRequest } = useApi();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    service_id: services[0]?.id || "",
    start_time: "",
    staff_id: currentUser?.id || "",
  });

  // 2. AÑADIMOS ESTO: Escucha cuando el calendario manda una fecha
  useEffect(() => {
    if (currentUser?.id) {
      setFormData((prev) => ({ ...prev, staff_id: currentUser.id }));
    }
  }, [currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...formData,
        service_id: parseInt(formData.service_id),
        // Nos aseguramos de que el staff_id sea el del usuario actual si el form no lo tiene
        staff_id: formData.staff_id || currentUser?.id || 1,
      };
      console.log("Enviando cita con staff_id:", payload.staff_id); // Esto dirá si es 1, 2 o undefined

      await apiRequest("/appointments/", "POST", payload);

      setFormData({
        ...formData,
        client_name: "",
        client_email: "",
        start_time: "",
      });
      onSuccess();
    } catch (err) {
      onError(err.detail || "Error al agendar la cita");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-[3rem] shadow-xl border border-white/20 sticky top-8">
      <div className="bg-[#e8ddd0] p-10 text-center rounded-t-[3rem]">
        <h2 className="text-xl font-bold tracking-[0.25em] uppercase text-[#5d5045]">
          Nueva Cita
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="p-10 space-y-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-[#a39485] uppercase tracking-widest ml-2">
            Cliente
          </label>
          <input
            required
            className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none"
            placeholder="Nombre completo"
            value={formData.client_name}
            onChange={(e) =>
              setFormData({ ...formData, client_name: e.target.value })
            }
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-[#a39485] uppercase tracking-widest ml-2">
            Servicio
          </label>
          <select
            className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none appearance-none cursor-pointer"
            value={formData.service_id}
            onChange={(e) =>
              setFormData({ ...formData, service_id: e.target.value })
            }
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (
                {s.duration >= 60
                  ? `${Math.floor(s.duration / 60)}h ${s.duration % 60 > 0 ? (s.duration % 60) + "min" : ""}`
                  : `${s.duration} min`}
                )
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-[#a39485] uppercase tracking-widest ml-2">
            Fecha y Hora
          </label>
          <input
            required
            type="datetime-local"
            className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none"
            value={formData.start_time}
            onChange={(e) =>
              setFormData({ ...formData, start_time: e.target.value })
            }
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-5 bg-[#5d5045] text-[#f5f5f1] rounded-2xl font-bold uppercase text-[11px] tracking-[0.3em] shadow-lg hover:bg-[#4a3f35] transition-all"
        >
          {loading ? "Procesando..." : "Confirmar Cita"}
        </button>
      </form>
    </div>
  );
};

export default AppointmentForm;
