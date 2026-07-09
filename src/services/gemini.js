import { formatDate } from '../utils/dateHelpers';
import { auth } from './firebase'; // CR-3: used to get a fresh ID token per request

const SYSTEM_PROMPT = `
You are the AI Assistant for AirBuddy Aerospace WorkSpace, a workforce management platform.
Your job is to help the user manage their tasks, understand their schedule, and provide guidance.

Here is the user's current task list (in JSON format):
{TASKS_JSON}

Current Date: {CURRENT_DATE}

Guidelines:
1. Be concise, helpful, and professional.
2. If the user asks about their tasks, refer to the provided JSON data.
3. If they ask to DO something (like create a task or update progress), gently explain that you are a read-only assistant right now, but they can do that through the app's UI (Dashboard or Admin Panel).
4. Use emojis occasionally for a friendly tone.
5. Format your responses in Markdown for readability (use bullet points, bold text, etc. where appropriate).
`;

/**
 * Send a conversation to Gemini (via Vercel Serverless Function)
 * @param {Array} history - Array of previous messages { role: 'user' | 'model', parts: [{ text: '...' }] }
 * @param {Array} currentTasks - The user's current tasks from Firestore
 * @param {String} newMessage - The latest user message
 * @returns {Promise<string>} The AI's response text
 */
export const sendMessage = async (history, currentTasks, newMessage) => {
  // Format tasks for the prompt
  const taskSummary = currentTasks.map(t => ({
    title: t.title,
    status: t.status,
    priority: t.priority,
    progress: t.progress,
    dueDate: t.dueDate ? formatDate(t.dueDate) : 'No date',
  }));

  const dynamicSystemPrompt = SYSTEM_PROMPT
    .replace('{TASKS_JSON}', JSON.stringify(taskSummary, null, 2))
    .replace('{CURRENT_DATE}', formatDate(new Date()));

  try {
    // CR-3: Obtain a fresh Firebase ID token to authenticate with the serverless function.
    // getIdToken() returns a cached token if still valid, or silently refreshes it.
    // This avoids storing the token in sessionStorage (HI-11 fix).
    const idToken = await auth.currentUser?.getIdToken() ?? '';

    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({
        history,
        systemPrompt: dynamicSystemPrompt,
        newMessage
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Server responded with an error');
    }

    const data = await response.json();
    return data.reply;
  } catch (error) {
    console.error('Gemini API Error (via Vercel):', error);
    throw new Error(error.message || 'Failed to connect to the AI API endpoint');
  }
};
