import React from "react";
import {
  Clock,
  Calendar,
  BarChart3,
  Users,
  UserSquare2,
  LogOut,
} from "lucide-react";

const MobileNavbar = ({ activeTab, setActiveTab, onLogout }) => {
  const tabs = [
    { id: "agenda", icon: Clock },
    { id: "calendario", icon: Calendar },
    { id: "stats", icon: BarChart3 },
    { id: "equipo", icon: Users },
    { id: "clientes", icon: UserSquare2 },
  ];

  return (
    <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 md:hidden w-auto">
      {/* Contenedor ultra-compacto y translúcido */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white/40 backdrop-blur-md rounded-full border border-white/40 shadow-[0_8px_32px_rgba(93,80,69,0.1)]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-500 ${
                isActive
                  ? "bg-[#5d5045] text-white shadow-md"
                  : "text-[#5d5045] opacity-40"
              }`}
            >
              <Icon size={16} strokeWidth={isActive ? 2.5 : 1.5} />

              {/* Punto indicador para el estado activo */}
              {isActive && (
                <span className="absolute -bottom-1 w-1 h-1 bg-[#5d5045] rounded-full animate-pulse" />
              )}
            </button>
          );
        })}

        {/* Separador tipo hilo */}
        <div className="w-[1px] h-4 bg-[#5d5045]/10 mx-1" />

        {/* Botón Salir más discreto */}
        <button
          onClick={onLogout}
          className="flex items-center justify-center w-10 h-10 rounded-full text-[#8c857d] opacity-40 hover:opacity-100 transition-opacity"
        >
          <LogOut size={16} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
};

export default MobileNavbar;
