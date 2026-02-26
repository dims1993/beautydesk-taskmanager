import { useState, useEffect } from "react";
import { useApi } from "./hooks/useApi";

// Componentes
import LoginView from "./components/LoginView";
import Dashboard from "./components/Dashboard";
import AppointmentForm from "./components/AppointmentForm";
import AppointmentList from "./components/AppointmentList";
import HistoryList from "./components/HistoryList";
import CalendarView from "./components/CalendarView";
import TeamView from "./components/TeamView";
import MobileNavbar from "./components/MobileNavbar"; // <-- Nuevo import

function App() {
  const { apiRequest } = useApi();
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("token"));
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("agenda");
  const [appointments, setAppointments] = useState([]);
  const [allAppointments, setAllAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchInitialData = async () => {
    try {
      const [user, svcs, apps, team] = await Promise.all([
        apiRequest("/users/me"),
        apiRequest("/services/"),
        apiRequest("/appointments/"),
        apiRequest("/staff/availability-map"),
      ]);
      if (user) setCurrentUser(user);
      if (svcs) setServices(svcs);
      if (apps)
        setAppointments(
          apps.sort((a, b) => new Date(b.start_time) - new Date(a.start_time)),
        );
      if (team) setAllAppointments(team);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isLoggedIn) fetchInitialData();
  }, [isLoggedIn]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) return <LoginView onLogin={() => setIsLoggedIn(true)} />;

  return (
    <div className="min-h-screen bg-[#f8f5f2] pb-24 md:pb-12 pt-6 md:pt-12 px-4 md:px-6 font-sans text-[#5d5045]">
      {/* 1. NOTIFICACIÓN DE ERROR */}
      {errorMessage && (
        <div className="fixed top-4 md:top-10 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md">
          <div className="bg-white border-l-4 border-red-500 p-4 rounded-xl shadow-2xl flex justify-between items-center">
            <p className="text-[10px] font-bold uppercase">{errorMessage}</p>
            <button onClick={() => setErrorMessage("")} className="text-xl">
              &times;
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12">
        {/* COLUMNA IZQUIERDA (Desktop o Móvil-Inicio) */}
        <aside
          className={`lg:col-span-5 ${activeTab !== "agenda" ? "hidden lg:block" : "block"}`}
        >
          {currentUser && (
            <AppointmentForm
              services={services}
              currentUser={currentUser}
              onSuccess={fetchInitialData}
              onError={(msg) => setErrorMessage(msg)}
            />
          )}
        </aside>

        {/* COLUMNA DERECHA */}
        <main className="lg:col-span-7 space-y-8">
          <div className="hidden md:block">
            <Dashboard appointments={appointments} services={services} />
          </div>

          {/* Menú Superior (Solo Desktop) */}
          <nav className="hidden md:flex bg-[#e8ddd0]/50 backdrop-blur-sm p-2 rounded-4xl border border-[#e5e0d8]">
            {["agenda", "calendario", "historial", "equipo"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-[10px] font-black uppercase rounded-3xl transition-all ${
                  activeTab === tab ? "bg-white shadow-md" : "opacity-40"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>

          <section className="space-y-5">
            {activeTab === "agenda" && (
              <AppointmentList
                appointments={appointments.filter(
                  (a) => a.status === "scheduled",
                )}
                services={services}
                onUpdate={fetchInitialData}
              />
            )}
            {activeTab === "calendario" && (
              <CalendarView allAppointments={allAppointments} />
            )}
            {activeTab === "historial" && (
              <HistoryList
                appointments={appointments}
                services={services}
                onUpdateStatus={fetchInitialData}
              />
            )}
            {activeTab === "equipo" && (
              <TeamView allAppointments={allAppointments} services={services} />
            )}

            <button
              onClick={handleLogout}
              className="hidden md:block w-full text-[10px] font-black text-red-400 uppercase border border-red-100 py-4 rounded-2xl"
            >
              Cerrar Sesión
            </button>
          </section>
        </main>
      </div>

      {/* --- EL COMPONENTE NUEVO --- */}
      <MobileNavbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
      />
    </div>
  );
}

export default App;
