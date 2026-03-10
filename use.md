# AirBuddy Aerospace WorkSpace — Usage Guide

A practical guide for both **Employees** and **Admins**.

---

## 🔐 Signing In

1. Open `http://localhost:5173`
2. Click **Continue with Google** and sign in with your Google Workspace account
3. You're taken directly to your personal Dashboard

> Your profile is created automatically on first login. An admin must set `role: "admin"` in Firestore to grant admin access.

---

## 👤 Employee Guide

### Dashboard
- See your **stats at a glance**: Total, Completed, Pending tasks, and tasks due this week
- Three charts auto-update in real time:
  - **Donut** — task status distribution
  - **Bar** — tasks per day of week
  - **Line** — cumulative completions over 30 days
- Click any **Upcoming Task card** to open the detail view

### Task Detail
- Tap a task card anywhere in the app to open the modal
- If you are the task creator (not an admin task), drag the **progress slider** and click **Save Progress**
- Status auto-updates: `0%` → Pending, `1–99%` → In Progress, `100%` → Completed
- Click any **link** or **attachment** to open/download

### Calendar
- View tasks as events on a **Month / Week / Day** calendar
- Event colors = priority: 🔴 High · 🟡 Medium · 🔵 Low
- Switch to **List View** to search, filter by status or date range, and sort columns
- Click any event to open the Task Detail modal

### Work Partner
- Shows all tasks where **you share the assignment** with at least one colleague
- See co-worker avatar stacks and the shared task's progress

### Announcements
- Unread announcements show an **orange dot**
- Click an announcement to expand the full message (marks it as read automatically)
- If a **Join Meeting** button is visible, click it to open the meeting link

### AI Assistant 🤖
- Click the orange **🤖 button** (bottom-right corner) on any page
- The AI knows your full task list — ask anything:
  - *"What's my most urgent task?"*
  - *"Summarize what I need to do today"*
  - *"What should I prioritize for the week?"*
- Press **Enter** to send, **Shift+Enter** for a new line

### Notifications 🔔
- The **bell icon** in the top-right shows your unread count
- Click it to see recent notifications (task assignments, announcements)
- Click **Mark all read** to clear the badge

---

## 🛡️ Admin Guide

Navigate to **Admin Panel** via the sidebar (only visible to admins).

### Team Overview Tab
- See all team members in a table with their assigned task count, completion count, and completion rate

### Assign Task Tab
- Fill in task title, description, module, priority, start/due dates
- Select **one or more employees** from the grid (highlighted in orange when selected)
- Click **Assign Task** — the task saves to Firestore and appears on each assigned employee's dashboard immediately

### Task Monitor Tab
- View **all tasks** across the entire team
- Filter by status, search by title
- **Delete** any task directly from the table

### Announcements Tab
- Create new announcements with title, message, priority, and optional meeting link
- Broadcasts appear immediately in all employees' Announcements page
- Delete old announcements from the list below the form

### Employee Management Tab
- View all registered team profiles: name, role, email, join date

---

## 🔁 Common Flows

### Onboarding a new team member
1. Ask them to visit `http://localhost:5173` and sign in with Google
2. Their profile auto-creates in Firestore with `role: "employee"`
3. (For admin access) Open their Firestore user doc and change `role` to `"admin"`

### Creating a team task
1. Admin Panel → **Assign Task** tab
2. Fill out the form, select employees, set dates → **Assign Task**
3. Employees see it on Dashboard and Calendar instantly (real-time Firestore)

### Updating task progress (employee)
1. Click the task anywhere → Task Detail modal opens
2. Drag the progress slider → **Save Progress**
3. Status and progress update live for everyone

### Posting a meeting announcement
1. Admin Panel → **Announcements** tab
2. Enter title, message, set priority to **High**, paste the meeting URL
3. Click **Post Announcement** — team sees it with a **Join Meeting** button

---

## 🗂️ Project File Map

```
d:\Desktop\Work_flow\
├── src/
│   ├── services/         firebase.js · googleCalendar.js · anthropic.js
│   ├── context/          AuthContext.jsx · TaskContext.jsx
│   ├── hooks/            useNotifications.js
│   ├── utils/            dateHelpers.js · permissions.js
│   ├── components/
│   │   ├── shared/       Navbar · Sidebar · Modal · TaskCard · Charts
│   │   ├── Dashboard/    EmployeeDashboard
│   │   ├── Calendar/     CalendarView · ListView · TaskDetailModal
│   │   ├── WorkPartner/  WorkPartner
│   │   ├── Announcement/ AnnouncementList
│   │   ├── Admin/        AdminPanel (5 tabs)
│   │   ├── About/        AboutPage
│   │   └── AIAssistant/  AIAssistantButton + AIChatSidebar
│   ├── pages/            LoginPage · AppLayout
│   └── App.jsx           React Router + Protected Routes
├── functions/index.js    Cloud Functions stubs (FCM)
├── firestore.rules       Firestore security rules
├── .env                  API keys (do not commit to git)
├── setup.md              First-time setup guide
└── use.md                This file
```
