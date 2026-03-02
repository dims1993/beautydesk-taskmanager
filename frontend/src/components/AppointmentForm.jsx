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
  const [lastCreated, setLastCreated] = useState(null); // Para el botón de WhatsApp

  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    client_phone: "",
    service_id: services[0]?.id || "",
    start_time: initialDate || "",
    staff_id: currentUser?.id || "",
  });

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

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
      client_phone: client.telefono || "",
    });
    setShowSuggestions(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLastCreated(null); // Resetear aviso previo

    try {
      const existingClient = clients.find(
        (c) =>
          `${c.nombre} ${c.apellidos || ""}`.trim().toLowerCase() ===
          formData.client_name.toLowerCase(),
      );

      let finalClientId = existingClient?.id || null;

      if (!existingClient) {
        if (!formData.client_phone) {
          throw { detail: "El teléfono es obligatorio para clientes nuevos" };
        }
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

      const payload = {
        ...formData,
        client_id: finalClientId,
        service_id: parseInt(formData.service_id),
        staff_id: formData.staff_id || currentUser?.id || 1,
      };

      await apiRequest("/appointments/", "POST", payload);

      // Guardamos datos para el link de WhatsApp antes de limpiar
      const formattedDate = new Date(formData.start_time).toLocaleString(
        "es-ES",
        {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        },
      );

      setLastCreated({
        name: formData.client_name,
        phone: formData.client_phone,
        date: formattedDate,
      });

      setFormData({
        client_name: "",
        client_email: "",
        client_phone: "",
        service_id: services[0]?.id || "",
        start_time: "",
      });

      onSuccess();
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
        {/* AVISO DE WHATSAPP POST-CITA */}
        {lastCreated && (
          <div className="mb-4 p-5 bg-green-50 border border-green-200 rounded-3xl animate-fadeIn">
            <p className="text-[9px] font-black text-green-700 uppercase tracking-widest text-center mb-3">
              ✅ Cita guardada correctamente
            </p>
            <button
              type="button"
              onClick={() => {
                const msg = `Hola ${lastCreated.name}, te confirmo tu cita en BeautyTask 💇‍♀️ para el ${lastCreated.date}. ¡Te esperamos!`;
                const cleanPhone = lastCreated.phone.replace(/\s+/g, "");
                window.open(
                  `https://wa.me/34${cleanPhone}?text=${encodeURIComponent(msg)}`,
                  "_blank",
                );
                setLastCreated(null);
              }}
              className="w-full py-3 bg-[#25D366] text-white rounded-xl font-bold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 shadow-md hover:scale-[1.02] transition-transform"
            >
              Enviar WhatsApp 💬
            </button>
            <button
              type="button"
              onClick={() => setLastCreated(null)}
              className="w-full mt-2 text-[8px] text-gray-400 uppercase font-bold text-center"
            >
              Cerrar aviso
            </button>
          </div>
        )}

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

        <div className="space-y-2">
          <label
            className={`text-[10px] font-black uppercase tracking-widest ml-2 ${isNewClient ? "text-amber-600" : "text-[#a39485]"}`}
          >
            Teléfono {isNewClient && "* (Obligatorio)"}
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
          className="w-full py-5 bg-[#5d5045] text-[#f5f5f1] rounded-2xl font-bold uppercase text-[11px] tracking-[0.3em] shadow-lg disabled:opacity-50 transition-all hover:bg-[#4a3f35]"
        >
          {loading ? "Registrando..." : "Confirmar Cita"}
        </button>
      </form>
    </div>
  );
};

export default AppointmentForm;
