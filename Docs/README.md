# DriveChat Documentation Index

Welcome to the DriveChat documentation. This directory contains comprehensive guides covering the system architecture, implementation details, and key features.

---

## 📚 Documentation Overview

### Core Architecture

#### [DRIVECHAT_ONE_PAGER.md](./DRIVECHAT_ONE_PAGER.md)

**Complete system overview and feature documentation**

- Problem statement and solution approach
- Core features (messaging, files, devices, security)
- High-level architecture diagrams
- Technology stack
- API overview
- Real-time architecture (Socket.IO + Redis Streams)
- Queue system overview
- Security and privacy model
- Scaling strategy

**When to read**: Start here for a comprehensive understanding of the entire DriveChat system.

---

#### [ARCHITECTURE_FLOW.md](./ARCHITECTURE_FLOW.md)

**Setup flows and deployment architecture**

- Traditional development setup (local)
- Docker development setup
- Step-by-step setup flows
- System architecture diagrams
- Environment configuration guide

**When to read**: When setting up the development environment or deploying the application.

---

### Client-Side Features

#### [DRIVE_CLIENT_MIGRATION.md](./DRIVE_CLIENT_MIGRATION.md)

**Client-side Google Drive integration** ✅ Implemented

- OAuth flow (Google Identity Services / PKCE)
- Client-side upload strategy
- Download/view flows
- Delete flow (client executor pattern)
- Backend responsibilities (metadata only)
- Data shapes and event schemas

**When to read**: When working on file upload/download features or understanding the Drive integration.

---

#### [ENCRYPTION_INTEGRATION.md](./ENCRYPTION_INTEGRATION.md)

**Zero-knowledge encryption system** ✅ Implemented

- Password-based key derivation (scrypt)
- AES-256-GCM encryption
- Client-side encryption flows
- Message and file metadata encryption
- Salt storage and MEK caching
- Cryptography choices and parameters
- UX flows (first-time user, returning user, logout)

**When to read**: When implementing or debugging encryption features, or understanding the privacy model.

---

#### [LAST_SEEN_AND_CACHE.md](./LAST_SEEN_AND_CACHE.md)

**Realtime watermarking and local cache strategy** ✅ Implemented

- Last seen ID persistence (Dexie + localStorage)
- Startup sync paths (PreChat)
- Realtime connection watermarking
- Event deduplication
- Sign-out and cleanup behavior
- Failure recovery strategies

**When to read**: When debugging realtime sync issues or implementing offline-first features.

---

### Backend Systems

#### [QUEUE_ARCHITECTURE.md](./QUEUE_ARCHITECTURE.md)

**Redis + BullMQ queue system**

- Why queues (vs cron)
- Queue architecture overview
- Active queues:
  - Cleanup queue (expired messages, temp files)
- Queue configuration
- Job types and usage patterns
- Monitoring and stats

**When to read**: When working on background jobs, cleanup tasks, or adding new async operations.

---

#### [REALTIME_IMPLEMENTATION_PLAN.md](./REALTIME_IMPLEMENTATION_PLAN.md)

**Socket.IO + Redis Streams real-time delivery** ✅ Implemented

- Goals and architecture
- Data flow (Firestore → Redis Streams → Socket.IO)
- Event schemas
- Integration points (backend and frontend)
- Device lastSeen and presence
- Testing and rollout strategy
- Feature flag usage (`ENABLE_REALTIME`)

**When to read**: When working on realtime features, debugging message delivery, or scaling the system.

---

## 🗺️ Quick Navigation

### By Role

**Frontend Developer**:

1. Start with [DRIVECHAT_ONE_PAGER.md](./DRIVECHAT_ONE_PAGER.md) (Core Features section)
2. Read [ENCRYPTION_INTEGRATION.md](./ENCRYPTION_INTEGRATION.md)
3. Review [DRIVE_CLIENT_MIGRATION.md](./DRIVE_CLIENT_MIGRATION.md)
4. Check [LAST_SEEN_AND_CACHE.md](./LAST_SEEN_AND_CACHE.md)

**Backend Developer**:

