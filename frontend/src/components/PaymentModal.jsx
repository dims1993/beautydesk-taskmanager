import { useState, useEffect } from "react";

const PaymentModal = ({ appointment, onClose, onConfirm }) => {
  const [price, setPrice] = useState(0);
  const [method, setMethod] = useState("efectivo");

  // Si la cita tiene un servicio asociado, podríamos sugerir el precio base aquí
  useEffect(() => {
    if (appointment) setPrice(appointment.suggested_price || 0);
  }, [appointment]);

  if (!appointment) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl animate-scaleUp">
        <h4 className="text-xl font-black text-[#5d5045] mb-2">
          Finalizar Cita
        </h4>
        <p className="text-sm text-[#a39485] mb-6">
          Cliente: <span className="font-bold">{appointment.client_name}</span>
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[#a39485] mb-2 block">
              Precio Final
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl px-4 py-3 text-[#5d5045] font-bold outline-none focus:border-[#dcc7b1]"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[#a39485] mb-2 block">
              Método de Pago
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMethod("efectivo")}
                className={`py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${method === "efectivo" ? "bg-[#5d5045] text-white" : "bg-[#fcfaf8] text-[#a39485] border border-[#eee8e2]"}`}
              >
                Efectivo
              </button>
              <button
                onClick={() => setMethod("tarjeta")}
                className={`py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${method === "tarjeta" ? "bg-[#5d5045] text-white" : "bg-[#fcfaf8] text-[#a39485] border border-[#eee8e2]"}`}
              >
                Tarjeta
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-[#a39485]"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(appointment.id, price, method)}
            className="flex-1 bg-[#dcc7b1] py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-[#5d5045] shadow-lg shadow-[#dcc7b1]/20"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
