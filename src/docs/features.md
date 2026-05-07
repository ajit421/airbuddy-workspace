# Platform Features

AirBuddy WorkSpace is a comprehensive workforce management platform purpose-built for aerospace teams. Below is a complete reference for every feature available to both employees and administrators.

## Authentication & Access Control

### Google OAuth Sign-In

The platform uses Firebase Authentication with Google OAuth via a popup flow. On first sign-in, a user profile is automatically created in Firestore with the `employee` role.

> **Important:** Access is restricted to whitelisted emails. The admin must add your email to the `allowed_emails` collection in Firestore before you can log in.

### Role-Based Access Control

Two roles are supported across the platform:

| Role | Capabilities |
|---|---|
| `employee` | View assigned tasks, update progress, create personal tasks, view calendar, use AI assistant |
| `admin` | All employee capabilities plus task assignment, team monitoring, announcements, and HRMS management |

Route-level guards (`ProtectedRoute`, `AdminRoute`) enforce access at the React Router level, and Firestore security rules enforce it server-side.

## Employee Dashboard

The main dashboard provides a real-time overview of your work.

### Stat Cards

Four KPI cards at the top of the dashboard show filtered statistics:

- **Total Tasks** — all tasks in the selected timeframe
- **Completed** — tasks with `status: "completed"`
- **Pending** — tasks with `status: "pending"` or `"in-progress"`
- **Due This Week** — tasks due within the next 7 days

Use the **Month / Week / Day** toggle in the top-right to filter the timeframe.

### Charts

Three interactive charts visualize your workload:

- **Donut Chart** — task status distribution (Pending / In Progress / Completed)
- **Bar Chart** — task counts grouped by day of the week
- **Line Chart** — cumulative completion trend over the selected timeframe

### Task List & Status Tabs

All your tasks are listed below the charts, sortable by due date. Use the status tabs to filter:

- **All** — every task assigned to you
- **In Progress** — tasks with `status: "in-progress"`
- **Pending** — tasks not yet started
- **Completed** — finished tasks

Click any task card to open the full **Task Detail Modal**.

### Quick Check In / Out

A live clock widget at the top of the dashboard allows you to punch in and out of your shift. The widget reads from the `attendance/{uid}/records` Firestore subcollection and updates in real-time.

## Task Management

### Task Detail Modal

Clicking any task card opens a full-screen modal with:

- Title, description, module, priority, status, and progress
- Start and due dates with an **Extend Due Date** control (hover to reveal)
- A **progress slider** (0–100%) with a **Save Progress** button
- On reaching 100%, a **Completion Dialog** prompts for a commit message and optional attachment link
- A **Work Partners** section for collaborative tasks
- A **GitHub-style collaboration timeline** showing all commits, status changes, and partner additions
- An **"Add to My Google Calendar"** button for syncing to your personal calendar

### Creating Personal Tasks

Click **New Personal Task** on the dashboard to create a self-assigned task. These tasks have `isAdminTask: false` and appear with a **Self-Assigned** badge on their cards.

### Extending Due Dates

Hover over the due date in the Task Detail Modal to reveal an **Extend** button. This opens an inline date picker and sets `isExtended: true` on the task document. Extended tasks display a red **Extended** badge.

## Admin Panel

The Admin Panel (accessible at `/admin`) provides five management tabs.

### Team Overview

A table showing all team members with their task counts, work partner counts, completion rates, and visual progress bars.

### Assign Task

A form to create and assign tasks to one or more team members. On submission, the task is written to Firestore, synced to the admin's Google Calendar, and in-app notifications are sent to all assignees.

### Task Monitor

A searchable, filterable table of all tasks in the system with the ability to delete any task. Filter by status or search by title.

### Announcements

Create announcements with a title, message, priority level (Normal / Medium / High), and optional meeting link. All team members receive an in-app notification when a new announcement is posted.

### Employee Management

A card grid showing all registered users with their roles and join dates.

## Calendar

The Calendar view (`/calendar`) renders all your tasks as color-coded events:

- 🔴 **Red** — High priority
- 🟡 **Yellow/Orange** — Medium priority
- 🔵 **Blue** — Low priority

Supports **Month**, **Week**, **Day**, and **Agenda** views. Click any event to open the Task Detail Modal.

Toggle to **List View** for a sortable, filterable timeline table of all tasks with date range and status filters.

## Work Partners

The Work Partner system (`/work-partner`) enables real-time collaboration on tasks. A task appears here when:

- You are one of multiple assignees
- You have been added as a work partner by the task creator

### GitHub-Style Network Graph

Each collaborative task displays a visual network graph showing all contributors as branches. Events (progress updates, status changes, partner additions, commits) appear as nodes on each branch.

### Posting Commits

Inside the Task Detail Modal, use the **Post Commit** button to document your work. Commits can include a Google Drive link with a custom label. All commits appear in the real-time collaboration timeline.

## HRMS Module

The Human Resource Management System module provides five sub-sections accessible from the sidebar.

### Attendance Manager (`/hrms/attendance`)

- **Employee view**: A heatmap of attendance over a custom date range, plus a detailed log table showing punch-in/out times and total hours
- **Admin view**: An all-employees overview table with attendance rates and a drill-down modal for any individual

### Leave Management (`/hrms/leaves`)

Employees can apply for **Sick**, **Casual**, **Privilege**, **Compensatory Off**, **Emergency** leave with a start date, end date, and reason. Admins see a **Pending Approvals** table and can approve or reject requests with optimistic UI updates.

### Employee Directory (`/hrms/directory`)

A searchable, filterable table of all employees. Admins can add, edit, or delete employee records.

### Recruitment Board (`/hrms/recruitment`)

A Kanban board with four columns: **Applied → Interviewing → Hired → Rejected**. Admins can drag cards between columns (native HTML5 drag and drop with optimistic updates and rollback on error).

### Performance Dashboard (`/hrms/performance`)

- **Radar chart** showing skill scores for the latest review period
- **Bar chart** comparing goals assigned vs. goals completed across all periods
- Admins can add new performance reviews via a modal with skill sliders (1–5 scale) and goals input

## Team Members

The Team Members page (`/team`) shows all aerospace professionals in a responsive card grid. Each card displays:

- Avatar, name, designation, and department
- Task completion stats and attendance rate
- Social and professional links (GitHub, LinkedIn, Onshape, etc.)
- An **Edit Profile** button (visible to own profile and admins)

Admins can set a **Custom Role Label** (displayed as a violet badge) and update `department`, `designation`, and RBAC role.

## AI Assistant

A floating chat widget (bottom-right corner) powered by **Google Gemini 2.5 Flash Lite**. The assistant has context-awareness of your current task list and can help with prioritization, scheduling advice, and task questions.

> The AI is **read-only** — it can help you understand your work but will always direct you to the app UI for any mutations.

All API calls are routed through a Vercel Serverless Function (`/api/gemini`) so the API key never reaches the browser.

## Notifications

The bell icon in the navbar shows unread in-app notifications. Notifications are sent when:

- A task is assigned to you
- A task's status is updated
- A new announcement is posted
- A work partner is added to one of your tasks

Click any notification to mark it as read. Use **Mark all read** to clear the badge.