1. Start with [DRIVECHAT_ONE_PAGER.md](./DRIVECHAT_ONE_PAGER.md) (System Components section)
2. Review [REALTIME_IMPLEMENTATION_PLAN.md](./REALTIME_IMPLEMENTATION_PLAN.md)
3. Read [QUEUE_ARCHITECTURE.md](./QUEUE_ARCHITECTURE.md)
4. Check [DRIVE_CLIENT_MIGRATION.md](./DRIVE_CLIENT_MIGRATION.md) (Backend Responsibilities)

**DevOps / Setup**:

1. Read [ARCHITECTURE_FLOW.md](./ARCHITECTURE_FLOW.md)
2. Check [QUEUE_ARCHITECTURE.md](./QUEUE_ARCHITECTURE.md) (Redis setup)
3. Review [REALTIME_IMPLEMENTATION_PLAN.md](./REALTIME_IMPLEMENTATION_PLAN.md) (Environment variables)

**Security / Privacy Audit**:

1. Read [ENCRYPTION_INTEGRATION.md](./ENCRYPTION_INTEGRATION.md)
2. Review [DRIVE_CLIENT_MIGRATION.md](./DRIVE_CLIENT_MIGRATION.md)
3. Check [DRIVECHAT_ONE_PAGER.md](./DRIVECHAT_ONE_PAGER.md) (Security & Privacy section)

---

## 🏗️ Current Architecture Summary

### Core Principles

1. **Client-Side First**: Files are uploaded/downloaded directly from Google Drive by the client; the server never proxies or stores file content.

2. **Zero-Knowledge Encryption**: All message content and file metadata are encrypted on the client using AES-256-GCM; the server stores only ciphertext.

3. **Real-Time Delivery**: Socket.IO + Redis Streams provide instant message delivery with durable replay for disconnected devices.

4. **Ephemeral by Default**: Messages auto-delete after 24 hours unless starred; cleanup is coordinated via queues and client executors.

5. **Local-First Search**: Search operates on decrypted Dexie cache client-side since the server cannot decrypt content.

### Tech Stack

**Frontend**:

- React + Vite
- Dexie (IndexedDB) for local cache
- Socket.IO client for realtime
- Web Crypto API for encryption
- Google Identity Services for Drive OAuth

**Backend**:

- Express.js
- Socket.IO server
- Redis (Streams + BullMQ queues)
- Firebase Firestore (metadata only)
- Clerk Auth (JWT)

**Removed Components** (as of latest cleanup):

- ❌ Admin routes and controller
- ❌ Authentication controller (legacy Drive token handlers)
- ❌ Server-side message search endpoint
- ❌ Server-side file preview generation
- ❌ Server-side file uploads (proxy)
- ❌ Large request body parsing (50MB → 2MB)

**Added Components** (recent):

- ✅ Route-specific rate limiting (messages: 120/15min, users: 60/15min)
- ✅ Client-side file uploads/downloads
- ✅ Client-side encryption for all content
- ✅ Real-time delivery via Socket.IO
- ✅ Local-first search and caching

---

## 📝 Deprecated Documentation

The following docs have been removed as they covered deprecated architecture:

- ~~`OAUTH_REFACTOR.md`~~ - Covered old authentication controller (removed)
- ~~`IMPLEMENTATION_COMPLETE.md`~~ - Covered server-side preview generation (moved to client)
- ~~`QUEUE_SYSTEM_REINITIALIZATION.md`~~ - Covered admin routes and AI queue (removed)

---

## 🔄 Keeping Docs Updated

When making architectural changes:

1. Update the relevant documentation file
2. Update this README if new docs are added
3. Mark features as ✅ Implemented or 🚧 In Progress
4. Remove deprecated documentation and note it in this file

---

## 📞 Questions?

- Architecture questions → See [DRIVECHAT_ONE_PAGER.md](./DRIVECHAT_ONE_PAGER.md)
- Setup issues → See [ARCHITECTURE_FLOW.md](./ARCHITECTURE_FLOW.md)
- Feature-specific questions → See the relevant feature doc above
