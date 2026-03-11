# Patient Mobile App (Expo)

Mobile app for patients to use core system flows directly.

## Features
- Patient login/register
- Patient dashboard summary
- Quick triage submission
- Appointment booking

## Run
1. Copy env:
   - Windows: `copy .env.example .env`
2. Install dependencies:
   - `npm install`
3. Start Expo:
   - `npm start`
4. In Expo terminal:
   - Press `a` for Android emulator/device
   - Press `w` for web preview

## Environment
- `EXPO_PUBLIC_API_BASE_URL` default: `http://localhost:5000/api`

## Required backend
- Node API: http://localhost:5000
- Python triage: http://localhost:5001
