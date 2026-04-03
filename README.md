# BeautyDesk Task Manager

Full-stack web app for beauty salons: multi-tenant organizations, appointment scheduling, service catalog, client management, team views, and operational stats. The UI is optimized for salon staff (Spanish copy); the API is documented via FastAPI’s OpenAPI.

## Live Demo

You can explore the live version here: https://beautydesk-taskmanager.vercel.app
The backend it will be deployed by render: https://beautydesk-taskmanager.onrender.com

---

## Tech Stack

- **Backend:** [Python](https://www.python.org/) 3.13+, [FastAPI](https://fastapi.tiangolo.com/), [SQLModel](https://sqlmodel.tiangolo.com/) / [SQLAlchemy](https://www.sqlalchemy.org/), [Alembic](https://alembic.sqlalchemy.org/) (migrations)
- **Database:** [PostgreSQL](https://www.postgresql.org/) 15
- **Frontend:** [React](https://react.dev/) 19, [Vite](https://vitejs.dev/), [React Router](https://reactrouter.com/), [Tailwind CSS](https://tailwindcss.com/) 4
- **Auth:** JWT (password login), optional [Google Sign-In](https://developers.google.com/identity) (`@react-oauth/google`), Google OAuth for Calendar connect on the backend
- **Email:** [FastAPI-Mail](https://sabuhish.github.io/fastapi-mail/) (SMTP)
- **Ops:** [Docker](https://www.docker.com/) & Docker Compose

## Key Features

- **Multi-tenant organizations:** Users belong to an organization; data is scoped per salon.
- **Roles:** `SUPER_ADMIN` (platform), `OWNER` (salon owner), `STAFF`, and `CLIENT` with route guards (for example `/master-panel` for super admins only).
- **Registration & compliance:** Sign-up with terms/privacy acceptance; fiscal/business fields with a **complete fiscal profile** gate before creating appointments or managing clients when required.
- **Marketing site:** Landing, contact (optional WhatsApp via env), legal terms and privacy pages.
- **Salon app (`/app`):** Agenda (weekly list), calendar, team view, statistics and charts, archived appointments, client list with create/delete, settings (profile, fiscal data, services with **duration and price**), optional Google Calendar integration when OAuth is configured.
- **API:** REST routers for users, organizations, auth, services, appointments, and clients; CORS and security headers configurable via environment variables.

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose, **or** local Python 3.13+, Node.js 20+, and PostgreSQL 15.

### 1. Clone the repository

```bash
git clone https://github.com/dims1993/beautydesk-taskmanager.git
cd beautydesk-taskmanager
```

### 2. Environment variables

Copy the examples and fill in secrets (never commit `.env` files).

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

- **Backend:** database credentials, `SECRET_KEY`, optional `SUPER_ADMIN_REGISTRATION_SECRET`, `CORS_ORIGINS` for production, mail and Google OAuth as needed. See comments inside [`.env.example`](.env.example).
- **Frontend:** `VITE_API_URL` (API base URL), optional `VITE_GOOGLE_CLIENT_ID`, `VITE_BUSINESS_WHATSAPP` for the contact page.

### 3. Run with Docker Compose (recommended)

From the repository root:

```bash
docker compose up --build
```

- **API:** [http://localhost:8000](http://localhost:8000) — OpenAPI docs at [http://localhost:8000/docs](http://localhost:8000/docs)
- **Frontend:** [http://localhost:5173](http://localhost:5173)

### 4. Run locally without Docker (optional)

1. Start PostgreSQL and align variables in `.env` with your local instance (`POSTGRES_SERVER=localhost`, etc.).
2. **Backend:** create a virtualenv, install dependencies, run migrations if you use Alembic, then start Uvicorn:

   ```bash
   python -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

3. **Frontend:**

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Project Structure

```text
beautydesk-taskmanager/
├── app/                          # FastAPI application
│   ├── main.py                   # App factory, CORS, router registration, lifespan
│   ├── dependencies.py           # Auth / DB dependencies
│   ├── models/                   # SQLModel entities (User, Organization, Service, …)
│   ├── schemas/                  # Pydantic request/response models
│   ├── routers/                  # API routes (auth, users, orgs, services, appointments, clients)
│   ├── services/                 # Business logic (e.g. registration)
│   └── core/                     # DB session, security, Google Calendar, notifications
├── alembic/                      # Database migrations
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # Routes and logged-in shell
│   │   ├── main.jsx
│   │   ├── hooks/                # useApi, appointment modals
│   │   ├── components/
│   │   │   ├── navigation/       # DesktopNavBar, MobileNavbar, navTabs
│   │   │   ├── marketing/        # Landing, Contacto, Terms, Privacy
│   │   │   ├── auth/             # Login, Register, Google, RoleGuard
│   │   │   └── salon/            # Agenda, calendar, team, stats, clients, settings, super-admin
│   │   └── …
│   ├── public/
│   └── package.json
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── .env.example
└── README.md
```

## Architecture Notes

The codebase follows a layered layout (routers → services → models/repositories). A fuller **hexagonal** split (domain / ports / adapters) is planned as business rules grow; see the existing separation in `app/routers`, `app/services`, and `app/models`.

## Contact & Connect

LinkedIn: [www.linkedin.com/in/david-muñoz-salinas-735b0b133](https://www.linkedin.com/in/david-muñoz-salinas-735b0b133)

Email: [dimsepp@gmail.com](mailto:dimsepp@gmail.com)

Thanks for reading ♥
