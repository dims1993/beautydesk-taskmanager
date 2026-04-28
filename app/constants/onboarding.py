ALLOWED_SALON_CATEGORIES = frozenset(
    {
        "PELUQUERO",
        "BARBERO",
        "UNAS",
        "ESTETICA",
        "SPA",
        "MASAJE",
        "DEPILACION",
        "ESTETICISTA",
    }
)


# Default service catalog by primary salon category (owner wizard selection).
# These are starting points — editable after registration.
DEFAULT_SERVICES_BY_PRIMARY = {
    "PELUQUERO": [
        {"name": "Corte mujer", "duration": 45, "price": 25.0},
        {"name": "Corte hombre", "duration": 30, "price": 15.0},
        {"name": "Lavado + peinado", "duration": 45, "price": 20.0},
        {"name": "Tinte", "duration": 90, "price": 45.0},
        {"name": "Mechas", "duration": 150, "price": 75.0},
    ],
    "BARBERO": [
        {"name": "Corte", "duration": 30, "price": 15.0},
        {"name": "Corte + barba", "duration": 45, "price": 22.0},
        {"name": "Arreglo de barba", "duration": 30, "price": 12.0},
        {"name": "Afeitado", "duration": 30, "price": 12.0},
    ],
    "ESTETICA": [
        {"name": "Limpieza facial", "duration": 60, "price": 35.0},
        {"name": "Manicura", "duration": 45, "price": 18.0},
        {"name": "Pedicura", "duration": 60, "price": 25.0},
        {"name": "Maquillaje", "duration": 60, "price": 35.0},
    ],
    "SPA": [
        {"name": "Masaje relajante", "duration": 60, "price": 45.0},
        {"name": "Masaje descontracturante", "duration": 60, "price": 50.0},
        {"name": "Circuito spa", "duration": 90, "price": 55.0},
    ],
    "UNAS": [
        {"name": "Manicura semipermanente", "duration": 60, "price": 25.0},
        {"name": "Retirada semipermanente", "duration": 20, "price": 8.0},
        {"name": "Uñas acrílicas", "duration": 120, "price": 45.0},
    ],
    "DEPILACION": [
        {"name": "Depilación cejas", "duration": 15, "price": 6.0},
        {"name": "Depilación piernas", "duration": 45, "price": 18.0},
        {"name": "Depilación axilas", "duration": 15, "price": 6.0},
    ],
    "MASAJE": [
        {"name": "Masaje relajante", "duration": 60, "price": 45.0},
        {"name": "Masaje deportivo", "duration": 60, "price": 50.0},
    ],
    "ESTETICISTA": [
        {"name": "Servicio", "duration": 30, "price": 0.0},
    ],
}
