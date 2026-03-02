import React, { useState } from "react";
import { useApi } from "../hooks/useApi";

const ClientsView = ({ clients = [], onAddClient, onRefresh }) => {
  const { apiRequest } = useApi();
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);

  // ESTADOS PARA EDICIÓN
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [newClient, setNewClient] = useState({
    nombre: "",
    apellidos: "",
    telefono: "",
    email: "",
  });

  const filteredClients = clients.filter(
    (c) =>
      `${c.nombre || ""} ${c.apellidos || ""}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (c.telefono && c.telefono.includes(searchTerm)),
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddClient(newClient);
    setNewClient({ nombre: "", apellidos: "", telefono: "", email: "" });
    setShowForm(false);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();

    if (!editingId || !editForm) return;

    try {
      const dataToUpdate = {
        nombre: editForm.nombre,
        apellidos: editForm.apellidos || "",
        telefono: editForm.telefono,
        email: editForm.email || "",
      };

      // 1. Enviamos la actualización real
      await apiRequest(`/clients/${editingId}`, "PATCH", dataToUpdate);

      // 2. Limpiar estados
      setEditingId(null);
      setEditForm(null);

      // 3. ¡EL CAMBIO AQUÍ!
      // Usamos onRefresh() (que es fetchInitialData) en lugar de onAddClient()
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error("Error al actualizar:", err);
      // 2. Usamos la prop onError en lugar de alert
      if (onError) {
        onError("No se pudo actualizar el cliente. Revisa los datos.");
      }
    }
  };
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* CABECERA Y BUSCADOR */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-[#eee8e2] shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a39485]">
            Base de Datos Clientes
          </h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-[#5d5045] text-white text-[18px] w-10 h-10 rounded-full hover:rotate-90 transition-all flex items-center justify-center"
          >
            {showForm ? "×" : "+"}
          </button>
        </div>
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono..."
          value={searchTerm || ""}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[#f8f5f2] border-none rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-[#dcc7b1] outline-none transition-all"
        />
      </div>

      {/* FORMULARIO NUEVO CLIENTE - CORREGIDO PARA EVITAR WARNINGS */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-[#dcc7b1]/10 p-6 rounded-[2.5rem] border border-dashed border-[#dcc7b1] space-y-3 animate-slideDown"
        >
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Nombre"
              required
              className="p-3 rounded-xl border-none text-sm outline-none focus:ring-1 focus:ring-[#dcc7b1]"
              value={newClient.nombre || ""}
              onChange={(e) =>
                setNewClient({ ...newClient, nombre: e.target.value })
              }
            />
            <input
              placeholder="Apellidos"
              className="p-3 rounded-xl border-none text-sm outline-none focus:ring-1 focus:ring-[#dcc7b1]"
              value={newClient.apellidos || ""}
              onChange={(e) =>
                setNewClient({ ...newClient, apellidos: e.target.value })
              }
            />
          </div>
          <input
            placeholder="Teléfono"
            required
            className="w-full p-3 rounded-xl border-none text-sm outline-none focus:ring-1 focus:ring-[#dcc7b1]"
            value={newClient.telefono || ""}
            onChange={(e) =>
              setNewClient({ ...newClient, telefono: e.target.value })
            }
          />
          <input
            placeholder="Email"
            type="email"
            className="w-full p-3 rounded-xl border-none text-sm outline-none focus:ring-1 focus:ring-[#dcc7b1]"
            value={newClient.email || ""}
            onChange={(e) =>
              setNewClient({ ...newClient, email: e.target.value })
            }
          />
          <button className="w-full bg-[#5d5045] text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest">
            Guardar Cliente Fiel
          </button>
        </form>
      )}

      {/* LISTADO DE CLIENTES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredClients.map((client) => (
          <div
            key={client.id}
            className={`bg-white p-6 rounded-[2.5rem] border transition-all ${
              editingId === client.id
                ? "border-[#dcc7b1] ring-2 ring-[#dcc7b1]/10"
                : "border-[#eee8e2]"
            } hover:border-[#dcc7b1] group relative`}
          >
            {editingId === client.id && editForm ? (
              /* --- MODO EDICIÓN --- */
              <form
                onSubmit={handleSaveEdit}
                className="space-y-4 animate-fadeIn"
              >
                <p className="text-[9px] font-black text-[#dcc7b1] uppercase tracking-[0.2em] mb-2">
                  Editando Perfil
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-[#a39485] uppercase ml-2">
                      Nombre
                    </label>
                    <input
                      className="w-full p-2.5 bg-[#f8f5f2] rounded-xl text-xs font-bold text-[#5d5045] outline-none"
                      value={editForm.nombre || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, nombre: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-[#a39485] uppercase ml-2">
                      Apellidos
                    </label>
                    <input
                      className="w-full p-2.5 bg-[#f8f5f2] rounded-xl text-xs text-[#5d5045] outline-none"
                      value={editForm.apellidos || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, apellidos: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-bold text-[#a39485] uppercase ml-2">
                    Teléfono
                  </label>
                  <input
                    className="w-full p-2.5 bg-[#f8f5f2] rounded-xl text-xs text-[#5d5045] outline-none"
                    value={editForm.telefono || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, telefono: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-bold text-[#a39485] uppercase ml-2">
                    Email
                  </label>
                  <input
                    className="w-full p-2.5 bg-[#f8f5f2] rounded-xl text-xs text-[#5d5045] outline-none"
                    value={editForm.email || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-[#5d5045] text-white text-[9px] font-black py-2.5 rounded-xl uppercase tracking-widest shadow-md"
                  >
                    Actualizar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex-1 bg-white border border-[#eee8e2] text-[#a39485] text-[9px] font-black py-2.5 rounded-xl uppercase"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              /* --- MODO VISTA --- */
              <>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black text-[#dcc7b1] uppercase tracking-tighter">
                      Cliente v.i.p
                    </p>
                    <h4 className="font-bold text-[#5d5045] text-lg">
                      {client.nombre} {client.apellidos || ""}
                    </h4>
                  </div>
                  <button
                    onClick={() => {
                      setEditingId(client.id);
                      setEditForm({ ...client }); // Copia profunda para evitar mutaciones directas
                    }}
                    className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-2.5 bg-[#f8f5f2] text-[#5d5045] rounded-full transition-all text-xs hover:bg-[#dcc7b1] hover:text-white"
                  >
                    ✏️
                  </button>
                </div>
                <div className="mt-4 space-y-1">
                  <p className="text-[11px] font-medium text-[#a39485] flex items-center gap-2">
                    <span className="opacity-50">📞</span> {client.telefono}
                  </p>
                  {client.email && (
                    <p className="text-[11px] font-medium text-[#a39485] flex items-center gap-2">
                      <span className="opacity-50">✉️</span> {client.email}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClientsView;
