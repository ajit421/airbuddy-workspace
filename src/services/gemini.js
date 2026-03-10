import { GoogleGenAI } from '@google/genai';
import { formatDate } from '../utils/dateHelpers';

// Initialize the Google Gen AI client with the API key from environment variables
const ai = new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY,
});

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
 * Send a conversation to Gemini and get a response
 * @param {Array} history - Array of previous messages { role: 'user' | 'model', parts: [{ text: '...' }] }
 * @param {Array} currentTasks - The user's current tasks from Firestore
 * @param {String} newMessage - The latest user message
 * @returns {Promise<string>} The AI's response text
 */
export const sendMessage = async (history, currentTasks, newMessage) => {
  if (!import.meta.env.VITE_GEMINI_API_KEY) {
    throw new Error('Gemini API key is missing. Please add VITE_GEMINI_API_KEY to your .env file.');
  }

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
    // We send the system prompt as the first message, and build history
    const contents = [
      { role: 'user', parts: [{ text: dynamicSystemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. I am ready to help with your tasks.' }] },
      ...history,
      { role: 'user', parts: [{ text: newMessage }] },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: contents,
      config: {
        temperature: 0.7,
      }
    });

    return response.text;
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw new Error(error.message || 'Failed to connect to the AI service');
  }
};
