# DriveChat Backend

Express.js backend server for DriveChat application with **Redis + BullMQ** queue architecture.

## Features

- ✅ Clerk authentication with token verification
- ✅ Google OAuth 2.0 integration for Drive API
- ✅ Firebase Firestore for message metadata
- ✅ Real-time message management
- ✅ File upload/download via Google Drive API
- ✅ **Redis + BullMQ queue system** for async operations
- ✅ **Event-driven auto-deletion** of expired messages
- ✅ **Async file operations** (upload/delete)
- ✅ **AI operations queue** (for future features)
- ✅ Device management and identification
- ✅ User profile and analytics
- ✅ Search and filtering capabilities

## Queue Architecture

This backend uses **BullMQ** with Redis for:

1. ⏰ Auto-deletion of messages after expiration (event-driven)
2. 🧹 Periodic cleanup of expired data
3. 📁 Async file operations (uploads/deletes)
4. 🤖 AI operations (summarization, analysis - future)

See [QUEUE_ARCHITECTURE.md](./QUEUE_ARCHITECTURE.md) for detailed documentation.

## Setup

### Prerequisites

- Node.js 18+
- Redis (for BullMQ queues)

### Install Redis

**Windows (Docker recommended):**

```bash
docker run -d -p 6379:6379 redis
```

**macOS:**

```bash
brew install redis
brew services start redis
```

**Linux:**

```bash
sudo apt install redis-server
sudo systemctl start redis
```

### Install Dependencies

1. Install dependencies:

```bash
npm install
```

2. Create `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

3. Fill in all environment variables in `.env` (including Redis config)

4. Start the server:

```bash
npm run dev     # Development with nodemon
npm start       # Production
```

## API Endpoints

### Health Check

- `GET /health` - Server health status

### Authentication

- `GET /api/auth/google/url` - Get Google OAuth URL
- `GET /api/auth/google/callback` - OAuth callback handler
- `POST /api/auth/google/tokens` - Exchange code for tokens
- `POST /api/auth/google/refresh` - Refresh access tokens

### Messages

- `GET /api/messages` - Get all messages
- `GET /api/messages/search?q=query` - Search messages
- `GET /api/messages/category/:category` - Get messages by category
- `GET /api/messages/:id` - Get single message
- `POST /api/messages` - Create message
- `PATCH /api/messages/:id` - Update message (star/edit)
- `DELETE /api/messages/:id` - Delete message

### Files

- `POST /api/files/upload` - Upload file to Drive (supports `async: true` for queuing)
- `GET /api/files/:fileId` - Get file metadata
- `GET /api/files/:fileId/download` - Download file
- `GET /api/files/:fileId/preview` - Get file preview
- `DELETE /api/files/:fileId` - Delete file from Drive (supports `async: true` for queuing)

### Users

- `GET /api/users/me` - Get current user profile
- `PATCH /api/users/me` - Update user profile
- `GET /api/users/devices` - Get all devices
- `POST /api/users/devices` - Register new device
- `PATCH /api/users/devices/:deviceId` - Update device
- `DELETE /api/users/devices/:deviceId` - Delete device
- `GET /api/users/analytics` - Get user analytics

### Admin

- `POST /api/admin/cleanup` - Trigger cleanup manually (queues job)
- `GET /api/admin/cleanup/stats` - Get cleanup & queue statistics
- `GET /api/admin/stats` - Get system statistics

## Project Structure

```
backend/
├── src/
│   ├── index.js              # Entry point
│   ├── config/
│   │   ├── firebase.js       # Firestore setup
│   │   ├── clerk.js          # Clerk SDK
│   │   ├── google-oauth.js   # Google OAuth
│   │   └── redis.js          # Redis connection
│   ├── middleware/
│   │   ├── auth.js           # Authentication
│   │   └── errorHandler.js   # Error handling
│   ├── routes/
│   │   ├── auth.js
│   │   ├── messages.js
│   │   ├── files.js
│   │   ├── users.js
│   │   └── admin.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── messageController.js
│   │   ├── fileController.js
│   │   ├── userController.js
│   │   └── adminController.js
│   ├── services/
│   │   ├── cleanupService.js
│   │   └── fileService.js
│   ├── queues/              # NEW: Queue system
│   │   ├── index.js         # Queue initialization
│   │   ├── config.js        # Queue configuration
│   │   ├── cleanupQueue.js  # Cleanup jobs
│   │   ├── fileQueue.js     # File operations
│   │   └── aiQueue.js       # AI operations
│   ├── utils/
│   │   ├── fileUtils.js
│   │   ├── validators.js
│   │   └── logger.js
│   └── cron/               # DEPRECATED
│       └── cleanup.js      # Replaced by queue system
├── .env
├── .env.example
├── package.json
├── README.md
└── QUEUE_ARCHITECTURE.md   # NEW: Queue documentation
```

## Environment Variables

See `.env.example` for all required variables, including:

**Required:**

- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`
- `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`
- `REDIS_HOST`, `REDIS_PORT` (for BullMQ)

**Optional:**

- `REDIS_PASSWORD` (for production Redis)
- `NODE_ENV`, `PORT`, `LOG_LEVEL`

## Development

```bash
npm run dev     # Start with nodemon (auto-reload)
```

## Production

```bash
npm start       # Start production server
```

## Queue System

### Message Auto-Deletion

When a message is created, it's automatically scheduled for deletion after 24 hours using BullMQ delayed jobs. When a message is starred, the deletion job is cancelled.

### Periodic Cleanup

- Expired messages: Every 6 hours
- Temp files: Daily at 2 AM

### Async File Operations

Large file uploads/deletes can be queued for background processing by passing `async: true` in the request body.

### Monitoring Queues

```bash
# Get queue statistics
curl http://localhost:5000/api/admin/cleanup/stats
```

For detailed queue documentation, see [QUEUE_ARCHITECTURE.md](./QUEUE_ARCHITECTURE.md).

## Security

- All routes (except health and auth) require valid Clerk authentication token
- Bearer token format: `Authorization: Bearer <token>`
- Firestore security rules ensure users can only access their own data
- Google Drive files stored in user's own Drive account

## Error Handling

All errors return JSON with structure:

```json
{
  "error": "Error name",
  "message": "Error description",
  "stack": "Stack trace (dev only)"
}
```

## License

MIT
