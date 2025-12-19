# Drive Client-Side Migration Plan

Goal: move all Google Drive access to the client. Backend stores only encrypted metadata and timestamps, coordinates deletion via realtime (no polling), and never holds Drive tokens.

## Auth & Tokens (Client)

- Use Google Identity Services (GIS) OAuth (PKCE) in the client.
- Persist tokens only in client storage (Dexie/session memory). Never send tokens to backend.
- On expiration, refresh via GIS; if refresh fails, prompt re-consent.

## Upload Flow (Client)

1. User picks a file; client gets Drive tokens via GIS.
2. Client uploads directly to Drive (no backend proxy).
3. Client gathers metadata to send to backend (encrypted where applicable):
   - `fileCiphertext` (encrypted JSON containing Drive IDs/links)
   - `nonce`/`iv` and `tag` for encryption (fields to be finalized later)
   - `mimeType`, `size`, `fileCategory`, `fileName` (can be duplicated in ciphertext)
   - `previewInfo` (optional client-generated preview links)
4. Client calls backend message create with ciphertext + metadata. Backend stores as-is.

## Download/View (Client)

- Client reads ciphertext from message payload, decrypts locally, and uses Drive webContent/webView links.
- Backend never proxies Drive content.

## Delete Flow (Client executor)

- When user deletes or expires messages, backend publishes realtime `drive.delete.request` events with opaque payload (ciphertext or encrypted IDs).
- Client listens, decrypts, calls Drive delete (file/folder), then optionally POSTs a completion ack (new endpoint) without revealing plaintext IDs.
- Backend proceeds with Firestore deletion independently; Drive delete is best-effort client-side.

## Backend Responsibilities

- Accept and store encrypted file metadata; do not call Drive.
- Emit realtime events for create/update/delete.
- Expose lightweight acks endpoint for client executors (to record success/failure without plaintext IDs).
- Keep cleanup jobs but skip Drive calls; rely on realtime executor events instead.

## Data Shapes (proposed)

- Message for file types:
  - `type`: `file`
  - `fileCiphertext`: string (Base64)
  - `encryption`: { `nonce`, `tag`, `version` }
  - `fileName`, `mimeType`, `fileSize`, `fileCategory`
  - `filePreview`: optional client-provided preview links (already public)
- Realtime delete event:
  - `type`: `drive.delete.request`
  - `messageId`
  - `payload`: encrypted blob containing Drive IDs (client decrypts)
  - `ts`: timestamp
- Ack endpoint body (future): { `messageId`, `status`: `success|failed`, `attemptedAt`, `details?` }

## Open Items

- Finalize encryption format (AES-GCM vs libsodium) and key distribution.
- Decide on preview generation strategy (client-generated thumbnails vs none).
- Add retry/backoff policy for client executor when offline.
- Add telemetry fields to monitor executor success rates (no plaintext IDs).
