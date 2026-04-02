import os
from datetime import timezone
from zoneinfo import ZoneInfo
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES = ["https://www.googleapis.com/auth/calendar"]

def sync_with_google_calendar(appointment, user):
    """
    Best-effort Google Calendar sync.
    Never raises: appointment creation must not fail if Google API fails.
    """
    try:
        if not user.google_access_token:
            print("Google access token is missing.")
            return

        client_id = os.getenv("GOOGLE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_CLIENT_SECRET")

        creds = Credentials(
            token=user.google_access_token,
            refresh_token=getattr(user, "google_refresh_token", None),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=SCOPES,
        )

        # Refresh if needed (requires refresh_token + client secret)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())

            # Persist rotated access token for future calls (best-effort)
            try:
                user.google_access_token = creds.token
            except Exception:
                pass

        service = build("calendar", "v3", credentials=creds)

        tz = ZoneInfo(os.getenv("DEFAULT_TIMEZONE", "Europe/Madrid"))

        start_dt = appointment.start_time
        end_dt = appointment.end_time

        # If datetimes are naive, assume they're in local tz
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=tz)
        else:
            start_dt = start_dt.astimezone(tz)

        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=tz)
        else:
            end_dt = end_dt.astimezone(tz)

        event = {
            "summary": f"Appointment with {appointment.client_name}",
            "location": "",
            "description": f"Service: {getattr(appointment, 'service_name', '')}\nClient: {appointment.client_name}",
            "start": {
                "dateTime": start_dt.isoformat(),
                "timeZone": str(tz),
            },
            "end": {
                "dateTime": end_dt.isoformat(),
                "timeZone": str(tz),
            },
        }
        
        event = service.events().insert(calendarId="primary", body=event).execute()
        print(f"Event created: {event.get('htmlLink')}")
    
    except HttpError as e:
        print(f"Google Calendar HttpError: {e}")
        try:
            content = e.content.decode("utf-8") if hasattr(e.content, "decode") else str(e.content)
            print(f"Google Calendar HttpError content: {content}")
        except Exception:
            pass
    except Exception as e:
        print(f"Error syncing with Google Calendar: {e}")
