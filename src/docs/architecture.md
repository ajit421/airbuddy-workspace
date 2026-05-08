# Architecture

This document describes the technical architecture of AirBuddy WorkSpace — the technology choices, data flows, and design patterns that underpin the platform.

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | React | 19 |
| Build Tool | Vite | 7 |
| Styling | Tailwind CSS | 3 |
| Routing | React Router DOM | 7 |
| Backend / Database | Firebase (Auth, Firestore, FCM) | Latest |
| AI Assistant | Google Gemini 2.5 Flash Lite | via `@google/genai` |
| Calendar Integration | Google Calendar REST API | v3 |
| Serverless API | Vercel Serverless Functions | Latest |
| Cloud Functions | Firebase Cloud Functions (Node.js) | Latest |
| Charts | Chart.js + react-chartjs-2 | Latest |
| Calendar UI | react-big-calendar + moment.js | Latest |

## Application Architecture

The application is a **Single Page Application (SPA)** deployed on Vercel. All routing is client-side via React Router DOM v7.

### Component Hierarchy

```
App
├── AuthProvider (AuthContext)
│   └── AppRoutes
│       ├── LoginPage (public)
│       └── ProtectedRoute
│           └── TaskProvider (TaskContext)
│               └── AppLayout
│                   ├── Navbar
│                   ├── Sidebar
│                   ├── <Outlet /> (page content)
│                   └── AIAssistantButton (floating)
```

### Context Providers

Two global context providers manage shared state:

**`AuthContext`** (`src/context/AuthContext.jsx`)
- Manages Firebase Authentication state via `onAuthStateChanged`
- Handles Google OAuth sign-in, sign-out, and token refresh
- Implements the invite-only whitelist gate (`allowed_emails` collection check)
- Resolves secondary email accounts to primary UIDs via `user_email_map`
- Exposes: `user`, `userProfile`, `effectiveUid`, `isAdmin`, `googleAccessToken`

**`TaskContext`** (`src/context/TaskContext.jsx`)
- Maintains a real-time Firestore subscription to tasks
- For admins: subscribes to all tasks via `orderBy('createdAt', 'desc')`
- For employees: runs two parallel queries (by `assignedTo` and `workPartnerUids`) and merges + deduplicates client-side
- Exposes: `tasks`, `allTasks`, `allUsers`, `loading`, `getUpcomingTasks()`

## Data Flow

### Authentication Flow

1. User clicks "Continue with Google" on `/login`
2. `signInWithPopup(auth, googleProvider)` opens a Google OAuth popup
3. On success, the Google access token is stored in `sessionStorage` for Calendar API use
4. `onAuthStateChanged` fires with the Firebase user
5. The `allowed_emails` collection is checked — if the email isn't whitelisted, the user is immediately signed out with an error toast
6. The `user_email_map` collection is checked for secondary email mapping
7. The user's Firestore profile is fetched or created at `users/{effectiveUid}`

### Task Assignment Flow (Admin)

1. Admin submits the Assign Task form in the Admin Panel
2. Task document is written to `tasks/` with `isAdminTask: true`
3. `addTaskToGoogleCalendar()` creates an all-day event on the admin's Google Calendar via the REST API
4. `sendNotification()` writes a notification document to `notifications/{uid}/items/` for each assignee
5. Firebase Cloud Function `onTaskCreate` fires, reads FCM tokens from user profiles, and sends push notifications via `admin.messaging().sendToDevice()`

### AI Assistant Flow

1. User sends a message in the floating chat widget
2. `sendMessage()` in `src/services/gemini.js` builds a system prompt containing the user's current task list as JSON
3. A `POST` request is made to the Vercel Serverless Function at `/api/gemini`
4. The serverless function calls the Gemini API using the server-side `GEMINI_API_KEY` environment variable
5. The response is returned to the client and displayed in the chat widget

## Firestore Schema

### `users/{uid}`

