# API Reference

This document covers all service functions, context APIs, and custom hooks exposed by AirBuddy WorkSpace. Use this as a reference when building new features or extending existing ones.

## AuthContext

Import with: `import { useAuth } from './context/AuthContext'`

### Properties

| Property | Type | Description |
|---|---|---|
| `user` | `FirebaseUser \| null` | The raw Firebase Auth user object |
| `userProfile` | `Object \| null` | The Firestore user profile document |
| `effectiveUid` | `string \| null` | The resolved UID (handles secondary email mapping) |
| `isAdmin` | `boolean` | True if user has admin role AND not in employee preview mode |
| `realIsAdmin` | `boolean` | True if the user's actual role is admin (ignores preview toggle) |
| `isEmployeeView` | `boolean` | True when admin is previewing the employee perspective |
| `loading` | `boolean` | True while the auth state is being resolved |
| `googleAccessToken` | `string \| null` | Google OAuth access token for Calendar API calls |
| `authError` | `string \| null` | The current authentication error message, if any |

### Methods

| Method | Signature | Description |
|---|---|---|
| `signInWithGoogle` | `() => Promise<UserCredential>` | Opens Google OAuth popup and signs the user in |
| `signOut` | `() => Promise<void>` | Signs the user out and clears the session token |
| `refreshGoogleToken` | `() => Promise<string \| null>` | Re-opens the Google OAuth popup to get a fresh access token |
| `clearAuthError` | `() => void` | Clears the `authError` state |
| `toggleEmployeeView` | `() => void` | Toggles the admin's employee preview mode |

## TaskContext

Import with: `import { useTasks } from './context/TaskContext'`

### Properties

| Property | Type | Description |
|---|---|---|
| `tasks` | `Task[]` | The user's tasks (role-filtered, real-time) |
| `allTasks` | `Task[]` | All tasks in the system (admin only; same as `tasks` for admins) |
| `allUsers` | `Record<string, UserProfile>` | Map of UID → user profile for all registered users |
| `loading` | `boolean` | True while the initial task snapshot is loading |

### Methods

| Method | Signature | Description |
|---|---|---|
| `getTasksByStatus` | `(status: string) => Task[]` | Filters tasks by the given status string |
| `getUpcomingTasks` | `(days?: number) => Task[]` | Returns tasks due within `days` days (default: 7) |

## collaborationService

Import from: `import { ... } from './services/collaborationService'`

### `addWorkPartner(taskId, newPartner, addedByUser)`

Adds a work partner to a task. Atomically updates both `workPartners` (rich object array for UI) and `workPartnerUids` (flat string array for Firestore rules). Then posts a `partner_added` timeline event.

```javascript
await addWorkPartner(
  'task123',
  { uid: 'user456', name: 'Susanta Sethy', avatar: 'https://...' },
  { uid: 'user789', name: 'Yuvraj Singh', avatar: 'https://...' }
);
```

### `removeWorkPartner(taskId, partnerUid, currentWorkPartners)`

Removes a work partner by filtering both parallel arrays and writing the updated arrays back atomically.

### `postCommit(taskId, author, message, driveLink?, driveLinkLabel?)`

Posts a manual commit event to the task timeline. Throws if `message` is empty after trimming.

```javascript
await postCommit(
  'task123',
  { uid: 'user456', name: 'Susanta Sethy', avatar: 'https://...' },
  'Completed the UI integration and tested edge cases',
  'https://drive.google.com/file/...',
  'Test Report v2'
);
```

### `subscribeToTimeline(taskId, callback, onError?)`

Sets up a real-time Firestore listener on `tasks/{taskId}/events/` ordered by `createdAt` descending. Returns an unsubscribe function.

```javascript
const unsubscribe = subscribeToTimeline(
  'task123',
  (events) => setEvents(events),
  (err) => console.error(err)
);
// Call unsubscribe() in useEffect cleanup
```

### `checkCanAddPartner(task, currentUserUid)`

Pure synchronous check. Returns `true` if the current user is the task creator, an assignee, or an existing work partner.

### `recordStatusChange(taskId, author, fromStatus, toStatus)`

