/** @param {{ organization_name?: string | null, organization_city?: string | null }} user */
export function formatSalonHeadline(user) {
  if (!user) return null;
  const name = (user.organization_name || "").trim();
  const city = (user.organization_city || "").trim();
  if (name && city) return `${name}, ${city}`;
  if (name) return name;
  if (city) return city;
  return null;
}

function getSalonParts(user) {
  if (!user) return null;
  const name = (user.organization_name || "").trim();
  const city = (user.organization_city || "").trim();
  if (!name && !city) return null;
  return { name: name || null, city: city || null };
}

/**
 * Minimal salon mark: typography only, no frame (signature-style).
 */
export default function SalonIdentityBar({ currentUser }) {
  const parts = getSalonParts(currentUser);
  if (!parts) return null;

  const { name, city } = parts;

  return (
    <div className="max-w-6xl mx-auto mb-5 md:mb-6 px-1">
      <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.55em] text-[#b5aea6]">
        Salón
      </p>
      <p className="max-w-full font-serif text-[1.05rem] font-normal leading-snug tracking-[0.02em] text-[#5d5045]/88 md:text-[1.2rem]">
        {name ? (
          <span className="font-medium text-[#5d5045]">{name}</span>
        ) : null}
        {name && city ? (
          <span className="mx-2 text-[#c9c2ba] font-light select-none" aria-hidden>
            ·
          </span>
        ) : null}
        {city ? (
          <span className="italic text-[#8a8178]">{city}</span>
        ) : null}
      </p>
    </div>
  );
}
