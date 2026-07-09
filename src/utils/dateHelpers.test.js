import { describe, it, expect, vi } from 'vitest';
import {
  toDate,
  formatDate,
  getDueDateLabel,
  getDueDateColor,
  daysUntil,
} from './dateHelpers';

describe('dateHelpers.js Unit Tests', () => {
  describe('toDate', () => {
    it('should parse a string to a Date object', () => {
      const d = toDate('2026-07-09');
      expect(d).toBeInstanceOf(Date);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(6); // 0-indexed July
      expect(d.getDate()).toBe(9);
    });

    it('should return null for empty/invalid inputs', () => {
      expect(toDate(null)).toBeNull();
      expect(toDate('')).toBeNull();
    });

    it('should return the same Date object if passed a Date object', () => {
      const original = new Date();
      expect(toDate(original)).toBe(original);
    });
  });

  describe('formatDate', () => {
    it('should format a valid date with the default format', () => {
      const d = new Date(2026, 6, 9); // July 9, 2026
      expect(formatDate(d)).toBe('Jul 9, 2026');
    });

    it('should return N/A for null or invalid dates', () => {
      expect(formatDate(null)).toBe('N/A');
      expect(formatDate('invalid-date')).toBe('N/A');
    });
  });

  describe('daysUntil and DueDate Helpers', () => {
    it('should calculate days until correctly', () => {
      // Mock system date
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 9, 12, 0, 0)); // July 9, 2026

      const target = new Date(2026, 6, 12, 12, 0, 0); // July 12, 2026
      expect(daysUntil(target)).toBe(3);

      vi.useRealTimers();
    });

    it('should assign correct label for overdue/due/future tasks', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 9, 12, 0, 0)); // July 9, 2026

      // Past
      expect(getDueDateLabel(new Date(2026, 6, 5), 'pending')).toBe('Overdue by 4d');
      expect(getDueDateLabel(new Date(2026, 6, 5), 'completed')).toBe('Completed');

      // Today
      expect(getDueDateLabel(new Date(2026, 6, 9), 'pending')).toBe('Due today');

      // Tomorrow
      expect(getDueDateLabel(new Date(2026, 6, 10), 'pending')).toBe('Due tomorrow');

      // Future
      expect(getDueDateLabel(new Date(2026, 6, 12), 'pending')).toBe('Due in 3 days');

      vi.useRealTimers();
    });

    it('should assign correct priority/due-date text colors', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 9, 12, 0, 0));

      // Overdue
      expect(getDueDateColor(new Date(2026, 6, 5), 'pending')).toBe('text-red-400');
      // Due tomorrow
      expect(getDueDateColor(new Date(2026, 6, 10), 'pending')).toBe('text-red-400');
      // Due in 3 days
      expect(getDueDateColor(new Date(2026, 6, 12), 'pending')).toBe('text-yellow-400');
      // Due in 5 days
      expect(getDueDateColor(new Date(2026, 6, 14), 'pending')).toBe('text-text-secondary');

      vi.useRealTimers();
    });
  });
});
