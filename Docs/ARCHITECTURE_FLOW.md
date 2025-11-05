# 🗺️ Architecture & Setup Flow

## System Architecture

### Traditional Development (Recommended)

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Machine                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  Frontend   │  │   Backend    │  │  Redis         │    │
│  │  React/Vite │  │  Express     │  │  (in Docker)   │    │
│  │  :5173      │  │  :5000       │  │  :6379         │    │
│  │             │  │              │  │                │    │
│  │ (runs via   │  │ (runs via    │  │ (Container)    │    │
│  │  npm run)   │  │  npm run)    │  │                │    │
│  └──────┬──────┘  └──────┬───────┘  └────────────────┘    │
│         │                │                 ▲               │
│         └────────────────┼─────────────────┘               │
│                          │ (API calls)                     │
│                    ┌─────▼───────┐                         │
│                    │ BullMQ Queue │                        │
│                    │  - cleanup   │                        │
│                    │  - files     │                        │
│                    │  - AI        │                        │
│                    └─────────────┘                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
              │ (Internet)
              ▼
┌─────────────────────────────────────────────────────────────┐
│         External Services (via API)                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  Firestore   │  │ Google Drive │  │  Clerk Auth    │    │
│  │  (Database)  │  │  (Files)     │  │  (Auth)        │    │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Docker Development (Alternative)

```
┌─────────────────────────────────────────────────────────────┐
│              Docker Compose Network                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  Frontend   │  │   Backend    │  │  Redis         │    │
│  │  Container  │  │  Container   │  │  Container     │    │
│  │  :5173      │  │  :5000       │  │  :6379         │    │
│  │             │  │              │  │                │    │
│  │ (Docker)    │  │ (Docker)     │  │ (Docker)       │    │
│  └──────┬──────┘  └──────┬───────┘  └────────────────┘    │
│         │                │                 ▲               │
│         └────────────────┼─────────────────┘               │
│                          │ (via 'redis' hostname)         │
│                    ┌─────▼───────┐                         │
│                    │ BullMQ Queue │                        │
│                    │  - cleanup   │                        │
│                    │  - files     │                        │
│                    │  - AI        │                        │
│                    └─────────────┘                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
              │ (Internet)
              ▼
┌─────────────────────────────────────────────────────────────┐
│         External Services (via API)                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  Firestore   │  │ Google Drive │  │  Clerk Auth    │    │
│  │  (Database)  │  │  (Files)     │  │  (Auth)        │    │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Setup Flow Diagram

### Traditional Development Setup

```
START
  │
  ├─ Step 1: Start Redis
  │   └─ docker run -d ... redis:7-alpine
  │       └─ ✅ Redis ready at localhost:6379
  │
  ├─ Step 2: Configure Environment
  │   └─ cd backend && cp .env.example .env
  │       └─ Edit with: CLERK_*, FIREBASE_*, GOOGLE_*
  │
  ├─ Step 3: Install Dependencies
  │   └─ npm install (root)
  │       └─ npm install (backend)
  │           └─ npm install (frontend)
  │
  ├─ Step 4: Start Services
  │   └─ npm run start
  │       └─ concurrently runs:
  │           ├─ npm run dev:backend  → Backend @ :5000
  │           └─ npm run dev:frontend → Frontend @ :5173
  │
  └─ Step 5: Use Your App
      └─ Open http://localhost:5173
          └─ ✅ Ready to develop!

DEVELOPMENT
  │
  ├─ Edit frontend code
  │   └─ Vite hot-reload (instant)
  │
  ├─ Edit backend code
  │   └─ Nodemon auto-reload
  │
  └─ Make API calls
      └─ Backend uses Redis queues
```

### Docker Setup

```
START
  │
  ├─ Step 1: Configure Environment
  │   └─ cd backend && cp .env.example .env
  │       └─ Edit with: CLERK_*, FIREBASE_*, GOOGLE_*
  │
  ├─ Step 2: Start Docker Compose
  │   └─ npm run docker:up
  │       └─ docker-compose starts:
  │           ├─ redis service ✅
  │           ├─ backend service ✅
  │           └─ frontend service ✅
  │
  ├─ Step 3: Verify Services
  │   └─ docker ps (check all running)
  │       └─ npm run docker:logs (view output)
  │
  └─ Step 4: Use Your App
      └─ Open http://localhost:5173
          └─ ✅ Everything containerized!

DEVELOPMENT
  │
  ├─ Edit frontend code
  │   └─ Docker volume syncs instantly
  │       └─ Vite hot-reload works!
  │
  ├─ Edit backend code
  │   └─ Docker volume syncs instantly
  │       └─ Nodemon auto-reload works!
  │
  └─ View logs
      └─ npm run docker:logs
```

---

## Command Decision Tree

```
I want to develop locally
│
├─ YES
│   ├─ Start Redis?
│   │   └─ docker run -d --name redis-dev -p 6379:6379 redis:7-alpine
│   │
│   ├─ Configure .env?
│   │   └─ cd backend && cp .env.example .env (edit credentials)
│   │
│   └─ Run everything?
│       └─ npm run start
│           ✅ Backend @ :5000
│           ✅ Frontend @ :5173
│
└─ NO - Test production setup?
    └─ npm run docker:up
        ✅ All services in Docker
        ✅ Production-like environment
