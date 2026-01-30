from sqlmodel import Session, select
from app.db.session import engine
from app.models import Service


def seed_services():
    services_data = [
        {"name": "Diseño de Cejas", "description": "Depilación y forma",
            "price": 15.0, "duration": 30},
        {"name": "Lifting de Pestañas", "description": "Curvatura natural",
            "price": 35.0, "duration": 60},
        {"name": "Manicura Semi-permanente",
            "description": "Esmaltado larga duración", "price": 25.0, "duration": 45},
        {"name": "Limpieza Facial", "description": "Tratamiento hidratante",
            "price": 45.0, "duration": 90},
    ]

    with Session(engine) as session:
        for item in services_data:
            # Solo lo añade si no existe ya uno con el mismo nombre
            exists = session.exec(select(Service).where(
                Service.name == item["name"])).first()
            if not exists:
                new_service = Service(**item)
                session.add(new_service)

        session.commit()
        print("✅ Servicios de belleza insertados con éxito.")


if __name__ == "__main__":
    seed_services()
