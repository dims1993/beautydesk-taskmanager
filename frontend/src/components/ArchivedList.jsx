import React from "react";

const ArchivedList = ({ appointments, onRestore, onDeletePermanent }) => {
  const HOY = new Date();
  const DOS_SEMANAS_EN_MS = 14 * 24 * 60 * 60 * 1000;

  // 1. Filtramos y clasificamos
  const archived = appointments.filter((appo) => {
    if (appo.status !== "cancelled") return false;

    const fechaCita = new Date(appo.start_time);
    const antiguedad = HOY - fechaCita;

    // Solo mostramos las que tienen MENOS de 14 días
    return antiguedad < DOS_SEMANAS_EN_MS;
  });

  if (archived.length === 0) return null;

  return (
    <div className="mt-12 bg-white/30 rounded-[2.5rem] p-8 border border-dashed border-[#dcc7b1] animate-fadeIn mb-10">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <span className="text-xl opacity-50">📁</span>
          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#a39485]">
            Archivo Reciente (Últimos 14 días)
          </h4>
        </div>
        <span className="text-[9px] font-black text-[#dcc7b1] uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-[#eee8e2]">
          {archived.length} citas
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {archived.map((appo) => {
          const diasPasados = Math.floor(
            (HOY - new Date(appo.start_time)) / (1000 * 60 * 60 * 24),
          );

          return (
            <div
              key={appo.id}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 flex items-center justify-between border border-[#eee8e2] shadow-sm hover:border-[#dcc7b1] transition-all"
            >
              <div>
                <p className="text-sm font-bold text-[#5d5045]">
                  {appo.client_name}
                </p>
                <div className="flex gap-2 items-center">
                  <p className="text-[9px] font-black uppercase text-[#b5a798] tracking-widest">
                    {new Date(appo.start_time).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </p>
                  <span className="text-[8px] px-1.5 py-0.5 bg-[#f8f5f2] text-[#a39485] rounded font-bold uppercase">
                    Hace {diasPasados}d
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onRestore(appo.id, "scheduled")}
                  className="px-4 py-2 bg-[#5d5045] text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-[#dcc7b1] transition-all"
                >
                  Restaurar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[8px] text-[#a39485] mt-6 text-center uppercase font-bold opacity-40 tracking-tighter">
        * Las citas con más de 14 días de antigüedad se eliminan automáticamente
        de esta lista por seguridad y limpieza.
      </p>
    </div>
  );
};

export default ArchivedList;
