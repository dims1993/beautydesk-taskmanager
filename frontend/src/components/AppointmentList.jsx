import { useState } from "react"; // Añadimos useState
import { useApi } from "../hooks/useApi";

const AppointmentList = ({ appointments, services, onUpdate }) => {
  const { apiRequest } = useApi();

  // Estados para el Modal de confirmación
  const [confirmingAppo, setConfirmingAppo] = useState(null);
  const [finalPrice, setFinalPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");

  const handleStatusChange = async (id, status) => {
    try {
      await apiRequest(
        `/appointments/${id}/status?new_status=${status}`,
        "PATCH",
      );
      onUpdate();
    } catch (err) {
      console.error("Error al actualizar:", err);
    }
  };

  const handleFinalConfirm = async () => {
    try {
      // 1. Limpiamos la URL: quitamos el ?new_status=...
      // 2. Enviamos el cuerpo JSON limpio
      await apiRequest(`/appointments/${confirmingAppo.id}/status`, "PATCH", {
        final_price: parseFloat(finalPrice),
        payment_method: paymentMethod, // Enviará "tarjeta" o "efectivo"
      });

      setConfirmingAppo(null);
      onUpdate(); // Esto dispara la recarga de las gráficas
    } catch (err) {
      console.error("Error al completar:", err);
    }
  };

  const openConfirmModal = (appo, servicePrice) => {
    setConfirmingAppo(appo);
    setFinalPrice(servicePrice || 0); // Pre-rellenamos con el precio del servicio
    setPaymentMethod("efectivo");
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
                  onClick={() => openConfirmModal(appo, service?.price)}
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

      {/* --- MODAL DE CONFIRMACIÓN DE COBRO --- */}
      {confirmingAppo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
            <h3 className="text-lg font-black text-[#5d5045] mb-2 uppercase tracking-tight text-center">
              Confirmar Cobro
            </h3>
            <p className="text-[10px] text-center text-[#a39485] uppercase font-bold tracking-widest mb-6">
              {confirmingAppo.client_name}
            </p>

            <div className="space-y-6">
              {/* Ajuste de Precio */}
              <div>
                <label className="text-[9px] font-black uppercase text-[#b5a798] ml-2">
                  Precio Final (€)
                </label>
                <input
                  type="number"
                  value={finalPrice}
                  onChange={(e) => setFinalPrice(e.target.value)}
                  className="w-full bg-[#f8f5f2] border-none rounded-2xl p-4 mt-1 font-bold text-[#5d5045]"
                />
              </div>

              {/* Método de Pago */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPaymentMethod("efectivo")}
                  className={`py-4 rounded-2xl text-[10px] font-black uppercase transition-all ${paymentMethod === "efectivo" ? "bg-[#5d5045] text-white shadow-lg" : "bg-[#f8f5f2] text-[#a39485]"}`}
                >
                  💵 Efectivo
                </button>
                <button
                  onClick={() => setPaymentMethod("tarjeta")}
                  className={`py-4 rounded-2xl text-[10px] font-black uppercase transition-all ${paymentMethod === "tarjeta" ? "bg-[#5d5045] text-white shadow-lg" : "bg-[#f8f5f2] text-[#a39485]"}`}
                >
                  💳 Tarjeta
                </button>
              </div>

              {/* Botones de acción */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setConfirmingAppo(null)}
                  className="flex-1 py-4 text-[10px] font-black uppercase text-[#a39485]"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleFinalConfirm}
                  className="flex-[2] py-4 bg-[#dcc7b1] text-white rounded-2xl text-[10px] font-black uppercase shadow-md hover:shadow-xl transition-all"
                >
                  Finalizar y Cobrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentList;
