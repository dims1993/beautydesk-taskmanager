import { useState, useEffect, useMemo, useCallback } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { useApi } from "./hooks/useApi";
/* eslint-disable react-hooks/set-state-in-effect */
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { getPendingPlanFromSession } from "./utils/billingPlan";

import MobileNavbar from "./components/navigation/MobileNavbar";
import DesktopNavBar from "./components/navigation/DesktopNavBar";
import SalonIdentityBar from "./components/navigation/SalonIdentityBar";
import Landing from "./components/marketing/Landing";
import ContactoView from "./components/marketing/ContactoView";
import TermsView from "./components/marketing/TermsView";
import PrivacyView from "./components/marketing/PrivacyView";
import LoginView from "./components/auth/LoginView";
import RegisterView from "./components/auth/RegisterView";
import RoleGuard from "./components/auth/RoleGuard";
import AppointmentForm from "./components/salon/AppointmentForm";
import AppointmentList from "./components/salon/AppointmentList";
import CalendarView from "./components/salon/CalendarView";
import StatsCharts from "./components/salon/StatsCharts";
import ArchivedList from "./components/salon/ArchivedList";
import SalonClientsView from "./components/salon/SalonClientsView";
import TeamView from "./components/salon/TeamView";
import SuperAdminPanel from "./components/salon/SuperAdminPanel";
import SettingsView from "./components/salon/SettingsView";
import BillingSubscriptionPanel from "./components/salon/BillingSubscriptionPanel";
import FirstVisitGuide from "./components/onboarding/FirstVisitGuide";
import MorningWhatsAppRemindersModal from "./components/modals/MorningWhatsAppRemindersModal";

const ONBOARDING_STORAGE_KEY = "beautydesk_onboarding_v2";

/** One-shot replay: first session after deploy clears “completed” for this account only. Bump suffix to replay again. */
const ONBOARDING_REPLAY_ONCE_KEY = "beautydesk_onboarding_replay_2026_04_david_v1";
const ONBOARDING_REPLAY_EMAIL = "davidisraelmunozsalinas@gmail.com";

/** Tras login/registro, si había un plan en la landing, ir a Ajustes → Suscripción. */
function PostLoginAppRedirect() {
  const to = useMemo(() => {
    if (getPendingPlanFromSession()) {
      return "/app?tab=ajustes&billing=1";
    }
    return "/app";
  }, []);
  return <Navigate to={to} replace />;
}

/**
 * Registro con ?plan= desde la landing; al volver al login se conserva la query
 * para el flujo de pago/cambio de plan.
 */
function RegisterFromLandingRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const q = searchParams.toString() ? `?${searchParams.toString()}` : "";
  return (
    <div className="relative">
      <a
        href="/"
        className="absolute top-8 left-8 text-[#5d5045] font-black text-[10px] uppercase tracking-widest z-50 bg-white/50 px-4 py-2 rounded-full border border-[#5d5045]/10 hover:bg-white transition-colors"
      >
        ← Inicio
      </a>
      <RegisterView
        onBack={() => navigate(`/login${q}`)}
        onCompleteRegistration={() => navigate(`/login${q}`)}
      />
    </div>
  );
}

