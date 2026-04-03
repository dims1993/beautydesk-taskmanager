import React from "react";
import { CalendarDays, Users, Sparkles, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function Landing() {
  const features = [
    {
      type: "content",
      icon: CalendarDays,
      title: "Agenda Inteligente",
      description:
        "Gestiona tu flujo diario con elegancia. Un calendario visual diseñado para profesionales de la belleza.",
      size: "md:col-span-2 md:row-span-1",
      bg: "bg-white",
    },
    {
      type: "image",
      image: "/nails1.webp", // Ruta directa a public/nails1.jpg
      alt: "Gestión de agenda elegante",
      size: "md:col-span-1 md:row-span-2",
    },
    {
      type: "image",
      image: "/nails2.webp", // Ruta directa a public/nails2.jpg
      alt: "Experiencia de cliente relajante",
      size: "md:col-span-1 md:row-span-1",
    },
    {
      type: "content",
      icon: Users,
      title: "Armonía con Clientes",
      description:
        "Fideliza con perfiles detallados, historial de citas y preferencias personalizadas.",
      size: "md:col-span-1 md:row-span-1",
      bg: "bg-[#f5ebe0]",
    },
    {
      type: "content",
      icon: Sparkles,
      title: "Equipo Elevado",
      description:
        "Potencia a tu personal con roles claros y análisis para maximizar el rendimiento del salón.",
      size: "md:col-span-1 md:row-span-1",
      bg: "bg-white",
    },
    {
      type: "image",
      image: "/work-nails.webp", // Ruta directa a public/work-nails.jpg
      alt: "Atmósfera sofisticada del salón",
      size: "md:col-span-2 md:row-span-1",
    },
  ];
  return (
    <div className="bg-[#FAF9F6] min-h-screen text-[#5d5045] font-sans antialiased selection:bg-[#f5ebe0]">
      {/* Navbar: Mobile First */}
      <nav className="flex flex-col md:flex-row justify-between items-center px-6 md:px-16 py-6 md:py-8 gap-6">
        <h1 className="text-2xl md:text-3xl font-serif tracking-widest italic font-medium text-[#5d5045]">
          BEAUTYTASK
        </h1>
        <div className="flex items-center space-x-6 md:space-x-10 text-[10px] uppercase tracking-[0.2em] font-bold">
          <Link to="/login" className="hover:text-gray-400 transition-colors">
            Iniciar Sesión
          </Link>
          <Link
            to="/contacto"
            className="bg-[#5d5045] text-[#f5ebe0] px-6 md:px-8 py-3 rounded-full hover:bg-[#4a3f36] transition shadow-md active:scale-95"
          >
            Contacta
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="max-w-7xl mx-auto mt-0 md:mt-16 px-0 md:px-16 pb-20 md:pb-32 border-b border-[#eaddcf]/50">
        <div className="flex flex-col md:flex-row items-center justify-between gap-12 md:gap-20">
          {/* 1. COMPOSICIÓN ELEGANTE DE TRES IMÁGENES DE APP (MULTI-DEVICE SHOWCASE) */}
          {/* order-first md:order-last: Arriba en móvil, Derecha en escritorio */}
          <div className="relative h-[65vh] md:h-[700px] w-full md:w-[50%] flex items-center justify-center order-first md:order-last p-4 md:p-0 overflow-hidden md:overflow-visible">
            {/* Resplandor de fondo sofisticado (Aura suave) */}
            <div className="absolute w-[120%] h-[120%] bg-[#f5ebe0] rounded-full blur-[140px] opacity-40 translate-y-20 md:translate-y-0" />

            {/* --- IMAGEN 1: IZQUIERDA (CLIENTES - SECUNDARIA) --- */}
            {/* He simplificado el código interno para que el 'border-box' sea la imagen completa */}
            <div className="absolute left-[5%] md:left-[-10%] top-[25%] w-[160px] md:w-[220px] aspect-[9/18.5] bg-white rounded-[2rem] shadow-[0_15px_40px_-10px_rgba(93,80,69,0.15)] border border-[#eaddcf]/50 z-10 scale-90 md:scale-100 opacity-90 md:opacity-100 rotate-[-5deg] md:rotate-[-8deg] overflow-hidden p-1.5 hover:rotate-0 transition-transform duration-500">
              {/* Imagen Real de tu Pantalla de Clientes */}
              <img
                src="/hero.png"
                alt="Gestión de Clientes en BeautyTask"
                className="w-full h-full object-cover rounded-[1.8rem]"
                // FALLBACK: Si no existe, muestra un patrón elegante que combina con la marca
                onError={(e) =>
                  (e.target.src =
                    "https://images.unsplash.com/photo-1590439471364-192b10a27177?q=80&w=500")
                }
              />
            </div>

            {/* --- IMAGEN 2: CENTRO (DASHBOARD PRINCIPAL - DESTACADA) --- */}
            {/* Este es el iPhone 15 Pro simulado con biseles ultra-finos */}
            <div className="relative w-[240px] md:w-[280px] aspect-[9/19.5] bg-[#1a1a1a] rounded-[2.8rem] p-1.5 shadow-[0_40px_110px_-25px_rgba(93,80,69,0.35)] border-[4px] border-[#332d29] z-20 hover:scale-105 hover:border-[#4a3f36] transition-all duration-700 ease-out group">
              {/* Notch Dinámico Ultra-fino */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 md:w-24 h-5 bg-[#332d29] rounded-b-2xl z-30 flex items-center justify-center">
                <div className="w-1 h-1 bg-[#1a1a1a] rounded-full mr-1.5" />
                <div className="w-8 h-1 bg-[#1a1a1a] rounded-full" />
              </div>

              {/* Pantalla Interna */}
              <div className="w-full h-full bg-white rounded-[2.4rem] overflow-hidden relative flex flex-col p-0.5">
                {/* Imagen Real de tu Dashboard Principal */}
                <div className="flex-1 rounded-[2.2rem] overflow-hidden bg-gray-50 border border-[#eaddcf]/20 shadow-inner group-hover:rotate-1 transition-transform duration-1000">
                  <img
                    src="/hero2.png"
                    alt="BeautyTask Analytics Dashboard"
                    className="w-full h-full object-cover"
                    // FALLBACK: Una imagen de ejemplo de analíticas nítida
                    onError={(e) =>
                      (e.target.src =
                        "https://images.unsplash.com/photo-1551288049-bbbda536339a?q=80&w=500")
                    }
                  />
                </div>

                {/* Overlay suave para integrar la imagen y dar espacio al texto */}
                <div className="absolute inset-x-2 bottom-2 h-1/2 bg-gradient-to-t from-white via-white/50 to-transparent rounded-b-[2rem]" />

                {/* Texto sobre la imagen (opcional para dar contexto) */}
                <div className="absolute bottom-6 left-6 right-6 z-10 space-y-1">
                  <div className="w-10 h-1 bg-[#5d5045]/40 rounded-full" />
                  <p className="text-xl font-serif text-[#5d5045] leading-tight">
                    Control Total.
                  </p>
                </div>
              </div>
            </div>

            {/* --- IMAGEN 3: DERECHA (CALENDARIO - SECUNDARIA) --- */}
            <div className="absolute right-[5%] md:right-[-8%] bottom-[20%] w-[160px] md:w-[220px] aspect-[9/18.5] bg-white rounded-[2rem] shadow-[0_15px_40px_-10px_rgba(93,80,69,0.15)] border border-[#eaddcf]/50 z-10 scale-90 md:scale-100 opacity-90 md:opacity-100 rotate-[5deg] md:rotate-[8deg] overflow-hidden p-1.5 hover:rotate-0 transition-transform duration-500">
              {/* Imagen Real de tu Vista de Calendario */}
              <img
                src="/hero3.jpeg"
                alt="Agenda Inteligente de BeautyTask"
                className="w-full h-full object-cover rounded-[1.8rem]"
                // FALLBACK: Un patrón minimalista crema que combina con la marca
                onError={(e) =>
                  (e.target.src =
                    "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?q=80&w=500")
                }
              />
            </div>
          </div>

          {/* 2. BLOQUE DE TEXTO (Adaptado ligeramente para la nueva composición) */}
          <div className="flex-1 w-full space-y-6 md:space-y-10 p-8 md:p-0 text-left -mt-20 md:mt-0 relative z-30 bg-[#FAF9F6] md:bg-transparent rounded-t-[3.5rem] md:rounded-none">
            <div className="space-y-4">
              <p className="text-[10px] md:text-[11px] uppercase tracking-[0.6em] text-[#8c857d] font-black opacity-80">
                The New Standard of Beauty
              </p>
              <h2 className="text-5xl md:text-[6.5rem] lg:text-[7.5rem] font-serif leading-[1.05] md:leading-[0.88] tracking-tighter text-[#5d5045]">
                Eleva el <br className="hidden md:block" />
                flujo diario <br />
                <span className="italic opacity-80 underline decoration-[#eaddcf]/70 decoration-1 underline-offset-[14px]">
                  de tu salón.
                </span>
              </h2>
            </div>

            <p className="text-base md:text-xl text-[#8c857d] max-w-xl font-light leading-relaxed">
              Una plataforma de gestión sofisticada diseñada exclusivamente para
              la industria de la belleza y el bienestar. Control total, estética
              impecable.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-start gap-6 pt-6">
              <Link
                to="/contacto"
                className="w-full sm:w-auto bg-[#5d5045] text-[#f5ebe0] px-12 py-6 rounded-full text-[11px] font-black uppercase tracking-[0.2em] hover:bg-[#4a3f36] transition shadow-2xl shadow-[#5d5045]/20 flex items-center justify-center gap-3 active:scale-95"
              >
                Contactar ahora
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </header>
      {/* Bento Grid Section */}
      <section className="max-w-7xl mx-auto px-6 md:px-16 py-24 md:py-40">
        <div className="mb-12 md:mb-20 text-center md:text-left">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#8c857d] mb-4 font-bold">
            Características
          </p>
          <h3 className="text-4xl md:text-5xl font-serif">
            Todo en <span className="italic">equilibrio.</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:auto-rows-[300px]">
          {features.map((feature, index) => {
            // Decidimos qué renderizar
            if (feature.type === "image") {
              // --- RENDER DE TARJETA DE IMAGEN ---
              return (
                <div
                  key={index}
                  className={`relative overflow-hidden rounded-[2.5rem] border border-[#eaddcf] shadow-sm hover:shadow-2xl hover:shadow-[#5d5045]/10 transition-all duration-500 group ${feature.size}`}
                >
                  <img
                    src={feature.image}
                    alt={feature.alt}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  {/* Overlay sutil al hacer hover */}
                  <div className="absolute inset-0 bg-[#5d5045]/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-white opacity-60" />
                  </div>
                </div>
              );
            } else {
              // --- RENDER DE TARJETA DE CONTENIDO (el que ya teníamos, refinado) ---
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className={`relative overflow-hidden p-8 md:p-12 rounded-[2.5rem] border border-[#eaddcf] flex flex-col justify-between group transition-all duration-500 hover:-translate-y-2 ${feature.bg} ${feature.size} shadow-sm hover:shadow-2xl hover:shadow-[#5d5045]/10`}
                >
                  {/* Decoración de fondo */}
                  <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#f5ebe0]/20 rounded-full blur-3xl group-hover:bg-[#5d5045]/5 transition-colors duration-500" />

                  <div className="relative z-10 space-y-6">
                    {Icon && (
                      <div className="bg-white h-14 w-14 rounded-2xl flex items-center justify-center shadow-sm border border-[#f5ebe0] group-hover:rotate-6 transition-transform duration-500">
                        <Icon className="h-6 w-6 text-[#5d5045]" />
                      </div>
                    )}
                    <div className="space-y-3">
                      <h4 className="text-2xl md:text-3xl font-serif text-[#5d5045]">
                        {feature.title}
                      </h4>
                      <p className="text-sm md:text-base text-[#8c857d] leading-relaxed font-light">
                        {feature.description}
                      </p>
                    </div>
                  </div>

                  <div className="relative z-10 flex items-center justify-between pt-6">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#5d5045] opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      Saber más
                    </span>
                    <div className="h-10 w-10 rounded-full border border-[#5d5045]/10 flex items-center justify-center group-hover:bg-[#5d5045] group-hover:text-white transition-all duration-500">
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              );
            }
          })}
        </div>
      </section>
      {/* Sección de Contacto */}
      <section id="contacto" className="max-w-4xl mx-auto px-6 py-24 md:py-40">
        <div className="bg-white rounded-[3rem] border border-[#eaddcf] p-8 md:p-16 shadow-2xl shadow-[#5d5045]/5">
          <div className="text-center space-y-4 mb-12">
            <p className="text-[10px] uppercase tracking-[0.4em] text-[#8c857d] font-black">
              Contacto Directo
            </p>
            <h3 className="text-4xl md:text-5xl font-serif text-[#5d5045]">
              Hablemos de tu <span className="italic">estudio.</span>
            </h3>
          </div>

          <form className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#8c857d] ml-4">
                Nombre
              </label>
              <input
                type="text"
                placeholder="TU NOMBRE"
                className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-6 rounded-2xl text-[11px] focus:outline-none focus:border-[#5d5045] transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#8c857d] ml-4">
                Email
              </label>
              <input
                type="email"
                placeholder="hola@tuestudio.com"
                className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-6 rounded-2xl text-[11px] focus:outline-none focus:border-[#5d5045] transition-all"
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#8c857d] ml-4">
                Mensaje
              </label>
              <textarea
                rows="4"
                placeholder="¿CÓMO PODEMOS AYUDARTE?"
                className="w-full bg-[#FAF9F6] border border-[#eaddcf] py-4 px-6 rounded-2xl text-[11px] focus:outline-none focus:border-[#5d5045] transition-all resize-none"
              ></textarea>
            </div>
            <button className="md:col-span-2 bg-[#5d5045] text-[#f5ebe0] py-5 rounded-full text-[11px] font-black uppercase tracking-[0.2em] hover:bg-[#4a3f36] transition shadow-lg active:scale-95">
              Enviar Mensaje
            </button>
          </form>
        </div>
      </section>
      <footer className="text-center py-10 border-t border-[#f5ebe0] text-[9px] text-[#8c857d] uppercase tracking-[0.4em] font-bold">
        BeautyTask © 2026 • Gestión Profesional de Salones
      </footer>
    </div>
  );
}
