/** Helpers for appointments with one primary service_id + optional additional_service_ids from API. */

export function allServiceIdsFromAppointment(appo) {
  if (!appo) return [];
  const primary = appo.service_id;
  const extras = Array.isArray(appo.additional_service_ids)
    ? appo.additional_service_ids
    : [];
  const out = [];
  if (primary != null) out.push(primary);
  for (const id of extras) {
    if (id != null) out.push(id);
  }
  return out;
}

export function durationMinutesForAppointment(appo, services) {
  if (appo?.end_time && appo?.start_time) {
    const start = new Date(appo.start_time).getTime();
    const end = new Date(appo.end_time).getTime();
    const diff = end - start;
    if (diff > 0) return Math.max(1, Math.round(diff / 60000));
  }
  const ids = allServiceIdsFromAppointment(appo);
  const sum = ids.reduce((acc, id) => {
    const s = services.find((x) => Number(x.id) === Number(id));
    return acc + (s?.duration ?? 0);
  }, 0);
  return sum > 0 ? sum : 30;
}

export function totalPriceForAppointment(appo, services) {
  return allServiceIdsFromAppointment(appo).reduce((acc, id) => {
    const s = services.find((x) => Number(x.id) === Number(id));
    return acc + (Number(s?.price) || 0);
  }, 0);
}

export function serviceNamesForAppointment(appo, services) {
  return allServiceIdsFromAppointment(appo).map((id) => {
    const s = services.find((x) => Number(x.id) === Number(id));
    return s?.name || "Servicio";
  });
}

export function totalsForSelectedServiceIds(selectedIds, services) {
  const list = Array.isArray(selectedIds) ? selectedIds : [];
  let minutes = 0;
  let price = 0;
  for (const raw of list) {
    const s = services.find((x) => String(x.id) === String(raw));
    if (s) {
      minutes += Number(s.duration) || 0;
      price += Number(s.price) || 0;
    }
  }
  return { minutes: minutes || 0, price };
}
