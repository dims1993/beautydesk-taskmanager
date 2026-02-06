import { useState, useEffect } from "react";

function App() {
  // --- ESTADOS PRINCIPALES ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [activeTab, setActiveTab] = useState("agenda");

  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    service_id: "",
    start_time: "",
    staff_id: 1,
  });

  const minDateTime = new Date().toISOString().slice(0, 16);

  useEffect(() => {
    if (isLoggedIn) {
      fetchServices();
      fetchAppointments();
    }
  }, [isLoggedIn]); // <-- Ahora se ejecutará justo en el momento de loguearse

  const fetchServices = async () => {
    try {
      const res = await fetch("http://localhost:8000/services/");
      const data = await res.json();
      setServices(data);
      if (data.length > 0) {
        setFormData((prev) => ({ ...prev, service_id: data[0].id }));
        setSelectedService(data[0]);
      }
    } catch (err) {
      console.error("Error servicios:", err);
    }
  };

  const fetchAppointments = async () => {
    try {
      const token = localStorage.getItem("token"); // Sacamos la llave guardada

      const res = await fetch("http://localhost:8000/appointments/", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`, // <-- Esto le dice al Back quién eres
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        const data = await res.json();
        // Ahora data solo contiene las citas que el Back filtró para este usuario
        setAppointments(
          data.sort((a, b) => new Date(b.start_time) - new Date(a.start_time)),
        );
      } else if (res.status === 401) {
        // Si el token no vale, cerramos sesión
        setIsLoggedIn(false);
      }
    } catch (err) {
      console.error("Error citas:", err);
    }
  };

  // --- LÓGICA DE NEGOCIO ---
  const groupAppointmentsByDate = (apps) => {
    const groups = {};
    apps.forEach((app) => {
      const dateKey = new Date(app.start_time).toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(app);
    });
    return groups;
  };

  const getMonthlyEarnings = () => {
    const now = new Date();
    return appointments
      .filter((appo) => {
        const appoDate = new Date(appo.start_time);
        return (
          appo.status === "completada" &&
          appoDate.getMonth() === now.getMonth() &&
          appoDate.getFullYear() === now.getFullYear()
        );
      })
      .reduce((sum, appo) => {
        const service = services.find((s) => s.id === appo.service_id);
        return sum + (service ? service.price : 0);
      }, 0);
  };

  const calculateDailyTotal = (apps) => {
    return apps.reduce((sum, appo) => {
      const service = services.find((s) => s.id === appo.service_id);
      return sum + (service ? service.price : 0);
    }, 0);
  };

  const updateStatus = async (id, newStatus) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:8000/appointments/${id}/status?new_status=${newStatus}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`, // <-- Seguridad activada
          },
        },
      );
      if (response.ok) fetchAppointments();
    } catch (err) {
      console.error("Error estado:", err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    let formattedTime = formData.start_time;
    if (formattedTime && formattedTime.split(":").length === 2)
      formattedTime += ":00";

    const payload = {
      ...formData,
      service_id: parseInt(formData.service_id),
      start_time: formattedTime,
      // Nota: staff_id ya no es necesario enviarlo, el backend lo pondrá solo
    };

    try {
      const token = localStorage.getItem("token"); // Recuperamos la llave

      const response = await fetch("http://localhost:8000/appointments/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // <--- La llave para entrar
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSuccess(true);
        setFormData({
          ...formData,
          client_name: "",
          client_email: "",
          start_time: "",
        });
        fetchAppointments();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.detail}`);
      }
    } catch (err) {
      alert("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");

    const cleanUsername = loginData.username.trim().toLowerCase();
    const cleanPassword = loginData.password.trim();

    const params = new URLSearchParams();
    params.append("username", cleanUsername);
    params.append("password", cleanPassword);

    try {
      const response = await fetch("http://localhost:8000/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });

      // LEEMOS EL JSON UNA SOLA VEZ AQUÍ
      const data = await response.json();

      if (response.ok) {
        // Usamos 'data' que ya contiene el json
        localStorage.setItem("token", data.access_token);
        setIsLoggedIn(true);
      } else {
        // Si el backend da error (401), el mensaje viene en data.detail
        setLoginError(data.detail || "Credenciales incorrectas");
      }
    } catch (error) {
      console.error("Error de conexión:", error);
      setLoginError("Servidor fuera de servicio");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsLoggedIn(false);
    // ¡Muy importante! Limpiamos las listas para que el siguiente no vea nada del anterior
    setAppointments([]);
    setLoginData({ username: "", password: "" });
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#f8f5f2] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-[3rem] shadow-[0_30px_60px_rgba(93,80,69,0.1)] border border-white/20 overflow-hidden">
          <div className="bg-[#e8ddd0] p-12 text-center relative">
            <span className="text-4xl mb-4 block">🌿</span>
            <h2 className="text-2xl font-black text-[#5d5045] uppercase tracking-[0.3em]">
              BeautyTask
            </h2>
            <p className="text-[10px] text-[#a39485] font-bold uppercase tracking-widest mt-2 italic text-opacity-80">
              Gestión Exclusiva
            </p>
          </div>

          <form onSubmit={handleLogin} className="p-10 space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#a39485] uppercase ml-2 tracking-widest">
                Usuario o Email
              </label>
              <input
                required
                className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl focus:ring-2 focus:ring-[#dcc7b1] outline-none transition-all"
                placeholder="saray_beauty"
                value={loginData.username}
                onChange={(e) =>
                  setLoginData({ ...loginData, username: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#a39485] uppercase ml-2 tracking-widest">
                Contraseña
              </label>
              <input
                required
                type="password"
                className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl focus:ring-2 focus:ring-[#dcc7b1] outline-none transition-all"
                placeholder="••••••••"
                value={loginData.password}
                onChange={(e) =>
                  setLoginData({ ...loginData, password: e.target.value })
                }
              />
            </div>

            {loginError && (
              <p className="text-red-400 text-[10px] font-bold text-center uppercase tracking-tight animate-pulse">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-5 bg-[#5d5045] text-[#f5f5f1] rounded-2xl font-bold uppercase text-[11px] tracking-[0.3em] shadow-lg hover:bg-[#4a3f35] transition-all transform hover:-translate-y-1"
            >
              Entrar al Salón
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f5f2] py-12 px-6 font-sans text-[#5d5045]">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* COLUMNA IZQUIERDA: Formulario con efecto "Floating Card" */}
        <div className="lg:col-span-5">
          <div className="bg-white/80 backdrop-blur-md rounded-[3rem] shadow-[0_20px_50px_rgba(93,80,69,0.05)] overflow-hidden border border-white/20 sticky top-8">
            <div className="bg-[#e8ddd0] p-10 text-[#5d5045] text-center relative overflow-hidden">
              <h2 className="text-xl font-bold tracking-[0.25em] uppercase relative z-10">
                Nueva Cita
              </h2>
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
            </div>

            <form onSubmit={handleSubmit} className="p-10 space-y-8">
              <div className="group">
                <label className="block text-[10px] font-black text-[#a39485] uppercase mb-3 ml-2 tracking-widest transition-colors group-focus-within:text-[#dcc7b1]">
                  Nombre del Cliente
                </label>
                <input
                  required
                  className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl focus:ring-2 focus:ring-[#dcc7b1] focus:bg-white outline-none text-[#5d5045] transition-all placeholder:text-[#d1c7bc]"
                  placeholder="Ej. Carmen Martínez"
                  value={formData.client_name}
                  onChange={(e) =>
                    setFormData({ ...formData, client_name: e.target.value })
                  }
                />
              </div>

              <div className="group">
                <label className="block text-[10px] font-black text-[#a39485] uppercase mb-3 ml-2 tracking-widest">
                  Tratamiento
                </label>
                <div className="relative">
                  <select
                    className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl focus:ring-2 focus:ring-[#dcc7b1] focus:bg-white outline-none text-[#5d5045] cursor-pointer appearance-none transition-all"
                    value={formData.service_id}
                    onChange={(e) => {
                      const id = parseInt(e.target.value);
                      const service = services.find((s) => s.id === id);
                      setSelectedService(service);
                      setFormData({ ...formData, service_id: id });
                    }}
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-[#a39485]">
                    ↓
                  </div>
                </div>
                {selectedService && (
                  <div className="mt-4 flex justify-between px-3 text-[11px] font-bold text-[#b5a798] bg-[#f8f5f2] py-2 rounded-lg">
                    <span className="flex items-center gap-1.5">
                      ⏱ {selectedService.duration} min
                    </span>
                    <span className="flex items-center gap-1.5 font-black text-[#5d5045]">
                      {selectedService.price}€
                    </span>
                  </div>
                )}
              </div>

              <div className="group">
                <label className="block text-[10px] font-black text-[#a39485] uppercase mb-3 ml-2 tracking-widest transition-colors group-focus-within:text-[#dcc7b1]">
                  Horario Sugerido
                </label>
                <input
                  required
                  type="datetime-local"
                  min={minDateTime}
                  className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl focus:ring-2 focus:ring-[#dcc7b1] focus:bg-white outline-none text-[#5d5045] transition-all"
                  value={formData.start_time}
                  onChange={(e) =>
                    setFormData({ ...formData, start_time: e.target.value })
                  }
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-5 rounded-2xl font-bold uppercase text-[11px] tracking-[0.3em] transition-all shadow-lg ${loading ? "bg-[#d1c7bc] text-white" : "bg-[#5d5045] text-[#f5f5f1] hover:bg-[#4a3f35] hover:-translate-y-0.5 active:translate-y-0 shadow-[#5d5045]/20"}`}
              >
                {loading ? "Procesando..." : "Agendar Cita"}
              </button>
              {success && (
                <div className="p-4 bg-[#e8ddd0] text-[#5d5045] rounded-2xl text-center text-[10px] font-black animate-bounce uppercase tracking-widest border border-[#dcc7b1]">
                  ✓ Cita confirmada
                </div>
              )}
            </form>
          </div>
        </div>

        {/* COLUMNA DERECHA: Dashboard y Lista */}
        <div className="lg:col-span-7 space-y-10">
          {/* DASHBOARD: Caja del Mes con estilo "Art Deco" */}
          <div className="bg-[#4a3f35] p-10 rounded-[3rem] shadow-[0_30px_60px_-15px_rgba(74,63,53,0.3)] text-[#f5f5f1] flex justify-between items-center relative overflow-hidden group">
            <div className="relative z-10 pl-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#c9b7a7] mb-4 opacity-80">
                Volumen de Caja Mensual
              </p>
              <div className="flex items-baseline gap-3">
                <span className="text-6xl font-black tracking-tighter group-hover:scale-105 transition-transform duration-500 block">
                  {getMonthlyEarnings()}
                </span>
                <span className="text-2xl font-light text-[#dcc7b1]">EUR</span>
              </div>
            </div>
            {/* Icono decorativo sutil */}
            <div className="relative z-10 w-24 h-24 bg-linear-to-br from-[#dcc7b1]/20 to-transparent rounded-4xl flex items-center justify-center border border-white/10 backdrop-blur-sm">
              <span className="text-4xl filter drop-shadow-md">🌿</span>
            </div>
            {/* Luces decorativas */}
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-[#dcc7b1]/10 rounded-full blur-[80px]"></div>
            <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-black/20 rounded-full blur-[60px]"></div>
          </div>

          {/* NAVEGACIÓN TABS */}
          <div className="flex bg-[#e8ddd0]/50 backdrop-blur-sm p-2 rounded-4xl w-full sm:w-96 shadow-inner border border-[#e5e0d8]">
            <button
              onClick={() => setActiveTab("agenda")}
              className={`flex-1 py-3.5 text-[10px] font-black uppercase rounded-3xl transition-all tracking-[0.15em] ${activeTab === "agenda" ? "bg-white shadow-md text-[#5d5045]" : "text-[#a39485] hover:text-[#5d5045]"}`}
            >
              Próximas
            </button>
            <button
              onClick={() => setActiveTab("historial")}
              className={`flex-1 py-3.5 text-[10px] font-black uppercase rounded-3xl transition-all tracking-[0.15em] ${activeTab === "historial" ? "bg-white shadow-md text-[#5d5045]" : "text-[#a39485] hover:text-[#5d5045]"}`}
            >
              Pasadas
            </button>
          </div>

          {/* LISTADO DE CITAS */}
          <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-4 custom-scrollbar">
            {activeTab === "agenda" ? (
              appointments.filter((a) => a.status === "scheduled").length >
              0 ? (
                appointments
                  .filter((a) => a.status === "scheduled")
                  .map((appo) => (
                    <div
                      key={appo.id}
                      className="bg-white p-8 rounded-[2.5rem] border border-[#eee8e2] shadow-[0_10px_30px_rgba(0,0,0,0.02)] relative overflow-hidden group hover:shadow-[0_15px_40px_rgba(93,80,69,0.08)] hover:border-[#dcc7b1] transition-all duration-500"
                    >
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-[#dcc7b1] animate-pulse"></span>
                            <h4 className="font-bold text-[#5d5045] text-xl tracking-tight">
                              {appo.client_name}
                            </h4>
                          </div>
                          <p className="text-[10px] font-black text-[#b5a798] uppercase tracking-[0.2em] ml-5">
                            ✨{" "}
                            {
                              services.find((s) => s.id === appo.service_id)
                                ?.name
                            }
                          </p>
                          <div className="flex items-center gap-4 ml-5 mt-4">
                            <span className="text-[11px] text-[#a39485] bg-[#f8f5f2] px-3 py-1 rounded-full font-medium italic">
                              {formatDate(appo.start_time)}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => updateStatus(appo.id, "completada")}
                            className="w-14 h-14 flex items-center justify-center bg-[#f8f5f2] text-[#5d5045] hover:bg-[#5d5045] hover:text-white rounded-2xl transition-all border border-[#eee8e2] shadow-sm"
                          >
                            <span className="text-xl">✓</span>
                          </button>
                          <button
                            onClick={() => updateStatus(appo.id, "cancelada")}
                            className="w-14 h-14 flex items-center justify-center bg-white text-[#d1c7bc] hover:text-red-400 rounded-2xl transition-all border border-[#eee8e2] hover:border-red-100"
                          >
                            <span className="text-xl">×</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="text-center py-20 bg-white/40 rounded-[3rem] border-2 border-dashed border-[#e8ddd0]">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#a39485]">
                    No hay citas pendientes
                  </p>
                </div>
              )
            ) : (
              /* Historial con diseño minimalista */
              <div className="space-y-10 px-2">
                {Object.entries(
                  groupAppointmentsByDate(
                    appointments.filter((a) => a.status !== "scheduled"),
                  ),
                ).map(([date, apps]) => (
                  <div key={date} className="space-y-5">
                    <div className="flex justify-between items-end border-b border-[#e8ddd0] pb-3">
                      <h5 className="text-[10px] font-black text-[#5d5045] uppercase tracking-[0.3em]">
                        {date}
                      </h5>
                      <span className="text-[11px] font-bold text-[#a39485]">
                        Total:{" "}
                        {calculateDailyTotal(
                          apps.filter((a) => a.status === "completada"),
                        )}
                        €
                      </span>
                    </div>
                    <div className="grid gap-3">
                      {apps.map((appo) => (
                        <div
                          key={appo.id}
                          className="bg-white/40 p-5 rounded-2xl flex justify-between items-center border border-[#eee8e2] hover:bg-white transition-colors group"
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${appo.status === "completada" ? "bg-[#dcc7b1]" : "bg-red-200"}`}
                            ></div>
                            <div>
                              <p
                                className={`text-sm font-bold ${appo.status === "completada" ? "text-[#5d5045]" : "text-[#d1c7bc]"}`}
                              >
                                {appo.client_name}
                              </p>
                              <p className="text-[9px] text-[#a39485] font-bold uppercase tracking-widest">
                                {
                                  services.find((s) => s.id === appo.service_id)
                                    ?.name
                                }
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => updateStatus(appo.id, "scheduled")}
                            className="text-[9px] font-black text-[#a39485] hover:text-[#5d5045] uppercase tracking-tighter border border-[#eee8e2] px-3 py-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                          >
                            Reactivar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={handleLogout}
              className="text-[10px] font-black text-red-400 uppercase tracking-widest border border-red-100 px-4 py-2 rounded-xl hover:bg-red-50 transition-all"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
