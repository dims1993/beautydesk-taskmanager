import React from "react";

const MobileNavbar = ({ activeTab, setActiveTab, onLogout }) => {
  const navItems = [
    { id: "agenda", label: "Inicio", icon: "🏠" },
    { id: "calendario", label: "Citas", icon: "📅" },
    { id: "equipo", label: "Equipo", icon: "👥" },
    { id: "historial", label: "Hist", icon: "📜" },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-[#eee8e2] px-6 py-4 flex justify-between items-center z-[90] shadow-[0_-10px_40px_rgba(93,80,69,0.08)]">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => setActiveTab(item.id)}
          className={`flex flex-col items-center transition-all duration-300 ${
            activeTab === item.id
              ? "text-[#5d5045] scale-110"
              : "opacity-30 grayscale"
          }`}
        >
          <span className="text-xl">{item.icon}</span>
          <span className="text-[8px] font-black uppercase mt-1 tracking-tighter">
            {item.label}
          </span>
          {activeTab === item.id && (
            <div className="w-1 h-1 bg-[#5d5045] rounded-full mt-1 animate-pulse"></div>
          )}
        </button>
      ))}

      <button
        onClick={onLogout}
        className="flex flex-col items-center opacity-30 hover:opacity-100 transition-opacity"
      >
        <span className="text-xl">🚪</span>
        <span className="text-[8px] font-black uppercase mt-1">Salir</span>
      </button>
    </div>
  );
};

export default MobileNavbar;
