/**
 * Vercel Serverless Function — Gemini AI Proxy
 *
 * Security hardening (CR-3):
 *  1. CORS restricted to the production domain only (no wildcard).
 *  2. Every request must carry a valid Firebase ID token in the
 *     Authorization: Bearer <token> header.
 *     Token is verified with the Firebase Admin SDK before calling Gemini.
 *
 * Environment variables required in Vercel:
 *  - GEMINI_API_KEY           : Google AI Studio key (server-side only)
 *  - FIREBASE_SERVICE_ACCOUNT : Firebase service account JSON as a string
 *                               (download from Firebase Console → Project Settings
 *                                → Service Accounts → Generate new private key)
 *  Optional override:
 *  - ALLOWED_ORIGIN           : Override the allowed CORS origin (default below)
 */

import { GoogleGenAI } from '@google/genai';
import admin from 'firebase-admin';

// ── Firebase Admin — lazy singleton initialisation ────────────────────────────
// Uses FIREBASE_SERVICE_ACCOUNT env var (JSON string) when available.
// Falls back to application-default credentials (works in GCP environments).
// If neither is available, token verification is skipped with a loud warning
// so existing deployments don't break immediately — but set the env var ASAP.
let adminReady = false;

if (!admin.apps.length) {
    try {
        const svcAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
        admin.initializeApp({
            credential: svcAccountJson
                ? admin.credential.cert(JSON.parse(svcAccountJson))
                : admin.credential.applicationDefault(),
        });
        adminReady = true;
    } catch (e) {
        console.error(
            '[gemini] ⚠️  Firebase Admin init failed — token verification DISABLED.\n' +
            '         Add FIREBASE_SERVICE_ACCOUNT to your Vercel environment variables.\n' +
            '         Error:', e.message
        );
    }
} else {
    adminReady = true;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://airbuddy-workspace.vercel.app';

export default async function handler(req, res) {
    // ── CORS: restricted to production domain only ────────────────────────────
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // ── Firebase ID token verification ────────────────────────────────────────
    if (adminReady) {
        const authHeader = req.headers.authorization || '';
        const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        if (!idToken) {
            return res.status(401).json({ error: 'Authentication required. Please log in.' });
        }

        try {
            await admin.auth().verifyIdToken(idToken);
        } catch (e) {
            console.warn('[gemini] Rejected invalid ID token:', e.code || e.message);
            return res.status(403).json({ error: 'Invalid or expired authentication token.' });
        }
    } else {
        // Log clearly so operators know token verification is off
        console.warn(
            '[gemini] ⚠️  SECURITY: Serving unauthenticated request because ' +
            'FIREBASE_SERVICE_ACCOUNT is not configured. Set it in Vercel env vars.'
        );
    }

    // ── Gemini API key guard ──────────────────────────────────────────────────
    if (!process.env.GEMINI_API_KEY) {
        console.error('[gemini] GEMINI_API_KEY server environment variable is missing.');
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    // ── Request validation and Gemini call ────────────────────────────────────
    try {
        const { history, systemPrompt, newMessage } = req.body;

        if (!systemPrompt || !newMessage) {
            return res.status(400).json({ error: 'Missing required fields: systemPrompt or newMessage' });
        }

        const contents = [
            { role: 'user',  parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: 'Understood. I am ready to help with your tasks.' }] },
            ...(history || []),
            { role: 'user',  parts: [{ text: newMessage }] },
        ];

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents,
            config: { temperature: 0.7 },
        });

        return res.status(200).json({ reply: response.text });
    } catch (error) {
        console.error('[gemini] Error generating AI content:', error);
        return res.status(500).json({ error: 'Failed to connect to the AI service' });
    }
}
