# Despliegue: Render (API + PostgreSQL) y Vercel (frontend)

Orden recomendado: **base de datos → API en Render → dominio de la API fijado → frontend en Vercel → ajustar CORS y `FRONTEND_URL` en Render → Stripe y Google**.

---

## 1. Render: PostgreSQL

1. [Dashboard](https://dashboard.render.com) → **New** → **PostgreSQL**.
2. Nombre, región, plan (el gratuito expira/hiberna según política de Render; para producción usa plan de pago).
3. Crea el recurso y copia la **Internal Database URL** (o **External** si el servicio web no comparte red, pero en un mismo “Blueprint”/cuenta lo habitual es vincular la Web Service a la misma región y usar la URL interna).
4. Registra: usuario, base, host y contraseña (o solo guarda el string `DATABASE_URL` completo que te da Render).

`DATABASE_URL` de Render a veces empieza por `postgres://`; el backend ya la normaliza a `postgresql://` en `app/core/db/session.py`.

---

## 2. Render: Web Service (FastAPI / Docker)

1. **New** → **Web Service** → conecta el repositorio Git.
2. **Root directory:** raíz del repo (donde está el `Dockerfile`).
3. **Environment:** **Docker** (construcción con el `Dockerfile` del repo).
4. **Start command:** puedes dejarlo vacío: el `Dockerfile` del repo arranca con `uvicorn` en el puerto `PORT` (Render) o `8000` (local). Si tu servicio exige un comando explícito, usa:

   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```

5. **Instance type** según carga; el plan free puede hibernar.

### Variables de entorno en Render (Web Service)

Añade al menos lo siguiente. Los nombres coinciden con `.env.example` en la raíz del backend.

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Pega el valor de la PostgreSQL creada (o “link” de DB si Render lo ofrece). **No** hace falta repetir `POSTGRES_*` si usas solo `DATABASE_URL`. |
| `SECRET_KEY` | Cadena larga y aleatoria (por ejemplo 32+ bytes en hex/base64). **Nunca** uses el valor de ejemplo. |
| `CORS_ORIGINS` | Orígenes permitidos, **separados por comas, sin barra final**. Ej.: `https://tu-app.vercel.app` o varios. Debe incluir el dominio del front en Vercel. |
| `FRONTEND_URL` | URL **pública** del front, p. ej. `https://tu-proyecto.vercel.app` o tu dominio. **No** uses la URL del **panel** de Vercel (`https://vercel.com/tu-cuenta/...`): Stripe redirigirá ahí y verás **404**. Cópiala del desplegador: Vercel → **Deployments** → abre el deployment y usa el dominio `https://…vercel.app` (o **Settings → Domains**). Se usa en Stripe (success/cancel) y en OAuth. |
| `STRIPE_SECRET_KEY` | `sk_live_...` (producción) o `sk_test_...` (pruebas). |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` del endpoint de webhook (ver sección Stripe). |
| `STRIPE_PRICE_ESENCIAL` | ID de precio de Stripe (modo test o live, coherente con la clave). |
| `STRIPE_PRICE_PROFESIONAL` | Igual. |
| `STRIPE_PRICE_PREMIUM` | Igual. |
| `STRIPE_TRIAL_DAYS` | Opcional; por defecto el código usa 10. |
| `ENFORCE_ORG_STRIPE_SUBSCRIPTION` | `true` en producción con Stripe; `false` solo si aún no tienes precios y quieres desbloquear (no recomendado en prod). |
| `GOOGLE_CLIENT_ID` | Mismo proyecto que en Google Cloud. |
| `GOOGLE_CLIENT_SECRET` | |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://TU-SERVICIO-API.onrender.com/auth/google/calendar/callback` (sustituye por tu host real de Render). Debe **coincidir** con lo añadido en Google Cloud Console. |
| `MAIL_*` | Obligatorio para el **registro owner-wizard** (código por email). `MAIL_SERVER`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM`. Gmail: [contraseña de aplicación](https://support.google.com/accounts/answer/185833). Si falta o es inválida, el endpoint puede devolver **503** con detalle (antes 500). Sin `MAIL_*` el backend **no envía** correo pero imprime el código en **logs** (solo para depuración). |
| `SUPER_ADMIN_REGISTRATION_SECRET` | Opcional; solo para crear cuentas SUPER_ADMIN por el flujo de registro. |
| `ALLOWED_EMAILS` | Opcional; allowlist de emails para Google login. |
| `DEFAULT_TIMEZONE` | Opcional; por defecto `Europe/Madrid`. |
| `MAIL_SOCIAL_FACEBOOK_URL` / `MAIL_SOCIAL_INSTAGRAM_URL` | Opcionales; pie de emails. |

**No commitear** el `.env` con secretos. Render almacena las variables cifradas en el servicio.

Tras el primer despliegue, la API quedará en `https://<tu-servicio>.onrender.com` (o custom domain). Úsala para Vercel y para Stripe.

---

## 3. Vercel (frontend, Vite)

1. [Vercel](https://vercel.com) → **Add New** → **Project** → importa el mismo repo.
2. **Root Directory:** `frontend` (carpeta donde está `package.json` del front).
3. **Framework Preset:** Vite (Vercel lo detecta).
4. **Build command:** `npm run build` (por defecto).
5. **Output directory:** `dist` (Vite).
6. **Environment Variables** (pantalla de proyecto → Settings → Environment Variables). Las variables `VITE_*` se inyectan **en el build**; al cambiarlas hay que **volver a desplegar**.

| Variable | Valor de ejemplo | Notas |
|----------|------------------|--------|
| `VITE_API_URL` | `https://tu-api.onrender.com` | **Sin** barra final. Debe apuntar al origen de la API. |
| `VITE_GOOGLE_CLIENT_ID` | Mismo `GOOGLE_CLIENT_ID` que en Render | Para el botón de Google en login/registro. En Google Cloud, añade en “Authorized JavaScript origins” el dominio de Vercel, p. ej. `https://tu-app.vercel.app`. |
| `VITE_BUSINESS_WHATSAPP` | Opcional, p. ej. `34600111222` | Página de contacto. |

Despliega. La URL final será `https://<proyecto>.vercel.app` o tu dominio custom.

**Importante:** vuelve a **Render** y pega esa URL (HTTPS, sin `/` final) en `CORS_ORIGINS` y `FRONTEND_URL`, y haz **Manual Deploy** del Web Service para que apliquen.

---

## 4. Stripe (producción o test)

1. [Dashboard](https://dashboard.stripe.com) → **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL:** `https://<tu-api>.onrender.com/billing/webhook`
3. Eventos: al menos `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` (alineado con `app/routers/billing.py`).
4. Copia el **Signing secret** (`whsec_...`) a `STRIPE_WEBHOOK_SECRET` en Render.
5. Los **Price IDs** deben ser del **mismo modo** (test/live) que `STRIPE_SECRET_KEY`.
6. En el checkout, el **success URL** se construye con `FRONTEND_URL` en el backend: comprueba que tras pagar se abre tu Vercel con `?tab=ajustes&billing=success&session_id=...` para el fallback `POST /billing/confirm-checkout-session`.

---

## 5. Google Cloud (OAuth y login)

- **Orígenes JavaScript autorizados:** `https://tu-app.vercel.app` (y `http://localhost:5173` si sigues en local).
- **URIs de redirección (sign-in y Calendar):** incluye `https://tu-api.onrender.com/auth/google/calendar/callback` y la que exija el tipo “Web client” usado con `@react-oauth/google`.
- `GOOGLE_OAUTH_REDIRECT_URI` en Render = exactamente la URI de callback del backend de Calendar (documentada arriba).

---

## 6. Comprobación rápida

| Comprobación | Dónde |
|--------------|--------|
| API viva | `GET https://tu-api.onrender.com/` debería devolver JSON de estado. |
| CORS | Desde el front en Vercel, el navegador no debe bloquear `fetch` a la API. Si falla, revisa `CORS_ORIGINS` (incluye el origen exacto de Vercel, `https://`). |
| Registro y login | Probar con usuario nuevo y ver correo (Render tiene SMTP; si usas Gmail, a veces hace falta “App password”). |
| Suscripción | Tras checkout, con webhook + `confirm-checkout-session` la org debería tener `stripe_subscription_id` y dejar de mostrar el bloqueo. |

---

## 7. Problemas frecuentes

- **409 / CORS al cargar la app:** `CORS_ORIGINS` no incluye el origen de Vercel o falta el esquema `https://`.
- **Stripe: redirige a localhost** en vez de a Vercel: `FRONTEND_URL` en Render sigue en `http://localhost:5173` — actualízala y vuelve a desplegar.
- **Google login: idpiframe “origin mismatch”:** Orígenes en Google Cloud no incluyen el dominio de Vercel o el `VITE_GOOGLE_CLIENT_ID` no coincide.
- **Vite no ve `VITE_API_URL`:** Variable no definida en Vercel o despliegue antiguo — redeploy tras guardar env.

---

## 8. Opcional: dominio custom

- **Render:** Settings del Web Service → Custom Domain para la API.
- **Vercel:** Project → Domains para el front.
- Actualiza de nuevo `CORS_ORIGINS`, `FRONTEND_URL`, orígenes de Google y, si aplica, la URL del webhook en Stripe.
