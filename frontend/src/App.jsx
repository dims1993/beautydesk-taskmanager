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
import MobileNavbar from "./components/MobileNavbar";
import StatsCharts from "./components/StatsCharts";

function App() {
  const { apiRequest } = useApi();
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("token"));
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("agenda");
  const [appointments, setAppointments] = useState([]);
  const [allAppointments, setAllAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [preselectedDate, setPreselectedDate] = useState("");

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

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      // Intentamos enviar el ID de quien completa la cita para que "se la quede"
      await apiRequest(
        `/appointments/${id}/status?new_status=${newStatus}&staff_id=${currentUser.id}`,
        "PATCH",
      );
      fetchAppointments();
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
      {errorMessage && (
        <div className="fixed top-4 md:top-10 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md">
          <div className="bg-white border-l-4 border-red-500 p-4 rounded-xl shadow-2xl flex justify-between items-center text-[10px] font-bold uppercase">
            {errorMessage}
            <button onClick={() => setErrorMessage("")} className="text-xl">
              &times;
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12">
        <aside
          className={`lg:col-span-5 ${activeTab !== "agenda" ? "hidden lg:block" : "block"}`}
        >
          {currentUser && (
            <AppointmentForm
              services={services}
              currentUser={currentUser}
              onSuccess={fetchInitialData}
              initialDate={preselectedDate}
              onError={(msg) => setErrorMessage(msg)}
            />
          )}
        </aside>

        <main className="lg:col-span-7 space-y-10">
          <nav className="hidden md:flex bg-[#e8ddd0]/50 backdrop-blur-sm p-2 rounded-4xl border border-[#e5e0d8]">
            {["agenda", "calendario", "stats", "historial", "equipo"].map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-[10px] font-black uppercase rounded-3xl transition-all ${
                    activeTab === tab ? "bg-white shadow-md" : "opacity-40"
                  }`}
                >
                  {tab === "stats" ? "Caja 📊" : tab}
                </button>
              ),
            )}
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
              <CalendarView
                allAppointments={allAppointments}
                services={services}
                onUpdateStatus={handleUpdateStatus}
                onAddClick={(date) => {
                  const isoDate = new Date(
                    date.getTime() - date.getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16);
                  setPreselectedDate(isoDate);
                  setActiveTab("agenda");
                }}
              />
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

            {activeTab === "stats" && (
              <div className="animate-fadeIn space-y-6">
                <Dashboard appointments={appointments} services={services} />

                {/* LAS NUEVAS GRÁFICAS */}
                <StatsCharts
                  appointments={appointments}
                  services={services}
                  currentUser={currentUser}
                />

                <div className="bg-white/50 p-8 rounded-[2.5rem] border border-[#e5e0d8]">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-[#a39485] mb-4">
                    Resumen de Actividad
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-3xl shadow-sm">
                      <p className="text-[9px] font-black text-[#5d5045] uppercase">
                        Citas Totales
                      </p>
                      <p className="text-2xl font-black text-[#5d5045]">
                        {appointments.length}
                      </p>
                    </div>
                    <div className="bg-white p-5 rounded-3xl shadow-sm">
                      <p className="text-[9px] font-black text-[#5d5045] uppercase">
                        Completadas
                      </p>
                      <p className="text-2xl font-black text-green-500">
                        {
                          appointments.filter((a) => a.status === "completada")
                            .length
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleLogout}
              className="hidden md:block w-full text-[10px] font-black text-red-400 uppercase border border-red-100 py-4 rounded-2xl mt-8"
            >
              Cerrar Sesión del Salón
            </button>
          </section>
        </main>
      </div>

      <MobileNavbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
      />
    </div>
  );
}

export default App;
