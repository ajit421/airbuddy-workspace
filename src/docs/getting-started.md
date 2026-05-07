# Getting Started

Welcome to the **AirBuddy Aerospace WorkSpace** documentation. This platform is the central workforce management hub for the AirBuddy Aerospace team — handling task assignment, real-time collaboration, calendar sync, HRMS, and AI assistance.

## Prerequisites

Before you begin, ensure you have the following:

- **Node.js 18+** installed on your machine
- A **Google Account** registered with the AirBuddy Aerospace organization
- Access to the [Firebase Console](https://console.firebase.google.com/) for the `airbuddy-workspace` project
- A **Google AI Studio API key** for the AI assistant feature

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/airbuddy/workspace.git
cd workspace
npm install
cd functions && npm install && cd ..
```

## Environment Variables

Create a `.env` file in the project root with the following variables:

```env
VITE_FIREBASE_API_KEY=api_key
VITE_FIREBASE_AUTH_DOMAIN=auth_domain
VITE_FIREBASE_PROJECT_ID=project_id
VITE_FIREBASE_STORAGE_BUCKET=storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=sender_id
VITE_FIREBASE_APP_ID=app_id
VITE_FIREBASE_MEASUREMENT_ID=measurement_id
VITE_FIREBASE_VAPID_KEY=vapid_key
VITE_GOOGLE_CLIENT_ID=client_id
VITE_GOOGLE_CALENDAR_API_KEY=calendar_api_key
```

For the Vercel Serverless Function, set this in your Vercel project dashboard:

```env
GEMINI_API_KEY=gemini_api_key
```

## Running the Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. The app will hot-reload as you make changes.

## Setting Up Your First Admin Account

By default, every new Google sign-in is assigned the `employee` role. To promote yourself to admin:

1. Sign in with your Google account at `/login`
2. Open the Firebase Console → **Firestore** → `users` collection
3. Find your document (matched by UID) and change `role` from `"employee"` to `"admin"`
4. Refresh the app — the Admin Panel will now appear in the sidebar

