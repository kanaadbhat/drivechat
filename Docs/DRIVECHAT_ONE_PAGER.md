# DriveChat — Complete Overview

**A privacy-first, single-user multi-device chat and file sync application that uses your own Google Drive as authoritative file storage and Firestore for instant message sync across devices.**

---

## 📋 Table of Contents

1. [The Problem](#the-problem)
2. [Pain Points](#pain-points)
3. [The Solution](#the-solution)
4. [Core Features](#core-features)
5. [High-Level Architecture](#high-level-architecture)
6. [Technology Stack](#technology-stack)
7. [System Components](#system-components)
8. [Data Model](#data-model)
9. [Key Flows](#key-flows)
10. [API Overview](#api-overview)
11. [Real-Time Architecture (Socket.IO)](#real-time-architecture-socketio)
12. [Queue System (Redis + BullMQ)](#queue-system-redis--bullmq)
13. [Docker & DevOps](#docker--devops)
14. [Security & Privacy](#security--privacy)
15. [Scaling Strategy](#scaling-strategy)
16. [Cost & Performance](#cost--performance)
17. [Future Scope (AI & Beyond)](#future-scope-ai--beyond)
18. [Implementation Roadmap](#implementation-roadmap)

---

## The Problem

Modern users own multiple devices (laptop, phone, tablet) but moving content between them is frustratingly complex:

- **Quick note handoff**: Sending a reminder, link, or snippet from your phone to your laptop requires opening an app, finding yourself as a contact, sending, then switching devices
- **File transfers**: Screenshots, documents, or media files require multiple steps through cloud services or messaging apps
- **Context switching**: Using email or social DMs for personal transfers creates inbox clutter and privacy concerns
- **Platform lock-in**: Solutions like AirDrop are OS-specific; cross-platform alternatives store your data on third-party servers indefinitely

**The core problem**: There's no lightweight, real-time, privacy-first "personal inbox" for seamless cross-device communication.

---

## Pain Points

### 1. Friction & Complexity

- Too many steps for a simple personal handoff
- Manual file uploads/downloads to cloud storage
- Need to remember which service you used last time

### 2. Latency & Sync Issues

- Slow propagation across devices
- Manual refresh required in many apps
- Inconsistent notification delivery

### 3. Privacy & Ownership

- Third-party services store your messages indefinitely
- No control over data retention policies
- Files stored on external servers you don't control
- Developer access to your private content

### 4. Clutter & Organization

- Personal "note-to-self" threads become dumps
- No automatic cleanup of temporary shares
- Hard to find important items later
- Mixed personal and work contexts

### 5. Cost

- Premium features locked behind subscriptions
- Storage limits force you to delete or pay more
- Per-device licensing in some solutions

---

## The Solution

**DriveChat** is a real-time, ephemeral chat system designed for single-user, multi-device scenarios. It treats your Google Drive as the authoritative file store and Firestore as the real-time sync engine.

### Key Differentiators

1. **Your Storage**: Files live in your own Google Drive—you own the data
2. **Ephemeral by Default**: Messages auto-delete after 24 hours unless starred
3. **Real-Time Push**: Socket.IO ensures instant delivery without polling
4. **Zero-Knowledge**: Developers never see your file contents
5. **Rich Previews**: Inline media playback without leaving the chat
6. **Smart Queuing**: Background jobs handle cleanup and heavy operations

---

## Core Features

### Messaging

- ✅ Real-time text and file messages
- ✅ Auto-delete after 24 hours (configurable)
- ✅ Star important messages to keep indefinitely
- ✅ Edit text messages (marked as edited)
- ✅ Delete messages manually
- ✅ Client-side search across decrypted messages (Dexie)
- ✅ Filter by starred/category

### File Handling

- ✅ Upload any file type to your Google Drive
- ✅ Inline rich previews (images, videos, audio, PDFs)
- ✅ Backend streaming proxy to avoid CORS/CSP issues
- ✅ Download files with proper authentication
- ✅ Auto-categorization (image, video, audio, doc, etc.)
- ✅ Thumbnail generation via Google Drive

### Device Management

- ✅ Name your devices (e.g., "MyLaptop", "MyPhone")
- ✅ See which device sent each message
- ✅ Track device activity and analytics
- ✅ Register/update/delete devices via API

### User Experience

- ✅ Dark theme, modern UI with Tailwind CSS
- ✅ Right-click context menu (star, edit, copy, delete, view, download)
- ✅ Compact inline search with debouncing
- ✅ Visibility-aware polling fallback
- ✅ Loading states and error handling
- ✅ Responsive design for all screen sizes

### Security & Privacy

- ✅ Clerk authentication (JWT-based)
- ✅ Google OAuth for Drive access
- ✅ Firestore security rules (user-level isolation)
- ✅ Encrypted token storage
- ✅ No server-side content storage

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  • Clerk Auth (JWT)                                  │    │
│  │  • Chat UI (bubbles, previews, context menu)        │    │
│  │  • Socket.IO Client (real-time push)                │    │
│  │  • Axios (REST API)                                 │    │
│  │  • Tailwind CSS (dark theme)                        │    │
│  └─────────────────────────────────────────────────────┘    │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTPS + WebSocket (JWT auth)
┌────────────────────────▼─────────────────────────────────────┐
│                  Express Backend (Node.js)                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  • Clerk Token Verification                          │    │
│  │  • REST API (messages, files, users, admin)         │    │
│  │  • Socket.IO Server (per-user rooms)                │    │
│  │  • Google Drive API (file operations)               │    │
│  │  • Media Streaming Proxy (auth + CORS bypass)       │    │
│  │  • BullMQ Job Producers                             │    │
│  └─────────────────────────────────────────────────────┘    │
└───┬──────────────┬──────────────┬──────────────┬────────────┘
    │              │              │              │
    │              │              │              │
┌───▼──────┐  ┌───▼──────┐  ┌───▼──────┐  ┌───▼──────────┐
│Firestore │  │  Redis   │  │Google    │  │Socket.IO     │
│          │  │          │  │Drive API │  │Redis Adapter │
│• Messages│  │• Queues  │  │          │  │              │
│• Users   │  │• Jobs    │  │• Files   │  │• Pub/Sub     │
│• Devices │  │• Cache   │  │• Preview │  │• Scale Out   │
│• Tokens  │  │• Session │  │• Storage │  │              │
└──────────┘  └────┬─────┘  └──────────┘  └──────────────┘
                   │
              ┌────▼──────┐
              │  BullMQ   │
              │  Workers  │
              │           │
              │• Auto-del │
              │• Cleanup  │
              │• File Ops │
              │• AI Jobs  │
              └───────────┘
```

### Data Flow Summary

- **State/Metadata**: Firestore (messages, users, devices)
- **Files**: Google Drive (user's own storage)
- **Real-Time Push**: Socket.IO (rooms per user; Redis adapter for scale)
- **Async Work**: BullMQ + Redis (auto-delete, cleanup, file ops, future AI)
- **Media Access**: Backend proxy streams authenticated bytes from Drive

---

## Technology Stack

### Frontend Technologies

| Technology           | Purpose                    | Version |
| -------------------- | -------------------------- | ------- |
| **React**            | UI framework               | 19.x    |
| **Vite**             | Build tool & dev server    | Latest  |
| **Tailwind CSS**     | Utility-first styling      | 4.x     |
| **Clerk**            | Authentication & user mgmt | Latest  |
| **Axios**            | HTTP client for API        | Latest  |
| **Socket.IO Client** | Real-time WebSocket client | Latest  |
| **React Router**     | Client-side routing        | Latest  |
| **Lucide React**     | Icon library               | Latest  |
| **Day.js**           | Date/time formatting       | Latest  |

### Backend Technologies

| Technology             | Purpose                | Version |
| ---------------------- | ---------------------- | ------- |
| **Node.js**            | JavaScript runtime     | 18+     |
| **Express**            | Web framework          | 5.x     |
| **Firebase Admin SDK** | Firestore operations   | Latest  |
| **Google APIs**        | Drive API client       | Latest  |
| **Clerk SDK**          | Token verification     | Latest  |
| **Socket.IO**          | WebSocket server       | Latest  |
| **Redis**              | In-memory data store   | 7.x     |
| **BullMQ**             | Queue/job processing   | Latest  |
| **Multer**             | File upload middleware | Latest  |
| **Morgan**             | HTTP logging           | Latest  |
| **CORS**               | Cross-origin support   | Latest  |
| **Dotenv**             | Environment config     | Latest  |

### Infrastructure & DevOps

| Technology         | Purpose                           |
| ------------------ | --------------------------------- |
| **Docker**         | Containerization                  |
| **Docker Compose** | Multi-container orchestration     |
| **Redis**          | Queue backend + Socket.IO adapter |
| **Firestore**      | NoSQL database (managed)          |
| **Google Cloud**   | Drive API & OAuth                 |
| **ESLint**         | Code linting                      |
| **Prettier**       | Code formatting                   |
| **Husky**          | Git hooks                         |
| **Commitlint**     | Commit message validation         |

---

## System Components

### 1. Frontend (React + Vite)

#### Pages

- **LandingPage**: Hero, features, sign-in CTA
- **SignInPage**: Clerk authentication flow
- **ChatInterface**: Main chat with real-time messaging
- **StarredMessages**: File manager-like view of starred content

#### Key Components

- **ChatBox**: Message list with auto-scroll
- **MessageBubble**: Individual message (text/file) with device label
- **ContextMenu**: Right-click actions (star, edit, copy, delete, view, download)
- **MediaPreview**: Inline players for images/videos/audio
- **SearchBar**: Debounced search with compact UI
- **DeviceIndicator**: Shows sender device and timestamp

#### State Management

- **Local State**: React hooks (useState, useEffect)
- **Auth State**: Clerk's useAuth, useUser, useSession
- **Real-Time**: Socket.IO listeners update local state
- **API Calls**: Axios with Clerk token injection

### 2. Backend (Express)

#### Routes

- `/api/auth`: Google OAuth flow (url, callback, tokens, refresh)
- `/api/messages`: CRUD, search, category filters
- `/api/files`: Upload, download, preview, streaming proxy
- `/api/users`: Profile, devices, analytics
- `/api/admin`: Cleanup triggers, queue stats

#### Controllers

- **authController**: OAuth dance, token management
- **messageController**: Message CRUD, star/unstar, edit, delete
- **fileController**: Upload to Drive, metadata, streaming proxy
- **userController**: Profile and device management
- **adminController**: Manual cleanup, stats

#### Middleware

- **auth**: Validates Clerk JWT on protected routes
- **errorHandler**: Centralized error responses
- **multer**: Handles multipart file uploads

#### Services

- **cleanupService**: Expired message cleanup logic
- **fileService**: Drive API operations

### 3. Storage Layer

#### Firestore Collections

- **messages**: Message metadata (text, fileId, starred, timestamps)
- **users**: User profiles, devices, analytics, OAuth tokens
- **devices**: Device registry (optional separate collection)

#### Google Drive

- **Folder Structure**: `DriveChat/{userId}/`
- **Permissions**: Private by default; backend controls access
- **Metadata**: Stored in Firestore; files only in Drive

### 4. Real-Time Layer (Socket.IO)

#### Server-Side

- Initialized on Express server
- Authenticates via Clerk JWT
- Joins socket to room: `user:{userId}`
- Emits events: `message:created`, `message:updated`, `message:deleted`

#### Client-Side

- Connects with auth token from Clerk
- Subscribes to user-specific room
- Updates local state on events
- Reconnects automatically on disconnect

#### Redis Adapter (For Scaling)

- Enables multi-instance Socket.IO
- Shares pub/sub across backend nodes
- Configured via `REDIS_HOST` and `REDIS_PORT`

### 5. Queue System (BullMQ)

#### Queues

- **cleanupQueue**: Auto-delete expired messages
- **fileQueue**: Async file uploads/deletes
- **aiQueue**: Future AI operations (summarization, OCR, etc.)

#### Workers

- Process jobs in background
- Retry logic for failures
- Emit socket events on job completion

#### Job Types

- **Delayed**: Schedule message deletion after 24h
- **Recurring**: Periodic cleanup scans (every 6h)
- **Immediate**: Async file operations

---

## Data Model

### Message Document (Firestore)

```json
{
  "id": "msg_abc123",
  "userId": "user_xyz789",
  "deviceId": "device_laptop",
  "type": "text" | "file",
  "text": "Hello from laptop",
  "fileId": "1a2b3c4d5e6f",
  "fileName": "screenshot.png",
  "fileSize": 524288,
  "mimeType": "image/png",
  "fileCategory": "image",
  "webViewLink": "https://drive.google.com/file/d/.../view",
  "webContentLink": "https://drive.google.com/uc?id=...",
  "thumbnailLink": "https://lh3.googleusercontent.com/.../=s220",
  "starred": false,
  "edited": false,
  "createdAt": 1699286400000,
  "updatedAt": 1699286400000,
  "expiresAt": 1699372800000
}
```

### User Document (Firestore)

```json
{
  "id": "user_xyz789",
  "email": "user@example.com",
  "name": "John Doe",
  "isPro": false,
  "devices": [
    {
      "deviceId": "device_laptop",
      "name": "MyLaptop",
      "type": "desktop",
      "lastActive": 1699286400000
    }
  ],
  "analytics": {
    "messageCount": 142,
    "fileCount": 23,
    "storageUsed": 15728640,
    "lastActive": 1699286400000
  },
  "googleOAuth": {
    "accessToken": "encrypted_token",
    "refreshToken": "encrypted_token",
    "expiresAt": 1699290000000
  },
  "createdAt": 1699200000000,
  "updatedAt": 1699286400000
}
```

---

## Key Flows

### 1. Send Text Message

```
1. User types message in ChatInterface
2. Frontend: POST /api/messages { type: "text", text, deviceId }
3. Backend: Validates auth, writes to Firestore
4. Backend: Schedules auto-delete job (BullMQ, 24h delay)
5. Backend: Emits socket event message:created to user:{userId}
6. All connected clients: Update UI instantly via socket listener
```

### 2. Upload File

```
1. User selects file, clicks upload
2. Frontend: Shows loading spinner
3. Frontend: POST /api/files/upload (multipart form-data)
4. Backend: Streams to Google Drive (DriveChat/{userId}/)
5. Backend: Sets file permissions, generates links
6. Backend: Returns { fileId, fileName, size, mimeType, links }
7. Frontend: POST /api/messages { type: "file", fileId, ... }
8. Backend: Writes message metadata to Firestore
9. Backend: Schedules auto-delete job
10. Backend: Emits message:created event
11. All clients: Show file message with preview
```

### 3. Media Preview via Proxy

```
1. User sees file message, preview loads
2. Frontend: Requests authenticated URL from state cache
3. If not cached:
   a. Frontend: GET /api/files/:fileId/content?token=<clerk-jwt>
   b. Backend: Validates token, retrieves user's OAuth tokens
   c. Backend: Fetches file from Drive API
   d. Backend: Streams file bytes with proper headers
   e. Frontend: Caches authenticated URL by fileId
4. Frontend: Renders <img>, <video>, <audio> with cached URL
```

### 4. Star/Unstar Message

```
1. User clicks star icon (or context menu)
2. Frontend: PATCH /api/messages/:id { starred: !currentStarred }
3. Backend: Updates Firestore message.starred
4. Backend: If unstarred, reschedules delete job; if starred, cancels job
5. Backend: Emits message:updated event
6. All clients: Update star UI instantly
```

### 5. Auto-Delete Flow

```
1. Message created → BullMQ delayed job scheduled (24h)
2. Job executes after delay:
   a. Worker fetches message from Firestore
   b. If message.starred, abort deletion
   c. If message.type === "file", delete from Drive
   d. Delete Firestore document
   e. Emit message:deleted event
3. All clients: Remove message from UI
```

### 6. Real-Time Push (Socket.IO)

```
Server-Side:
1. Client connects to Socket.IO with Clerk JWT
2. Server verifies JWT, extracts userId
3. Server joins socket to room: user:{userId}
4. On message CRUD, server emits to room:
   - io.to(`user:${userId}`).emit('message:created', message)

Client-Side:
1. Frontend connects socket with auth token
2. Socket listens for events:
   - socket.on('message:created', (msg) => setMessages(prev => [...prev, msg]))
   - socket.on('message:updated', (msg) => updateMessageInState(msg))
   - socket.on('message:deleted', (id) => removeMessageFromState(id))
3. UI updates instantly without polling
```

---

## API Overview

### Authentication Endpoints

| Method | Endpoint                    | Description              | Auth |
| ------ | --------------------------- | ------------------------ | ---- |
| GET    | `/api/auth/google/url`      | Get OAuth URL            | ✅   |
| GET    | `/api/auth/google/callback` | OAuth callback           | ❌   |
| POST   | `/api/auth/google/tokens`   | Exchange code for tokens | ✅   |
| POST   | `/api/auth/google/refresh`  | Refresh access token     | ✅   |

### Message Endpoints

| Method | Endpoint                      | Description        | Auth |
| ------ | ----------------------------- | ------------------ | ---- |
| GET    | `/api/messages`               | Get all messages   | ✅   |
| GET    | `/api/messages/search?q=`     | Search messages    | ✅   |
| GET    | `/api/messages/category/:cat` | Filter by category | ✅   |
| GET    | `/api/messages/:id`           | Get single message | ✅   |
| POST   | `/api/messages`               | Create message     | ✅   |
| PATCH  | `/api/messages/:id`           | Update (star/edit) | ✅   |
| DELETE | `/api/messages/:id`           | Delete message     | ✅   |

### File Endpoints

| Method | Endpoint                     | Description       | Auth |
| ------ | ---------------------------- | ----------------- | ---- |
| POST   | `/api/files/upload`          | Upload to Drive   | ✅   |
| GET    | `/api/files/:fileId`         | Get metadata      | ✅   |
| GET    | `/api/files/:fileId/preview` | Get preview URL   | ✅   |
| GET    | `/api/files/:fileId/content` | Stream file bytes | ✅   |
| DELETE | `/api/files/:fileId`         | Delete from Drive | ✅   |

### User Endpoints

| Method | Endpoint                 | Description     | Auth |
| ------ | ------------------------ | --------------- | ---- |
| GET    | `/api/users/me`          | Get profile     | ✅   |
| PATCH  | `/api/users/me`          | Update profile  | ✅   |
| GET    | `/api/users/devices`     | List devices    | ✅   |
| POST   | `/api/users/devices`     | Register device | ✅   |
| PATCH  | `/api/users/devices/:id` | Update device   | ✅   |
| DELETE | `/api/users/devices/:id` | Delete device   | ✅   |
| GET    | `/api/users/analytics`   | Get stats       | ✅   |

### Admin Endpoints

| Method | Endpoint                   | Description      | Auth |
| ------ | -------------------------- | ---------------- | ---- |
| POST   | `/api/admin/cleanup`       | Trigger cleanup  | ✅   |
| GET    | `/api/admin/cleanup/stats` | Queue statistics | ✅   |
| GET    | `/api/admin/stats`         | System stats     | ✅   |

All ✅ endpoints require: `Authorization: Bearer <clerk-jwt>`

---

## Real-Time Architecture (Socket.IO)

### Why Socket.IO?

- **Push-based**: Server pushes updates instantly (no polling overhead)
- **Efficient**: Reduces Firestore read costs dramatically
- **Battle-tested**: Mature, widely adopted WebSocket library
- **Fallback**: Auto-falls back to long-polling if WebSockets blocked
- **Room-based**: Easy per-user isolation

### Implementation

#### Backend (Server)

```javascript
// src/index.js
const { Server } = require('socket.io');
const { verifyClerkToken } = require('./middleware/auth');

const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL },
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  const user = await verifyClerkToken(token);
  if (user) {
    socket.userId = user.id;
    next();
  } else {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  socket.join(`user:${userId}`);
  console.log(`User ${userId} connected`);

  socket.on('disconnect', () => {
    console.log(`User ${userId} disconnected`);
  });
});

// In message controller:
const createMessage = async (req, res) => {
  // ... create message in Firestore ...
  io.to(`user:${userId}`).emit('message:created', message);
  res.json(message);
};
```

#### Frontend (Client)

```javascript
// src/services/socket.js
import io from 'socket.io-client';
import { useAuth } from '@clerk/clerk-react';

const useSocket = () => {
  const { getToken } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const token = await getToken();
    const socketInstance = io(import.meta.env.VITE_BACKEND_URL, {
      auth: { token }
    });

    socketInstance.on('message:created', (message) => {
      setMessages(prev => [...prev, message].sort((a,b) => a.createdAt - b.createdAt));
    });

    socketInstance.on('message:updated', (message) => {
      setMessages(prev => prev.map(m => m.id === message.id ? message : m));
    });

    socketInstance.on('message:deleted', (id) => {
      setMessages(prev => prev.filter(m => m.id !== id));
    });

    setSocket(socketInstance);
    return () => socketInstance.disconnect();
  }, []);

  return socket;
};
```

### Scaling with Redis Adapter

```javascript
// Backend: src/config/redis.js
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const pubClient = createClient({ host: 'localhost', port: 6379 });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

**Result**: Multiple backend instances share socket state via Redis pub/sub. Load balancer can route any request to any node.

---

## Queue System (Redis + BullMQ)

### Why BullMQ?

- **Delayed Jobs**: Schedule auto-delete 24h in future
- **Recurring Jobs**: Periodic cleanup scans
- **Reliable**: Redis-backed, survives restarts
- **Retries**: Automatic retry on failure
- **Monitoring**: Built-in stats and UI (Bull Dashboard)

### Queue Configuration

#### Cleanup Queue (Auto-Delete)

```javascript
// src/queues/cleanupQueue.js
const { Queue, Worker } = require('bullmq');
const { deleteMessage } = require('../services/cleanupService');

const cleanupQueue = new Queue('cleanup', {
  connection: { host: 'localhost', port: 6379 },
});

const cleanupWorker = new Worker(
  'cleanup',
  async (job) => {
    const { messageId, userId } = job.data;
    await deleteMessage(messageId, userId);
  },
  {
    connection: { host: 'localhost', port: 6379 },
  }
);

module.exports = { cleanupQueue };
```

#### Scheduling Auto-Delete

```javascript
// When message created:
const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h
await cleanupQueue.add(
  'deleteMessage',
  { messageId: message.id, userId: message.userId },
  { delay: expiresAt - Date.now(), jobId: `delete_${message.id}` }
);

// When message starred:
await cleanupQueue.remove(`delete_${message.id}`);
```

#### File Queue (Async Operations)

```javascript
// Large file upload (async mode):
await fileQueue.add('uploadFile', {
  userId,
  deviceId,
  filePath,
  fileName,
});

// Worker processes in background:
fileWorker.on('completed', async (job) => {
  const { fileId, metadata } = job.returnvalue;
  io.to(`user:${userId}`).emit('file:uploaded', { fileId, metadata });
});
```

#### AI Queue (Future)

```javascript
// Summarize long thread:
await aiQueue.add('summarize', {
  userId, messageIds: [...],
  prompt: 'Summarize this conversation'
});

// OCR image:
await aiQueue.add('ocr', {
  userId, fileId: 'xyz', outputFormat: 'text'
});
```

### Queue Monitoring

```bash
# Get stats:
GET /api/admin/cleanup/stats

Response:
{
  "cleanup": {
    "waiting": 5,
    "active": 1,
    "completed": 234,
    "failed": 2
  },
  "file": { ... },
  "ai": { ... }
}
```

---

## Docker & DevOps

### Docker Compose Setup

```yaml
# docker-compose.yml
version: '3.9'

services:
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  backend:
    build: ./backend
    ports:
      - '5000:5000'
    environment:
      - NODE_ENV=production
      - PORT=5000
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - CLERK_SECRET_KEY=${CLERK_SECRET_KEY}
      - FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
      - FIREBASE_PRIVATE_KEY=${FIREBASE_PRIVATE_KEY}
      - FIREBASE_CLIENT_EMAIL=${FIREBASE_CLIENT_EMAIL}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
    depends_on:
      - redis
    volumes:
      - ./backend:/app
      - /app/node_modules

  frontend:
    build: ./frontend
    ports:
      - '5173:5173'
    environment:
      - VITE_BACKEND_URL=http://localhost:5000
      - VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
    depends_on:
      - backend
    volumes:
      - ./frontend:/app
      - /app/node_modules

volumes:
  redis_data:
```

### Quick Start Commands

```bash
# Start all services:
docker-compose up -d

# View logs:
docker-compose logs -f

# Stop all services:
docker-compose down

# Rebuild after code changes:
docker-compose up -d --build
```

### Backend Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 5000

CMD ["node", "src/index.js"]
```

### Frontend Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
```

### Environment Variables

**Backend (.env)**:

```env
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
REDIS_HOST=localhost
REDIS_PORT=6379
NODE_ENV=development
PORT=5000
LOG_LEVEL=debug
```

**Frontend (.env.local)**:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_BACKEND_URL=http://localhost:5000
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_APP_ID=...
VITE_GOOGLE_CLIENT_ID=...
```

---

## Security & Privacy

### Zero-Knowledge Architecture

1. **Files**: Stored exclusively in user's Google Drive
2. **No Backend Storage**: Server never saves file contents to disk
3. **Streaming Only**: Backend proxies bytes without inspection
4. **Encrypted Tokens**: OAuth tokens encrypted in Firestore

### Authentication Flow

```
1. User visits app → Clerk sign-in page
2. Clerk authenticates → Issues JWT
3. Frontend stores JWT → Passes in Authorization header
4. Backend verifies JWT → Extracts userId
5. All API calls gated by auth middleware
```

### Authorization

- **Firestore Rules**: Users can only read/write their own data
- **Backend Checks**: `req.auth.userId` must match resource owner
- **Socket.IO**: Only receives events for their own userId room

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /messages/{messageId} {
      allow read, write: if request.auth.uid == resource.data.userId;
    }
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
  }
}
```

### Data Encryption

- **At Rest**: Firestore and Drive encrypt by default
- **In Transit**: HTTPS for all API calls; WSS for sockets
- **Tokens**: OAuth tokens encrypted before storing in Firestore

### Rate Limiting (Future)

```javascript
// Rate limit per user:
const rateLimit = require('express-rate-limit');

app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    keyGenerator: (req) => req.auth.userId,
  })
);
```

---

## Scaling Strategy

### Horizontal Scaling

1. **Stateless Backend**: No session state in memory
2. **Socket.IO Redis Adapter**: Share socket connections across instances
3. **Load Balancer**: Distribute HTTP and WebSocket traffic
4. **Sticky Sessions**: Optional, but adapter removes requirement

### Vertical Scaling

- Increase backend instance size for CPU-bound operations (file streaming)
- Scale Redis for high queue throughput
- Firestore auto-scales (managed service)

### Queue Scalability

- **Multiple Workers**: Run separate worker processes for each queue
- **Priority Queues**: Separate urgent vs. batch jobs
- **Concurrency**: Configure concurrent job processing per worker

### Database Optimization

1. **Composite Indices**: Create Firestore indices for common queries
   - `starred == true ORDER BY createdAt DESC`
2. **Pagination**: Limit query results, use cursors for large datasets
3. **Caching**: Cache user profiles and device lists in Redis

### CDN & Caching

- **Static Assets**: Serve frontend via CDN (Vercel, Netlify)
- **Media Thumbnails**: Cache Drive thumbnails in CloudFlare
- **API Responses**: Cache-Control headers for read-heavy endpoints

---

## Cost & Performance

### Firestore Costs

**Before Real-Time (Polling)**:

- 10 devices polling every 5s = 120 reads/min/device = 1,200 reads/min
- Monthly: 1,200 × 60 × 24 × 30 = 51.8M reads ≈ $11.80/month

**After Real-Time (Socket.IO)**:

- Initial load: 10 reads
- Updates: Only on actual message events
- Monthly: ~1,000 reads ≈ $0.02/month

**Savings**: 99.8% reduction in Firestore reads!

### Google Drive Costs

- **Free Tier**: 15GB included per user
- **Quota**: User's own Drive quota (not yours)
- **API Limits**: 1,000 requests/100s (per user)

### Redis Costs

- **Self-Hosted**: Free (Docker or VPS)
- **Managed**: $10-50/month (AWS ElastiCache, Redis Cloud)
- **Memory**: 1-2GB sufficient for most use cases

### Backend Hosting

- **Free Tier**: Render, Fly.io (limited hours)
- **Production**: $7-20/month (single instance)
- **Scale**: Add instances as needed

### Frontend Hosting

- **Free**: Vercel, Netlify, Cloudflare Pages
- **Bandwidth**: Generous free tiers (100GB+)

### Total Cost Estimate

| Component       | Cost/Month |
| --------------- | ---------- |
| Firestore       | $0.02      |
| Redis (managed) | $10        |
| Backend (VPS)   | $10        |
| Frontend (CDN)  | $0         |
| **Total**       | **~$20**   |

---

## Future Scope (AI & Beyond)

### Phase 1: AI Summarization

**Goal**: Summarize long message threads

```javascript
// User clicks "Summarize Thread"
await aiQueue.add('summarize', {
  userId: 'user_xyz',
  messageIds: ['msg1', 'msg2', ...],
  model: 'gemini-pro'
});

// Worker processes:
const summary = await geminiAPI.summarize(messages);
await firestore.collection('summaries').add({
  userId, threadId, summary, createdAt: Date.now()
});
io.to(`user:${userId}`).emit('summary:ready', { threadId, summary });
```

### Phase 2: Semantic Search

**Goal**: Search by meaning, not just keywords

```javascript
// Generate embeddings on message create:
const embedding = await openai.embeddings.create({
  input: message.text,
  model: 'text-embedding-3-small'
});
await vectorDB.insert({ messageId, embedding });

// Search:
const queryEmbedding = await openai.embeddings.create({ input: query });
const results = await vectorDB.search(queryEmbedding, topK: 10);
```

### Phase 3: OCR & Transcription

**Goal**: Extract text from images and audio

```javascript
// OCR image:
await aiQueue.add('ocr', {
  userId,
  fileId: 'img_123',
  outputFormat: 'markdown',
});

// Worker:
const text = await googleVisionAPI.documentTextDetection(imageUrl);
await firestore.doc(`messages/${messageId}`).update({
  extractedText: text,
});

// Transcribe audio:
await aiQueue.add('transcribe', {
  userId,
  fileId: 'audio_456',
  language: 'en-US',
});

const transcript = await speechToText(audioUrl);
```

### Phase 4: Smart Previews

**Goal**: Content-aware previews

- **PDFs**: Extract first page as thumbnail
- **Videos**: Generate waveform or scene thumbnails
- **Docs**: Render preview in browser (Office Online API)

### Phase 5: Content Safety

**Goal**: Optional NSFW/toxicity detection

```javascript
// Before displaying image:
const safetyResult = await moderationAPI.check(imageUrl);
if (safetyResult.nsfw > 0.8) {
  showBlurredPreview();
}
```

### Phase 6: Automations

**Goal**: Rule-based actions

```javascript
// User creates rule:
{
  trigger: 'message.type === "file" && message.fileName.includes("invoice")',
  action: 'star'
}

// Backend processes:
if (evalRule(rule.trigger, message)) {
  await executeAction(rule.action, message);
}
```

### Phase 7: Mobile App

**Goal**: React Native client

- Push notifications via Firebase Cloud Messaging
- Offline support with local SQLite cache
- Native file picker and camera integration

### Phase 8: End-to-End Encryption

**Goal**: Per-device key encryption

```javascript
// Generate device keypair:
const { publicKey, privateKey } = await crypto.generateKey();

// Encrypt before upload:
const encryptedFile = await encrypt(file, recipientPublicKeys);
await uploadToDrive(encryptedFile);

// Decrypt after download:
const decryptedFile = await decrypt(encryptedFile, myPrivateKey);
```

### Phase 9: Pro Tier Features

- Extended expiry windows (7 days, 30 days, forever)
- Larger file size limits (100MB → 1GB)
- Priority queue processing
- Advanced analytics dashboard
- AI credits (summarization, OCR, etc.)

### AI Technology Options

| Feature       | Provider Options          | Cost                 |
| ------------- | ------------------------- | -------------------- |
| Summarization | Gemini Pro, GPT-4, Claude | $0.01-0.03/1K tokens |
| Embeddings    | OpenAI, Cohere            | $0.0001/1K tokens    |
| OCR           | Google Vision, Azure      | $1.50/1K images      |
| Transcription | Whisper, AssemblyAI       | $0.006/min           |
| Moderation    | OpenAI, Hive              | $0.002/image         |

---

## Implementation Roadmap

### ✅ Phase 1: MVP (Completed)

- [x] React frontend with Clerk auth
- [x] Express backend with Firestore
- [x] Google Drive file upload
- [x] Message CRUD operations
- [x] Star/unstar functionality
- [x] Search and filtering
- [x] Auto-delete scheduling
- [x] Device management

### 🚧 Phase 2: Real-Time (In Progress)

- [ ] Socket.IO server setup
- [ ] Authenticate sockets with Clerk JWT
- [ ] Per-user room isolation
- [ ] Emit events from message controllers
- [ ] Frontend socket client and listeners
- [ ] Remove/reduce polling
- [ ] Test multi-device sync

### 📋 Phase 3: Production Ready

- [ ] Redis adapter for Socket.IO
- [ ] Firestore composite indices
- [ ] Media proxy range request support
- [ ] Rate limiting
- [ ] Monitoring & logging (Sentry, LogRocket)
- [ ] Docker production configs
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Load testing

### 🔮 Phase 4: Advanced Features

- [ ] Mobile app (React Native)
- [ ] Push notifications
- [ ] Message reactions & emojis
- [ ] Voice messages
- [ ] Video call integration (WebRTC)
- [ ] Backup & export tools

### 🤖 Phase 5: AI Integration

- [ ] AI queue and workers
- [ ] Gemini/GPT integration
- [ ] Thread summarization
- [ ] OCR for images
- [ ] Audio transcription
- [ ] Semantic search with vector DB
- [ ] Content safety checks

### 💰 Phase 6: Monetization

- [ ] Pro membership system
- [ ] Stripe/PayPal integration
- [ ] Usage analytics dashboard
- [ ] Extended retention policies
- [ ] Larger file limits
- [ ] Premium AI features

---

## Quick Reference

### Start Development

```bash
# Terminal 1: Start Redis
docker run -d -p 6379:6379 redis

# Terminal 2: Start Backend
cd backend
npm install
npm run dev

# Terminal 3: Start Frontend
cd frontend
npm install
npm run dev
```

### Docker Development

```bash
# Start all services:
docker-compose up -d

# View logs:
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop all:
docker-compose down
```

### Key URLs

- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Health Check: http://localhost:5000/health
- Redis: localhost:6379

### Essential Commands

```bash
# Backend:
npm run dev          # Dev with nodemon
npm start            # Production
npm test             # Run tests
npm run lint         # Lint code

# Frontend:
npm run dev          # Dev server
npm run build        # Production build
npm run preview      # Preview build
npm run lint         # Lint code

# Docker:
docker-compose up -d --build  # Rebuild and start
docker-compose restart        # Restart services
docker-compose down -v        # Stop and remove volumes
```

---

## Documentation References

- [Backend README](../backend/README.md) - API details, setup, environment
- [Frontend README](../frontend/README.md) - Component docs, styling, pages
- [Queue Architecture](./QUEUE_ARCHITECTURE.md) - BullMQ deep dive
- [Architecture Flow](./ARCHITECTURE_FLOW.md) - Detailed data flows
- [Root README](../README.md) - Project overview, quick start

---

## Summary

**DriveChat** solves the cross-device personal messaging problem with:

1. **Your Storage**: Files in your Google Drive, not ours
2. **Real-Time**: Socket.IO for instant push updates
3. **Ephemeral**: Auto-delete after 24h unless starred
4. **Smart Queues**: BullMQ handles async work reliably
5. **Privacy-First**: Zero-knowledge, encrypted, secure
6. **Cost-Efficient**: $20/month for production, 99.8% less Firestore reads vs. polling
7. **Scalable**: Redis adapter, horizontal backend scaling, managed services
8. **Future-Ready**: AI pipelines, mobile apps, E2E encryption, and more

This is not just a chat app—it's a **personal, privacy-first communication layer** that grows with you.

---

**Last Updated**: November 6, 2025  
**Version**: 1.0.0  
**License**: MIT
