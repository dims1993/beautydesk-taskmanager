const Dashboard = ({ appointments, services }) => {
  const earnings = appointments
    .filter(
      (a) =>
        a.status === "completada" &&
        new Date(a.start_time).getMonth() === new Date().getMonth(),
    )
    .reduce(
      (sum, a) =>
        sum + (services.find((s) => s.id === a.service_id)?.price || 0),
      0,
    );

  return (
    <div className="bg-[#4a3f35] p-10 rounded-[3rem] shadow-xl text-[#f5f5f1] flex justify-between items-center group">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#c9b7a7] mb-4">
          Volumen de Caja Mensual
        </p>
        <div className="flex items-baseline gap-3">
          <span className="text-6xl font-black">{earnings}</span>
          <span className="text-2xl font-light text-[#dcc7b1]">EUR</span>
        </div>
      </div>
      <div className="w-24 h-24 bg-white/10 rounded-4xl flex items-center justify-center border border-white/10 backdrop-blur-sm">
        <span className="text-4xl">🌿</span>
      </div>
    </div>
  );
};

export default Dashboard;
