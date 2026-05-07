# Deployment Guide

This guide covers all deployment options for AirBuddy WorkSpace — from local development to full production deployment on Vercel and Firebase.

## Development Setup

### 1. Configure Firebase Services

In the [Firebase Console](https://console.firebase.google.com/project/airbuddy-workspace):

#### Enable Authentication
1. Go to **Authentication** → **Sign-in method**
2. Enable **Google** as a provider
3. Add your domain (e.g. `localhost`, your Vercel domain) to **Authorized domains**

#### Create Firestore Database
1. Go to **Firestore Database** → **Create database**
2. Select **Start in production mode**
3. Choose region `asia-south1` (recommended) or closest to your team

#### Deploy Security Rules
```bash
npx firebase-tools login
npx firebase-tools use airbuddy-workspace
npx firebase-tools deploy --only firestore:rules
```

### 2. Enable Google Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Library**
2. Search for **Google Calendar API** and click **Enable**
3. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
4. Select **Web application** and add these authorized origins:
   - `http://localhost:5173`
   - Your production Vercel domain
5. Copy the Client ID into your `.env` file as `VITE_GOOGLE_CLIENT_ID`

### 3. Set Up FCM (Optional — Push Notifications)

1. In Firebase Console → **Project Settings** → **Cloud Messaging**
2. Generate a **Web Push certificate** (VAPID key)
3. Copy the key into `.env` as `VITE_FIREBASE_VAPID_KEY`

## Production Deployment

### Vercel (Recommended)

Vercel is the recommended deployment target. The `vercel.json` in the project root is pre-configured for SPA routing and serverless functions.


#### Environment Variables

In your [Vercel project dashboard](https://vercel.com/dashboard), add the following environment variables:

```
GEMINI_API_KEY = your_google_ai_studio_key
```

All `VITE_*` variables from your `.env` file must also be added — they are required at build time.

#### Automatic Deployments

Connect your GitHub repository to Vercel for automatic deployments on every push to `main`.

### Firebase Hosting (Alternative)

```bash
# Build the production bundle
npm run build

# Deploy to Firebase Hosting
npx firebase-tools deploy --only hosting
```

Add your Firebase Hosting domain to the authorized origins list in Google Cloud Console and Firebase Authentication.

## Firebase Cloud Functions

> **Requires the Blaze (pay-as-you-go) Firebase plan.** Cloud Functions are not available on the free Spark plan.


### Deploying Functions

```bash
cd functions
npm install
cd ..
npx firebase-tools deploy --only functions
```

### Deployed Functions

| Function | Type | Trigger |
|---|---|---|
| `onTaskCreate` | Firestore | Document created in `tasks/{taskId}` |
| `onTaskUpdate` | Firestore | Document updated in `tasks/{taskId}` |
| `onAnnouncementCreate` | Firestore | Document created in `announcements/{id}` |
| `onDueDateApproach` | Scheduled | Daily at 09:00 AM Eastern Time |

### Monitoring Functions

View logs and execution history in the [Firebase Console](https://console.firebase.google.com/project/airbuddy-workspace/functions) under **Functions** → **Logs**.

## Whitelisting New Users

The platform uses an invite-only access system. To grant a new user access:

1. Open the [Firebase Console](https://console.firebase.google.com/project/airbuddy-workspace/firestore)
2. Navigate to **Firestore** → `allowed_emails` collection
3. Create a new document with the user's email address as the **Document ID**
4. The document can be empty (`{}`) — its existence is all that matters

The user can now sign in with that Google account.

## Adding a Secondary Email Account

To allow a user to sign in with a different Google account and access the same workspace profile:

1. In Firestore → `user_email_map` collection
2. Create a document with the **secondary email** as the Document ID
3. Set the field `primaryUid` to the user's primary Firebase Auth UID

The secondary account will now transparently access the same profile and data as the primary account.

## Health Checks

After deployment, verify the following:

- [ ] Login page loads at `/login`
- [ ] Google OAuth popup opens and completes successfully
- [ ] Dashboard loads with real-time task data
- [ ] Admin Panel is accessible to admin accounts
- [ ] AI Assistant responds (tests the Vercel serverless function)
- [ ] Task creation and assignment works
- [ ] Push notifications are received (requires Blaze plan + deployed functions)
