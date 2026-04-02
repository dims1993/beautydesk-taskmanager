import React, { useState, useMemo } from "react";
import { useApi } from "../hooks/useApi";

/** Example contacts when the DB list is empty (demo / sales preview). */
const SHOWCASE_CLIENTS = [
  {
    id: "showcase-1",
    _isShowcase: true,
    nombre: "María",
    apellidos: "Fernández López",
    telefono: "612 445 892",
    email: "maria.fernandez@email.com",
  },
  {
    id: "showcase-2",
    _isShowcase: true,
    nombre: "Cristina",
    apellidos: "Jiménez Ruiz",
    telefono: "634 221 018",
    email: "cristina.j@email.com",
  },
  {
    id: "showcase-3",
    _isShowcase: true,
    nombre: "Paula",
    apellidos: "Moreno Sánchez",
    telefono: "698 903 441",
    email: "",
  },
  {
    id: "showcase-4",
    _isShowcase: true,
    nombre: "Andrea",
    apellidos: "Torres Vega",
    telefono: "611 778 302",
    email: "andrea.torres@email.com",
  },
  {
    id: "showcase-5",
    _isShowcase: true,
    nombre: "Lucía",
    apellidos: "Herrera Díaz",
    telefono: "622 119 556",
    email: "lucia.herrera@email.com",
  },
  {
    id: "showcase-6",
    _isShowcase: true,
    nombre: "Elena",
    apellidos: "Castro Mora",
    telefono: "645 887 120",
    email: "",
  },
];

/**
 * Salon client directory: search, add, and edit CRM-style contacts.
 */
const ClientDirectory = ({
  clients = [],
  onAddClient,
  onRefresh,
  onError,
}) => {
  const { apiRequest } = useApi();
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [newClient, setNewClient] = useState({
    nombre: "",
    apellidos: "",
    telefono: "",
    email: "",
  });

  const directoryRows = useMemo(
    () => (clients.length > 0 ? clients : SHOWCASE_CLIENTS),
    [clients],
  );

  const filteredClients = directoryRows.filter(
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

      await apiRequest(`/clients/${editingId}`, "PATCH", dataToUpdate);

      setEditingId(null);
      setEditForm(null);

      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error("Error al actualizar:", err);
      if (onError) {
        onError("No se pudo actualizar el cliente. Revisa los datos.");
      }
    }
  };
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white p-6 rounded-[2.5rem] border border-[#eee8e2] shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a39485]">
            Directorio de clientes
          </h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-[#5d5045] text-white text-[18px] w-10 h-10 rounded-full hover:rotate-90 transition-all flex items-center justify-center"
          >
            {showForm ? "×" : "+"}
          </button>
        </div>
        {clients.length === 0 && (
          <p className="text-[10px] text-[#a39485] font-medium leading-relaxed">
            Fichas de ejemplo. Añade tu primer cliente real con el botón + para
            guardarlo en la base de datos.
          </p>
        )}
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono..."
          value={searchTerm || ""}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[#f8f5f2] border-none rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-[#dcc7b1] outline-none transition-all"
        />
      </div>

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
            Guardar cliente
          </button>
        </form>
      )}

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
            {client._isShowcase && (
              <span className="absolute top-4 right-4 text-[8px] font-black uppercase tracking-widest text-[#c4bdb5]">
                Ejemplo
              </span>
            )}
            {editingId === client.id && editForm ? (
              <form
                onSubmit={handleSaveEdit}
                className="space-y-4 animate-fadeIn"
              >
                <p className="text-[9px] font-black text-[#dcc7b1] uppercase tracking-[0.2em] mb-2">
                  Editando perfil
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
              <>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black text-[#dcc7b1] uppercase tracking-tighter">
                      Cliente
                    </p>
                    <h4 className="font-bold text-[#5d5045] text-lg">
                      {client.nombre} {client.apellidos || ""}
                    </h4>
                  </div>
                  {!client._isShowcase && (
                    <button
                      onClick={() => {
                        setEditingId(client.id);
                        setEditForm({ ...client });
                      }}
                      className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-2.5 bg-[#f8f5f2] text-[#5d5045] rounded-full transition-all text-xs hover:bg-[#dcc7b1] hover:text-white"
                    >
                      ✏️
                    </button>
                  )}
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

export default ClientDirectory;
