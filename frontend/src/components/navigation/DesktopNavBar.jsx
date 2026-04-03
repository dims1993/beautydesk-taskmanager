import { Link } from "react-router-dom";
import { LayoutDashboard, LogOut } from "lucide-react";
import { APP_MAIN_NAV_TABS } from "./navTabs";

/**
 * Top pill nav for md+ breakpoints (matches MobileNavbar styling).
 */
export default function DesktopNavBar({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
}) {
  return (
    <nav className="hidden md:flex justify-center w-full">
      <div className="flex items-center gap-2 px-3 py-2 bg-white/40 backdrop-blur-md rounded-full border border-white/40 shadow-[0_8px_32px_rgba(93,80,69,0.1)]">
        {APP_MAIN_NAV_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              title={tab.title}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center justify-center w-11 h-11 rounded-full transition-all duration-500 ${
                isActive
                  ? "bg-[#5d5045] text-white shadow-md"
                  : "text-[#5d5045] opacity-40 hover:opacity-70"
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.5} />
              {isActive && (
                <span className="absolute -bottom-0.5 w-1 h-1 bg-[#5d5045] rounded-full animate-pulse" />
              )}
            </button>
          );
        })}

        <div className="w-[1px] h-4 bg-[#5d5045]/10 mx-1" />

        {currentUser?.role === "super_admin" && (
          <Link
            to="/master-panel"
            className="flex items-center justify-center w-11 h-11 rounded-full text-[#5d5045] opacity-50 hover:opacity-100 hover:bg-white/60 transition-all"
            title="Panel Maestro"
          >
            <LayoutDashboard size={18} strokeWidth={2} />
          </Link>
        )}

        <button
          type="button"
          title="Salir"
          onClick={onLogout}
          className="flex items-center justify-center w-11 h-11 rounded-full text-[#8c857d] opacity-40 hover:opacity-100 transition-opacity"
        >
          <LogOut size={18} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}
