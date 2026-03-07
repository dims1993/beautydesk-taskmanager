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
            to="/login"
            className="bg-[#5d5045] text-[#f5ebe0] px-6 md:px-8 py-3 rounded-full hover:bg-[#4a3f36] transition shadow-md active:scale-95"
          >
            Comenzar
          </Link>
        </div>
      </nav>

      {/* Hero */}
      {/* Hero */}
      <header className="max-w-7xl mx-auto mt-12 md:mt-24 px-6 md:px-16 pb-20 md:pb-32 border-b border-[#eaddcf]">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16 items-center">
          {/* Texto */}
          <div className="md:col-span-7 space-y-6 md:space-y-8 text-center md:text-left">
            <h2 className="text-5xl md:text-8xl font-serif leading-[1.1] md:leading-[0.95] tracking-tight text-[#5d5045]">
              Eleva el <br className="hidden md:block" />
              flujo diario <br />
              <span className="italic opacity-80">de tu salón.</span>
            </h2>
            <p className="text-base md:text-lg text-[#8c857d] max-w-lg mx-auto md:mx-0 font-light leading-relaxed">
              Una plataforma de gestión sofisticada diseñada exclusivamente para
              la industria de la belleza y el bienestar.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4 pt-4">
              <Link
                to="/login"
                className="w-full sm:w-auto bg-[#5d5045] text-[#f5ebe0] px-10 py-5 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-[#4a3f36] transition shadow-xl shadow-[#5d5045]/10 flex items-center justify-center gap-2 active:scale-95"
              >
                Explorar el flujo
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Ventana con imagen (Contenedor con 'group' para la animación) */}
          <div className="hidden md:block md:col-span-5 relative group">
            <div className="relative w-full h-[550px] rounded-t-full overflow-hidden border border-[#f5ebe0] shadow-2xl transform rotate-2 transition-transform duration-700 group-hover:rotate-0">
              {/* La Imagen */}
              <img
                src="/model1.webp"
                alt="Atmósfera del estudio"
                className="absolute inset-0 w-full h-full object-cover scale-110 group-hover:scale-100 transition-transform duration-1000"
              />

              {/* Overlay degradado */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#5d5045]/60 via-transparent to-transparent" />

              {/* Texto superpuesto */}
              <div className="absolute bottom-12 left-0 right-0 text-center">
                <p className="font-serif italic text-4xl text-white drop-shadow-md tracking-wide">
                  "Sofisticado"
                </p>
                <div className="mt-3 mx-auto w-12 h-[1px] bg-white/60"></div>
              </div>
            </div>

            {/* Elemento decorativo detrás */}
            <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-[#f5ebe0] rounded-full -z-10 border border-[#eaddcf]"></div>
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

      <footer className="text-center py-10 border-t border-[#f5ebe0] text-[9px] text-[#8c857d] uppercase tracking-[0.4em] font-bold">
        BeautyTask © 2026 • Gestión Profesional de Salones
      </footer>
    </div>
  );
}
