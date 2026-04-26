"""Public helpers for registration (no auth)."""

import os

import requests
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/public", tags=["public"])

NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse"


def _nominatim_address_parts(data: dict) -> dict:
    """Map Nominatim jsonv2 body to wizard business fields."""
    a = data.get("address") or {}
    hn = (a.get("house_number") or "").strip()
    road = (
        a.get("road")
        or a.get("pedestrian")
        or a.get("path")
        or a.get("footway")
        or ""
    ).strip()
    line_parts = [p for p in (hn, road) if p]
    address_line = " ".join(line_parts).strip()
    if not address_line:
        address_line = (
            (a.get("suburb") or a.get("neighbourhood") or a.get("quarter") or "")
            or (a.get("village") or a.get("hamlet") or "")
        ).strip()
    if not address_line:
        display = (data.get("display_name") or "").strip()
        if display:
            address_line = display.split(",")[0].strip()

    city = (
        a.get("city")
        or a.get("town")
        or a.get("village")
        or a.get("municipality")
        or a.get("city_district")
        or a.get("state_district")
        or a.get("county")
        or ""
    )
    city = str(city).strip()
    postcode = str(a.get("postcode") or "").strip()
    country = str(a.get("country") or "").strip()
    province = (
        a.get("province")
        or a.get("county")
        or a.get("state_district")
        or a.get("region")
        or a.get("state")
        or ""
    )
    province = str(province).strip()
    if province and city and province.casefold() == city.casefold():
        province = ""

    return {
        "address": address_line,
        "city": city,
        "postal_code": postcode,
        "country": country,
        "province": province,
    }


@router.get("/reverse-geocode")
def reverse_geocode(
    lat: float = Query(..., ge=-90, le=90, description="WGS84 latitude"),
    lon: float = Query(..., ge=-180, le=180, description="WGS84 longitude"),
):
    """
    Resolve coordinates to street-level fields via OSM Nominatim (used during owner registration).
    """
    mail = (os.getenv("MAIL_FROM") or "").strip()
    default_ua = "BeautyTask/0.1 (owner registration)"
    ua = (
        f"{default_ua}; mailto:{mail}"
        if mail
        else f"{default_ua}; +https://github.com/"
    )
    params = {
        "format": "jsonv2",
        "lat": lat,
        "lon": lon,
        "addressdetails": "1",
        "accept-language": "es,en",
    }
    try:
        r = requests.get(
            NOMINATIM_REVERSE,
            params=params,
            headers={"User-Agent": ua[:200]},
            timeout=12,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=503,
            detail="No se pudo consultar el servicio de direcciones. Inténtalo más tarde o escribe la dirección a mano.",
        ) from exc

    if r.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail="El servicio de direcciones devolvió un error.",
        )

    try:
        data = r.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="Respuesta inválida del servicio de direcciones.",
        ) from exc

    if not data or data.get("error"):
        raise HTTPException(
            status_code=404,
            detail="No se encontró una dirección para esa posición.",
        )

    parts = _nominatim_address_parts(data)
    if not parts["address"] and not parts["city"]:
        raise HTTPException(
            status_code=404,
            detail="No se pudo interpretar la dirección en esa zona.",
        )

    return parts
