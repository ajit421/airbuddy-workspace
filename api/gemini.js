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

// ── HI-4 fix: Per-user rate limiting ─────────────────────────────────────────
// Simple in-memory sliding-window rate limiter.
// Serverless caveat: each cold start resets the map, but this still catches
// rapid-fire abuse within a warm instance. For production, swap to Upstash Redis.
const RATE_LIMIT_WINDOW_MS  = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX        = 30;        // max requests per window per user
const rateLimitMap = new Map();          // uid → { count, windowStart }

function isRateLimited(uid) {
    const now = Date.now();
    const entry = rateLimitMap.get(uid);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(uid, { count: 1, windowStart: now });
        return false;
    }

    entry.count += 1;
    return entry.count > RATE_LIMIT_MAX;
}

// Periodic cleanup of stale entries (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [uid, entry] of rateLimitMap) {
        if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
            rateLimitMap.delete(uid);
        }
    }
}, 5 * 60 * 1000);

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
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            req._authedUid = decodedToken.uid; // HI-4: stash UID for rate limiter
        } catch (e) {
            console.warn('[gemini] Rejected invalid ID token:', e.code || e.message);
            return res.status(403).json({ error: 'Invalid or expired authentication token.' });
        }

        // HI-4 fix: per-user rate limiting (30 req/min)
        if (isRateLimited(req._authedUid)) {
            console.warn(`[gemini] Rate limited user ${req._authedUid}`);
            return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
        }
    } else {
        // CR-4 fix: REJECT all requests when Firebase Admin is not configured.
        // Previously this fell through and served unauthenticated requests.
        console.error(
            '[gemini] 🔒 REJECTED: Firebase Admin SDK not initialised — ' +
            'FIREBASE_SERVICE_ACCOUNT is not configured. Set it in Vercel env vars.'
        );
        return res.status(503).json({
            error: 'Authentication service unavailable. Please contact the administrator.',
        });
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

        // ── HI-5 fix: Input validation — cap lengths and validate shapes ──────
        // Prevents prompt injection payloads from being unreasonably large and
        // rejects malformed history entries that could confuse the model.
        if (typeof newMessage !== 'string' || newMessage.length > 2000) {
            return res.status(400).json({ error: 'Message exceeds maximum length (2000 characters).' });
        }

        if (typeof systemPrompt !== 'string' || systemPrompt.length > 10000) {
            return res.status(400).json({ error: 'System prompt exceeds maximum length.' });
        }

        // Validate and truncate conversation history
        const safeHistory = [];
        if (Array.isArray(history)) {
            for (const entry of history.slice(-20)) { // HI-5: cap to last 20 turns
                if (!entry || typeof entry !== 'object') continue;
                if (!['user', 'model'].includes(entry.role)) continue;
                if (!Array.isArray(entry.parts) || entry.parts.length === 0) continue;
                // Only allow text parts, strip anything else
                const textParts = entry.parts
                    .filter(p => p && typeof p.text === 'string')
                    .map(p => ({ text: p.text.slice(0, 2000) }));
                if (textParts.length > 0) {
                    safeHistory.push({ role: entry.role, parts: textParts });
                }
            }
        }

        const contents = [
            { role: 'user',  parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: 'Understood. I am ready to help with your tasks.' }] },
            ...safeHistory,
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
