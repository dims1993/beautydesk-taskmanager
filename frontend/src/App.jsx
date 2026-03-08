import { useState, useEffect } from "react";
import { useApi } from "./hooks/useApi";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

// Componentes
import LoginView from "./components/LoginView";
import AppointmentForm from "./components/AppointmentForm";
import AppointmentList from "./components/AppointmentList";
import CalendarView from "./components/CalendarView";
import TeamView from "./components/TeamView";
import MobileNavbar from "./components/MobileNavbar";
import StatsCharts from "./components/StatsCharts";
import ArchivedList from "./components/ArchivedList";
import ClientsView from "./components/ClientsView";
import Landing from "./components/Landing";
import RegisterView from "./components/RegisterView";
import ContactoView from "./components/ContactoView";

function App() {
  const { apiRequest } = useApi();
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    const token = localStorage.getItem("token");
    return !!token && token !== "undefined" && token !== "null";
  });

  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("agenda");
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [preselectedDate, setPreselectedDate] = useState("");
  const [clients, setClients] = useState([]);
  const [confirmingAppo, setConfirmingAppo] = useState(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const fetchInitialData = async () => {
    try {
      const [user, svcs, apps, clientsFromDB] = await Promise.all([
        apiRequest("/users/me"),
        apiRequest("/services/"),
        apiRequest("/appointments/"),
        apiRequest("/clients/"),
      ]);
      if (user) setCurrentUser(user);
      if (svcs) setServices(svcs);
      if (clientsFromDB) setClients(clientsFromDB);
      if (apps) {
        setAppointments(
          apps.sort((a, b) => new Date(b.start_time) - new Date(a.start_time)),
        );
      }
    } catch (err) {
      handleLogout();
    }
  };

  useEffect(() => {
    if (isLoggedIn) fetchInitialData();
  }, [isLoggedIn]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsLoggedIn(false);
  };

  const handleUpdateStatus = async (id, newStatus, extra = null) => {
    try {
      await apiRequest(`/appointments/${id}/status`, "PATCH", {
        new_status: newStatus,
        final_price: extra?.price || 0,
        payment_method: extra?.method || "ninguno",
      });
      // Ya no necesitamos setConfirmingAppo(null) aquí porque el modal se cierra solo
      fetchInitialData();
    } catch (err) {
      setErrorMessage("No se pudo actualizar la cita");
    }
  };

  const handleDeletePermanent = async (id) => {
    try {
      await apiRequest(`/appointments/${id}`, "DELETE");
      fetchInitialData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Router>
      <Routes>
        {/* --- RUTAS PÚBLICAS --- */}
        <Route path="/" element={<Landing />} />
        <Route path="/contacto" element={<ContactoView />} />

        <Route
          path="/login"
          element={
            !isLoggedIn ? (
              <div className="relative">
                <a
                  href="/"
                  className="absolute top-8 left-8 text-[#5d5045] font-black text-[10px] uppercase tracking-widest z-50 bg-white/50 px-4 py-2 rounded-full border border-[#5d5045]/10 hover:bg-white transition-colors"
                >
                  ← Inicio
                </a>
                {isRegistering ? (
                  <RegisterView
                    onBack={() => setIsRegistering(false)}
                    onSuccess={() => setIsRegistering(false)}
                  />
                ) : (
                  <LoginView
                    onLogin={() => setIsLoggedIn(true)}
                    onGoToRegister={() => setIsRegistering(true)}
                  />
                )}
              </div>
            ) : (
              <Navigate to="/app" />
            )
          }
        />

        {/* --- RUTA PRIVADA (LA APP) --- */}
        <Route
          path="/app"
          element={
            isLoggedIn ? (
              <div className="min-h-screen bg-[#f8f5f2] pb-24 md:pb-12 pt-6 md:pt-12 px-4 md:px-6 font-sans text-[#5d5045]">
                {errorMessage && (
                  <div className="fixed top-4 md:top-10 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md">
                    <div className="bg-white border-l-4 border-red-500 p-4 rounded-xl shadow-2xl flex justify-between items-center text-[10px] font-bold uppercase">
                      {errorMessage}
                      <button
                        onClick={() => setErrorMessage("")}
                        className="text-xl"
                      >
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
                      <div className="space-y-4">
                        <AppointmentForm
                          services={services}
                          clients={clients}
                          currentUser={currentUser}
                          onSuccess={fetchInitialData}
                          initialDate={preselectedDate}
                          onError={(msg) => setErrorMessage(msg)}
                        />
                      </div>
                    )}
                  </aside>

                  <main className="lg:col-span-7 space-y-10">
                    <nav className="hidden md:flex bg-[#e8ddd0]/50 backdrop-blur-sm p-1.5 rounded-full border border-[#e5e0d8] items-center">
                      {/* Botones de Pestañas */}
                      <div className="flex flex-1 gap-1">
                        {[
                          "agenda",
                          "calendario",
                          "stats",
                          "equipo",
                          "clientes",
                        ].map((tab) => (
                          <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-3 text-[10px] font-black uppercase rounded-full transition-all ${
                              activeTab === tab
                                ? "bg-white shadow-sm text-[#5d5045]"
                                : "opacity-40 hover:opacity-60"
                            }`}
                          >
                            {tab === "stats" ? "Caja 📊" : tab}
                          </button>
                        ))}
                      </div>

                      {/* Separador sutil */}
                      <div className="w-[1px] h-4 bg-[#dcc7b1] mx-4" />

                      {/* Botón de Salida Minimalista */}
                      <button
                        onClick={handleLogout}
                        className="pr-4 pl-2 group flex items-center gap-2 transition-all"
                        title="Cerrar Sesión"
                      >
                        <span className="text-[9px] font-black uppercase tracking-widest text-[#8c857d] group-hover:text-red-400 transition-colors">
                          Salir
                        </span>
                        <div className="w-7 h-7 rounded-full bg-white/50 flex items-center justify-center group-hover:bg-red-50 transition-colors">
                          <svg
                            size={14}
                            className="w-3.5 h-3.5 text-[#8c857d] group-hover:text-red-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                        </div>
                      </button>
                    </nav>

                    <section className="space-y-5">
                      {activeTab === "agenda" && (
                        <AppointmentList
                          appointments={appointments.filter(
                            (a) => a.status === "scheduled",
                          )}
                          services={services}
                          onUpdateStatus={handleUpdateStatus}
                        />
                      )}
                      {activeTab === "calendario" && (
                        <CalendarView
                          allAppointments={appointments}
                          services={services}
                          onUpdateStatus={handleUpdateStatus}
                          onAddClick={(date) => {
                            setPreselectedDate(
                              new Date(
                                date.getTime() -
                                  date.getTimezoneOffset() * 60000,
                              )
                                .toISOString()
                                .slice(0, 16),
                            );
                            setActiveTab("agenda");
                          }}
                        />
                      )}
                      {activeTab === "equipo" && (
                        <TeamView
                          allAppointments={appointments}
                          services={services}
                        />
                      )}
                      {activeTab === "stats" && (
                        <div className="animate-fadeIn space-y-6">
                          <StatsCharts
                            appointments={appointments}
                            services={services}
                            currentUser={currentUser}
                          />
                          <ArchivedList
                            appointments={appointments}
                            onRestore={handleUpdateStatus}
                            onDeletePermanent={handleDeletePermanent}
                          />
                        </div>
                      )}
                      {activeTab === "clientes" && (
                        <ClientsView
                          clients={clients}
                          onRefresh={fetchInitialData}
                          onError={(msg) => setErrorMessage(msg)}
                          onAddClient={async (nc) => {
                            try {
                              await apiRequest("/clients/", "POST", nc);
                              fetchInitialData();
                            } catch {
                              setErrorMessage("Error en cliente.");
                            }
                          }}
                        />
                      )}
                    </section>
                  </main>
                </div>

                <MobileNavbar
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  onLogout={handleLogout}
                />
              </div>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
