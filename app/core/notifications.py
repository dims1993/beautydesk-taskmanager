from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
import os

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
        print("📭 Skipping appointment confirmation email: client_email is empty.")
        return

    html = f"""
    <p>Hola <b>{client_name}</b>,</p>
    <p>Tu cita para <b>{service_name}</b> ha sido confirmada para el día {date}.</p>
    <p>¡Te esperamos en BeautyTask!</p>
    """

    message = MessageSchema(
        subject="Confirmación de tu cita - BeautyTask",
        recipients=[email],
        body=html,
        subtype=MessageType.html
    )

    fm = FastMail(conf)
    await fm.send_message(message)
