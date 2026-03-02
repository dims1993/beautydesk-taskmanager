import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";

const AppointmentForm = ({
  services,
  currentUser,
  onSuccess,
  onError,
  initialDate,
  clients = [], // Recibimos la lista de clientes fidelizados
}) => {
  const { apiRequest } = useApi();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    service_id: services[0]?.id || "",
    start_time: initialDate || "",
    staff_id: currentUser?.id || "",
  });

  // Estados para el buscador inteligente
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (currentUser?.id) {
      setFormData((prev) => ({ ...prev, staff_id: currentUser.id }));
    }
  }, [currentUser]);

  // LÓGICA DE BÚSQUEDA EN TIEMPO REAL
  useEffect(() => {
    if (formData.client_name.length > 1) {
      const filtered = clients.filter((c) =>
        `${c.nombre} ${c.apellidos}`
          .toLowerCase()
          .includes(formData.client_name.toLowerCase()),
      );
      setSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [formData.client_name, clients]);

  const selectClientFromList = (client) => {
    setFormData({
      ...formData,
      client_name: `${client.nombre} ${client.apellidos}`,
      client_email: client.email || "",
    });
    setShowSuggestions(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...formData,
        service_id: parseInt(formData.service_id),
        staff_id: formData.staff_id || currentUser?.id || 1,
      };

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
    <div className="bg-white/80 backdrop-blur-md rounded-[3rem] shadow-xl border border-white/20 sticky top-8 z-50">
      <div className="bg-[#e8ddd0] p-10 text-center rounded-t-[3rem]">
        <h2 className="text-xl font-bold tracking-[0.25em] uppercase text-[#5d5045]">
          Nueva Cita
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="p-10 space-y-6">
        {/* BUSCADOR DE CLIENTE CON SUGERENCIAS */}
        <div className="space-y-2 relative">
          <label className="text-[10px] font-black text-[#a39485] uppercase tracking-widest ml-2">
            Cliente
          </label>
          <input
            required
            className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none focus:border-[#dcc7b1] transition-all"
            placeholder="Nombre completo"
            value={formData.client_name}
            onChange={(e) =>
              setFormData({ ...formData, client_name: e.target.value })
            }
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} // Delay para permitir el click
          />

          {/* DESPLEGABLE DE SUGERENCIAS */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-[60] w-full mt-1 bg-white border border-[#eee8e2] rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
              {suggestions.map((c, i) => (
                <div
                  key={i}
                  onClick={() => selectClientFromList(c)}
                  className="px-6 py-4 hover:bg-[#f8f5f2] cursor-pointer border-b border-[#fcfaf8] last:border-none flex justify-between items-center"
                >
                  <div>
                    <p className="text-sm font-bold text-[#5d5045]">
                      {c.nombre} {c.apellidos}
                    </p>
                    <p className="text-[9px] font-black text-[#dcc7b1] uppercase tracking-widest">
                      {c.telefono}
                    </p>
                  </div>
                  <span className="text-lg opacity-30">✨</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* EMAIL (Se rellena solo si seleccionas cliente fiel) */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-[#a39485] uppercase tracking-widest ml-2">
            Email / Contacto
          </label>
          <input
            type="email"
            className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none"
            placeholder="correo@ejemplo.com"
            value={formData.client_email}
            onChange={(e) =>
              setFormData({ ...formData, client_email: e.target.value })
            }
          />
        </div>

        {/* SELECTOR DE SERVICIO (con tu lógica de duración) */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-[#a39485] uppercase tracking-widest ml-2">
            Servicio
          </label>
          <div className="relative">
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
            <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-30">
              ▼
            </div>
          </div>
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
          className="w-full py-5 bg-[#5d5045] text-[#f5f5f1] rounded-2xl font-bold uppercase text-[11px] tracking-[0.3em] shadow-lg hover:bg-[#4a3f35] transition-all disabled:opacity-50"
        >
          {loading ? "Procesando..." : "Confirmar Cita"}
        </button>
      </form>
    </div>
  );
};

export default AppointmentForm;
