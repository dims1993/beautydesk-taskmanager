import React, { useEffect, useState } from "react";
import { ChevronLeft, Send, Sparkles, MapPin, Phone, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../hooks/useApi";

/** Número en formato internacional sin + (ej. 34600111222). Configura VITE_BUSINESS_WHATSAPP en producción. */
const defaultWa = "34900000000";

export default function ContactoView() {
  const navigate = useNavigate();
  const { apiRequest } = useApi();
  const [me, setMe] = useState(undefined);
  const [upgradeMessage, setUpgradeMessage] = useState("");

  const waNumber =
    import.meta.env.VITE_BUSINESS_WHATSAPP?.replace(/\D/g, "") || defaultWa;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || token === "undefined" || token === "null") {
      setMe(null);
      return;
    }
    let cancelled = false;
    apiRequest("/users/me")
      .then((user) => {
        if (!cancelled) setMe(user || null);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openWhatsApp = () => {
    const text = encodeURIComponent(
      "Hola, me gustaría información sobre BeautyTask.",
    );
    window.open(`https://wa.me/${waNumber}?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const handleWhatsAppClick = () => {
    if (me && me.integrations_access === false) {
      setUpgradeMessage(
        "El acceso directo a WhatsApp desde la cuenta profesional está reservado a planes con integraciones activas. Actualiza tu plan o escríbenos desde el formulario.",
      );
      return;
    }
    setUpgradeMessage("");
    openWhatsApp();
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-0 md:p-10 font-sans selection:bg-[#f5ebe0]">
      <div className="w-full max-w-6xl min-h-screen md:min-h-[750px] grid grid-cols-1 lg:grid-cols-2 bg-white md:rounded-[3rem] shadow-2xl overflow-hidden border-none md:border md:border-[#eaddcf]">
        <div className="relative h-[35vh] lg:h-auto overflow-hidden">
          <img
            src="/nails2.webp"
            alt="Detalle de atención al cliente"
            className="absolute inset-0 w-full h-full object-cover transform scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#5d5045]/90 via-[#5d5045]/40 to-transparent lg:bg-gradient-to-br lg:from-[#5d5045]/80 lg:to-transparent" />

          <div className="relative h-full p-8 md:p-16 flex flex-col justify-between text-[#f5ebe0]">
            <div className="space-y-4">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-full w-fit">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="text-4xl md:text-6xl font-serif leading-tight">
                Estamos a un <br />
                <span className="italic">mensaje</span> de distancia.
              </h2>
            </div>

            <div className="hidden md:block space-y-6 pt-10 border-t border-white/20">
              <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest">
                <MapPin className="w-5 h-5 opacity-70" />
                <span>Estudio BeautyTask, Calle Estética 123</span>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest">
                <Phone className="w-5 h-5 opacity-70" />
                <span>+34 900 000 000</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative -mt-10 lg:mt-0 bg-white rounded-t-[3rem] lg:rounded-none p-8 md:p-20 flex flex-col justify-center">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="absolute top-6 right-8 p-3 bg-[#FAF9F6] lg:bg-transparent rounded-full text-[#8c857d] hover:text-[#5d5045] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="space-y-2 mb-10 text-center lg:text-left">
            <p className="text-[10px] uppercase tracking-[0.4em] text-[#8c857d] font-black">
              Contacto Directo
            </p>
            <h3 className="text-3xl md:text-4xl font-serif text-[#5d5045]">
              Hablemos de tu proyecto
            </h3>
          </div>

          {upgradeMessage && (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] font-bold text-amber-950">
              {upgradeMessage}
            </div>
          )}

          <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-[#8c857d] ml-2">
                  Nombre
                </label>
                <input
                  type="text"
                  placeholder="TU NOMBRE"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-6 rounded-2xl text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all placeholder:text-[#c4bdb5] text-[#5d5045]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-[#8c857d] ml-2">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="HOLA@ESTUDIO.COM"
                  className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-6 rounded-2xl text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all placeholder:text-[#c4bdb5] text-[#5d5045]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-[#8c857d] ml-2">
                Mensaje
              </label>
              <textarea
                rows="4"
                placeholder="¿EN QUÉ PODEMOS AYUDARTE?"
                className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-6 rounded-2xl text-[11px] font-black tracking-widest focus:outline-none focus:border-[#5d5045] transition-all resize-none placeholder:text-[#c4bdb5] text-[#5d5045]"
              />
            </div>

            <button
              type="button"
              className="w-full bg-[#5d5045] text-[#f5ebe0] py-5 rounded-full text-[11px] font-black uppercase tracking-[0.2em] hover:bg-[#4a3f36] transition shadow-xl shadow-[#5d5045]/10 active:scale-95 flex items-center justify-center gap-3"
            >
              Enviar Mensaje
              <Send className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleWhatsAppClick}
              className="w-full bg-[#e8f5e9] text-[#2e7d32] border border-[#c8e6c9] py-5 rounded-full text-[11px] font-black uppercase tracking-[0.2em] hover:bg-[#dcedc8] transition flex items-center justify-center gap-3"
            >
              <MessageCircle className="w-4 h-4" />
              Abrir WhatsApp
            </button>
          </form>

          <p className="text-[10px] text-[#8c857d] text-center mt-10 font-medium">
            Típicamente respondemos en menos de 24 horas laborables.
          </p>
        </div>
      </div>
    </div>
  );
}
