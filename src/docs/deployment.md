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

### 2. Set Up Google Calendar Sync

Calendar sync runs **server-side**, in the task Cloud Functions. A service
account impersonates each employee through Google Workspace domain-wide
delegation, so nobody is ever asked for permission and sign-in is untouched.

> Do **not** create a browser OAuth client for this and do **not** add a Calendar
> scope to `googleProvider` in `src/services/firebase.js`. Calendar is a
> sensitive scope; on an app Google has not verified, that scope interrupts every
> team member's *login* with a full-page "Google hasn't verified this app" /
> "Access blocked" warning. This is why the feature was rolled back once already.

Requires Workspace **super admin** access for the domain.

1. **Create the service account.** [Google Cloud Console](https://console.cloud.google.com/)
   → **IAM & Admin** → **Service Accounts** → **Create service account**. Name it
   something like `calendar-sync`. No project roles are needed — it authenticates
   as employees, not as itself. Open it and copy the **Unique ID** (a 21-digit
   number); that is the "Client ID" the Admin console asks for.
2. **Enable the API.** **APIs & Services** → **Library** → *Google Calendar API*
   → **Enable**.
3. **Authorize domain-wide delegation.** [admin.google.com](https://admin.google.com)
   → **Security** → **Access and data control** → **API controls** → *Domain wide
   delegation* → **Manage Domain Wide Delegation** → **Add new**:
   - **Client ID**: the Unique ID from step 1
   - **OAuth scopes**: `https://www.googleapis.com/auth/calendar.events`
   - **Authorize**

   One scope only — `calendar.events` can write events but cannot create or
   delete calendars. Propagation usually takes a few minutes.
4. **Store the key as a secret.** On the service account → **Keys** → **Add key**
   → **Create new key** → **JSON**. Then paste the whole file contents into:

   ```bash
   npx firebase-tools functions:secrets:set CALENDAR_SA_KEY
   ```

   The secret has to exist before the functions deploy, or the deploy fails.
   Delete the downloaded JSON afterwards — it is a live credential.
5. **Deploy.**

   ```bash
   cd functions && npm install && cd ..
   npx firebase-tools deploy --only functions
   ```

To verify: create a task, then check the assignee's Google Calendar. If nothing
appears, `npx firebase-tools functions:log --only onTaskCreate` names the reason —
a missing delegation is logged with the exact console page and scope to fix.

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

The functions are written against the **v2 API** and run on **Node 22** in the `asia-south1` region.

### Before the first deploy

Set the Gemini secret. `functions.config()` was removed in `firebase-functions` v7 and no longer works:

```bash
npx firebase-tools functions:secrets:set GEMINI_API_KEY
```

Deploy rules and indexes first — the roadmap deadline cron queries an index that must already exist:

```bash
npx firebase-tools deploy --only firestore:rules
npx firebase-tools deploy --only firestore:indexes
npx firebase-tools deploy --only storage
```

### Deploying Functions

```bash
cd functions
npm install
cd ..
npx firebase-tools deploy --only functions
```

The first deploy enables Cloud Build, Artifact Registry, Cloud Scheduler and Eventarc on the project. Expect several minutes and a confirmation prompt.

### Deployed Functions

| Function | Type | Trigger |
|---|---|---|
| `onTaskCreate` | Firestore | Document created in `tasks/{taskId}` — pushes to assignees |
| `onTaskUpdate` | Firestore | Document updated in `tasks/{taskId}` — pushes on status change only |
| `onAnnouncementCreate` | Firestore | Document created in `announcements/{id}` |
| `onDueDateApproach` | Scheduled | Daily at **09:00 Asia/Kolkata** — tasks due tomorrow |
| `roadmapDeadlineCheck` | Scheduled | Daily at **09:15 Asia/Kolkata** — roadmap tasks due tomorrow or overdue |
| `onRoadmapTaskWrite` | Firestore | Task written under a roadmap node — recomputes node progress |
| `onRoadmapNodeProgressChange` | Firestore | Roadmap node written — propagates progress to ancestors |
| `onRoadmapNodeHistory` | Firestore | Roadmap node written — writes the audit history entry |
| `onRoadmapTaskHistory` | Firestore | Roadmap task written — writes the audit history entry |
| `askGemini` | Callable | Unused by the web app, which calls `/api/gemini` on Vercel |

The roadmap **History** tab is populated by the two history triggers and records changes from the deploy forward only — existing nodes will show an empty log until they are next edited.

### Push notifications

Background push needs all of these in place:

1. `VITE_FIREBASE_VAPID_KEY` set in `.env` **and** in the Vercel project settings.
2. `public/firebase-messaging-sw.js` shipped with the build (it is, automatically).
3. The functions above deployed.

Each browser registers its own device token on `users/{uid}.fcmTokens` at sign-in and removes it at sign-out. Tokens that stop working are pruned automatically.

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