```
{
  uid:         string   // Firebase Auth UID
  name:        string   // Display name from Google
  email:       string   // Google email
  role:        string   // "employee" | "admin"
  avatar:      string   // Google profile photo URL
  customRole:  string   // Admin-assigned display badge (optional)
  bio:         string   // Self-written bio (optional)
  phone:       string   // Phone number (optional)
  skills:      string[] // Up to 10 skill tags
  socialLinks: object   // { github, linkedin, twitter, ... }
  department:  string   // Set by admin (optional)
  designation: string   // Set by admin (optional)
  fcmToken:    string   // FCM device token for push notifications
  createdAt:   Timestamp
  updatedAt:   Timestamp
}
```

### `tasks/{taskId}`

```
{
  title:           string
  description:     string
  module:          string   // One of the aerospace modules
  priority:        string   // "high" | "medium" | "low"
  status:          string   // "pending" | "in-progress" | "completed"
  progress:        number   // 0–100
  startDate:       Timestamp
  dueDate:         Timestamp
  assignedTo:      string[] // Array of assignee UIDs
  assignedBy:      string   // Admin UID
  createdBy:       string   // Creator UID
  isAdminTask:     boolean  // false = personal self-assigned task
  workPartners:    object[] // [{ uid, name, avatar, addedBy, addedByName, addedAt }]
  workPartnerUids: string[] // Flat UID array (used by Firestore security rules only)
  links:           object[] // [{ url, label }]
  attachments:     object[] // [{ url, name }]
  completionNote:  object   // { message, completedAt, completedBy }
  isExtended:      boolean  // true if due date was extended
  createdAt:       Timestamp
  updatedAt:       Timestamp
}
```

### `tasks/{taskId}/events/{eventId}`

```
{
  type:         string  // "commit" | "partner_added" | "status_changed" | "progress_updated"
  authorUid:    string
  authorName:   string
  authorAvatar: string
  message:      string
  metadata:     object  // Type-specific payload
  createdAt:    Timestamp
}
```

### `attendance/{userId}/records/{recordId}`

```
{
  date:      string    // "YYYY-MM-DD"
  punchIn:   Timestamp
  punchOut:  Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

## Security Model

Firestore security rules (`firestore.rules`) implement multi-layer access control:

### Key Security Functions

- **`isAuthenticated()`** — checks `request.auth != null`
- **`isEmailAllowed()`** — checks the `allowed_emails/{email}` document exists
- **`getEffectiveUid()`** — resolves secondary emails to primary UIDs via `user_email_map`
- **`isAdmin()`** — checks the user's `role` field in their Firestore profile

### Permission Matrix

| Collection | Employee | Admin |
|---|---|---|
| `users` | Read all; update own safe fields | Full CRUD |
| `tasks` | Read assigned/created; update progress/status on own | Full CRUD |
| `tasks/events` | Read/create if participant | Full CRUD |
| `announcements` | Read; update `isRead` only | Full CRUD |
| `notifications/{uid}/items` | Read/update/delete own | Create for any user |
| `attendance/{uid}/records` | Read/create/update own | Read all; delete any |
| `leaves` | Read own; create pending | Read all; update status |
| `candidates` | Read | Full CRUD |
| `performances` | Read own | Full CRUD |

## Deployment

### Vercel (Frontend + Serverless API)

The project is configured via `vercel.json` which rewrites all non-asset requests to `index.html` for SPA routing. The `/api/*` path routes to the serverless functions in the `api/` directory.

```bash
npx vercel --prod
```

Set `GEMINI_API_KEY` in your Vercel project's Environment Variables dashboard.

### Firebase Hosting (Alternative)

```bash
npm run build
npx firebase-tools deploy --only hosting
```

### Firebase Cloud Functions

Requires the **Blaze (pay-as-you-go)** Firebase plan.

```bash
npx firebase-tools deploy --only functions
```

Four Cloud Functions are deployed:

| Function | Trigger | Purpose |
|---|---|---|
| `onTaskCreate` | Firestore `tasks/{taskId}` onCreate | Push notification to assignees |
| `onTaskUpdate` | Firestore `tasks/{taskId}` onUpdate | Push notification on status change |
| `onAnnouncementCreate` | Firestore `announcements/{id}` onCreate | Push notification to all users |
| `onDueDateApproach` | Pub/Sub schedule (daily 09:00 ET) | Push notification for tasks due tomorrow |
