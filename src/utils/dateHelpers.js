/**
 * Utility functions for date formatting and manipulation
 */
import { format, formatDistanceToNow, differenceInDays, isAfter, isBefore, startOfDay } from 'date-fns';

export const toDate = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

export const formatDate = (value, fmt = 'MMM d, yyyy') => {
  const d = toDate(value);
  if (!d || isNaN(d)) return 'N/A';
  return format(d, fmt);
};

export const formatDateTime = (value) => formatDate(value, 'MMM d, yyyy h:mm a');

export const timeFromNow = (value) => {
  const d = toDate(value);
  if (!d || isNaN(d)) return '';
  return formatDistanceToNow(d, { addSuffix: true });
};

export const daysUntil = (value) => {
  const d = toDate(value);
  if (!d) return null;
  return differenceInDays(startOfDay(d), startOfDay(new Date()));
};

export const isOverdue = (value) => {
  const d = toDate(value);
  if (!d) return false;
  return isBefore(d, new Date());
};

export const isUpcoming = (value, days = 7) => {
  const d = toDate(value);
  if (!d) return false;
  const cutoff = new Date(Date.now() + days * 86400000);
  return isAfter(d, new Date()) && isBefore(d, cutoff);
};

export const getDueDateLabel = (value, status) => {
  const days = daysUntil(value);
  if (days === null) return '';
  // Completed tasks should never show "Overdue"
  if (status === 'completed') {
    if (days >= 0) return `Due in ${days}d`;
    return `Completed`;
  }
  if (days < 0) return `Overdue by ${Math.abs(days)}d`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
};

export const getDueDateColor = (value, status) => {
  const days = daysUntil(value);
  if (days === null) return 'text-text-muted';
  // Completed tasks: show green if on-time, muted if past
  if (status === 'completed') {
    return days >= 0 ? 'text-green-400' : 'text-green-500';
  }
  if (days < 0) return 'text-red-400';
  if (days <= 1) return 'text-red-400';
  if (days <= 3) return 'text-yellow-400';
  return 'text-text-secondary';
};

// Generate day labels for the last N days
export const getLastNDays = (n = 7) => {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d;
  });
};

export const getLast30Days = () => getLastNDays(30);
export const getWeekDays = () => getLastNDays(7);
