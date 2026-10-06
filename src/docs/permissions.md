# Permissions

Admins can give an individual employee access to specific pages and actions, without making them an admin.

## Who can change permissions

Only an **admin** can. Open **Admin Panel > Permissions**. (The tab is hidden while you are in **Viewing as Employee** mode. Switch it off first.)

An employee can never change their own permissions or anyone else's, even one who has been given every permission listed below.

## Giving someone access

1. Go to **Admin Panel > Permissions**.
2. Click the employee.
3. Tick what they should have. You can also start from a **preset** (HR, Sales, Manager, None) or **copy** another employee's permissions.
4. Click **Save permissions**.

The change takes effect immediately. The employee does not need to sign out; the new links appear in their sidebar straight away.

Switch to **By permission** at the top of the tab to see, for each permission, which employees hold it.

## What each permission gives

| Permission | What the employee gets |
|---|---|
| Employee Directory | The **HRMS > Directory** page: everyone's profile, department and designation. Salary is **never** shown. |
| Attendance | **HRMS > Attendance** for the whole team. |
| Approve leaves | Everyone's leave requests on **HRMS > Leaves**, with Approve / Reject, plus everyone's leave on the Calendar. |
| Recruitment | **HRMS > Recruitment**: see candidates and move them between stages. |
| Performance | **HRMS > Performance**: read and write everyone's reviews. |
| Edit KPI | Add, edit and delete entries on the KPI pages. (Everyone can already *see* KPI.) |
| Edit roadmap | Create, edit and archive Company Roadmap milestones. |
| Assign tasks | **Admin Panel > Assign Task**. |
| See all tasks | Every task in the company on the Dashboard (with the employee filter), the Calendar, and **Admin Panel > Team Overview / Task Monitor**. |
| Post announcements | **Admin Panel > Announcements**. |

The Admin Panel appears in an employee's sidebar only when they have **Assign tasks**, **See all tasks** or **Post announcements**, and they see only those tabs.

## What stays admin-only

- Changing permissions, and making someone an admin.
- Salary.
- Editing or deleting employee records, deleting tasks, and **Sync now** for Google Calendar.
- Deleting other people's roadmap comments and attachments.

## Viewing as Employee

The **Preview as Employee** switch in the sidebar works as before. While it is on, an admin sees exactly what an employee with **no** extra permissions sees. It only changes the screen: your account still has admin rights in the database.

## How it is enforced

Permissions are checked in two places. The app hides pages and buttons, and the Firestore security rules refuse the data to anyone without the permission. So an employee cannot get around a hidden page by typing its URL or reading the database from the browser console.
