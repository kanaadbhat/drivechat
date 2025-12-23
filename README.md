# DriveChat

A private, cross-device workspace for syncing messages and files with yourself. DriveChat focuses on personal sync and strong privacy: no phone number required, end-to-end encryption, and files kept in your Google Drive.

## Quick pitch

- **No Phone Required**: Sign in with your Google account—no SMS verification, no phone number sharing.
- **Personal Sync**: Designed for "chatting with yourself"—a secure bridge to move notes, links, and files between your own devices.
- **End-to-end encrypted**: Messages and attachments are encrypted on your device before upload. Only you hold the keys.
- **Your Drive, your data**: Files live in the `DriveChat` folder in your Google Drive. DriveChat never hosts your files.

## Features

- Instant sync across logged-in devices (real-time via Socket.IO).
- End-to-end encryption derived from a user password/unlock step.
- Client-side previews for media and PDFs (no heavy server-side processing).
- Starred messages to keep important items permanently accessible.
- Optional auto-delete scheduling handled via backend queues (BullMQ + Redis) for cleanup metadata—files remain in your Drive.

## How it works (high level)

1. Sign in with Clerk using your Google account.
2. Unlock once on a device with your password to derive encryption keys (the password never leaves your device).
3. Messages are encrypted locally and delivered via the realtime service; files are uploaded to your Google Drive under `DriveChat/`.
4. Other devices with the same signed-in account and unlock password receive and decrypt the messages.

5. Configure envs: copy `backend/.env.example` and `frontend/.env.example`, then add Clerk, Firebase, and Google OAuth keys.
6. Run locally:
   ```powershell
   npm run start
   ```
7. Open `http://localhost:5173`, sign in with Clerk (Google), and follow the on-screen unlock flow.

## Important security notes

- **Password recovery isn’t possible**: If you lose your password, existing messages remain encrypted and cannot be recovered. If needed, delete your DriveChat account and sign in again to start fresh—your Google Drive files remain intact.
- **We never hold your unencrypted data**: DriveChat does not have access to your unlocked messages or passwords.
- **Files remain under your control**: All attachments are stored in your Google Drive; you can manage or remove them directly from Drive.

## Tech stack

- **Frontend**: React 19 + React Router 7, Vite, Tailwind CSS 4, Clerk, Axios, Socket.IO client, Dexie (offline cache), Zod + React Hook Form, Radix Dialog, Lucide icons.
- **Realtime & state**: Socket.IO with Redis Streams, ACK + `lastSeenId` watermarking, Dexie + localStorage persistence.
- **Backend**: Node.js + Express 5, Firebase Admin SDK (Firestore), Clerk SDK; Google Drive uploads/conversions handled client-side; BullMQ + Redis for auto-delete/cleanup scheduling.
- **Tooling**: ESLint (flat), Prettier, Husky + lint-staged, Commitlint, npm scripts.

## Contributing

- Use conventional commits.
- Lint/format before PRs.
- See `Docs/` for architecture and realtime notes.
