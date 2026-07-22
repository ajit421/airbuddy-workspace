/**
 * Google Calendar Service
 * ─────────────────────────────────────────────────────────────────
 * Uses the Google Calendar REST API v3 to create/update events
 * directly from the user's access token obtained during Google Sign-In.
 *
 * The app already requests the `calendar` scope via:
 *   googleProvider.addScope('https://www.googleapis.com/auth/calendar')
 *
 * The access token is stored in AuthContext and passed here.
 * ─────────────────────────────────────────────────────────────────
 */

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/**
 * Create a Google Calendar event for a task.
 *
 * @param {string} accessToken  - Google OAuth access token
 * @param {object} task         - Task object with title, description, dueDate, startDate
 * @param {string} userName     - Name of the person the event is for
 * @returns {Promise<object|null>}  The created event, or null on failure
 */
export const addTaskToGoogleCalendar = async (accessToken, task, userName = '') => {
    if (!accessToken) {
        console.warn('Google Calendar: No access token — skipping calendar sync.');
        return null;
    }

    try {
        // Determine event dates
        const startDate = task.startDate?.toDate
            ? task.startDate.toDate()
            : task.startDate
                ? new Date(task.startDate)
                : new Date();

        const endDate = task.dueDate?.toDate
            ? task.dueDate.toDate()
            : task.dueDate
                ? new Date(task.dueDate)
                : new Date(startDate.getTime() + 86400000); // default: 1 day after start

        // Make end date inclusive (add 1 day for all-day events)
        const endDateInclusive = new Date(endDate);
        endDateInclusive.setDate(endDateInclusive.getDate() + 1);

        const event = {
            summary: `[AirBuddy] ${task.title}`,
            description: [
                task.description ? `📋 ${task.description}` : '',
                `📌 Module: ${task.module || 'General'}`,
                `🔴 Priority: ${task.priority || 'medium'}`,
                `👤 Assigned to: ${userName}`,
                '',
                '— Created by AirBuddy WorkSpace',
            ]
                .filter(Boolean)
                .join('\n'),
            start: {
                date: startDate.toISOString().split('T')[0], // YYYY-MM-DD (all-day event)
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            end: {
                date: endDateInclusive.toISOString().split('T')[0],
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            colorId: task.priority === 'high' ? '11' : task.priority === 'medium' ? '5' : '7', // Red / Yellow / Teal
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 60 * 24 }, // 1 day before
                    { method: 'popup', minutes: 60 },       // 1 hour before
                ],
            },
            source: {
                title: 'AirBuddy WorkSpace',
                url: window.location.origin,
            },
        };

        const response = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(event),
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            console.error('Google Calendar API error:', response.status, errBody);

            // Token expired or revoked
            if (response.status === 401) {
                console.warn('Google Calendar: Access token expired. User needs to re-login.');
            }
            return null;
        }

        const createdEvent = await response.json();
        console.log('✅ Google Calendar event created:', createdEvent.htmlLink);
        return createdEvent;
    } catch (err) {
        console.error('Google Calendar: Unexpected error:', err);
        return null;
    }
};

/**
 * Create a Google Calendar event for a roadmap milestone node.
 * Only called for depth-0 and depth-1 nodes (syncEligible flag enforced at call site).
 *
 * @param {string} accessToken  - Google OAuth access token
 * @param {object} node         - Roadmap node object with title, description, dueDate, startDate, status, priority, progress
 * @returns {Promise<object|null>}  The created event, or null on failure
 */
export const addMilestoneToGoogleCalendar = async (accessToken, node) => {
    if (!accessToken) {
        console.warn('Google Calendar: No access token — skipping milestone sync.');
        return null;
    }

    try {
        const startDate = node.startDate
            ? (node.startDate?.toDate ? node.startDate.toDate() : new Date(node.startDate))
            : (node.dueDate?.toDate ? node.dueDate.toDate() : new Date(node.dueDate));

        const endDate = node.dueDate
            ? (node.dueDate?.toDate ? node.dueDate.toDate() : new Date(node.dueDate))
            : new Date(startDate.getTime() + 86400000);

        // All-day events need end date exclusive (+1 day)
        const endDateInclusive = new Date(endDate);
        endDateInclusive.setDate(endDateInclusive.getDate() + 1);

        const depthLabel = node.depth === 0 ? 'Root Milestone' : 'Milestone';

        const event = {
            summary: `[AirBuddy Roadmap] ${node.title}`,
            description: [
                node.description ? `📋 ${node.description}` : '',
                `🗺️ Type: ${depthLabel}`,
                `📊 Status: ${node.status || 'pending'}`,
                `🔴 Priority: ${node.priority || 'medium'}`,
                `📈 Progress: ${node.progress ?? 0}%`,
                '',
                '— Created by AirBuddy WorkSpace Roadmap',
            ]
                .filter(Boolean)
                .join('\n'),
            start: {
                date: startDate.toISOString().split('T')[0],
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            end: {
                date: endDateInclusive.toISOString().split('T')[0],
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            // colorId '2' = Sage (green-grey) — distinct from task red/yellow/teal
            colorId: '2',
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 60 * 24 * 3 }, // 3 days before
                    { method: 'popup', minutes: 60 * 24 },      // 1 day before
                ],
            },
            source: {
                title: 'AirBuddy WorkSpace Roadmap',
                url: window.location.origin + '/roadmap',
            },
        };

        const response = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(event),
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            console.error('Google Calendar API error (milestone):', response.status, errBody);
            if (response.status === 401) {
                console.warn('Google Calendar: Access token expired. User needs to re-login.');
            }
            return null;
        }

        const createdEvent = await response.json();
        console.log('✅ Google Calendar milestone event created:', createdEvent.htmlLink);
        return createdEvent;
    } catch (err) {
        console.error('Google Calendar: Unexpected error (milestone):', err);
        return null;
    }
};

