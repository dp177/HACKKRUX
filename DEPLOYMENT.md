# 🚀 Triage Backend - Render Deployment Guide

This guide walks through deploying the HackKRUX Triage backend to Render.com for production.

---

## Overview

**Render.com** is a free platform that hosts your Node.js backend in the cloud. It automatically:
- Builds and deploys your code when you push to GitHub
- Provides a public HTTPS URL for your backend
- Manages environment variables securely
- Offers free tier with 750 compute hours/month (sufficient for dev/testing)

---

## Prerequisites

- GitHub account with the HACKKRUX repo
- Render.com account (sign up at render.com, use GitHub to authenticate)
- Google OAuth credentials updated with production redirect URI
- MongoDB Atlas connection string (already in backend/.env)

---

## Step 1: Prepare Your Code

### 1.1 Update GitHub

Make sure your code is pushed to GitHub:

```bash
cd C:\Users\Dax\OneDrive\Documents\Desktop\HACKKRUX
git add .
git commit -m "chore: prepare for production deployment"
git push origin main
```

### 1.2 Verify Backend Files

Ensure these files exist:
- `backend/package.json` ✓ (has start script: `node src/server.js`)
- `backend/.env` ✓ (development config)
- `backend/.env.example` ✓ (template)
- `render.yaml` ✓ (deployment config)

---

## Step 2: Create Render Service

### 2.1 Connect GitHub

1. Go to **[render.com](https://render.com)**
2. Click **"New Web Service"**
3. Select **"Connect a GitHub repository"**
4. Authorize Render to access your GitHub account
5. Select the **HACKKRUX** repository

### 2.2 Configure Service

Fill in the form:

| Field | Value |
|-------|-------|
| **Name** | `hackkrux-backend` |
| **Environment** | `Node` |
| **Build Command** | `cd backend && npm install` |
| **Start Command** | `cd backend && npm start` |
| **Plan** | Free (or Starter for better uptime) |
| **Auto-Deploy** | Enable (on every git push) |

Click **Create Web Service**

---

## Step 3: Add Environment Variables

1. In the Render dashboard, go to **Settings** → **Environment**
2. Click **Add Environment Variable** for each:

```
NODE_ENV                    = production
MONGODB_URI                 = (paste your MongoDB Atlas connection string)
JWT_SECRET                  = (generate new: copy from password generator below)
GOOGLE_OAUTH_CLIENT_IDS     = (your-google-client-id.apps.googleusercontent.com)
GOOGLE_CLIENT_SECRET        = (your-google-client-secret)
GOOGLE_MOBILE_CALLBACK_URL  = https://YOUR-SERVICE-NAME.onrender.com/api/auth/google/mobile/callback
CORS_ORIGINS                = https://YOUR-FRONTEND-DOMAIN.com
ADMIN_ONBOARDING_KEY        = change-this-in-production
```

### Generate a New JWT_SECRET

Run this in PowerShell:

```powershell
# Generate a random 32-byte secret (base64 encoded)
$secret = [Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) }))
Write-Host $secret
```

Copy the output and paste it into `JWT_SECRET` in Render.

---

## Step 4: Update Google Console

1. Go to **[Google Cloud Console](https://console.cloud.google.com/)**
2. Select your project
3. Go to **APIs & Services** → **Credentials**
4. Click your **Web Client** OAuth app
5. Under **Authorized redirect URIs**, add:
   ```
   https://hackkrux-backend.onrender.com/api/auth/google/mobile/callback
   ```
   (Replace `hackkrux-backend` with your actual Render service name)
6. Click **Save**

---

## Step 5: Monitor Deployment

1. In Render dashboard, watch the **Deploy logs**
2. You should see:
   ```
   🏥 TRIAGE BACKEND API - RUNNING
   Server: https://hackkrux-backend.onrender.com
   Environment: production
   ```
3. Once it says **"Deploy successful"**, your backend is live!

### Test the Backend

Visit in your browser:
```
https://hackkrux-backend.onrender.com/health
```

You should see:
```json
{
  "status": "healthy",
  "service": "Node.js Backend API",
  "database": "connected"
}
```

---

## Step 6: Update Mobile App

Update `mobile/.env`:

```env
EXPO_PUBLIC_API_BASE_URL=https://hackkrux-backend.onrender.com/api
```

Then reload Metro: Press `r` in the terminal.

---

## Step 7: Test Full Auth Flow

1. Open the mobile app
2. Tap **"Continue with Google"**
3. Browser opens → sign in with Google
4. Browser shows **"✅ Sign-in successful!"**
5. App polls backend and logs you in
6. You see the **authenticated home screen**

---

## Production Checklist

- [ ] Render service is deployed and healthy
- [ ] Google Console has production redirect URI
- [ ] MongoDB Atlas is accessible
- [ ] JWT_SECRET is unique (not the development one)
- [ ] Mobile app is pointing to production backend
- [ ] Auth flow works end-to-end
- [ ] Health check endpoint responds
- [ ] Error handling is working (test with invalid auth)

---

## Troubleshooting

### "Deploy failed"
Check the build logs in Render dashboard. Common issues:
- Missing `cd backend &&` in build/start commands
- Syntax errors in code
- Missing dependencies in package.json

### "unhealthy" for /health endpoint
MongoDB connection failed:
- Verify `MONGODB_URI` is correct
- Check if MongoDB Atlas allows connections from Render (IP whitelist)

### AuthO timeout when signing in
Callback URL is wrong:
- Verify `GOOGLE_MOBILE_CALLBACK_URL` matches Google Console
- Check Render service name is correct

### "Invalid Redirect" from Google
Not registered in Google Console:
- Make sure you added the production URL (not localhost or ngrok)
- Wait 5 minutes for Google to sync

---

## Environment-Specific Notes

### Development (local)

```env
EXPO_PUBLIC_API_BASE_URL=http://10.51.198.215:5000/api
NODE_ENV=development
```

### Production (Render)

```env
EXPO_PUBLIC_API_BASE_URL=https://your-service.onrender.com/api
NODE_ENV=production
```

---

## Monitoring & Logs

In Render dashboard:
1. **Logs** tab: Real-time server output
2. **Events** tab: Deployment history
3. **Metrics** tab: CPU, memory, bandwidth usage

---

## Scaling Up (Future)

When you're ready to move off the free tier:
1. Upgrade to **Starter** plan ($12/month)
2. Upgrade to **Standard** plan ($29+/month)
3. No code changes needed — just select the plan in Render dashboard

---

## Next Steps

1. Finish deploying the backend ✓
2. Update mobile app with production URL ✓
3. Test auth flow with real device
4. Deploy web portal (when ready)
5. Set up triage engine on Render (separate service)

---

## Support

- Render Docs: https://render.com/docs
- Google OAuth Issues: https://developers.google.com/identity/protocols/oauth2/troubleshooting
