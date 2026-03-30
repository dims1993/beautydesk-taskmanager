import os
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/calendar']

def sync_with_google_calendar(appointment, user):
    if not user.google_access_token:
        print("Google access token is missing.")
        return
    
    try:
        creds = Credentials.from_authorized_user_info(
            {"access_token": user.google_access_token}, SCOPES
        )
        
        service = build('calendar', 'v3', credentials=creds)
        
        event = {
            'summary': f"Appointment with {appointment.client_name}",
            'location': '',
            'description': f"Service: {appointment.service_name}\nClient: {appointment.client_name}",
            'start': {
                'dateTime': appointment.start_time.isoformat(),
                'timeZone': 'UTC',
            },
            'end': {
                'dateTime': appointment.end_time.isoformat(),
                'timeZone': 'UTC',
            },
        }
        
        event = service.events().insert(calendarId='primary', body=event).execute()
        print(f"Event created: {event.get('htmlLink')}")
    
    except Exception as e:
        print(f"Error syncing with Google Calendar: {e}")