/** Google Sign-In only when VITE_GOOGLE_CLIENT_ID is set (e.g. Vercel env). */
function GoogleAuthShell({ children }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (clientId) {
    return (
      <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>
    );
  }
  return children;
}

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
  const [teamMembers, setTeamMembers] = useState([]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [showFirstVisitGuide, setShowFirstVisitGuide] = useState(false);
  const [guidedTourActive, setGuidedTourActive] = useState(false);
  const [showMorningWhatsApp, setShowMorningWhatsApp] = useState(false);

  function handleLogout() {
    localStorage.removeItem("token");
    setIsLoggedIn(false);
  }

  const MORNING_WHATSAPP_KEY = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateKey = `${yyyy}-${mm}-${dd}`;
    const uid = currentUser?.id != null ? String(currentUser.id) : "anon";
    return `beautydesk_morning_whatsapp_${uid}_${dateKey}`;
  }, [currentUser?.id]);

  /** Main nav (mobile/desktop pill): switch tab and show content from the top. */
  const setActiveTabFromNavbar = useCallback((tabId) => {
    setActiveTab(tabId);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, []);

  const todaysAppointments = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return (Array.isArray(appointments) ? appointments : [])
      .filter((a) => a?.status === "scheduled")
      .filter((a) => {
        const d = new Date(a.start_time);
        return !Number.isNaN(d.getTime()) && d >= start && d < end;
      })
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  }, [appointments]);

  const fetchInitialData = async () => {
    try {
      if (typeof window !== "undefined") {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get("billing") === "success" && sp.get("session_id")) {
          const sessionId = sp.get("session_id");
          try {
            await apiRequest("/billing/confirm-checkout-session", "POST", {
              session_id: sessionId,
            });
          } catch (err) {
            console.error("confirm-checkout-session", err);
            const d = err?.detail;
            setErrorMessage(
              typeof d === "string"
                ? d
                : "No se pudo confirmar el pago. Si ya completaste el checkout en Stripe, recarga; en local asegúrate de tener STRIPE_SECRET_KEY o el webhook reenviado.",
            );
          }
          try {
            const u = new URL(window.location.href);
            u.searchParams.delete("session_id");
            u.searchParams.delete("billing");
            const q = u.searchParams.toString();
            const path = u.pathname + (q ? `?${q}` : "") + (u.hash || "");
            window.history.replaceState({}, "", path);
          } catch {
            /* ignore */
          }
        }
      }
      const user = await apiRequest("/users/me");
      if (user) {
        try {
          if (
            String(user.email || "")
              .toLowerCase()
              .trim() === ONBOARDING_REPLAY_EMAIL &&
            !localStorage.getItem(ONBOARDING_REPLAY_ONCE_KEY)
          ) {
            localStorage.removeItem(ONBOARDING_STORAGE_KEY);
            localStorage.setItem(ONBOARDING_REPLAY_ONCE_KEY, "1");
          }
        } catch {
          /* ignore */
        }
        setCurrentUser(user);
      } else {
        return;
      }
      if (user.app_access_locked) {
        setServices([]);
        setAppointments([]);
        setClients([]);
        setTeamMembers([]);
        return;
      }
      const [svcs, apps, clientsFromDB, team] = await Promise.all([
        apiRequest("/services/"),
        apiRequest("/appointments/"),
        apiRequest("/clients/"),
        apiRequest("/users/team"),
      ]);
      console.log("Fetched appointments:", apps);
      if (svcs) setServices(svcs);
      if (clientsFromDB) setClients(clientsFromDB);
      if (Array.isArray(team)) setTeamMembers(team);
      else setTeamMembers([]);
      if (apps) {
        setAppointments(
          apps.sort((a, b) => new Date(a.start_time) - new Date(b.start_time)),
        );
      }
    } catch {
      handleLogout();
    }
  };

  useEffect(() => {
    const so = window.screen?.orientation;
    if (so && typeof so.lock === "function") {
      so.lock("portrait").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) fetchInitialData();
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("tab") === "ajustes") setActiveTab("ajustes");
      if (sp.get("billing") === "1" || sp.get("billing") === "focus") {
        setActiveTab("ajustes");
      }
    } catch {
      /* ignore */
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !currentUser || currentUser.app_access_locked) return;
    if (!todaysAppointments.length) return;
    const now = new Date();
    const hour = now.getHours();
    if (hour < 6) return;
    try {
      if (localStorage.getItem(MORNING_WHATSAPP_KEY)) return;
      setShowMorningWhatsApp(true);
    } catch {
      // If storage is blocked, just don't show it.
    }
  }, [isLoggedIn, currentUser, todaysAppointments.length, MORNING_WHATSAPP_KEY]);

  useEffect(() => {
    if (!isLoggedIn || !currentUser || currentUser.app_access_locked) {
      setShowFirstVisitGuide(false);
      setGuidedTourActive(false);
      return;
    }
    try {
      if (!localStorage.getItem(ONBOARDING_STORAGE_KEY)) {
        setShowFirstVisitGuide(true);
      }
    } catch {
      setShowFirstVisitGuide(false);
    }
  }, [isLoggedIn, currentUser]);

  const completeFirstVisitGuide = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setGuidedTourActive(false);
    setShowFirstVisitGuide(false);
  };

  const handleUpdateStatus = async (id, newStatus, extra = null) => {
    try {
      await apiRequest(`/appointments/${id}/status`, "PATCH", {
        new_status: newStatus,
        final_price: extra?.price || 0,
        payment_method: extra?.method || "ninguno",
      });
      fetchInitialData();
    } catch {
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
    <GoogleAuthShell>
      <Router>
        <Routes>
          {/* --- RUTAS PÚBLICAS --- */}
          <Route path="/" element={<Landing />} />
          <Route path="/contacto" element={<ContactoView />} />
          <Route path="/legal/terms" element={<TermsView />} />
          <Route path="/legal/privacy" element={<PrivacyView />} />

          <Route
            path="/register"
            element={!isLoggedIn ? <RegisterFromLandingRoute /> : <PostLoginAppRedirect />}
          />
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
                      onCompleteRegistration={() => setIsRegistering(false)}
                    />
                  ) : (
                    <LoginView
                      onLogin={() => setIsLoggedIn(true)}
                      onGoToRegister={() => setIsRegistering(true)}
                    />
                  )}
                </div>
              ) : (
                <PostLoginAppRedirect />
              )
            }
          />

          {/* --- RUTA PRIVADA (LA APP) --- */}
          <Route
            path="/app"
            element={
              isLoggedIn ? (
                <div className="min-h-screen bg-[#f8f5f2] pb-24 md:pb-12 pt-6 md:pt-12 px-4 md:px-6 font-sans text-[#5d5045]">
                  {!currentUser && (
                    <div className="max-w-6xl mx-auto py-20 text-center text-[10px] text-[#8c857d] font-bold uppercase tracking-widest">
                      Cargando tu cuenta…
                    </div>
                  )}
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

                  <MorningWhatsAppRemindersModal
                    isOpen={showMorningWhatsApp}
                    onClose={() => {
                      try {
                        localStorage.setItem(MORNING_WHATSAPP_KEY, "1");
                      } catch {
                        /* ignore */
                      }
                      setShowMorningWhatsApp(false);
                    }}
                    appointmentsToday={todaysAppointments}
                    services={services}
                    currentUser={currentUser}
                  />

                  {currentUser?.app_access_locked && (
                    <div className="max-w-2xl mx-auto space-y-6 py-4">
                      <div>
                        <h1 className="text-2xl md:text-3xl font-serif text-[#5d5045]">
                          Método de pago obligatorio
                        </h1>
                        <p className="mt-2 text-[10px] leading-relaxed text-[#8c857d]">
                          Para proteger el servicio, la organización debe
                          completar el alta en Stripe: periodo de prueba sin
                          cargo y, a continuación, el cobro del plan de no
                          cancelar. Hasta entonces, la app no estará
                          habilitada.
                        </p>
                      </div>
                      <div className="rounded-[2.5rem] border border-[#e5e0d8] bg-white/95 p-6 shadow-sm">
                        <BillingSubscriptionPanel
                          currentUser={currentUser}
                          onRefresh={fetchInitialData}
                          onError={setErrorMessage}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full py-3 rounded-full border border-[#e5e0d8] text-[10px] font-black uppercase tracking-widest text-[#8c857d] hover:border-[#5d5045]/20"
                      >
                        Cerrar sesión
                      </button>
                    </div>
                  )}

                  {currentUser && !currentUser.app_access_locked && (
                    <>
                  {currentUser?.needs_fiscal_completion && (
                    <div className="max-w-6xl mx-auto mb-4 px-1">
                      <div className="rounded-2xl border border-amber-300 bg-amber-50/95 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[10px] font-bold text-amber-950">
                        <span>
                          Falta completar los datos fiscales de tu negocio. Ve a{" "}
                          <button
                            type="button"
                            className="underline font-black"
                            onClick={() => setActiveTab("ajustes")}
                          >
                            Ajustes
                          </button>{" "}
                          para activar tu agenda y que no veas datos de otras
                          cuentas.
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab("ajustes")}
                          className="shrink-0 bg-[#5d5045] text-[#f5ebe0] px-4 py-2 rounded-full uppercase tracking-widest text-[9px]"
                        >
                          Completar ahora
                        </button>
                      </div>
                    </div>
                  )}

                  <SalonIdentityBar currentUser={currentUser} />

                  <div className="mx-auto grid min-w-0 max-w-6xl grid-cols-1 gap-8 md:gap-12 lg:grid-cols-12">
                    <aside
                      className={`min-w-0 lg:col-span-5 ${activeTab !== "agenda" ? "hidden lg:block" : "block"}`}
                    >
                      {currentUser && (
                        <AppointmentForm
                          services={services}
                          clients={clients}
                          currentUser={currentUser}
                          onSuccess={fetchInitialData}
                          initialDate={preselectedDate}
                          onError={(msg) => setErrorMessage(msg)}
                          disabledReason={
                            currentUser?.needs_fiscal_completion
                              ? "Completa los datos fiscales en Ajustes para crear citas."
                              : null
                          }
                        />
                      )}
                    </aside>

                    <main className="lg:col-span-7 space-y-10">
                      <DesktopNavBar
                        activeTab={activeTab}
                        setActiveTab={setActiveTabFromNavbar}
                        currentUser={currentUser}
                        onLogout={handleLogout}
                        guidedTourActive={guidedTourActive}
                      />

                      <section className="space-y-5">
                        {activeTab === "agenda" && (
                          <>
                            <div className="rounded-[2.5rem] border border-[#eaddcf] bg-gradient-to-br from-[#faf8f5] to-[#f5f0ea] px-6 py-6 md:px-8 md:py-7 shadow-sm shadow-[#5d5045]/5">
                              <p className="font-serif text-xl md:text-2xl text-[#5d5045] tracking-tight">
                                Citas próximas
                              </p>
                              <p className="mt-3 max-w-xl text-[11px] md:text-xs font-medium leading-relaxed text-[#8c857d]">
                                Aquí se muestran las{" "}
                                <span className="font-bold text-[#5d5045]">
                                  citas del día de hoy
                                </span>
                                . Con el botón de{" "}
                                <span className="font-bold text-[#5d5045]">
                                  Recordatorios
                                </span>{" "}
                                puedes preparar y enviar mensajes por WhatsApp (se
                                abrirá WhatsApp con el texto listo para que tú
                                confirmes el envío).
                              </p>
                              <button
                                type="button"
                                onClick={() => setShowMorningWhatsApp(true)}
                                disabled={!todaysAppointments.length}
                                className="mt-5 inline-flex items-center rounded-full border border-[#5d5045]/20 bg-white px-5 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-[#5d5045] transition hover:border-[#dcc7b1] hover:bg-[#faf8f5]"
                              >
                                Recordatorios
                              </button>
                            </div>
                            <AppointmentList
                              appointments={todaysAppointments}
                              services={services}
                              onUpdateStatus={handleUpdateStatus}
                              onRefresh={fetchInitialData}
                            />
                          </>
                        )}
                        {activeTab === "calendario" && (
                          <CalendarView
                            currentUser={currentUser}
                            allAppointments={appointments}
                            services={services}
                            teamMembers={teamMembers}
                            onUpdateStatus={handleUpdateStatus}
                            onRefresh={fetchInitialData}
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
                          <TeamView currentUser={currentUser} />
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
                          <SalonClientsView
                            clients={clients}
                            onRefresh={fetchInitialData}
                            onError={setErrorMessage}
                            blockedMessage={
                              currentUser?.needs_fiscal_completion
                                ? "Completa los datos fiscales en Ajustes para gestionar clientes."
                                : null
                            }
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
                        {activeTab === "ajustes" && (
                          <SettingsView
                            currentUser={currentUser}
                            services={services}
                            onRefresh={fetchInitialData}
                            onError={setErrorMessage}
                          />
                        )}
                      </section>
                    </main>
                  </div>
                  <MobileNavbar
                    activeTab={activeTab}
                    setActiveTab={setActiveTabFromNavbar}
                    currentUser={currentUser}
                    onLogout={handleLogout}
                    guidedTourActive={guidedTourActive}
                  />

                  {showFirstVisitGuide && (
                    <FirstVisitGuide
                      currentUser={currentUser}
                      onUserRefresh={fetchInitialData}
                      onComplete={completeFirstVisitGuide}
                      setActiveTab={setActiveTab}
                      onTourOpenChange={setGuidedTourActive}
                    />
                  )}
                    </>
                  )}
                </div>
              ) : (
                <Navigate to="/login" />
              )
            }
          />

          <Route
            path="/master-panel"
            element={
              <RoleGuard
                allowedRoles={["SUPER_ADMIN"]}
                user={currentUser}
                isLoggedIn={isLoggedIn}
              >
                <SuperAdminPanel />
              </RoleGuard>
            }
          />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </GoogleAuthShell>
  );
}

export default App;
