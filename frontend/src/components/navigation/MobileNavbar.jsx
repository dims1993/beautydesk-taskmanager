import React from "react";
import { LogOut } from "lucide-react";
import { APP_MAIN_NAV_TABS } from "./navTabs";

const MobileNavbar = ({ activeTab, setActiveTab, onLogout, currentUser }) => {
  const fiscalIncomplete =
    String(currentUser?.role || "").toUpperCase() === "OWNER" &&
    currentUser?.organization_id == null;

  return (
    <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 md:hidden w-auto">
      <div className="flex items-center gap-2 px-3 py-2 bg-white/40 backdrop-blur-md rounded-full border border-white/40 shadow-[0_8px_32px_rgba(93,80,69,0.1)]">
        {APP_MAIN_NAV_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              title={
                tab.id === "ajustes" && fiscalIncomplete
                  ? "Ajustes — datos fiscales"
                  : tab.title
              }
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-500 ${
                isActive
                  ? "bg-[#5d5045] text-white shadow-md"
                  : "text-[#5d5045] opacity-40"
              } ${
                tab.id === "ajustes" && fiscalIncomplete && !isActive
                  ? "ring-2 ring-amber-400/90"
                  : ""
              }`}
            >
              <Icon size={16} strokeWidth={isActive ? 2.5 : 1.5} />

              {isActive && (
                <span className="absolute -bottom-1 w-1 h-1 bg-[#5d5045] rounded-full animate-pulse" />
              )}
            </button>
          );
        })}

        <div className="w-[1px] h-4 bg-[#5d5045]/10 mx-1" />

        <button
          type="button"
          title="Salir"
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
