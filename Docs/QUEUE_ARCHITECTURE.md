# Queue Architecture - DriveChat Backend

## Overview

The DriveChat backend now uses **Redis + BullMQ** for queue-based task processing, replacing the cron-based cleanup system. This provides better scalability, reliability, and the ability to handle async heavy operations.

## Why Queues?

### Problems with Cron-based System:

- ❌ Fixed intervals (not event-driven)
- ❌ No retry mechanism
- ❌ No job persistence across restarts
- ❌ Can't handle async/heavy operations efficiently
- ❌ No job prioritization
- ❌ Limited monitoring capabilities

### Benefits of Queue System:

- ✅ Event-driven processing
- ✅ Automatic retries with exponential backoff
- ✅ Job persistence in Redis
- ✅ Async processing (non-blocking)
- ✅ Job prioritization
- ✅ Detailed monitoring and stats
- ✅ Horizontal scaling (multiple workers)
- ✅ Scheduled/delayed jobs

---

## Queue Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     REDIS (Job Store)                        │
└────────────┬────────────────────────────────────────────────┘
             │
    ┌────────┼───────────┬───────────────┐
    │        │           │               │
┌───▼────┐ ┌─▼─────┐ ┌──▼────┐    ┌────▼────┐
│Cleanup │ │ File  │ │  AI   │    │ Future  │
│ Queue  │ │ Queue │ │ Queue │    │ Queues  │
└───┬────┘ └─┬─────┘ └──┬────┘    └─────────┘
    │        │           │
┌───▼────┐ ┌─▼─────┐ ┌──▼────┐
│Cleanup │ │ File  │ │  AI   │
│Worker  │ │Worker │ │Worker │
└────────┘ └───────┘ └───────┘
     │          │         │
     └──────────┴─────────┴─────────> Processing
```

---

## Queues

### 1. **Cleanup Queue** (`cleanup`)

Handles auto-deletion and cleanup tasks.

**Job Types:**

- `expired-messages` - Periodic cleanup of expired messages (every 6 hours)
- `temp-files` - Periodic cleanup of temp files (daily at 2 AM)
- `specific-message` - Delete a specific message after its expiration time

**Configuration:**

- Concurrency: 2
- Retry attempts: 3
- Backoff: Exponential (5s delay)

**Usage:**

```javascript
import { scheduleMessageDeletion, cancelMessageDeletion } from './queues/cleanupQueue.js';

// Schedule a message for deletion
await scheduleMessageDeletion(userId, messageId, expiresAt);

// Cancel deletion (e.g., when starred)
await cancelMessageDeletion(userId, messageId);
```

---

### 2. **File Operations Queue** (`file-operations`)

Handles file uploads and deletions asynchronously.

**Job Types:**

- `upload` - Upload file to Google Drive
- `delete` - Delete file from Google Drive
- `batch-delete` - Delete multiple files at once

**Configuration:**

- Concurrency: 3
- Retry attempts: 5 (for uploads), 3 (for deletes)
- Backoff: Exponential (10s delay for uploads)

**Usage:**

```javascript
import { queueFileUpload, queueFileDelete } from './queues/fileQueue.js';

// Queue file upload
const job = await queueFileUpload({
  accessToken,
  refreshToken,
  userId,
  fileName,
  fileData,
  mimeType,
});

// Queue file deletion
await queueFileDelete({
  accessToken,
  refreshToken,
  userId,
  fileId,
});
```

---

### 3. **AI Operations Queue** (`ai-operations`)

Handles AI/ML tasks (summarization, analysis, etc.).

**Job Types:**

- `summarize` - AI summarization of messages
- `analyze` - AI analysis of content
- `extract` - Extract text from images/docs

**Configuration:**

- Concurrency: 1 (AI tasks are expensive)
- Retry attempts: 2
- Backoff: Fixed (30s delay)

**Usage:**

```javascript
import { queueAISummarization, queueAIAnalysis } from './queues/aiQueue.js';

// Queue AI summarization
const job = await queueAISummarization(userId, messageIds);

// Queue AI analysis
await queueAIAnalysis(userId, analysisData);
```

---

## How It Works

### 1. Message Auto-Deletion Flow

```
User creates message
        │
        ▼
Message saved to Firestore
        │
        ▼
scheduleMessageDeletion() called
        │
        ▼
Job added to cleanup queue with delay
        │
        ▼
After expiration time...
        │
        ▼
Worker picks up job
        │
        ▼
Message deleted from Firestore
        │
        ▼
Associated file (if any) marked for deletion
```

### 2. Starring a Message (Cancel Deletion)

```
User stars message
        │
        ▼
cancelMessageDeletion() called
        │
        ▼
Job removed from cleanup queue
        │
        ▼
Message persists indefinitely
```

### 3. Periodic Cleanup

```
Server starts
        │
        ▼
setupPeriodicCleanup() called
        │
        ▼
Repeating jobs added to queue
        │
        ▼
