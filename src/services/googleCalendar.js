/**
 * Google Calendar API Service
 * Manages syncing AirBuddy tasks with user's Google Calendar
 */

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_ID = 'primary';

let accessToken = null;

export const setGoogleAccessToken = (token) => {
  accessToken = token;
};

const apiRequest = async (endpoint, method = 'GET', body = null) => {
  if (!accessToken) {
    console.warn('Google Calendar: No access token available');
    return null;
  }
  const res = await fetch(`${CALENDAR_API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json();
    console.error('Google Calendar API error:', err);
    return null;
  }
  return res.json();
};

export const taskToCalendarEvent = (task) => ({
  summary: `[AirBuddy] ${task.title}`,
  description: `Module: ${task.module}\n${task.description || ''}`,
  start: {
    dateTime: task.startDate?.toDate
      ? task.startDate.toDate().toISOString()
      : new Date(task.startDate).toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  end: {
    dateTime: task.dueDate?.toDate
      ? task.dueDate.toDate().toISOString()
      : new Date(task.dueDate).toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  colorId: task.priority === 'high' ? '11' : task.priority === 'medium' ? '5' : '1',
  extendedProperties: {
    private: {
      airbuddyTaskId: task.taskId || task.id,
    },
  },
});

export const createCalendarEvent = async (task) => {
  const event = taskToCalendarEvent(task);
  const result = await apiRequest(`/calendars/${CALENDAR_ID}/events`, 'POST', event);
  return result?.id || null;
};

export const updateCalendarEvent = async (eventId, task) => {
  const event = taskToCalendarEvent(task);
  return apiRequest(`/calendars/${CALENDAR_ID}/events/${eventId}`, 'PUT', event);
};

export const deleteCalendarEvent = async (eventId) => {
  return apiRequest(`/calendars/${CALENDAR_ID}/events/${eventId}`, 'DELETE');
};

export const listUpcomingEvents = async (days = 30) => {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + days * 86400000).toISOString();
  const result = await apiRequest(
    `/calendars/${CALENDAR_ID}/events?timeMin=${now}&timeMax=${future}&singleEvents=true&orderBy=startTime`
  );
  return result?.items || [];
};
