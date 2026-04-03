import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

/**
 * Texto orientativo RGPD / LOPDGDD: revisión jurídica recomendada.
 */
export default function PrivacyView() {
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
          Política de privacidad
        </h1>
        <p className="text-[11px] text-[#8c857d] mb-10 uppercase tracking-widest font-bold">
          BeautyTask · Responsable del tratamiento · abril 2026
        </p>

        <div className="space-y-8 text-[14px] leading-relaxed text-[#4a4239]">
          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              1. Quién trata tus datos
            </h2>
            <p>
              Los datos personales que nos facilites al usar BeautyTask serán
              tratados por el responsable del servicio (BeautyTask / titular del
              proyecto), con la finalidad de gestionar el registro, la cuenta,
              la relación contractual y, en su caso, obligaciones fiscales y de
              facturación asociadas a tu uso profesional de la Plataforma.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              2. Datos que podemos tratar
            </h2>
            <p>
              Identificativos y de contacto (nombre de usuario, correo,
              teléfono), datos de negocio y facturación que nos proporciones,
              datos de uso de la aplicación y, si activas integraciones,
              información necesaria para conectar con proveedores como Google
              conforme a sus políticas.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              3. Base legal
            </h2>
            <p>
              La ejecución del contrato o medidas precontractuales (registro,
              prestación del servicio), el cumplimiento de obligaciones legales
              (p. ej. facturación) y, cuando corresponda, el interés legítimo en
              la seguridad y mejora del servicio. El registro requiere tu
              aceptación explícita de esta política junto con los términos de
              uso.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              4. Conservación
            </h2>
            <p>
              Conservaremos los datos el tiempo necesario para las finalidades
              indicadas y para cumplir plazos legales. Tras su finalización,
              podrán ser bloqueados o suprimidos según la normativa aplicable.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              5. Destinatarios
            </h2>
            <p>
              Podremos comunicar datos a proveedores de infraestructura,
              alojamiento o comunicaciones que actúen como encargados del
              tratamiento, con contrato o cláusulas tipo adecuadas. No
              vendemos tus datos personales.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              6. Tus derechos
            </h2>
            <p>
              Puedes ejercer los derechos de acceso, rectificación, supresión,
              oposición, limitación del tratamiento y portabilidad cuando
              proceda, así como retirar el consentimiento en los casos basados
              en el mismo. En España puedes reclamar ante la Agencia Española de
              Protección de Datos (www.aepd.es).
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-[#5d5045] mb-3">
              7. Seguridad
            </h2>
            <p>
              Aplicamos medidas técnicas y organizativas apropiadas frente al
              estado de la técnica; ningún sistema es 100&nbsp;% seguro.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
