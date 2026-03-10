# AirBuddy Aerospace WorkSpace — Setup Guide

This guide covers everything you need to do **once** to get the platform running from scratch.

---

## ✅ Prerequisites

- Node.js 18+ and npm
- A Google account
- (For AI features) An Anthropic account with API access

---

## Step 1 — Firebase Project (Already Done ✓)

A Firebase project has already been created for you:

| Setting | Value |
|---|---|
| **Project ID** | `airbuddy-workspace` |
| **Console URL** | [console.firebase.google.com/project/airbuddy-workspace](https://console.firebase.google.com/project/airbuddy-workspace) |

The `.env` file has been populated with Firebase keys automatically.

---

## Step 2 — Enable Firebase Services

Go to the [Firebase Console](https://console.firebase.google.com/project/airbuddy-workspace) and enable these one by one:

### 2a. Enable Google Sign-In (Authentication)
1. Left sidebar → **Authentication** → Get Started
2. **Sign-in method** tab → click **Google** → Enable → Add your support email → **Save**

### 2b. Create Firestore Database
1. Left sidebar → **Firestore Database** → **Create database**
2. Choose **Start in production mode**
3. Select region (e.g., `asia-south1` for India) → **Enable**
4. After creation, go to the **Rules** tab and paste the contents of `firestore.rules`

### 2c. Deploy Security Rules
In your terminal, inside `d:\Desktop\Work_flow`:
```powershell
npx firebase-tools login
npx firebase-tools use airbuddy-workspace
npx firebase-tools deploy --only firestore:rules
```

---

## Step 3 — Add Anthropic API Key (AI Assistant)

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. **API Keys** → **Create Key**
3. Copy the key and add it to `d:\Desktop\Work_flow\.env`:
   ```
   VITE_ANTHROPIC_API_KEY=sk-ant-api03-...
   ```

---

## Step 4 — Set Up the First Admin Account

By default, all new Google sign-ins are assigned the `employee` role. To make yourself an admin:

1. Start the app (`npm run dev`) and sign in with your Google account once.
2. Open Firestore → **users** collection → click your user document.
3. Edit the `role` field from `"employee"` to `"admin"`.
4. Refresh the app — you will now see the **Admin Panel** in the sidebar.

---

## Step 5 — (Optional) Google Calendar Sync

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Google Calendar API**  
   (APIs & Services → Library → search "Google Calendar API" → Enable)
3. Create OAuth 2.0 credentials → **Web Application**
   - Authorized origins: `http://localhost:5173`
4. Copy the **Client ID** into `.env`:
   ```
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```
5. Create an **API Key** (restrict to Calendar API) and add it:
   ```
   VITE_GOOGLE_CALENDAR_API_KEY=AIza...
   ```

---

## Step 6 — Start the App

```powershell
cd "d:\Desktop\Work_flow"
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## (Optional) Deploy Cloud Functions for Push Notifications

Functions stubs are in `d:\Desktop\Work_flow\functions\index.js`.  
Deployment requires the **Blaze (pay-as-you-go)** Firebase plan.

```powershell
npx firebase-tools deploy --only functions
```

---

## Environment Variables Summary

| Variable | Source |
|---|---|
| `VITE_FIREBASE_*` | Already filled from `airbuddy-workspace` project |
| `VITE_ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `VITE_GOOGLE_CLIENT_ID` | Google Cloud Console → Credentials (OAuth 2.0) |
| `VITE_GOOGLE_CALENDAR_API_KEY` | Google Cloud Console → Credentials (API Key) |
