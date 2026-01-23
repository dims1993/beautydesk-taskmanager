## MVP

1. Gestion de Usuarios y Roles:
   - Admin: Configuracion del salon
   - Esteticistas: Gestionan sus tareas y ven sus citas
   - Cliente final
2. Catalogo de Servicios
   - Definicion de servicios con duracion y precio
3. Appoinments
   - Core del negocio. Validar disponibilidad y asignar miembro del staff
4. Task Manager
   - Tareas operativas

## Arquitectura tecnica

Actualmente el proyecto se encuentra en fase de MVP con una estructura monolítica simplificada en la carpeta /app para agilizar el desarrollo inicial. Se planea una refactorización hacia Arquitectura Hexagonal a medida que crezca la complejidad de la lógica de negocio.

1. Lenguaje: Python 3.13+
2. Framework Web: FastAPI
3. Base de datos: PostgreSQL
4. ORM: SQLModel
5. Contenedorizacion: Docker and Docker Compose

## Patron de Diseno: Arquitectura Hexagonal

Las capas estaran separadas para que el codigo sea mantenible.

1. Capa de Dominio(Modelos)
2. Capa de Repositorio(Datos)
3. Capa de Servicios(Logica de Negocio)
4. Capa de Presentacion (API Routers)

## Estructura del Proyecto

```bash
beautytask-backend/
├── app/
│   ├── __init__.py
│   ├── main.py          # Punto de entrada y Endpoints
│   ├── db.py            # Configuración de base de datos y sesión
│   ├── models.py        # Modelos de datos (User, Service, Appointment)
│   ├── schemas.py       # Validación de datos (Pydantic)
│   ├── security.py      # Lógica de hashing (Argon2)
├── .env                 # Variables de entorno (Ignorado en Git)
├── .gitignore           # Archivos excluidos
├── docker-compose.yml   # Orquestación de contenedores
├── Dockerfile           # Imagen de la aplicación
├── requirements.txt     # Dependencias del proyecto
└── README.md
```
