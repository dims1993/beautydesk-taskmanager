import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";

const AppointmentForm = ({
  services,
  currentUser,
  onSuccess,
  onError,
  initialDate,
  clients = [],
}) => {
  const { apiRequest } = useApi();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    client_phone: "", // <-- NUEVO: Obligatorio para clientes nuevos
    service_id: services[0]?.id || "",
    start_time: initialDate || "",
    staff_id: currentUser?.id || "",
  });

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Lógica de búsqueda
  useEffect(() => {
    if (formData.client_name.length > 1) {
      const filtered = clients.filter((c) =>
        `${c.nombre} ${c.apellidos || ""}`
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
      client_name: `${client.nombre} ${client.apellidos || ""}`.trim(),
      client_email: client.email || "",
      client_phone: client.telefono || "", // Rellenamos el teléfono si ya existe
    });
    setShowSuggestions(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. ¿Existe el cliente en la lista?
      const existingClient = clients.find(
        (c) =>
          `${c.nombre} ${c.apellidos || ""}`.trim().toLowerCase() ===
          formData.client_name.toLowerCase(),
      );

      let finalClientId = existingClient?.id || null;

      // 2. Si es cliente nuevo (no está en la lista), lo creamos primero
      if (!existingClient) {
        if (!formData.client_phone) {
          throw { detail: "El teléfono es obligatorio para clientes nuevos" };
        }

        // Dividimos nombre y apellidos si se puede (opcional, si no, todo al nombre)
        const nameParts = formData.client_name.split(" ");
        const nombre = nameParts[0];
        const apellidos = nameParts.slice(1).join(" ");

        const newClient = await apiRequest("/clients/", "POST", {
          nombre: nombre,
          apellidos: apellidos,
          telefono: formData.client_phone,
          email: formData.client_email || null,
        });

        finalClientId = newClient.id;
      }

      // 3. Crear la cita vinculada al ID
      const payload = {
        ...formData,
        client_id: finalClientId,
        service_id: parseInt(formData.service_id),
        staff_id: formData.staff_id || currentUser?.id || 1,
      };

      await apiRequest("/appointments/", "POST", payload);

      setFormData({
        client_name: "",
        client_email: "",
        client_phone: "",
        service_id: services[0]?.id || "",
        start_time: "",
      });

      onSuccess(); // Esto refresca la lista global y añade el nuevo cliente a la lista de búsqueda
    } catch (err) {
      onError(err.detail || "Error al procesar la cita");
    } finally {
      setLoading(false);
    }
  };

  const isNewClient =
    formData.client_name.length > 2 &&
    !clients.some(
      (c) =>
        `${c.nombre} ${c.apellidos || ""}`.trim().toLowerCase() ===
        formData.client_name.toLowerCase(),
    );

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-[3rem] shadow-xl border border-white/20 sticky top-8 z-50">
      <div className="bg-[#e8ddd0] p-8 text-center rounded-t-[3rem]">
        <h2 className="text-xl font-bold tracking-[0.25em] uppercase text-[#5d5045]">
          Nueva Cita
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-5">
        {/* NOMBRE DEL CLIENTE */}
        <div className="space-y-2 relative">
          <label className="text-[10px] font-black text-[#a39485] uppercase tracking-widest ml-2">
            Cliente{" "}
            {isNewClient && (
              <span className="text-amber-500 ml-2">✨ Nuevo</span>
            )}
          </label>
          <input
            required
            className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none focus:border-[#dcc7b1]"
            placeholder="Nombre completo"
            value={formData.client_name}
            onChange={(e) =>
              setFormData({ ...formData, client_name: e.target.value })
            }
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          />

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-[60] w-full mt-1 bg-white border border-[#eee8e2] rounded-2xl shadow-2xl overflow-hidden">
              {suggestions.map((c, i) => (
                <div
                  key={i}
                  onClick={() => selectClientFromList(c)}
                  className="px-6 py-4 hover:bg-[#f8f5f2] cursor-pointer border-b border-[#fcfaf8] flex justify-between items-center"
                >
                  <div>
                    <p className="text-sm font-bold text-[#5d5045]">
                      {c.nombre} {c.apellidos}
                    </p>
                    <p className="text-[9px] font-black text-[#dcc7b1] uppercase tracking-widest">
                      {c.telefono}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TELÉFONO - Aparece resaltado si es cliente nuevo */}
        <div className="space-y-2">
          <label
            className={`text-[10px] font-black uppercase tracking-widest ml-2 ${isNewClient ? "text-amber-600" : "text-[#a39485]"}`}
          >
            Teléfono {isNewClient && "* (Obligatorio para nuevos)"}
          </label>
          <input
            required={isNewClient}
            className={`w-full px-6 py-4 border rounded-2xl outline-none transition-all ${isNewClient ? "bg-amber-50 border-amber-200" : "bg-[#fcfaf8] border-[#eee8e2]"}`}
            placeholder="600 000 000"
            value={formData.client_phone}
            onChange={(e) =>
              setFormData({ ...formData, client_phone: e.target.value })
            }
          />
        </div>

        {/* EMAIL (Opcional) */}
        <div className="space-y-2 opacity-80">
          <label className="text-[10px] font-black text-[#a39485] uppercase tracking-widest ml-2">
            Email (Opcional)
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

        {/* SERVICIO */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-[#a39485] uppercase tracking-widest ml-2">
            Servicio
          </label>
          <select
            className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none cursor-pointer"
            value={formData.service_id}
            onChange={(e) =>
              setFormData({ ...formData, service_id: e.target.value })
            }
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.duration} min)
              </option>
            ))}
          </select>
        </div>

        {/* FECHA */}
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
          className="w-full py-5 bg-[#5d5045] text-[#f5f5f1] rounded-2xl font-bold uppercase text-[11px] tracking-[0.3em] shadow-lg disabled:opacity-50"
        >
          {loading ? "Registrando..." : "Confirmar Cita"}
        </button>
      </form>
    </div>
  );
};

export default AppointmentForm;
