const HistoryList = ({ appointments, services, onUpdateStatus }) => {
  // 1. Filtrar solo las citas que NO están programadas (completadas o canceladas)
  const pastApps = appointments.filter((a) => a.status !== "scheduled");

  // 2. Función de agrupación segura
  const groupByDate = (apps) => {
    const groups = {};
    apps.forEach((app) => {
      if (!app.start_time) return; // Evitar errores si no hay fecha

      const dateKey = new Date(app.start_time).toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(app);
    });
    return groups;
  };

  const grouped = groupByDate(pastApps);

  // 3. Si no hay historial, mostrar mensaje amigable en lugar de blanco
  if (pastApps.length === 0) {
    return (
      <div className="text-center py-20 bg-white/40 rounded-[3rem] border-2 border-dashed border-[#e8ddd0]">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#a39485]">
          El historial está vacío
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-fadeIn">
      {Object.entries(grouped).map(([date, apps]) => (
        <div key={date} className="space-y-4">
          <div className="flex justify-between border-b border-[#e8ddd0] pb-2 px-2">
            <h5 className="text-[10px] font-black uppercase text-[#5d5045]">
              {date}
            </h5>
          </div>

          {apps.map((appo) => {
            const service = services.find((s) => s.id === appo.service_id);
            return (
              <div
                key={appo.id}
                className="bg-white/40 p-5 rounded-2xl flex justify-between items-center border border-[#eee8e2] hover:bg-white transition-all"
              >
                <div>
                  <p className="text-sm font-bold text-[#5d5045]">
                    {appo.client_name}
                  </p>
                  <div className="flex gap-2 items-center mt-1">
                    <span
                      className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${
                        appo.status === "completada"
                          ? "bg-green-100 text-green-600"
                          : "bg-red-100 text-red-400"
                      }`}
                    >
                      {appo.status}
                    </span>
                    <span className="text-[10px] text-[#a39485]">
                      {service?.name || "Servicio"}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onUpdateStatus(appo.id, "scheduled")}
                  className="text-[9px] font-black text-[#a39485] border border-[#eee8e2] px-4 py-2 rounded-xl hover:bg-[#5d5045] hover:text-white hover:border-[#5d5045] transition-all"
                >
                  Reactivar
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default HistoryList;