Posts a `status_changed` event to the timeline. Called automatically by the progress save flow in `TaskDetailModal`.

### `recordProgressUpdate(taskId, author, fromProgress, toProgress)`

Posts a `progress_updated` event if the delta is ≥ 10 percentage points (throttled to prevent noisy micro-updates).

## hrmsService

Import from: `import { ... } from './services/hrmsService'`

| Function | Description |
|---|---|
| `getAllEmployees()` | Fetches all documents from the `users` collection |
| `addEmployee(data)` | Creates a new user document with `role: "employee"` |
| `updateEmployee(uid, data)` | Merges provided fields into an existing user document |
| `deleteEmployee(uid)` | Hard-deletes a user document (does NOT delete the Firebase Auth account) |
| `recordPunch(uid)` | Toggles punch state for today — creates a punch-in or writes a punch-out |
| `getTodayAttendance(uid)` | Returns today's attendance record or `null` |
| `getAttendanceDateRange(uid, startDate, endDate)` | Returns attendance records between two YYYY-MM-DD strings |
| `getAllEmployeesAttendanceSummary(employees, startDate, endDate)` | Admin: parallel queries for all employees |
| `applyForLeave(data)` | Creates a new `pending` leave request |
| `getMyLeaves(uid)` | Returns all leave requests for a user |
| `getAllPendingLeaves()` | Admin: returns all leave requests with `status: "pending"` |
| `updateLeaveStatus(leaveId, status, reviewerUid)` | Admin: approves or rejects a leave request |
| `getCandidates()` | Returns all recruitment candidates sorted newest first |
| `addCandidate(data)` | Creates a new candidate in the `Applied` stage |
| `updateCandidateStatus(candidateId, newStatus)` | Moves a candidate to a new Kanban column |
| `getMyPerformanceReviews(uid)` | Returns all performance reviews for an employee |
| `getAllPerformanceReviews()` | Admin: returns all performance reviews |
| `addPerformanceReview(data)` | Admin: creates a new performance review |

## notificationService

Import from: `import { ... } from './services/notificationService'`

### `sendNotification(uid, title, message, type, eventLink?)`

Writes a notification document to `notifications/{uid}/items/` and fires an instant browser notification if permission is granted.

```javascript
await sendNotification(
  'user456',
  '🆕 New Task Assigned',
  '"Avionics Integration" has been assigned to you.',
  'task_assigned',
  'https://calendar.google.com/...'  // optional
);
```

### `notifyUsers(uids, senderUid, title, message, type)`

Sends the same notification to multiple users, automatically excluding the sender's UID to prevent self-notifications.

### `requestBrowserNotifPermission()`

Requests browser notification permission. Returns a boolean indicating whether permission was granted. Called automatically on sign-in.

## Custom Hooks

### `useNotifications()`

Manages real-time notification state. Subscribes to `notifications/{effectiveUid}/items/` limited to the 20 most recent items.

```javascript
const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();
```

### `useTaskTimeline(taskId)`

Subscribes to a task's collaboration timeline events in real-time.

```javascript
const { events, loading, error } = useTaskTimeline('task123');
```

### `useTeamMembers()`

Provides a real-time list of all team members with merged task statistics. Task stats are computed synchronously from `TaskContext` data — no extra Firestore reads.

```javascript
const { members, loading, error, refreshAttendance } = useTeamMembers();
// Call refreshAttendance(uid) lazily when a profile card is opened
```

## googleCalendarService

Import from: `import { addTaskToGoogleCalendar } from './services/googleCalendarService'`

### `addTaskToGoogleCalendar(accessToken, task, userName?)`

Creates an all-day Google Calendar event for a task using the Google Calendar REST API v3.

```javascript
const event = await addTaskToGoogleCalendar(
  googleAccessToken,
  task,
  'Susanta Sethy'
);
// Returns the created event object, or null on failure
// event.htmlLink contains the Google Calendar URL
```

The event includes priority-based color coding (Red for high, Yellow for medium, Teal for low) and reminders at 24 hours and 1 hour before the due date.
