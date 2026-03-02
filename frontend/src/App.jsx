import { useState, useEffect } from "react";
import { useApi } from "./hooks/useApi";

// Componentes
import LoginView from "./components/LoginView";
import AppointmentForm from "./components/AppointmentForm";
import AppointmentList from "./components/AppointmentList";
import CalendarView from "./components/CalendarView";
import TeamView from "./components/TeamView";
import MobileNavbar from "./components/MobileNavbar";
import StatsCharts from "./components/StatsCharts";
import PaymentModal from "./components/PaymentModal"; // Importado
import ArchivedList from "./components/ArchivedList";
import ClientsView from "./components/ClientsView";

function App() {
  const { apiRequest } = useApi();
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("token"));
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("agenda");
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [preselectedDate, setPreselectedDate] = useState("");
  const [clients, setClients] = useState([]);

  // ESTADO PARA EL MODAL DE PAGO
  const [confirmingAppo, setConfirmingAppo] = useState(null);

  const fetchInitialData = async () => {
    try {
      const [user, svcs, apps] = await Promise.all([
        apiRequest("/users/me"),
        apiRequest("/services/"),
        apiRequest("/appointments/"),
      ]);

      if (user) setCurrentUser(user);
      if (svcs) setServices(svcs);
      if (apps) {
        const sortedApps = apps.sort(
          (a, b) => new Date(b.start_time) - new Date(a.start_time),
        );
        setAppointments(sortedApps);
      }
    } catch (err) {
      console.error("Error cargando datos:", err);
    }
  };

  // FUNCIÓN UNIFICADA PARA ACTUALIZAR ESTADOS
  const handleUpdateStatus = async (id, newStatus, extra = null) => {
    // Si queremos completar pero no tenemos los datos del pago, abrimos modal
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

      setConfirmingAppo(null); // Cerramos el modal si estaba abierto
      fetchInitialData();
    } catch (err) {
      console.error("Error al actualizar estado:", err);
      setErrorMessage("No se pudo actualizar la cita");
    }
  };

  // FUNCIÓN UNIFICADA PARA BORRAR PERMANENTEMENTE LOS ARCHIVADOS
  const handleDeletePermanent = async (id) => {
    try {
      // Usamos DELETE para borrar físicamente de la base de datos
      await apiRequest(`/appointments/${id}`, "DELETE");
      // No hace falta refrescar aquí si lo hace el fetchInitialData después
    } catch (err) {
      console.error("Error en borrado permanente:", err);
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
            {["agenda", "calendario", "stats", "equipo", "clientes"].map(
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
                onUpdateStatus={handleUpdateStatus} // Cambiado para usar la unificada
              />
            )}

            {activeTab === "calendario" && (
              <CalendarView
                allAppointments={appointments}
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

            {activeTab === "equipo" && (
              <TeamView allAppointments={appointments} services={services} />
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

                {/* ... (tu resumen de actividad actual) ... */}
              </div>
            )}
            {activeTab === "clientes" && (
              <ClientsView
                clients={clients}
                onAddClient={(newClient) => {
                  // Aquí podrías hacer un apiRequest para guardarlo en la DB
                  setClients([...clients, newClient]);
                  // Opcional: mostrar mensaje de éxito
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

      {/* MODAL DE PAGO ÚNICO */}
      {confirmingAppo && (
        <PaymentModal
          appointment={confirmingAppo}
          onClose={() => setConfirmingAppo(null)}
          onConfirm={(id, price, method) =>
            handleUpdateStatus(id, "completed", { price, method })
          }
        />
      )}
    </div>
  );
}

export default App;
