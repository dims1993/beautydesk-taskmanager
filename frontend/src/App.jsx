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

  const [allAppointments, setAllAppointments] = useState([]);

  const minDateTime = new Date().toISOString().slice(0, 16);
  const [errorMessage, setErrorMessage] = useState(""); // Nuevo estado para errores bonitos
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (isLoggedIn) {
      fetchServices();
      fetchAppointments();
      fetchAvailability();
      fetchUserProfile();
    }
  }, [isLoggedIn]);

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

  const fetchAvailability = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        "http://localhost:8000/appointments/availability",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) {
        const data = await res.json();
        setAllAppointments(data);
      }
    } catch (err) {
      console.error("Error disponibilidad:", err);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:8000/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data); // Guardamos {id: 1, username: 'saray', ...}
      }
    } catch (err) {
      console.error("Error al obtener perfil:", err);
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

  const getEndTime = (startTime, durationMinutes) => {
    const start = new Date(startTime);
    const end = new Date(start.getTime() + durationMinutes * 60000);
    return end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const checkCollision = (newStart, serviceId, targetStaffId) => {
    const service = services.find((s) => s.id === parseInt(serviceId));
    if (!service) return false;

    const newStartTime = new Date(newStart).getTime();
    const newEndTime = newStartTime + service.duration * 60000;

    // IMPORTANTE: targetStaffId debe ser el ID del profesional logueado
    // o el que se ha seleccionado para la cita.

    return allAppointments.some((appo) => {
      // 1. Solo comparamos con citas del MISMO profesional
      // 2. Solo citas que estén programadas (scheduled)
      if (appo.staff_id !== targetStaffId || appo.status !== "scheduled") {
        return false;
      }

      const existingService = services.find((s) => s.id === appo.service_id);
      const existingStart = new Date(appo.start_time).getTime();
      const existingEnd =
        existingStart + (existingService?.duration || 0) * 60000;

      // Lógica de solapamiento
      return newStartTime < existingEnd && newEndTime > existingStart;
    });
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
      if (response.ok) {
        // 1. Actualiza tu agenda personal (Mis Citas / Historial)
        await fetchAppointments();

        // 2. Actualiza el calendario global (Vista Equipo)
        // Así, si cancelas una cita, el hueco se libera instantáneamente para tu compañera
        await fetchAvailability();
      }
    } catch (err) {
      console.error("Error al actualizar el estado:", err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 1. VALIDACIÓN DE COLISIÓN LOCAL (Cambiado alert por setErrorMessage)
    const myId = currentUser?.id || 1; // Usamos el ID del usuario logueado o el seleccionado en el formulario

    // Si por alguna razón no ha cargado el user, no dejamos agendar para evitar errores
    if (!myId) {
      setErrorMessage("Error de sesión. Reintenta el login.");
      return;
    }

    const hasCollision = checkCollision(
      formData.start_time,
      formData.service_id,
      myId,
    );

    if (hasCollision) {
      setErrorMessage(
        "❌ Este horario ya está ocupado o se solapa con otra cita. Revisa la Vista Equipo.",
      );
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    setLoading(true);

    let formattedTime = formData.start_time;
    if (formattedTime && formattedTime.split(":").length === 2)
      formattedTime += ":00";

    const payload = {
      ...formData,
      service_id: parseInt(formData.service_id),
      start_time: formattedTime,
    };

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:8000/appointments/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
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
        fetchAvailability();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const errorData = await response.json();
        // Aquí capturamos el error del backend (el que tiene el nombre del cliente)
        setErrorMessage(errorData.detail);
        setTimeout(() => setErrorMessage(""), 5000);
      }
    } catch (err) {
      setErrorMessage("Error de conexión con el servidor");
      setTimeout(() => setErrorMessage(""), 5000);
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
        localStorage.setItem("token", data.access_token);
        // Guardamos el usuario (el backend debería devolver el ID o el username)
        // Si el backend no devuelve el user_id en /token, podemos sacarlo de una nueva función
        // Por ahora, asumamos que guardamos el perfil
        fetchUserProfile(); // Creamos esta función ahora
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
    setCurrentUser(null); // <--- Limpiamos
    setIsLoggedIn(false);
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
      {/* 1. NOTIFICACIÓN DE ERROR FLOTANTE (Aquí es el sitio ideal) */}
      {errorMessage && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 animate-bounce-in">
          <div className="bg-white border-l-4 border-red-500 p-5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] backdrop-blur-md flex items-center gap-4">
            <div className="bg-red-100 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-red-600 text-lg">⚠️</span>
            </div>
            <div className="flex-1">
              <h3 className="text-[10px] font-black text-red-800 uppercase tracking-[0.2em] mb-1">
                Conflicto de Horario
              </h3>
              <p className="text-xs text-[#5d5045] font-medium leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <button
              onClick={() => setErrorMessage("")}
              className="text-[#a39485] hover:text-red-500 transition-colors"
            >
              <span className="text-2xl">×</span>
            </button>
          </div>
        </div>
      )}
      {/* 2. EL GRID */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* COLUMNA IZQUIERDA: Formulario */}
        <div className="lg:col-span-5">
          <div className="bg-white/80 backdrop-blur-md rounded-[3rem] shadow-[0_20px_50px_rgba(93,80,69,0.05)] overflow-hidden border border-white/20 sticky top-8">
            <div className="bg-[#e8ddd0] p-10 text-[#5d5045] text-center relative overflow-hidden">
              <h2 className="text-xl font-bold tracking-[0.25em] uppercase relative z-10">
                Nueva Cita
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-10 space-y-8">
              <div className="group">
                <label className="block text-[10px] font-black text-[#a39485] uppercase mb-3 ml-2 tracking-widest">
                  Nombre del Cliente
                </label>
                <input
                  required
                  className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none text-[#5d5045] transition-all"
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
                <select
                  className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none text-[#5d5045] cursor-pointer appearance-none"
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
                {/* Detalle del servicio seleccionado en el formulario */}
                {selectedService && (
                  <div className="mt-4 flex justify-between px-3 text-[11px] font-bold text-[#b5a798] bg-[#f8f5f2] py-2 rounded-lg border border-[#eee8e2]">
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
                <label className="block text-[10px] font-black text-[#a39485] uppercase mb-3 ml-2 tracking-widest">
                  Horario Sugerido
                </label>
                <input
                  required
                  type="datetime-local"
                  min={minDateTime}
                  className="w-full px-6 py-4 bg-[#fcfaf8] border border-[#eee8e2] rounded-2xl outline-none"
                  value={formData.start_time}
                  onChange={(e) =>
                    setFormData({ ...formData, start_time: e.target.value })
                  }
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-[#5d5045] text-[#f5f5f1] rounded-2xl font-bold uppercase text-[11px] tracking-[0.3em] shadow-lg hover:bg-[#4a3f35] transition-all"
              >
                {loading ? "Procesando..." : "Agendar Cita"}
              </button>
            </form>
          </div>
        </div>

        {/* COLUMNA DERECHA: Dashboard y Lista */}
        <div className="lg:col-span-7 space-y-10">
          <div className="bg-[#4a3f35] p-10 rounded-[3rem] shadow-[0_30px_60px_-15px_rgba(74,63,53,0.3)] text-[#f5f5f1] flex justify-between items-center relative overflow-hidden group">
            <div className="relative z-10 pl-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#c9b7a7] mb-4 opacity-80">
                Volumen de Caja Mensual
              </p>
              <div className="flex items-baseline gap-3">
                <span className="text-6xl font-black tracking-tighter block">
                  {getMonthlyEarnings()}
                </span>
                <span className="text-2xl font-light text-[#dcc7b1]">EUR</span>
              </div>
            </div>
            <div className="relative z-10 w-24 h-24 bg-white/10 rounded-4xl flex items-center justify-center border border-white/10 backdrop-blur-sm">
              <span className="text-4xl">🌿</span>
            </div>
          </div>

          {/* NAVEGACIÓN TABS ÚNICA */}
          <div className="flex bg-[#e8ddd0]/50 backdrop-blur-sm p-2 rounded-4xl w-full shadow-inner border border-[#e5e0d8]">
            {["agenda", "historial", "equipo"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3.5 text-[10px] font-black uppercase rounded-3xl transition-all tracking-[0.15em] ${activeTab === tab ? "bg-white shadow-md text-[#5d5045]" : "text-[#a39485] hover:text-[#5d5045]"}`}
              >
                {tab === "agenda"
                  ? "Mis Citas"
                  : tab === "historial"
                    ? "Historial"
                    : "Vista Equipo 🌿"}
              </button>
            ))}
          </div>

          {/* CONTENEDOR DE LISTADOS UNIFICADO */}
          <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-4 custom-scrollbar">
            {/* VISTA 1: AGENDA (Dentro del .map de appointments) */}
            {activeTab === "agenda" &&
              (appointments.filter((a) => a.status === "scheduled").length >
              0 ? (
                appointments
                  .filter((a) => a.status === "scheduled")
                  .map((appo) => {
                    const service = services.find(
                      (s) => s.id === appo.service_id,
                    );
                    return (
                      <div
                        key={appo.id}
                        className="bg-white p-8 rounded-[2.5rem] border border-[#eee8e2] shadow-sm relative group hover:border-[#dcc7b1] transition-all"
                      >
                        <div className="flex justify-between items-center">
                          <div className="space-y-1">
                            <h4 className="font-bold text-[#5d5045] text-xl">
                              {appo.client_name}
                            </h4>
                            <p className="text-[10px] font-black text-[#b5a798] uppercase tracking-widest">
                              ✨ {service?.name || "Servicio"}
                            </p>

                            {/* ESTO ES LO QUE HABÍAMOS PERDIDO: Detalles del servicio */}
                            <div className="flex items-center gap-3 mt-3">
                              <span className="text-[10px] bg-[#f8f5f2] text-[#a39485] px-2 py-1 rounded-md font-bold">
                                ⏱ {service?.duration} min
                              </span>
                              <span className="text-[10px] bg-[#e8ddd0] text-[#5d5045] px-2 py-1 rounded-md font-black">
                                {service?.price}€
                              </span>
                            </div>

                            <p className="text-[11px] text-[#a39485] font-medium italic mt-2">
                              📅 {formatDate(appo.start_time)}
                            </p>
                          </div>

                          <div className="flex gap-3">
                            <button
                              onClick={() =>
                                updateStatus(appo.id, "completada")
                              }
                              className="w-12 h-12 flex items-center justify-center bg-[#f8f5f2] hover:bg-[#5d5045] hover:text-white rounded-2xl transition-all border border-[#eee8e2]"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => updateStatus(appo.id, "cancelada")}
                              className="w-12 h-12 flex items-center justify-center bg-white hover:text-red-400 rounded-2xl border border-[#eee8e2] transition-all"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div className="text-center py-20 bg-white/40 rounded-[3rem] border-2 border-dashed border-[#e8ddd0]">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#a39485]">
                    No hay citas pendientes
                  </p>
                </div>
              ))}

            {/* VISTA 2: HISTORIAL */}
            {activeTab === "historial" && (
              <div className="space-y-10">
                {Object.entries(
                  groupAppointmentsByDate(
                    appointments.filter((a) => a.status !== "scheduled"),
                  ),
                ).map(([date, apps]) => (
                  <div key={date} className="space-y-4">
                    <div className="flex justify-between border-b border-[#e8ddd0] pb-2">
                      <h5 className="text-[10px] font-black uppercase text-[#5d5045]">
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
                    {apps.map((appo) => (
                      <div
                        key={appo.id}
                        className="bg-white/40 p-5 rounded-2xl flex justify-between items-center border border-[#eee8e2]"
                      >
                        <p className="text-sm font-bold text-[#5d5045]">
                          {appo.client_name}
                        </p>
                        <button
                          onClick={() => updateStatus(appo.id, "scheduled")}
                          className="text-[9px] font-black text-[#a39485] border px-3 py-1.5 rounded-xl hover:text-[#5d5045] transition-colors"
                        >
                          Reactivar
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* VISTA 3: EQUIPO (Actualizada con intervalos) */}
            {activeTab === "equipo" && (
              <div className="space-y-8 animate-fadeIn">
                {Object.entries(
                  groupAppointmentsByDate(
                    allAppointments.filter((a) => a.status === "scheduled"),
                  ),
                ).map(([date, apps]) => (
                  <div
                    key={date}
                    className="bg-white/60 backdrop-blur-sm rounded-[2rem] p-6 border border-white/40 shadow-sm"
                  >
                    <h3 className="text-[10px] font-black text-[#5d5045] uppercase mb-4 border-b border-[#e8ddd0] pb-2">
                      {date}
                    </h3>
                    <div className="grid grid-cols-2 gap-6">
                      {/* Columna Saray y Stefany (se repite la lógica para ambas) */}
                      {[1, 2].map((staffId) => (
                        <div key={staffId} className="space-y-2">
                          <p
                            className={`text-[9px] font-bold uppercase text-center mb-2 ${staffId === 1 ? "text-[#dcc7b1]" : "text-[#5d5045]"}`}
                          >
                            {staffId === 1 ? "Saray" : "Stefany"}
                          </p>

                          {apps.filter((a) => a.staff_id === staffId).length >
                          0 ? (
                            apps
                              .filter((a) => a.staff_id === staffId)
                              .map((appo) => {
                                const service = services.find(
                                  (s) => s.id === appo.service_id,
                                );
                                const startTime = new Date(
                                  appo.start_time,
                                ).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                });
                                // Calculamos el final basado en la duración del servicio
                                const endTime = service
                                  ? getEndTime(
                                      appo.start_time,
                                      service.duration,
                                    )
                                  : "?";

                                return (
                                  <div
                                    key={appo.id}
                                    className={`text-[10px] bg-white p-3 rounded-xl border-l-4 shadow-xs ${staffId === 1 ? "border-[#dcc7b1]" : "border-[#5d5045]"}`}
                                  >
                                    <div className="font-black text-[#5d5045]">
                                      {startTime} - {endTime}
                                    </div>
                                    <div className="text-[8px] uppercase tracking-widest text-[#a39485] mt-1">
                                      {service?.name || "Ocupado"}
                                    </div>
                                  </div>
                                );
                              })
                          ) : (
                            <div className="text-[9px] text-center py-2 text-green-500 italic bg-green-50/30 rounded-xl border border-dashed border-green-100">
                              Libre
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleLogout}
              className="w-full mt-8 text-[10px] font-black text-red-400 uppercase border border-red-100 px-4 py-4 rounded-xl hover:bg-red-50 transition-all shadow-sm"
            >
              Cerrar Sesión del Salón
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
