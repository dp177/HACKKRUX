# Doctor Web App (Next.js)

Web dashboard for doctors to use the system without manual API testing.

## Features
- Doctor login
- Doctor dashboard (today schedule + queue)
- Call next patient
- Patient preview before calling to cabin

## Run
1. Copy env:
   - Windows: `copy .env.local.example .env.local`
2. Install dependencies:
   - `npm install`
3. Start dev server:
   - `npm run dev`
4. Open:
   - http://localhost:3000

## Environment
- `NEXT_PUBLIC_API_BASE_URL` default: `http://localhost:5000/api`

## Required backend
- Node API: http://localhost:5000
- Python triage: http://localhost:5001
