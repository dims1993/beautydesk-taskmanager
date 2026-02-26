import { useState, useEffect } from "react";
import { useApi } from "./hooks/useApi";

// Importación de Componentes
import LoginView from "./components/LoginView";
import Dashboard from "./components/Dashboard";
import AppointmentForm from "./components/AppointmentForm";
import AppointmentList from "./components/AppointmentList";
import HistoryList from "./components/HistoryList";
import CalendarView from "./components/CalendarView";
import TeamView from "./components/TeamView";

function App() {
  const { apiRequest } = useApi();

  // --- ESTADOS ---
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("token"));
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("agenda");
  const [appointments, setAppointments] = useState([]);
  const [allAppointments, setAllAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");

  // --- CARGA DE DATOS ---
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
      console.error("Error cargando datos del salón:", err);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchInitialData();
    }
  }, [isLoggedIn]);

  // --- ACCIONES ---
  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsLoggedIn(false);
    setCurrentUser(null);
    setAppointments([]);
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      await apiRequest(
        `/appointments/${id}/status?new_status=${status}`,
        "PATCH",
      );
      fetchInitialData();
    } catch (err) {
      setErrorMessage("No se pudo actualizar el estado");
    }
  };

  if (!isLoggedIn) return <LoginView onLogin={() => setIsLoggedIn(true)} />;

  return (
    <div className="min-h-screen bg-[#f8f5f2] py-12 px-6 font-sans text-[#5d5045]">
      {/* Notificación de Error */}
      {errorMessage && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 animate-bounce">
          <div className="bg-white border-l-4 border-red-500 p-5 rounded-2xl shadow-2xl flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="text-red-500">⚠️</span>
              <p className="text-xs font-bold uppercase tracking-tight">
                {errorMessage}
              </p>
            </div>
            <button
              onClick={() => setErrorMessage("")}
              className="text-2xl text-[#a39485]"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
        <aside className="lg:col-span-5">
          {currentUser && (
            <AppointmentForm
              services={services}
              currentUser={currentUser}
              onSuccess={fetchInitialData}
              onError={(msg) => {
                setErrorMessage(msg);
                setTimeout(() => setErrorMessage(""), 5000);
              }}
            />
          )}
        </aside>

        <main className="lg:col-span-7 space-y-10">
          <Dashboard appointments={appointments} services={services} />

          {/* MENÚ DE NAVEGACIÓN (UNIFICADO) */}
          <nav className="flex bg-[#e8ddd0]/50 backdrop-blur-sm p-2 rounded-4xl border border-[#e5e0d8] shadow-inner">
            {["agenda", "calendario", "historial", "equipo"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3.5 text-[10px] font-black uppercase rounded-3xl transition-all tracking-widest ${
                  activeTab === tab
                    ? "bg-white shadow-md text-[#5d5045]"
                    : "text-[#a39485] hover:text-[#5d5045]"
                }`}
              >
                {tab === "agenda"
                  ? "Mis Citas"
                  : tab === "calendario"
                    ? "Calendario 📅"
                    : tab === "historial"
                      ? "Historial"
                      : "Vista Equipo 🌿"}
              </button>
            ))}
          </nav>

          {/* CONTENEDOR DINÁMICO */}
          <section className="space-y-5 max-h-[65vh] overflow-y-auto pr-4 custom-scrollbar">
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
                onUpdateStatus={handleUpdateStatus}
              />
            )}

            {activeTab === "equipo" && (
              <TeamView allAppointments={allAppointments} services={services} />
            )}

            <button
              onClick={handleLogout}
              className="w-full mt-8 text-[10px] font-black text-red-400 uppercase border border-red-100 px-4 py-4 rounded-2xl hover:bg-red-50 transition-all shadow-sm"
            >
              Cerrar Sesión del Salón
            </button>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
