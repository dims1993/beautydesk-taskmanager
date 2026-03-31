import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";
import {
  Sparkles,
  MessageCircle,
  User,
  Phone,
  CheckCircle2,
  X,
  ChevronRight,
} from "lucide-react";

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
  const [lastCreated, setLastCreated] = useState(null);

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
    setLastCreated(null);

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
          nombre,
          apellidos,
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
    <div className="bg-white rounded-[3rem] shadow-2xl shadow-[#5d5045]/10 border border-[#eaddcf] overflow-hidden sticky top-8 z-40 transition-all duration-500">
      {/* Cabecera Editorial */}
      <div className="bg-[#FAF9F6] p-10 border-b border-[#eaddcf] text-center space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#8c857d]">
          Concierge
        </p>
        <h2 className="text-3xl font-serif text-[#5d5045]">
          Reserva de <span className="italic opacity-80">Experiencias</span>
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="p-8 md:p-10 space-y-6">
        {/* AVISO DE WHATSAPP (Rediseñado) */}
        {lastCreated && (
          <div className="p-6 bg-[#f5f1ed] rounded-3xl border border-[#eaddcf] animate-in fade-in slide-in-from-top-4 duration-500 relative">
            <button
              onClick={() => setLastCreated(null)}
              className="absolute top-4 right-4 text-[#8c857d] hover:text-[#5d5045]"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="w-5 h-5 text-[#5d5045]" />
              <p className="text-[10px] font-black uppercase tracking-widest text-[#5d5045]">
                Confirmación Lista
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const msg = `Hola ${lastCreated.name}, te confirmo tu cita en BeautyTask 💇‍♀️ para el ${lastCreated.date}. ¡Te esperamos!`;
                window.open(
                  `https://wa.me/34${lastCreated.phone.replace(/\s+/g, "")}?text=${encodeURIComponent(msg)}`,
                  "_blank",
                );
                setLastCreated(null);
              }}
              className="w-full py-4 bg-[#5d5045] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 hover:bg-[#4a3f36] transition-all"
            >
              <MessageCircle className="w-4 h-4" /> Enviar WhatsApp
            </button>
          </div>
        )}

        {/* Campo: Cliente */}
        <div className="space-y-3 relative">
          <label className="flex justify-between items-center px-2 text-[10px] font-black text-[#8c857d] uppercase tracking-[0.2em]">
            <span>Cliente</span>
            {isNewClient && (
              <span className="text-[#c4a484] flex items-center gap-1 font-black">
                <Sparkles className="w-3 h-3" /> Nuevo Cliente
              </span>
            )}
          </label>
          <div className="relative">
            <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5]" />
            <input
              required
              className="w-full pl-14 pr-6 py-5 bg-[#FAF9F6] border border-[#eaddcf] rounded-2xl outline-none focus:border-[#5d5045] focus:bg-white transition-all text-xs font-bold tracking-wider text-[#5d5045] placeholder:text-[#c4bdb5]"
              placeholder="NOMBRE COMPLETO"
              value={formData.client_name}
              onChange={(e) =>
                setFormData({ ...formData, client_name: e.target.value })
              }
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-[60] w-full mt-2 bg-white border border-[#eaddcf] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              {suggestions.map((c, i) => (
                <div
                  key={i}
                  onClick={() => selectClientFromList(c)}
                  className="px-6 py-4 hover:bg-[#FAF9F6] cursor-pointer border-b border-[#f5f1ed] last:border-0 flex justify-between items-center transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-[#5d5045] uppercase tracking-wider">
                      {c.nombre} {c.apellidos}
                    </span>
                    <span className="text-[9px] text-[#8c857d] font-medium tracking-[0.1em]">
                      {c.telefono}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#eaddcf]" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campo: Teléfono */}
        <div className="space-y-3">
          <label className="px-2 text-[10px] font-black text-[#8c857d] uppercase tracking-[0.2em]">
            Teléfono {isNewClient && "*"}
          </label>
          <div className="relative">
            <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4bdb5]" />
            <input
              required={isNewClient}
              className={`w-full pl-14 pr-6 py-5 border rounded-2xl outline-none transition-all text-xs font-bold tracking-wider ${isNewClient ? "bg-[#fdf8f3] border-[#c4a484]/30" : "bg-[#FAF9F6] border-[#eaddcf]"} focus:border-[#5d5045]`}
              placeholder="600 000 000"
              value={formData.client_phone}
              onChange={(e) =>
                setFormData({ ...formData, client_phone: e.target.value })
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Campo: Servicio */}
          <div className="space-y-3">
            <label className="px-2 text-[10px] font-black text-[#8c857d] uppercase tracking-[0.2em]">
              Servicio
            </label>
            <select
              className="w-full px-6 py-5 bg-[#FAF9F6] border border-[#eaddcf] rounded-2xl outline-none cursor-pointer text-xs font-bold tracking-wider text-[#5d5045] appearance-none focus:border-[#5d5045] transition-all"
              value={formData.service_id}
              onChange={(e) =>
                setFormData({ ...formData, service_id: e.target.value })
              }
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Campo: Fecha y Hora */}
          <div className="space-y-3">
            <label className="px-2 text-[10px] font-black text-[#8c857d] uppercase tracking-[0.2em]">
              Horario
            </label>
            <div className="relative">
              <input
                required
                type="datetime-local"
                className="w-full px-6 py-5 bg-[#FAF9F6] border border-[#eaddcf] rounded-2xl outline-none text-xs font-bold tracking-wider text-[#5d5045] focus:border-[#5d5045] transition-all"
                value={formData.start_time}
                onChange={(e) =>
                  setFormData({ ...formData, start_time: e.target.value })
                }
              />
            </div>
          </div>
        </div>

        {/* Botón de Acción Principal */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-6 mt-4 bg-[#5d5045] text-[#f5ebe0] rounded-2xl font-black uppercase text-[11px] tracking-[0.4em] shadow-xl shadow-[#5d5045]/20 disabled:opacity-50 transition-all hover:bg-[#4a3f36] active:scale-[0.98]"
        >
          {loading ? "PROCESANDO..." : "CONFIRMAR CITA"}
        </button>
      </form>
    </div>
  );
};

export default AppointmentForm;
