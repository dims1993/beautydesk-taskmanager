import React, { useMemo } from "react";
import { Clock, Lock, Scissors, X } from "lucide-react";

export default function PendingSetupTasksModal({
  currentUser,
  onClose,
  onGoCash,
  onGoServices,
  onGoHours,
}) {
  const tasks = useMemo(() => {
    return [
      {
        key: "cash",
        label: "Configura la clave de cierre de caja",
        done: !!currentUser?.cash_close_password_configured,
        icon: Lock,
        onGo: onGoCash,
      },
      {
        key: "services",
        label: "Añade tu primer servicio",
        done: !!currentUser?.has_services_configured,
        icon: Scissors,
        onGo: onGoServices,
      },
      {
        key: "hours",
        label: "Define el horario del salón",
        done: !!currentUser?.salon_hours_configured,
        icon: Clock,
        onGo: onGoHours,
      },
    ];
  }, [currentUser, onGoCash, onGoServices, onGoHours]);

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 md:p-8">
      <button
        type="button"
        className="absolute inset-0 bg-[#2c2620]/55 backdrop-blur-[2px]"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-1 -right-1 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#8c857d] shadow-md ring-1 ring-[#eaddcf] transition hover:bg-white hover:text-[#5d5045] md:-right-2 md:-top-2"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" strokeWidth={2} />
        </button>
        <div className="relative rounded-[2rem] border border-[#eaddcf] bg-[#faf8f5]/95 px-8 py-10 shadow-[0_24px_80px_rgba(93,80,69,0.18)] backdrop-blur-md">
          <p className="text-[9px] font-black uppercase tracking-[0.5em] text-[#a39a91] text-center">
            Configuración pendiente
          </p>
          <h2 className="mt-3 font-serif text-2xl leading-snug text-[#5d5045] text-center">
            Completa estos 3 pasos para dejar tu salón listo
          </h2>
          <p className="mt-3 text-[12px] leading-relaxed text-[#6d6359] text-center">
            Te lo mostramos al iniciar sesión hasta que esté todo configurado.
          </p>

          <div className="mt-6 space-y-3">
            {tasks.map((t) => {
              const Icon = t.icon;
              return (
                <div
                  key={t.key}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[#eee8e2] bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#f5ebe0] text-[#5d5045] ring-2 ring-[#5d5045]/10">
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-black tracking-widest text-[#5d5045]">
                        {t.label}
                      </p>
                      <p className="text-[10px] text-[#8c857d]">
                        {t.done ? "Completado" : "Pendiente"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={t.onGo}
                    className="shrink-0 rounded-full border border-[#eaddcf] bg-white px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#5d5045] hover:border-[#5d5045]/30 hover:bg-[#faf8f5]"
                  >
                    {t.done ? "Ver" : "Ir"}
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-full bg-white py-3 text-[10px] font-black uppercase tracking-widest text-[#8c857d] ring-1 ring-[#eaddcf] hover:text-[#5d5045] hover:bg-[#faf8f5]"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}

