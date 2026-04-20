from sqlmodel import Session, select
from app.core.db.session import engine
from app.models import Service, Organization


def seed_services():
    """
    Crea el catálogo demo en cada organización existente (nombre único por org).
    """
    services_data = [
        {
            "name": "Diseño de Cejas",
            "description": "Depilación y forma",
            "price": 15.0,
            "duration": 30,
        },
        {
            "name": "Lifting de Pestañas",
            "description": "Curvatura natural",
            "price": 35.0,
            "duration": 60,
        },
        {
            "name": "Manicura Semi-permanente",
            "description": "Esmaltado larga duración",
            "price": 25.0,
            "duration": 45,
        },
        {
            "name": "Limpieza Facial",
            "description": "Tratamiento hidratante",
            "price": 45.0,
            "duration": 90,
        },
        {
            "name": "Semipermanente",
            "description": "Esmaltado gel semipermanente manos",
            "price": 28.0,
            "duration": 60,
        },
        {
            "name": "Uñas Gel / Acrílicas",
            "description": "Esculpidas o refuerzo",
            "price": 40.0,
            "duration": 90,
        },
        {
            "name": "Pedicura Spa",
            "description": "Cuidado completo de pies",
            "price": 32.0,
            "duration": 60,
        },
        {
            "name": "Depilación cera (zona pequeña)",
            "description": "Labio, cejas o axilas",
            "price": 12.0,
            "duration": 20,
        },
        {
            "name": "Micropigmentación cejas",
            "description": "Pelos / sombreado",
            "price": 180.0,
            "duration": 120,
        },
        {
            "name": "Masaje relajante 30'",
            "description": "Espalda y cervicales",
            "price": 35.0,
            "duration": 35,
        },
        {
            "name": "Tratamiento capilar",
            "description": "Hidratación y puntas",
            "price": 22.0,
            "duration": 45,
        },
    ]

    with Session(engine) as session:
        orgs = session.exec(select(Organization)).all()
        if not orgs:
            print("⚠️ Sin organizaciones en la base: se omite la siembra de servicios demo.")
            return

        added = 0
        for org in orgs:
            for item in services_data:
                exists = session.exec(
                    select(Service).where(
                        Service.name == item["name"],
                        Service.organization_id == org.id,
                    )
                ).first()
                if not exists:
                    session.add(
                        Service(
                            **item,
                            organization_id=org.id,
                        )
                    )
                    added += 1

        session.commit()
        print(
            f"✅ Catálogo de servicios demo verificado ({len(services_data)} referencias por org). "
            f"Entradas nuevas añadidas: {added}."
        )


if __name__ == "__main__":
    seed_services()
