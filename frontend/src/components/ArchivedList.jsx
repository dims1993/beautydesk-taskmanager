import React, { useEffect } from "react";

const ArchivedList = ({ appointments, onRestore, onDeletePermanent }) => {
  const HOY = new Date();
  const CATORCE_DIAS_MS = 14 * 24 * 60 * 60 * 1000;
  const TREINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

  // --- LÓGICA DE BORRADO AUTOMÁTICO (30 DÍAS) ---
  useEffect(() => {
    const appointmentsToDelete = appointments.filter((appo) => {
      if (appo.status !== "cancelled") return false;
      const antiguedad = HOY - new Date(appo.start_time);
      return antiguedad > TREINTA_DIAS_MS; // Más de un mes
    });

    // Si hay citas muy viejas, las borramos permanentemente del servidor
    appointmentsToDelete.forEach((appo) => {
      onDeletePermanent(appo.id);
    });
  }, [appointments]);

  // --- LÓGICA DE FILTRO VISUAL (14 DÍAS) ---
  const archivedVisible = appointments.filter((appo) => {
    if (appo.status !== "cancelled") return false;
    const antiguedad = HOY - new Date(appo.start_time);
    return antiguedad < CATORCE_DIAS_MS; // Solo vemos las de menos de 14 días
  });

  if (archivedVisible.length === 0) return null;

  return (
    <div className="mt-12 bg-white/30 rounded-[2.5rem] p-8 border border-dashed border-[#dcc7b1] animate-fadeIn mb-10">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <span className="text-xl opacity-50">📁</span>
          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#a39485]">
            Papelera Reciente (Autolimpia en 14d)
          </h4>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {archivedVisible.map((appo) => {
          const dias = Math.floor(
            (HOY - new Date(appo.start_time)) / (1000 * 60 * 60 * 24),
          );
          return (
            <div
              key={appo.id}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 flex items-center justify-between border border-[#eee8e2] shadow-sm"
            >
              <div>
                <p className="text-sm font-bold text-[#5d5045]">
                  {appo.client_name}
                </p>
                <p className="text-[9px] font-black uppercase text-[#b5a798] tracking-widest flex gap-2">
                  {new Date(appo.start_time).toLocaleDateString()}
                  <span className="text-orange-300">({dias}d)</span>
                </p>
              </div>
              <button
                onClick={() => onRestore(appo.id, "scheduled")}
                className="px-4 py-2 bg-[#5d5045] text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-[#dcc7b1] transition-all"
              >
                Restaurar
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-[8px] text-[#a39485] mt-6 text-center uppercase font-bold opacity-40">
        Las citas de más de 30 días se eliminan permanentemente del sistema
        automáticamente.
      </p>
    </div>
  );
};

export default ArchivedList;
