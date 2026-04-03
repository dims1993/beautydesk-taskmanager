import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

/**
 * Texto orientativo: revisión jurídica recomendada antes de producción.
 */
export default function TermsView() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#5d5045] font-sans">
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#8c857d] hover:text-[#5d5045] mb-10"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver atrás
        </button>
        <h1 className="font-serif text-3xl md:text-4xl mb-2">
          Términos y condiciones de uso
        </h1>
        <p className="text-[11px] text-[#8c857d] mb-10 uppercase tracking-widest font-bold">
          BeautyTask · Última actualización: abril 2026
        </p>

        <div className="space-y-8 text-[14px] leading-relaxed text-[#4a4239]">
          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              1. Objeto
            </h2>
            <p>
              El presente documento regula el acceso y uso de la plataforma
              BeautyTask (en adelante, la &quot;Plataforma&quot;), un servicio
              software para la gestión de citas, clientes y operaciones de
              negocios de servicios. Al registrarte o utilizar la Plataforma,
              aceptas estos términos en su versión vigente.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              2. Cuenta y datos
            </h2>
            <p>
              Eres responsable de la veracidad de los datos que facilitas,
              incluidos los datos de contacto y, en su caso, los datos fiscales
              y de facturación. Debes mantener la confidencialidad de tus
              credenciales. Cualquier actividad realizada con tu cuenta se
              presumirá realizada por ti o bajo tu autorización.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              3. Uso permitido
            </h2>
            <p>
              Te comprometes a utilizar la Plataforma de conformidad con la ley,
              la buena fe y estos términos. Queda prohibido el uso que vulnere
              derechos de terceros, introduzca malware, realice ingeniería
              inversa no autorizada o interfiera con la seguridad o el
              funcionamiento del servicio.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              4. Integraciones de terceros
            </h2>
            <p>
              Funciones como el inicio de sesión o la sincronización con Google
              Calendar pueden estar sujetas a términos adicionales del proveedor
              correspondiente. El uso de dichas integraciones es bajo tu
              responsabilidad.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              5. Disponibilidad y modificaciones
            </h2>
            <p>
              Procuramos mantener el servicio operativo, pero no garantizamos
              una disponibilidad ininterrumpida. Podemos actualizar la
              Plataforma o estos términos; la versión publicada en esta página
              prevalecerá. El uso continuado tras cambios implica la aceptación
              de los mismos cuando así lo exija la ley aplicable.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              6. Limitación de responsabilidad
            </h2>
            <p>
              En la medida permitida por la ley, la Plataforma se ofrece &quot;tal
              cual&quot;. No nos hacemos responsables de daños indirectos,
              lucro cesante o pérdida de datos salvo en los casos en que la ley
              imperativa disponga lo contrario.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              7. Contacto
            </h2>
            <p>
              Para consultas sobre estos términos, utiliza los canales de
              contacto indicados en la web o dentro de la aplicación.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
