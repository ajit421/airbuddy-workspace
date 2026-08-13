/**
 * useTaskTodos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Manages a real-time subscription to one task's todo list (the `todos`
 *   field on tasks/{taskId}). Handles loading state, error state, and cleanup.
 *
 * USAGE:
 *   const { todos, loading, error } = useTaskTodos(task.id);
 *
 * RULES:
 *   - Never imports from 'firebase/firestore' directly.
 *   - All Firestore access goes through todoService.subscribeToTaskTodos.
 *   - The subscription is torn down and restarted whenever taskId changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { subscribeToTaskTodos } from '../services/todoService';

/**
 * Real-time hook for a task's todo checklist.
 *
 * @param {string | null | undefined} taskId
 *   Firestore task document ID. `null`/`undefined` is safe — the hook settles
 *   immediately with an empty list.
 *
 * @returns {{
 *   todos: Array<{
 *     id: string, text: string, done: boolean,
 *     createdAt: string, createdBy: string, createdByName: string,
 *     completedAt: string | null, completedBy: string | null, completedByName: string | null
 *   }>,
 *   loading: boolean,
 *   error: string | null
 * }}
 */
export function useTaskTodos(taskId) {
  const [todos, setTodos]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!taskId) {
      setTodos([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToTaskTodos(
      taskId,
      (next) => {
        setTodos(next);
        setLoading(false);
      },
      (err) => {
        console.error('[useTaskTodos] Snapshot error:', err);
        setError('Could not load the todo list. Please try again.');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [taskId]);

  return { todos, loading, error };
}
