# DriveChat — Real-time Delivery Implementation Plan

Status: draft

This document captures my understanding, design decisions, and a step-by-step implementation plan to replace polling with a Socket.IO + Redis Streams real-time delivery system while keeping Firestore as the canonical store.

## Goals

- Deliver messages and preview-ready events to all connected devices instantly.
- Provide durable, short-term replay for disconnected devices via Redis Streams (per-user streams).
- Keep Firestore as the canonical, durable message store; Streams should carry only tiny pointers.
- Minimize Firestore reads by using Redis for real-time delivery and Dexie/IndexedDB for local caching.

## Core components

- Firestore: canonical message documents and pointers to media.
- Express backend: API surface and host for Socket.IO; writes to Firestore then publishes to Redis Streams.
- Redis Streams: per-user stream `stream:user:{userId}` containing small events (messageId, path, timestamp, conversationId, senderId).
- Socket.IO: persistent connections to browsers, replay on connect, emit new stream events.
- Dexie (IndexedDB) on the client: local message cache, lastSeenId per device for replay/ack tracking.

## High-level data flow

1. Client sends message via API or Socket.IO emit.
2. Server writes full message doc to Firestore (messageId, content/pointer, metadata).
3. Server calls XADD on `stream:user:{recipientUserId}` with a tiny event: messageId, firestorePath, conversationId, timestamp, senderId.
4. Socket.IO server (for connected devices) replays missing entries for a device (XREAD from lastSeenId+1) then pushes events; it also listens for new events via XREAD BLOCK or via a consumer pushing to sockets.
5. Client receives event, fetches full Firestore doc if needed (or uses embedded payload), stores into Dexie, displays, and sends an ACK to server; server updates `device:{deviceId}:lastSeen` in Redis.

## Event schema (recommended)

- stream entry fields:
  - `messageId` (string)
  - `firestorePath` (string) — e.g. `users/{uid}/messages/{msgId}`
  - `conversationId` (string)
  - `senderId` (string)
  - `ts` (number, epoch ms)

Keep entries tiny — do not embed file bytes.

## Integration points (repo)

- Add `backend/src/realtime/socketServer.js` — attach Socket.IO to the existing HTTP server in `backend/src/index.js`.
- Add `backend/src/realtime/streamsPublisher.js` — helper XADD called from `messageController` and `previewService` after successful Firestore writes.
- Add `backend/src/realtime/streamsConsumer.js` or implement consumer inside `socketServer.js` to XREAD BLOCK and push events to sockets.
- Add `backend/src/realtime/deviceStore.js` — Redis wrapper to get/set `device:{deviceId}:lastSeen` and presence.
- Add `frontend/src/utils/socketClient.js` and `frontend/src/db/dexie.js`.

## Environment variables needed

- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `ENABLE_REALTIME` (feature flag)
- `REALTIME_STREAM_MAXLEN` (stream retention)
- `SKIP_PERIODIC_CLEANUP` (for dev guard)
- Existing Firebase/Clerk envs remain required (use the same service account and auth flow for socket handshake validation).

### Local dev (suggested)

- Backend (`backend/.env`):
  - `ENABLE_REALTIME=true`
  - `SKIP_PERIODIC_CLEANUP=true` (optional; avoids Firestore composite-index errors)
- Frontend (`frontend/.env` or your shell):
  - `VITE_ENABLE_REALTIME=true`

## Implementation plan (step-by-step)

1. Design & infra
   - Decide Redis plan (Streams supported), set MAXMEM and persistence settings.
   - Add `REDIS_*` env vars to `.env.example` and `docker-compose.yml` for local dev.

2. Socket.IO server
   - Implement `socketServer.js` that:
     - Attaches to the HTTP server.
     - Validates clients in the handshake (Clerk tokens or JWT with `userId` + `deviceId`).
     - Joins the socket to a room `user:{userId}` (optionally device-scoped).
     - On connect: fetch `device:{deviceId}:lastSeen` and trigger replay.

3. Publisher integration
   - Add `streamsPublisher.publishMessage(recipientUserId, event)`.
   - Call publisher after Firestore writes in `messageController.createMessage()` and after preview generation.
   - Use `XADD stream:user:{userId} MAXLEN ~ 10000 * field value` to keep stream trimmed.

4. Consumer / Delivery
   - Approach A (simple): inside `socketServer` on connect, read backlog with `XREAD` starting at lastSeen+1 and then `XREAD BLOCK 0` for new events; this scales well for per-connection replay.
   - Approach B (scaled): run an independent consumer/worker that reads streams and publishes to Socket.IO nodes via Redis adapter — recommended for horizontal scaling.
   - Implement ACK handling: on client ack, update `device:{deviceId}:lastSeen` to the stream ID of the ACKed entry.

5. Device lastSeen & presence
   - Use `device:{deviceId}:lastSeen` and `device:{deviceId}:node` (optional) keys in Redis.
   - On socket connect, update presence TTL; on disconnect, clear presence or mark offline.

6. Frontend changes
   - Add `socketClient.js` to connect and handshake with `userId` & `deviceId` (deviceId generated per browser/tab install or derived from fingerprint + permission).
   - Add Dexie schema: messages (messageId primary), meta table for lastSeenId per device.
   - On connect: send local lastSeenId; replay local Dexie content immediately; merge incoming stream events (dedupe by messageId).

7. Trimming, retention & ops
   - Set MAXLEN on XADD (e.g., 10k entries) and monitor memory.
   - Provide admin script to inspect stream backlog and replay entries to a device (for debugging).

