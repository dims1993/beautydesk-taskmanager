import { useState, useEffect } from "react";
import { useApi } from "./hooks/useApi";
// Importamos las piezas necesarias de react-router-dom
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
import PaymentModal from "./components/PaymentModal";
import ArchivedList from "./components/ArchivedList";
import ClientsView from "./components/ClientsView";
import Landing from "./components/Landing";
import RegisterView from "./components/RegisterView";

function App() {
  const { apiRequest } = useApi();
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    const token = localStorage.getItem("token");
    return !!token && token !== "undefined" && token !== "null";
  });

  // Eliminamos showLanding ya que ahora usaremos rutas de URL
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
    if (newStatus === "completed" && !extra) {
      const appo = appointments.find((a) => a.id === id);
      setConfirmingAppo(appo);
      return;
    }
    try {
      await apiRequest(`/appointments/${id}/status`, "PATCH", {
        new_status: newStatus,
        final_price: extra?.price || 0,
        payment_method: extra?.method || "ninguno",
      });
      setConfirmingAppo(null);
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
        {/* RUTA 1: LANDING (Pública) */}
        <Route
          path="/"
          element={!isLoggedIn ? <Landing /> : <Navigate to="/app" />}
        />

        {/* RUTA 2: LOGIN / REGISTRO */}
        <Route
          path="/login"
          element={
            !isLoggedIn ? (
              <div className="relative">
                <a
                  href="/"
                  className="absolute top-8 left-8 text-[#5d5045] font-black text-[10px] uppercase tracking-widest z-50 bg-white/50 px-4 py-2 rounded-full border border-[#5d5045]/10 hover:bg-white transition-colors"
                >
                  ← Back to Home
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

        {/* RUTA 3: LA APLICACIÓN (Privada) */}
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
                        <button
                          onClick={handleLogout}
                          className="md:hidden w-full bg-white/50 text-[10px] font-black text-red-400 uppercase border border-red-100 py-4 rounded-2xl shadow-sm active:bg-red-50 transition-all"
                        >
                          Cerrar Sesión del Salón
                        </button>
                      </div>
                    )}
                  </aside>

                  <main className="lg:col-span-7 space-y-10">
                    <nav className="hidden md:flex bg-[#e8ddd0]/50 backdrop-blur-sm p-2 rounded-4xl border border-[#e5e0d8]">
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
                          className={`flex-1 py-3 text-[10px] font-black uppercase rounded-3xl transition-all ${activeTab === tab ? "bg-white shadow-md" : "opacity-40"}`}
                        >
                          {tab === "stats" ? "Caja 📊" : tab}
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
                {confirmingAppo && (
                  <PaymentModal
                    appointment={confirmingAppo}
                    onClose={() => setConfirmingAppo(null)}
                    onConfirm={(id, p, m) =>
                      handleUpdateStatus(id, "completed", {
                        price: p,
                        method: m,
                      })
                    }
                  />
                )}
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