Every 6 hours: expired-messages cleanup
Every 24 hours: temp-files cleanup
```

---

## API Integration

### Updated Endpoints

#### POST `/api/files/upload`

Now supports async uploads:

```json
{
  "accessToken": "...",
  "fileName": "document.pdf",
  "fileData": "base64...",
  "async": true // NEW: Queue the upload
}
```

Response:

```json
{
  "success": true,
  "queued": true,
  "jobId": "12345",
  "message": "File upload queued for processing"
}
```

#### DELETE `/api/files/:fileId`

Now supports async deletion:

```json
{
  "accessToken": "...",
  "async": true // NEW: Queue the deletion
}
```

#### POST `/api/admin/cleanup`

Triggers immediate cleanup (queued):

```json
{
  "success": true,
  "jobId": "67890",
  "queuedAt": "2025-11-05T10:00:00Z"
}
```

#### GET `/api/admin/cleanup/stats`

Get queue statistics:

```json
{
  "timestamp": "2025-11-05T10:00:00Z",
  "status": "operational",
  "queues": {
    "cleanup": {
      "waiting": 5,
      "active": 1,
      "completed": 42,
      "failed": 0,
      "delayed": 10,
      "recentCompleted": 15
    },
    "fileOperations": { ... },
    "aiOperations": { ... }
  }
}
```

---

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### Queue Options

Modify in `src/queues/config.js`:

```javascript
export const defaultQueueOptions = {
  defaultJobOptions: {
    attempts: 3, // Retry attempts
    backoff: {
      type: 'exponential', // or 'fixed'
      delay: 5000, // Initial delay (ms)
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep for 24 hours
      count: 100, // Keep last 100
    },
  },
};
```

---

## Monitoring

### Queue Dashboard (Optional)

Install BullMQ Dashboard:

```bash
npm install @bull-board/express
```

Add to server:

```javascript
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
createBullBoard({
  queues: [
    new BullMQAdapter(cleanupQueue),
    new BullMQAdapter(fileQueue),
    new BullMQAdapter(aiQueue),
  ],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());
```

Access: `http://localhost:5000/admin/queues`

---

## Deployment

### Production Considerations

1. **Redis Setup**
   - Use Redis Cloud or AWS ElastiCache
   - Enable persistence (RDB + AOF)
   - Set up monitoring

2. **Worker Scaling**
   - Run workers on separate processes/containers
   - Scale horizontally based on load
   - Use PM2 for process management

3. **Error Handling**
   - Monitor failed jobs
   - Set up alerts for high failure rates
   - Implement dead letter queue

4. **Performance**
   - Tune concurrency settings
   - Optimize job payload size
   - Use job prioritization

---

## Development

### Testing Queues Locally

1. **Install Redis**:

   ```bash
   # Windows (WSL or Docker)
   docker run -d -p 6379:6379 redis

   # macOS
   brew install redis
   brew services start redis

   # Linux
   sudo apt install redis-server
   sudo systemctl start redis
   ```

2. **Start Server**:

   ```bash
   npm run dev
   ```

3. **Monitor Jobs**:
   ```bash
   # Check queue stats
   curl http://localhost:5000/api/admin/cleanup/stats
   ```

---

## Migration from Cron

### Changes Made:

1. ✅ Replaced `src/cron/cleanup.js` with queue-based system
2. ✅ Added Redis + BullMQ dependencies
3. ✅ Created queue configurations and workers
4. ✅ Integrated queue calls in controllers
5. ✅ Added environment variables for Redis
6. ✅ Updated startup to initialize queues

### Removed:

- ❌ Cron-based cleanup service
- ❌ Fixed interval cleanup (replaced with event-driven + periodic)

### Added:

- ✅ Cleanup queue with scheduler
- ✅ File operations queue
- ✅ AI operations queue (for future features)
- ✅ Per-message deletion scheduling
- ✅ Queue monitoring endpoints

---

## Future Enhancements

1. **Bull Board** - Visual queue monitoring dashboard
2. **Priority Queues** - Separate high/low priority queues
3. **Rate Limiting** - Per-user rate limiting for operations
4. **Batch Processing** - Efficient batch operations
5. **Dead Letter Queue** - Handle permanently failed jobs
6. **Queue Metrics** - Export metrics to Prometheus/Grafana
7. **Job Notifications** - Webhook/email on job completion

---

## Troubleshooting

### Redis Connection Issues

```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# Check connection from Node
node -e "const Redis = require('ioredis'); const r = new Redis(); r.ping().then(console.log)"
```

### Queue Not Processing Jobs

1. Check worker is running
2. Verify Redis connection
3. Check job is in queue: `await cleanupQueue.getWaiting()`
4. Check for errors in logs

### Jobs Stuck in "Active" State

- Worker crashed before completion
- Use `await queue.clean(0, 'active')` to clear

---

## Resources

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Documentation](https://redis.io/documentation)
- [Bull Board](https://github.com/felixmosh/bull-board)

---

**Queue Architecture Status**: ✅ Complete & Production Ready
**Last Updated**: November 5, 2025