8. Testing, rollout & docs
   - Add E2E integration test: send message → Firestore write → XADD → socket client receives, stores in Dexie, ack.
   - Add metrics: delivery latency, ack lag, consumer lag, Redis memory.
   - Document the architecture and runbook in `Docs/REALTIME_ARCHITECTURE.md`.

## Safety & migration notes

- Feature-flag rollout: gate the new flows behind `ENABLE_REALTIME`. When disabled, system stays on Firestore polling path.
- Backwards compatibility: keep Firestore history reads intact for older clients; the new client can fall back to Firestore bootstrapping if no lastSeen found.
- Dev guard: use `SKIP_PERIODIC_CLEANUP` to avoid cleanup queries (and Firestore index errors) during local development.

## Rough timeline & effort estimate

- Design & infra config: 1 day
- Socket.IO server + handshake: 1–2 days
- Publisher integration & small changes in controllers: 1 day
- Consumer/worker and ACK semantics: 1–2 days
- Frontend Dexie + socket client: 2 days
- Trimming/ops/writing docs and tests: 1–2 days

Total estimate: ~7–11 working days (single engineer, end-to-end). Shorter if you accept a simpler approach where the socket server does per-connection XREAD/XREAD-BLOCK and no dedicated consumer worker is implemented initially.

## Next immediate steps I can implement for you

1. Scaffold `backend/src/realtime/socketServer.js` and wire into `backend/src/index.js`.
2. Add `backend/src/realtime/streamsPublisher.js` and call it from `messageController` after Firestore writes.
3. Add `frontend/src/utils/socketClient.js` and minimal Dexie schema.

Tell me which of the next steps you want me to start implementing and I will open a PR-like patch set.

**Implementation Verification — Real-Time System**

- **Status**: ✓ Implemented and wired end-to-end in the repo (feature-flagged).
- **Backend:** `backend/src/realtime/realtimeHub.js`, `backend/src/realtime/streams.js`, and `backend/src/realtime/deviceStore.js` are present and initialized from `backend/src/index.js`.
- **Publishers:** `messageController` and `previewService` publish `message.created`, `message.updated`, `message.deleted`, `messages.cleared`, and `preview.ready` events via Redis Streams + Socket.IO.
- **Client:** `frontend/src/utils/realtimeClient.js` connects with Clerk auth, replays from Dexie `realtime:lastSeenId`, ACKs events, and persists lastSeen.
- **Local cache:** `frontend/src/db/dexie.js` provides `messages` and `meta` stores and helpers used by `ChatInterface`.
- **Polling fallback:** `ChatInterface.jsx` only polls when realtime is disabled or not connected (fallback enabled).
- **Non-blocking:** All realtime publishing is wrapped in try/catch (non-fatal) to avoid blocking core flows.

**SKIP_PERIODIC_CLEANUP — Why it existed and current recommendation**

- **Why added (dev guard):** During development the Firestore cleanup query triggered a Firestore 'query requires an index' (FAILED_PRECONDITION) error because the composite index required by the production cleanup query was not present in the developer Firebase project. To avoid crashing or repeatedly failing the periodic cleanup job in local dev, `SKIP_PERIODIC_CLEANUP=true` was provided as a temporary guard to skip scheduling the periodic cleanup worker.
- **Current state:** The required Firestore composite index has now been created in the Firestore project (per your note). That removes the original blocker that motivated `SKIP_PERIODIC_CLEANUP`.
- **Recommendation:**
  - In local/dev: you may keep `SKIP_PERIODIC_CLEANUP=true` if you prefer not to run periodic cleanup locally (it's safe and avoids side effects).
  - In staging/production: set `SKIP_PERIODIC_CLEANUP=false` (or remove the guard) so the periodic cleanup scheduler runs as intended. This will re-enable automatic expired-message cleanup and associated Drive folder deletions.
  - Verify the cleanup index exists in the target project and then enable the scheduler by setting `SKIP_PERIODIC_CLEANUP=false` in your production environment variables.

**How to enable periodic cleanup (quick steps)**

1. Confirm the composite index exists in Firestore for the cleanup query (Firestore console > Indexes). If missing, create it using the index definition from the error link.
2. Set `SKIP_PERIODIC_CLEANUP=false` in the production environment (or remove that env var).
3. Restart the backend to pick up env changes. The scheduler will call `setupPeriodicCleanup()` during `initializeQueues()`.
4. Confirm logs show the cleanup scheduler created and the first run completes without index errors.

**Quick test steps (multi-device & preview validation)**

- **Setup:** Start dev stack with realtime enabled: set `ENABLE_REALTIME=true` (backend) and `VITE_ENABLE_REALTIME=true` (frontend). Ensure Redis is running.
- **Two-browser test:** Open two browser windows (or profiles) and sign in with the same Clerk user. On device A send a message; verify device B receives `message.created` instantly and Dexie is populated.
- **Preview test:** Upload a file from device A. After preview generation completes, verify both devices receive `preview.ready` and the UI updates without relying on polling.
- **Delete / Clear test:** Delete a message or run bulk `deleteAllMessages()`; verify `message.deleted` or `messages.cleared` events clear the other device immediately.
- **Fallback test:** Disconnect Socket.IO (e.g., set `VITE_ENABLE_REALTIME=false` or block websockets) and verify polling resumes as expected.

---

_Note:_ If you want I can also update `docker-compose.yml` and the `backend/.env.example` comment to recommend `SKIP_PERIODIC_CLEANUP=false` for staging/production and leave a short runbook entry for enabling/disabling it.
