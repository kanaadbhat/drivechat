# 🚀 DriveChat — Privacy-First Cross-Device Chat & File Sync

> **A lightweight, real-time chat app that uses your own Google Drive as authoritative file storage and Firestore for instant message sync across devices.**

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Setup Instructions](#setup-instructions)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Frontend Features](#frontend-features)
- [Security](#security)
- [Future Roadmap](#future-roadmap)

---

## ✨ Features

### Core Functionality

- **Single-User, Multi-Device Chat**: Send messages from any device (phone, laptop, tablet) and see them instantly on all others
- **Real-time Sync**: Powered by Firestore listeners—no manual refresh needed
- **File Sharing**: Upload files to your own Google Drive; metadata stored securely in Firestore
- **Smart Preview System**: Automatic thumbnail generation for images, poster frames for videos, waveforms for audio, and first-page previews for PDFs
- **Device Management**: Name your devices (e.g., "MyIphone", "MyLaptop") for clarity
- **Message Status**: See which device sent/received each message with timestamp
- **Ephemeral Messages**: Messages auto-delete after 24 hours (configurable by Pro users)
- **Star Messages**: Important messages can be starred to persist indefinitely
- **Rich Media Preview**: Inline preview for images, videos (with seeking), audio (with waveform), and documents
- **Categorized File Manager**: View files grouped by type (docs, images, videos, others)
- **Full-Text Search**: Search across all messages and file names
- **User Analytics**: Track message count, storage usage, last active time, and more

### Preview Generation System 🎨

- **Automatic Background Processing**: Previews generate asynchronously via BullMQ queue system
- **Multiple Thumbnail Sizes**: Responsive images (320px, 640px, 1280px) for optimal loading
- **Video Posters**: Extracts poster frame at 1 second + duration calculation
- **Audio Waveforms**: Visual waveform generation (640x120px) + duration display
- **PDF First Page**: Converts first page to PNG for quick preview
- **Office Document Support**: Exports DOCX/XLSX/PPTX to PDF, then extracts first page
- **Drive-Stored**: All previews stored in user's Drive "DriveChat-previews" folder
- **Range Header Support**: Smooth video/audio seeking with HTTP 206 Partial Content
- **Smart Loading States**: Skeleton loaders while generating, error states on failure
- **Retry Logic**: 3 automatic retry attempts with exponential backoff

### Security & Privacy

- **Zero-Knowledge Architecture**: Developer cannot read user files
- **Google Drive Storage**: All files stored in your own Drive folder
- **Firestore Security Rules**: User can only read/write their own data
- **Clerk Authentication**: Secure session management and OAuth integration
- **Automatic Cleanup**: Backend removes expired messages and associated Drive files

---

## 🛠️ Tech Stack

### Frontend

- **React 19** — UI framework
- **Vite** — Lightning-fast build tool
- **Tailwind CSS 4** — Utility-first styling
- **Firebase SDK** — Firestore client + real-time listeners
- **Clerk** — Authentication & user management
- **React Router** — Client-side routing
- **Axios** — HTTP client for backend API calls
- **Zod** — Schema validation
- **Socket.io Client** — (Optional) for future real-time features

### Backend

- **Node.js + Express 5** — REST API server
- **Firebase Admin SDK** — Firestore operations with elevated privileges
- **Google Drive API** — File upload/download/delete
- **Clerk SDK** — Token verification and session management
- **BullMQ + Redis** — Background job processing for preview generation
- **Sharp** — High-performance image thumbnail generation
- **FFmpeg** — Video poster extraction and audio waveform generation
- **PDF-Poppler** — PDF to image conversion
- **Cron Jobs** — Scheduled cleanup of expired messages
- **Morgan** — HTTP request logging
- **CORS** — Cross-origin resource sharing
- **Dotenv** — Environment variable management

### Database & Storage

- **Firestore** — NoSQL database for message metadata and user profiles
- **Google Drive** — User-owned file storage
- **Clerk** — User directory and authentication

### DevOps & Quality

- **ESLint + Prettier** — Code quality and formatting
- **Husky + Lint-staged** — Pre-commit hooks
- **Commitlint** — Conventional commit messages

---

## 🚀 Quick Start

> **For complete setup guide with two development options, see [Docs/DEVELOPMENT_GUIDE.md](./Docs/DEVELOPMENT_GUIDE.md)**

### Prerequisites

- Node.js 20+
- npm or yarn
- Redis (local or Docker)
- Google account (for Drive API)
- Firebase project
- Clerk project

### Installation (5 minutes)

1. **Clone the repository**

   ```bash
   git clone https://github.com/kanaadbhat/drivechat.git
   cd drivechat
   ```

2. **Start Redis** (required for preview generation)

   ```powershell
   # Quick start script (Windows):
   .\start-redis.ps1

   # OR manually:
   # Docker (recommended):
   docker run -d --name drivechat-redis -p 6379:6379 --restart unless-stopped redis:latest

   # WSL2:
   wsl sudo service redis-server start

   # Verify:
   redis-cli ping  # Should return: PONG
   ```

   **📖 [Full Redis setup guide](./Docs/REDIS_SETUP.md)**

3. **Install dependencies**

   ```bash
   npm install
   cd backend && npm install && cd ../frontend && npm install && cd ..
   ```

4. **Configure environment variables**

   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your Clerk, Firebase, and Google OAuth credentials
   cd ..
   ```

5. **Start the app**

   ```bash
   npm run start
   ```

   - Backend: http://localhost:5000
   - Frontend: http://localhost:5173

### Alternative: Docker-based Development

```bash
# Start all services (Redis, Backend, Frontend) in Docker
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

**📖 [See DEVELOPMENT_GUIDE.md for detailed instructions](./Docs/DEVELOPMENT_GUIDE.md)**

---

## 📁 Project Structure

```
syncit/
├── backend/                    # Node.js + Express backend
│   ├── src/
│   │   ├── index.js           # Entry point
│   │   ├── config/            # Configuration files
│   │   ├── middleware/        # Express middleware
│   │   ├── routes/            # API routes
│   │   ├── controllers/       # Route handlers
│   │   ├── services/          # Business logic
│   │   ├── utils/             # Helper functions
│   │   └── cron/              # Scheduled jobs
│   ├── .env.example           # Example env vars
│   └── package.json
│
├── frontend/                   # React + Vite frontend
│   ├── src/
│   │   ├── main.jsx           # Entry point
│   │   ├── App.jsx            # Root component
│   │   ├── pages/             # Page components
│   │   ├── components/        # Reusable components
│   │   ├── services/          # API & Firebase services
│   │   ├── hooks/             # Custom React hooks
│   │   ├── context/           # Context API providers
│   │   ├── utils/             # Helper functions
│   │   └── styles/            # Global styles
│   ├── .env.example           # Example env vars
│   └── package.json
│
├── .eslintrc.json             # ESLint config (v9 flat format)
├── .prettierrc                # Prettier config
├── commitlint.config.cjs      # Commitlint config
├── eslint.config.js           # Root ESLint config
├── package.json               # Root package.json
├── PROJECT_ARCHITECTURE.md    # Detailed architecture
└── README.md                  # This file
```

---

## 🏗️ Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────┐
│       React Frontend (Vite + Tailwind)       │
│  - Chat UI (bubbles, device labels)          │
│  - File Manager (categorized)                │
│  - Profile & Device Management               │
│  - Search & Message History                  │
└────────────────┬─────────────────────────────┘
                 │
         ┌───────┴─────────────────────┐
         │                             │
    ┌────▼──────────┐        ┌────────▼────────┐
    │   Firestore   │        │  Google Drive   │
    │ (Metadata &   │        │   (File Blob)   │
    │  Chat Data)   │        │                 │
    └───────────────┘        └─────────────────┘
         ▲
         │
    ┌────┴──────────────────────────────┐
    │  Express Backend (Node.js)         │
    │  - REST API                        │
    │  - Firestore Admin SDK             │
    │  - Google Drive API                │
    │  - Cleanup Cron Jobs               │
    │  - Auth Verification (Clerk)       │
    └────────────────────────────────────┘
```

### Data Flow

**Sending a Message:**

```
User types → Click Send → Frontend writes to Firestore →
Firestore listener triggers on all devices → UI updates in real-time
```

**Uploading a File:**

```
User selects file → Frontend uploads to Google Drive →
Backend returns Drive fileId → Frontend writes metadata to Firestore →
All devices see file message with preview
```

**Auto-Delete (Cleanup):**

```
Backend starts → Scans for expired messages →
Deletes Drive file (if file message) → Deletes Firestore doc →
Analytics updated
```

---

## 🔧 Setup Instructions

### 1. Firebase / Firestore Setup

1. Create a Firebase project at [firebase.google.com](https://firebase.google.com)
2. Enable Firestore Database (start in test mode for development)
3. Go to **Project Settings → Service Accounts**
4. Click **Generate New Private Key** and save the JSON file
5. Extract these values for `.env`:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_PRIVATE_KEY` (from the JSON)
   - `FIREBASE_CLIENT_EMAIL`

### 2. Clerk Setup

1. Create a Clerk account at [clerk.com](https://clerk.com)
2. Create a new application
3. Go to **Credentials** and copy:
   - `CLERK_SECRET_KEY`
   - `CLERK_PUBLISHABLE_KEY`
4. In Clerk dashboard, configure Google OAuth

### 3. Google OAuth & Drive API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable **Google Drive API**
4. Go to **Credentials → Create OAuth 2.0 Client ID**
5. Set authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
6. Copy:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

### 4. Firestore Security Rules

Add these rules to your Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }

    match /users/{uid}/messages/{msgId} {
      allow read, write: if request.auth.uid == uid;
    }
  }
}
```

---

## 🔑 Environment Variables

### Backend (`.env`)

```env
# === Clerk ===
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...

# === Firebase / Firestore ===
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@appspot.gserviceaccount.com

# === Google OAuth ===
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:5000/api/auth/google/callback

# === Server ===
NODE_ENV=development
PORT=5000
LOG_LEVEL=debug
```

### Frontend (`.env.local`)

```env
# === Clerk ===
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...

# === Firebase ===
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_APP_ID=...

# === Google OAuth ===
VITE_GOOGLE_CLIENT_ID=....apps.googleusercontent.com

# === Backend ===
VITE_BACKEND_URL=http://localhost:5000
```

---

## 📡 API Reference

### Authentication

#### Google OAuth Callback

```
POST /api/auth/google/callback
Body: { code: "...", state: "..." }
Response: { token, user }
```

### Messages

#### Get All Messages

```
GET /api/messages
Headers: { Authorization: "Bearer <clerk-token>" }
Response: [{ id, type, text, fileId, timestamp, expiresAt, starred, ... }]
```

#### Create Message

```
POST /api/messages
Headers: { Authorization: "Bearer <clerk-token>" }
Body: { type: "text", text: "...", deviceId: "...", expiresAt: "..." }
Response: { id, timestamp, ... }
```

#### Update Message (Star)

```
PATCH /api/messages/:messageId
Headers: { Authorization: "Bearer <clerk-token>" }
Body: { starred: true }
Response: { id, starred, ... }
```

#### Delete Message

```
DELETE /api/messages/:messageId
Headers: { Authorization: "Bearer <clerk-token>" }
Response: { success: true }
```

### Files

#### Upload File to Drive

```
POST /api/files/upload
Headers: { Authorization: "Bearer <clerk-token>" }
Body: FormData { file, deviceId }
Response: { fileId, fileName, fileSize, mimeType, previewUrl }
```

#### Delete File from Drive

```
DELETE /api/files/:fileId
Headers: { Authorization: "Bearer <clerk-token>" }
Response: { success: true }
```

### Users

#### Get User Profile

```
GET /api/users/me
Headers: { Authorization: "Bearer <clerk-token>" }
Response: { email, name, isPro, devices, createdAt, ... }
```

#### Update User Profile

```
PATCH /api/users/me
Headers: { Authorization: "Bearer <clerk-token>" }
Body: { name, isPro, ... }
Response: { email, name, ... }
```

#### Get/Create Device

```
POST /api/users/devices
Headers: { Authorization: "Bearer <clerk-token>" }
Body: { name: "MyIphone", type: "mobile" }
Response: { deviceId, name, type, createdAt }
```

#### Rename Device

```
PATCH /api/users/devices/:deviceId
Headers: { Authorization: "Bearer <clerk-token>" }
Body: { name: "New Device Name" }
Response: { deviceId, name, ... }
```

---

## 💻 Frontend Features

### Pages

1. **LoginPage** — Clerk OAuth login flow
2. **ChatPage** — Main chat interface with real-time messages
3. **FileManagerPage** — Categorized file browser
4. **ProfilePage** — User profile, device management, analytics
5. **SearchPage** — Full-text search across messages

### Components

- **ChatBox** — Main chat display with message bubbles
- **MessageBubble** — Individual message (text/file) with device label
- **FileUploader** — Drag-and-drop file upload
- **FilePreview** — Inline preview for images/videos
- **DeviceBar** — Show sender device name and timestamp
- **FileManager** — Categorized file view
- **DeviceManager** — Create, rename, delete devices
- **SearchBox** — Message search with filters

### Hooks

- `useMessages()` — Firestore real-time listener for messages
- `useUser()` — Fetch and update user profile
- `useSearch()` — Search messages by text, type, date
- `useAuth()` — Clerk authentication state

---

## 🔒 Security

### Authentication

- **Clerk** handles user authentication and session tokens
- All API requests require valid Clerk Bearer token
- Frontend uses `useAuth()` hook for token management

### Authorization

- Firestore Security Rules enforce user-level data isolation
- Users can only read/write their own messages and devices
- Backend verifies `request.auth.uid` matches user ID

### Data Privacy

- **No server-side storage of message content** — only metadata in Firestore
- **Files stored in user's Google Drive** — developer never accesses file contents
- **Auto-delete functionality** — expired messages removed automatically
- **Encrypted tokens** — refresh tokens stored encrypted (if using server-side OAuth)

### File Security

- Files uploaded to `DriveChat/{uid}/` folder in user's Drive
- Download links only provided after backend verification
- No public sharing by default

---

## 🚀 Deployment

### Backend Deployment (Recommended: Vercel, Fly.io, or Render)

1. Push code to GitHub
2. Connect repo to hosting platform
3. Set environment variables in platform dashboard
4. Deploy!

Example (Vercel):

```bash
vercel deploy
```

### Frontend Deployment (Recommended: Vercel, Netlify)

1. Build the frontend:

   ```bash
   cd frontend
   npm run build
   ```

2. Deploy the `dist/` folder:
   ```bash
   vercel deploy --prod
   ```

### Database (Firestore)

- Firestore is fully managed by Google — no deployment needed
- Use Firestore console to monitor usage and adjust pricing

---

## 🛣️ Future Roadmap

### Phase 1: MVP (Current)

- ✅ Chat & real-time sync
- ✅ File upload & preview
- ✅ Device management
- ✅ Auto-delete & star messages
- ✅ Search

### Phase 2: Enhancement

- [ ] Mobile app (React Native)
- [ ] Push notifications
- [ ] Message reactions & emoji
- [ ] Voice/video calling
- [ ] AI-powered summarization (Gemini)

### Phase 3: Monetization

- [ ] Pro membership (extended expiry, larger storage)
- [ ] Stripe/PayPal integration
- [ ] Usage analytics dashboard
- [ ] Premium features (AI summary, backup)

### Phase 4: Enterprise

- [ ] End-to-end encryption
- [ ] Backup & export features
- [ ] Admin dashboard
- [ ] API for third-party integrations
- [ ] Multi-workspace support

---

## 📚 Resources

### Official Documentation

- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Google Drive API](https://developers.google.com/drive/api)
- [Clerk Documentation](https://clerk.com/docs)
- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Documentation](https://redis.io/docs/)

### DriveChat Documentation

- **[Quick Start Guide](./Docs/QUICK_START_PREVIEW.md)** - Get up and running in 5 minutes
- **[Redis Setup Guide](./Docs/REDIS_SETUP.md)** - Detailed Redis installation for all platforms
- **[Preview System Architecture](./Docs/PREVIEW_SYSTEM.md)** - Complete technical documentation
- **[Preview API Reference](./Docs/PREVIEW_API_REFERENCE.md)** - Frontend integration examples
- **[Development Guide](./Docs/DEVELOPMENT_GUIDE.md)** - Full development setup
- **[Project Architecture](./Docs/PROJECT_ARCHITECTURE.md)** - System architecture overview

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat(chat): add emoji support'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🎯 Quick Start Checklist

- [ ] Clone the repo
- [ ] Install dependencies
- [ ] Set up Firebase project
- [ ] Set up Clerk
- [ ] Configure Google OAuth
- [ ] Add environment variables
- [ ] Run `npm run start`
- [ ] Open `http://localhost:5173`
- [ ] Log in and start chatting!

---

**Built with ❤️ by [Your Name]**
