const TeamView = ({ allAppointments, services }) => {
  const groupByDate = (apps) => {
    const groups = {};
    apps.forEach((app) => {
      const dateKey = new Date(app.start_time).toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(app);
    });
    return groups;
  };

  const dates = groupByDate(allAppointments);

  return (
    <div className="space-y-8">
      {Object.entries(dates).map(([date, apps]) => (
        <div
          key={date}
          className="bg-white/60 rounded-[2rem] p-6 border border-white/40"
        >
          <h3 className="text-[10px] font-black text-[#5d5045] uppercase mb-4 border-b border-[#e8ddd0] pb-2">
            {date}
          </h3>
          <div className="grid grid-cols-2 gap-6">
            {[1, 2].map((staffId) => (
              <div key={staffId} className="space-y-2">
                <p
                  className={`text-[9px] font-bold uppercase text-center mb-2 ${staffId === 1 ? "text-[#dcc7b1]" : "text-[#5d5045]"}`}
                >
                  {staffId === 1 ? "Saray" : "Stefany"}
                </p>
                {apps
                  .filter((a) => a.staff_id === staffId)
                  .map((appo) => {
                    const service = services.find(
                      (s) => s.id === appo.service_id,
                    );
                    return (
                      <div
                        key={appo.id}
                        className={`text-[10px] bg-white p-3 rounded-xl border-l-4 ${staffId === 1 ? "border-[#dcc7b1]" : "border-[#5d5045]"}`}
                      >
                        <div className="font-black text-[#5d5045]">
                          {new Date(appo.start_time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <div className="text-[8px] uppercase text-[#a39485]">
                          {service?.name || "Ocupado"}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TeamView;
