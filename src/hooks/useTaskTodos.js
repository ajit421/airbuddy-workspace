/**
 * useTaskTodos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Manages a real-time subscription to one task's todo list (the `todos`
 *   field on tasks/{taskId}). Handles loading state, error state, and cleanup.
 *
 * USAGE:
 *   const { todos, loading, error } = useTaskTodos(task);
 *
 * RULES:
 *   - Never imports from 'firebase/firestore' directly.
 *   - All Firestore access goes through todoService.subscribeToTaskTodos.
 *   - The subscription is torn down and restarted whenever the work item changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { subscribeToTaskTodos } from '../services/todoService';
import { workItemCollection, workItemId } from '../utils/workItemRef';

/**
 * Real-time hook for a task's todo checklist.
 *
 * @param {object | string | null | undefined} task
 *   The work item — a task or a projected roadmap milestone — or a bare task
 *   id. `null`/`undefined` is safe: the hook settles immediately with an empty
 *   list. The effect is keyed on the resolved collection+id rather than on the
 *   object itself, which is a fresh reference on every render and would
 *   otherwise tear down and rebuild the listener continuously.
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
export function useTaskTodos(task) {
  // Stable primitive key for the effect — see the note on @param above.
  const docPath = workItemId(task) ? `${workItemCollection(task)}/${workItemId(task)}` : null;
  const [todos, setTodos]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!docPath) {
      setTodos([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToTaskTodos(
      task,
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
  }, [docPath]);

  return { todos, loading, error };
}
