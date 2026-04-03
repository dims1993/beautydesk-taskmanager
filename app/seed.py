from sqlmodel import Session, select
from app.core.db.session import engine
from app.models import Service, Organization


def seed_services():
    """
    Solo crea servicios demo dentro de la primera organización existente.
    Cuentas nuevas (otra organización) no reciben estos datos automáticamente.
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
    ]

    with Session(engine) as session:
        first_org = session.exec(select(Organization).order_by(Organization.id)).first()
        if not first_org:
            print("⚠️ Sin organizaciones en la base: se omite la siembra de servicios demo.")
            return

        for item in services_data:
            exists = session.exec(
                select(Service).where(
                    Service.name == item["name"],
                    Service.organization_id == first_org.id,
                )
            ).first()
            if not exists:
                session.add(
                    Service(
                        **item,
                        organization_id=first_org.id,
                    )
                )

        session.commit()
        print(
            f"✅ Servicios demo verificados para la organización id={first_org.id}."
        )


if __name__ == "__main__":
    seed_services()
