import React from "react";

const Landing = ({ onEnterLogin }) => {
  // <--- Debe decir onEnterLogin
  return (
    <div className="min-h-screen bg-[#f8f5f2] flex flex-col font-sans text-[#5d5045]">
      <header className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="bg-[#e8ddd0] text-[#5d5045] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">
          BeautyTask v2.0
        </div>
        <h1 className="text-5xl md:text-7xl font-light mb-4 tracking-tighter">
          Beauty<span className="font-black">Task</span>
        </h1>
        <p className="max-w-md text-lg opacity-70 mb-10 leading-relaxed">
          Gestión inteligente para salones de belleza. Controla tu agenda,
          clientes y finanzas.
        </p>

        {/* ESTE ES EL BOTÓN CLAVE */}
        <button
          onClick={onEnterLogin} // <--- Debe coincidir con el nombre de arriba
          className="bg-[#5d5045] text-white px-10 py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl hover:scale-105 transition-transform active:scale-95"
        >
          Ver Demo en Vivo
        </button>
      </header>

      <footer className="p-10 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
        <div className="bg-white/40 p-6 rounded-3xl border border-white/20 text-center">
          <p className="text-sm font-bold">Agenda Inteligente</p>
        </div>
        <div className="bg-white/40 p-6 rounded-3xl border border-white/20 text-center">
          <p className="text-sm font-bold">Control de Caja</p>
        </div>
        <div className="bg-white/40 p-6 rounded-3xl border border-white/20 text-center">
          <p className="text-sm font-bold">Fidelización</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
