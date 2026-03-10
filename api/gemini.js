import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

export default async function handler(req, res) {
    // Add CORS headers for typical Vercel setup (optional but good practice)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Or strict to your domain
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Ensure process.env.GEMINI_API_KEY is configured in Vercel
    if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY server environment variable is missing.");
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    try {
        const { history, systemPrompt, newMessage } = req.body;

        if (!systemPrompt || !newMessage) {
            return res.status(400).json({ error: 'Missing required fields: systemPrompt or newMessage' });
        }

        const contents = [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: 'Understood. I am ready to help with your tasks.' }] },
            ...(history || []),
            { role: 'user', parts: [{ text: newMessage }] },
        ];

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: contents,
            config: {
                temperature: 0.7,
            }
        });

        return res.status(200).json({ reply: response.text });
    } catch (error) {
        console.error('Error generating AI content in Vercel function:', error);
        return res.status(500).json({ error: 'Failed to connect to the AI service' });
    }
}
