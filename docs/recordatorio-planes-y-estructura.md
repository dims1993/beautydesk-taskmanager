# Recordatorio: planes, accesos y mapa del producto (BeautyDesk)

Documento interno para alinear **qué está implementado hoy** en código y **cómo está seccionada la app**. Actualízalo cuando cambien reglas de negocio o aparezcan planes de pago reales (Stripe, etc.).

---

## 1. Vista de un vistazo

```text
┌─────────────────────────────────────────────────────────────────┐
│  BeautyDesk = app de salón multi-tenant (organización = salón)   │
│  Frontend: React/Vite · Backend: FastAPI · DB: PostgreSQL        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Roles de usuario (modelo mental)

| Rol            | Quién es              | Notas en producto |
|----------------|------------------------|-------------------|
| `SUPER_ADMIN`  | Plataforma / soporte   | Panel `/master-panel`, ve todo si el código lo permite |
| `OWNER`        | Titular del negocio    | Organización, equipo, servicios, cierre de caja (config), datos fiscales |
| `STAFF`        | Profesional del salón  | Sus citas, stats/caja según filtros actuales |
| `CLIENT`       | Cliente final          | Registro posible; uso en app principal limitado según rutas |

---

## 3. Suscripción, método de pago y matriz de permisos (implementado)

Fuente de verdad en código: **`app/billing/subscription.py`** (`SubscriptionPlan`, `PaymentMethod`, `PlanEntitlements`).

### 3.1 Organización (`Organization`)

- **`subscription_active`** (bool, default `true`): control de negocio / alta (hook futuro si se enlaza cobro real).
- **`subscription_plan`** (`esencial` | `profesional` | `premium`, default **esencial**): define los **entitlements** del salón.
- **`payment_method`** (`unspecified` | `card` | `sepa_debit` | `bank_transfer` | `manual_invoice`, default **unspecified**): forma de cobro acordada; hasta activar pasarela suele quedar `unspecified`.

**Super admin (operación manual / pruebas):** `PATCH /users/organizations/{org_id}/billing` con `subscription_plan` y/o `payment_method`. Listado de orgs: `GET /users/organizations` incluye ambos campos.

### 3.2 Usuario (`User`) e integraciones

- Sigue existiendo **`integrations_access`** en fila de usuario (legacy / registro).
- **Efectivo para la API y login:** el acceso a **Google Calendar** se calcula con el **plan de la organización** (`integrations_access_effective` en `app/billing/subscription.py`): si hay org, mandan los entitlements; si no hay org, se usa el booleano del usuario. **`SUPER_ADMIN`** siempre puede integraciones a nivel lógica de permisos.

**`GET /users/me`** devuelve además: `subscription_plan`, `payment_method`, `plan_entitlements` (objeto con los flags de la matriz siguiente) y **`integrations_access` ya coherente con el plan** cuando el usuario pertenece a una organización.

### 3.3 Matriz de permisos por plan (entitlements)

| Plan | Google Calendar | Profesionales STAFF (máx.) | Nivel stats (`stats_level`) | Export informe mensual (Excel) | Analítica avanzada | Invitar equipo (`team_invites`) | Soporte prioritario |
|------|-----------------|----------------------------|-----------------------------|--------------------------------|--------------------|----------------------------------|---------------------|
| **Esencial** | No | **0** (solo titular) | `basic` | No | No | No | No |
| **Profesional** | Sí | **2** | `standard` | Sí | No | Sí | No |
| **Premium** | Sí | **ilimitado** (`null` en API) | `advanced` | Sí | Sí | Sí | Sí |

**Enforcement orientativo:**

- **Equipo:** `POST /users/team` comprueba `team_invites` y cuenta de usuarios con rol `STAFF` vs `max_staff_users`.
- **Calendar / OAuth:** routers en `app/routers/auth.py` y sync de citas según plan.
- **Export Excel (stats):** UI en `StatsCharts.jsx` deshabilita export si `plan_entitlements.export_monthly` es falso.

### 3.4 Completar negocio (OWNER)

- **`needs_fiscal_completion`**: si el OWNER no tiene organización / datos fiscales completados, la app **limita** crear citas, clientes, etc., hasta completar **Ajustes** (flujo fiscal).

---

## 4. Mapa de la app autenticada (`/app`)

Tabs principales (barra superior escritorio / inferior móvil):

```text
  agenda          → Lista semanal de citas próximas (scheduled)
  calendario      → Mes + detalle del día; Google Calendar si integraciones OK
  equipo          → Listado del equipo (OWNER); invitar / retirar accesos
  estadísticas    → Caja, gráficos, informe Excel, histórico / papelera
  clientes        → CRM ligero del salón
  ajustes         → Perfil, fiscal (si aplica), servicios del negocio (CRUD)
```

**Rutas especiales**

- **`/master-panel`**: solo `SUPER_ADMIN` (guard de rol).

**Marketing (sin sesión de salón)**

- Landing, contacto, términos, privacidad, login, registro.

---

## 5. Funcionalidades ligadas a plan / integraciones (referencia rápida)

| Área | Comportamiento (resumen) |
|------|---------------------------|
| Google Calendar | Permitido solo si el plan de la org incluye `google_calendar` (Profesional/Premium); ver §3.3 y `auth.py`. |
| Export mensual (stats) | Gated por `export_monthly` (Esencial: no). |
| Equipo (invitar STAFF) | Gated por `team_invites` y límite numérico; Esencial sin equipo adicional. |
| Resto core (citas, servicios, clientes) | Rol + fiscal completado (`needs_fiscal_completion`), no solo plan. |

*(Búsqueda útil: `plan_entitlements`, `integrations_access`, `app/billing/`.)*

---

## 6. Hoja de ruta (plantilla)

Usad esta tabla cuando cerréis hitos de producto:

| Fecha | Hitos | Notas |
|-------|--------|------|
|       |        |      |

**Ideas frecuentes a documentar cuando existan:**

- Planes de pago y qué flags activan en BD.
- Límites por plan (nº de staff, citas/mes, etc.) si se implementan.
- Integraciones nuevas (WhatsApp Business API, etc.).

---

## 7. Dónde tocar el código (ancla rápida)

| Tema | Ubicación orientativa |
|------|------------------------|
| Planes y matriz de permisos | `app/billing/subscription.py` |
| Routers API | `app/routers/` |
| Modelos / tenant | `app/models/`, `organization_id` en citas y servicios |
| Registro OWNER / integraciones | `app/services/registration.py`, `wizard_registration.py` |
| UI salón | `frontend/src/App.jsx`, `frontend/src/components/salon/` |
| Guía primera visita | `frontend/src/components/onboarding/FirstVisitGuide.jsx` |

---

*Última revisión orientativa al estado del repo; no sustituye contratos legales ni pricing comercial.*
