import React, { useState } from "react";

const ClientsView = ({ clients = [], onAddClient }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newClient, setNewClient] = useState({
    nombre: "",
    apellidos: "",
    telefono: "",
    email: "",
  });

  const filteredClients = clients.filter(
    (c) =>
      `${c.nombre} ${c.apellidos}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) || c.telefono.includes(searchTerm),
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddClient(newClient);
    setNewClient({ nombre: "", apellidos: "", telefono: "", email: "" });
    setShowForm(false);
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
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[#f8f5f2] border-none rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-[#dcc7b1] outline-none transition-all"
        />
      </div>

      {/* FORMULARIO NUEVO CLIENTE */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-[#dcc7b1]/10 p-6 rounded-[2.5rem] border border-dashed border-[#dcc7b1] space-y-3 animate-slideDown"
        >
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Nombre"
              required
              className="p-3 rounded-xl border-none text-sm"
              onChange={(e) =>
                setNewClient({ ...newClient, nombre: e.target.value })
              }
            />
            <input
              placeholder="Apellidos"
              className="p-3 rounded-xl border-none text-sm"
              onChange={(e) =>
                setNewClient({ ...newClient, apellidos: e.target.value })
              }
            />
          </div>
          <input
            placeholder="Teléfono (ej: 600 000 000)"
            required
            className="w-full p-3 rounded-xl border-none text-sm"
            onChange={(e) =>
              setNewClient({ ...newClient, telefono: e.target.value })
            }
          />
          <input
            placeholder="Email"
            type="email"
            className="w-full p-3 rounded-xl border-none text-sm"
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
        {filteredClients.map((client, index) => (
          <div
            key={index}
            className="bg-white p-5 rounded-3xl border border-[#eee8e2] hover:border-[#dcc7b1] transition-all group"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-[#dcc7b1] uppercase tracking-tighter">
                  Cliente v.i.p
                </p>
                <h4 className="font-bold text-[#5d5045] text-lg">
                  {client.nombre} {client.apellidos}
                </h4>
              </div>
              <span className="opacity-20 group-hover:opacity-100 transition-opacity">
                👤
              </span>
            </div>

            <div className="mt-4 space-y-1">
              <p className="text-[11px] font-medium text-[#a39485] flex items-center gap-2">
                <span>📞</span> {client.telefono}
              </p>
              {client.email && (
                <p className="text-[11px] font-medium text-[#a39485] flex items-center gap-2">
                  <span>✉️</span> {client.email}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClientsView;
