import html as html_module
import os

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"),
    MAIL_PORT=os.getenv("MAIL_PORT"),
    MAIL_SERVER=os.getenv("MAIL_SERVER"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)


async def send_appointment_confirmation(email: str, client_name: str, date: str, service_name: str = "Servicio"):
    if not email or not str(email).strip():
        print("Skipping appointment confirmation email: client_email is empty.")
        return

    safe_client = html_module.escape((client_name or "").strip() or "cliente")
    safe_service = html_module.escape((service_name or "").strip() or "Servicio")
    safe_date = html_module.escape((date or "").strip())

    html = f"""
    <p>Hola <b>{safe_client}</b>,</p>
    <p>Tu cita para <b>{safe_service}</b> ha sido confirmada para el día {safe_date}.</p>
    <p>Te esperamos en BeautyTask.</p>
    """

    message = MessageSchema(
        subject="Confirmación de tu cita - BeautyTask",
        recipients=[email],
        body=html,
        subtype=MessageType.html
    )

    fm = FastMail(conf)
    await fm.send_message(message)


def _mail_configured() -> bool:
    return bool(
        (os.getenv("MAIL_USERNAME") or "").strip()
        and (os.getenv("MAIL_PASSWORD") or "").strip()
        and (os.getenv("MAIL_FROM") or "").strip()
        and (os.getenv("MAIL_SERVER") or "").strip()
    )


async def send_registration_verification_email(
    *,
    to_email: str,
    first_name: str,
    business_name: str,
    code: str,
) -> None:
    """
    Sends the 6-digit verification code after OWNER freemium wizard step 3.
    If SMTP is not configured, logs the code (local development only).
    """
    safe_name = html_module.escape((first_name or "").strip() or "ahí")
    safe_business = html_module.escape((business_name or "").strip() or "tu negocio")
    safe_code = html_module.escape((code or "").strip())
    fb = (os.getenv("MAIL_SOCIAL_FACEBOOK_URL") or "").strip()
    ig = (os.getenv("MAIL_SOCIAL_INSTAGRAM_URL") or "").strip()
    social_block = ""
    if fb or ig:
        parts = []
        if fb:
            parts.append(
                f'<a href="{html_module.escape(fb, quote=True)}" style="color:#5d5045;">Facebook</a>'
            )
        if ig:
            parts.append(
                f'<a href="{html_module.escape(ig, quote=True)}" style="color:#5d5045;">Instagram</a>'
            )
        social_block = "<p style='margin:24px 0 8px;font-size:12px;color:#666;'>" + " · ".join(parts) + "</p>"

    html = f"""
    <div style="font-family:Georgia,serif;color:#333;max-width:560px;line-height:1.6;">
      <h1 style="font-size:22px;color:#5d5045;">Casi has terminado</h1>
      <p>Hola <b>{safe_name}</b>,</p>
      <p>Para acceder a tu cuenta de <b>BeautyDesk</b> del salón <b>{safe_business}</b>,
      introduce el código de verificación que aparece a continuación en la página de registro:</p>
      <p style="font-size:32px;letter-spacing:0.3em;font-weight:bold;color:#5d5045;margin:28px 0;">
        {safe_code}
      </p>
      <p>¡Estamos felices de tenerte con nosotros!</p>
      <p>Con cariño,<br/>El equipo de BeautyDesk</p>
      <hr style="border:none;border-top:1px solid #eaddcf;margin:28px 0;" />
      <p style="font-size:12px;color:#888;">
        ¿No tienes una cuenta BeautyDesk? Ignora este correo electrónico.
      </p>
      <p style="font-size:12px;color:#888;">
        Has recibido este correo porque tu dirección se utilizó para crear una cuenta en BeautyDesk.
      </p>
      {social_block}
    </div>
    """

    if not _mail_configured():
        print(
            f"📧 [DEV] Verification code for {to_email}: {code} "
            "(configure MAIL_* in .env to send real email)"
        )
        return

    message = MessageSchema(
        subject="Casi has terminado — BeautyDesk",
        recipients=[to_email.strip()],
        body=html,
        subtype=MessageType.html,
    )
    fm = FastMail(conf)
    await fm.send_message(message)