```

---

## File Structure (Updated)

```
drivechat/
│
├── 🆕 docker-compose.yml          ← Defines all services
├── 🆕 .env.example                ← Root env template
├── 🆕 Docs/
│   ├── DEVELOPMENT_GUIDE.md       ← THIS explains everything
│   ├── QUESTIONS_ANSWERED.md      ← Q&A document
│   ├── DOCKER_SETUP.md            ← Docker detailed guide
│   ├── CLEANUP_REPORT.md          ← What was cleaned
│   ├── SETUP_COMPLETE.md          ← Setup summary
│   └── ...
│
├── backend/
│   ├── 🆕 Dockerfile              ← Backend container
│   ├── 🆕 .dockerignore           ← Exclude files from Docker
│   ├── 🆕 .env.example            ← Backend env template
│   ├── ✏️  package.json           ← Updated (removed unused deps)
│   ├── src/
│   │   ├── index.js
│   │   ├── queues/               ← BullMQ queues
│   │   ├── routes/               ← API routes
│   │   ├── controllers/          ← Route handlers
│   │   ├── services/             ← Business logic
│   │   ├── config/               ← Firebase, Clerk, OAuth
│   │   ├── middleware/           ← Auth, error handling
│   │   └── utils/                ← Helpers
│   └── ❌ src/cron/              ← DELETED (replaced by queues)
│
├── frontend/
│   ├── 🆕 Dockerfile              ← Frontend container
│   ├── 🆕 .dockerignore           ← Exclude files from Docker
│   ├── src/
│   ├── package.json
│   └── vite.config.js
│
├── package.json                   ← ✏️ Added docker commands
├── README.md                      ← ✏️ Updated with quick start
└── ...
```

Legend:

- 🆕 = NEW files/folders
- ✏️ = MODIFIED files
- ❌ = DELETED files/folders

---

## Data Flow: Message Creation

```
User Types & Sends Message
        │
        ▼
Frontend (React)
├─ validateInput()
├─ showLoading()
└─ POST /api/messages
    └─ { text, deviceId, type: "text" }
        │
        ▼
Backend (Express)
├─ verifyAuthToken() ← Clerk
├─ createMessageInFirestore()
├─ scheduleMessageDeletion() ← BullMQ cleanup queue
└─ return { messageId, timestamp }
    │
    ▼
Frontend receives response
├─ hideLoading()
├─ addToChat()
└─ Listen to Firestore updates
    │
    ▼
Firestore real-time listener
├─ Sends update to frontend
│
▼
Frontend updates UI
├─ Message appears in chat
├─ Timestamp shows
├─ Device label shows
└─ Message auto-deletes in 24h (or when starred)
```

---

## Data Flow: File Upload

```
User Selects File
        │
        ▼
Frontend (React)
├─ validateFile()
├─ showProgress()
└─ POST /api/files/upload
    └─ FormData { file, deviceId, async: false }
        │
        ▼
Backend (Express)
├─ verifyAuthToken()
├─ uploadToGoogleDrive()
│   ├─ Creates file in /DriveChat/{uid}/
│   └─ Returns fileId
├─ createMessageInFirestore()
│   └─ { type: "file", fileId, fileName, size }
└─ return { fileId, fileName, previewUrl }
    │
    ▼
Frontend receives response
├─ hideProgress()
├─ addFileMessage()
└─ Show preview thumbnail
    │
    ▼
All other devices (via Firestore listener)
├─ See new file message
├─ Show preview
└─ Can download when clicked
```

---

## Queue System Flow

```
Message Created
        │
        ▼
Backend checks expiresAt
        │
        ├─ Is starred? → NO AUTO-DELETE
        │
        └─ Not starred
            │
            ▼
        Add to BullMQ cleanup queue
            │
            ├─ Job: deleteMessageAt(expiresAt)
            │   └─ Scheduled for 24h later
            │
            ▼
        When expiration time reached
            ├─ Delete from Firestore
            ├─ Delete from Google Drive (if file)
            └─ Update analytics
```

---

## Environment Variables Flow

```
You create backend/.env
        │
        ├─ CLERK_SECRET_KEY ─────┐
        ├─ FIREBASE_* ────────────┤
        ├─ GOOGLE_* ──────────────┤
        ├─ REDIS_HOST ────────────┼─> Backend loads on startup
        ├─ REDIS_PORT ────────────┤
        └─ ...                    │
                                  ▼
            Backend (Express server)
            ├─ Connects to Redis @ REDIS_HOST:REDIS_PORT
            ├─ Verifies Clerk tokens with CLERK_SECRET_KEY
            ├─ Accesses Firestore with FIREBASE_*
            └─ Authenticates Google Drive with GOOGLE_*
```

---

## Recommended Development Commands

```bash
# Session 1: Start everything
echo "Starting development environment..."
docker run -d --name redis-dev -p 6379:6379 redis:7-alpine
echo "✅ Redis started"
npm run start
echo "✅ Backend and Frontend started"
echo "Visit: http://localhost:5173"

# Session 2: Just resume
echo "Resuming development..."
npm run start
echo "✅ Backend and Frontend started"

# Before deployment
npm run docker:rebuild
npm run docker:logs
echo "✅ All services ready for deployment"
```

---

## Summary Table

| What                | Traditional               | Docker              |
| ------------------- | ------------------------- | ------------------- |
| **Start Redis**     | `docker run -d ... redis` | Automatic           |
| **Start Backend**   | `npm run dev:backend`     | Automatic           |
| **Start Frontend**  | `npm run dev:frontend`    | Automatic           |
| **Start All**       | `npm run start`           | `npm run docker:up` |
| **Debug**           | ⭐⭐⭐⭐⭐                | ⭐⭐⭐              |
| **Hot Reload**      | ✅                        | ✅                  |
| **Production-like** | ❌                        | ✅                  |
| **Best For**        | Development               | Testing/Deployment  |

---

See `Docs/DEVELOPMENT_GUIDE.md` for complete step-by-step instructions!
