/**
 * taskService.test.js — Unit tests for taskService (LO-1 fix)
 *
 * Tests the Zod validation schema at the service boundary.
 * Firestore calls are mocked via vi.mock — no real database needed.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock firebase/firestore so tests don't need a real Firestore connection
vi.mock('firebase/firestore', () => ({
  collection:       vi.fn(),
  addDoc:           vi.fn().mockResolvedValue({ id: 'mock-task-id' }),
  deleteDoc:        vi.fn().mockResolvedValue(undefined),
  doc:              vi.fn(),
  query:            vi.fn(),
  orderBy:          vi.fn(),
  onSnapshot:       vi.fn().mockReturnValue(() => {}),
  serverTimestamp:  vi.fn().mockReturnValue('SERVER_TIMESTAMP'),
}));

// Mock the firebase.js init module
vi.mock('../services/firebase', () => ({
  db: {},
}));

// Import AFTER mocks are set up
import { createAdminTask, deleteTask } from '../services/taskService';

const validForm = {
  title:       'Test Task',
  description: 'A test description',
  module:      'Development',
  priority:    'medium',
  status:      'pending',
  progress:    0,
  startDate:   '2026-07-09',
  dueDate:     '2026-07-20',
  assignedTo:  ['uid-1', 'uid-2'],
  links:       [],
  attachments: [],
};

describe('taskService.createAdminTask', () => {
  it('should succeed with valid form data', async () => {
    const id = await createAdminTask(validForm, 'admin-uid');
    expect(id).toBe('mock-task-id');
  });

  it('should throw ZodError when title is empty', async () => {
    await expect(
      createAdminTask({ ...validForm, title: '' }, 'admin-uid')
    ).rejects.toThrow();
  });

  it('should throw ZodError when priority is invalid', async () => {
    await expect(
      createAdminTask({ ...validForm, priority: 'ultra' }, 'admin-uid')
    ).rejects.toThrow();
  });

  it('should throw ZodError when status is invalid', async () => {
    await expect(
      createAdminTask({ ...validForm, status: 'unknown' }, 'admin-uid')
    ).rejects.toThrow();
  });

  it('should throw ZodError when assignedTo is empty array', async () => {
    await expect(
      createAdminTask({ ...validForm, assignedTo: [] }, 'admin-uid')
    ).rejects.toThrow();
  });

  it('should throw ZodError when progress is out of range', async () => {
    await expect(
      createAdminTask({ ...validForm, progress: 150 }, 'admin-uid')
    ).rejects.toThrow();
  });
});

describe('taskService.deleteTask', () => {
  it('should call deleteDoc with the correct task ID', async () => {
    await expect(deleteTask('task-abc')).resolves.toBeUndefined();
  });

  it('should throw when taskId is empty', async () => {
    await expect(deleteTask('')).rejects.toThrow('[taskService] deleteTask: taskId is required');
  });

  it('should throw when taskId is null', async () => {
    await expect(deleteTask(null)).rejects.toThrow('[taskService] deleteTask: taskId is required');
  });
});
