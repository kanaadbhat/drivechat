# DriveChat — Client-side Zero-Knowledge Encryption

This document describes the client-side, zero-knowledge encryption system added to DriveChat, summarizes the implementation changes made across the repo, explains runtime behavior, and provides test and next-step guidance.

---

## Goals & Guarantees

- Zero-knowledge for message content and Drive IDs: server stores only ciphertext and encryption metadata (envelope), never plaintext message text, link targets, or Drive file IDs (unless legacy clients send them).
- Password-based key derivation (user passphrase) occurs only on the client. The server stores a salt (opaque blob) to allow re-derivation on other devices.
- Minimal UX friction: prompt for passphrase once during pre-chat, cache derived key in localStorage for session convenience, and automatically clear on logout or account deletion.
- Client-only file operations (uploads/deletes) remain handled by the client via Google Drive — the server never holds Drive access tokens.

---

## High-level design

1. User sees `PreChat` flow after sign-in. If an encryption salt exists for the user, the client requires the user to enter their passphrase to derive the MEK (master encryption key). If no salt exists, user sets a new password and a new salt is generated and saved to the user's profile.
2. The client derives the MEK via scrypt and uses it (AES-GCM via Web Crypto) to encrypt JSON payloads representing message contents (text/link/file metadata). The encrypted blob (ciphertext + iv + envelope metadata) is sent to the server.
3. The server stores ciphertext and the envelope metadata (alg/version/iv/salt reference) along with sender metadata; it no longer attempts to index or search encrypted fields.
4. For files: files are uploaded to Google Drive (client-side) and then the Drive file ID and preview URL are encrypted into the ciphertext to store in Firestore. When the client later needs the Drive ID (e.g., delete or download), it decrypts with the MEK and performs Drive operations client-side.
5. Pending deletions and bulk deletes include either a plain `fileId` (legacy) or an encrypted payload; clients attempt to decrypt and perform Drive deletion.

---

## Cryptography choices and parameters

- KDF: scrypt (via `@noble/hashes` scrypt implementation). Parameters: N = 2^15 (32768), r = 8, p = 1, dkLen = 32. These parameters were chosen to be reasonably slow on modern desktop browsers while still working on phones — adjust as needed.
- AEAD: AES-256-GCM via the browser `crypto.subtle` API. Envelope includes `ciphertext`, `iv` (12 bytes), `alg` and `ver` fields.
- Salt storage: salt is stored in the user's Firestore profile (field `encryptionSalt`) and cached locally. The salt is not secret.
- MEK caching: the derived MEK bytes are stored in localStorage (encoded base64) under a per-user key. This cache is cleared on sign-out and account deletion.
- Integrity: AES-GCM includes authentication tag; envelope also contains a SHA-256 digest in the helper for quick debugging but final integrity relies on the AEAD tag.

Note: Argon2 is stronger for password hashing but lacks consistent, performant WebCrypto support across browsers; scrypt via `@noble/hashes` is a pragmatic choice. If you want Argon2, consider a WASM Argon2 implementation or using platform-specific APIs.

---

## Files added / modified

Frontend (added/modified):

- Added: `frontend/src/utils/crypto.js` — KDF, AES-GCM encrypt/decrypt wrappers, base64 utilities, local cache helpers.
- Modified: `frontend/package.json` — added dependency `@noble/hashes`.
- Modified: `frontend/src/components/PreChat.jsx` — prompts for encryption password, derives MEK, saves salt to server if new, caches key locally, decrypts pending deletions, blocks prechat completion until MEK available, supports reset and clear-on-logout.
- Modified: `frontend/src/components/ChatInterface.jsx` — encrypts outbound payloads (text/link/file metadata) before POST, decrypts messages on fetch and realtime events, persists decrypted UI copies in Dexie for local search, blocks the main chat UI when MEK missing, clears cached MEK on sign-out.
- Modified: `frontend/src/db/dexie.js` — Dexie usage left intact; messages cached are now the decrypted objects written by the client.
- Modified: `frontend/src/components/SettingsPage.jsx` — clear cached MEK and salt on account deletion and clear the `drivechat_prechat_passed` flag.

Backend (modified):

- Modified: `backend/src/controllers/messageController.js` — relaxed validation to accept ciphertext-only messages and file ciphertexts; persists `ciphertext`, `fileCiphertext`, and `encryption` envelopes; pending-deletions support encrypted payloads; server-side search replaced with a response noting encrypted messages must be searched on clients.
- Modified: `backend/src/controllers/userController.js` — allow `encryptionSalt` and `encryptionVersion` fields to be written on the user profile and seeded for new users.

---

## Data formats (client↔server)

Encrypted message (POST payload example):

- Text/Link message
  {
  "type": "text", // or "link"
  "ciphertext": "<base64>",
  "encryption": { "version": "v1", "alg": "aes-256-gcm", "iv": "<base64>", "salt": "<base64>" },
  "sender": { deviceId, deviceName, deviceType }
  }

- File message (client uploads to Drive first, then sends metadata encrypted):
  {
  "type": "file",
  "fileCiphertext": "<base64>",
  "encryption": { ... },
  "sender": { ... }
  }

On the server the Firestore message document will contain either plaintext fields (legacy clients) or ciphertext fields (`ciphertext` / `fileCiphertext`) together with `encryption` metadata.

---

## UX flows and behavior

1. First-time user (no salt on server)
   - PreChat prompts to create encryption password.
   - Client generates a new random salt, derives MEK via scrypt, caches MEK locally, stores salt in user profile via PATCH `/api/users/me`.
   - PreChat completes and user proceeds to chat.

2. Returning user / new device (salt exists on server)
   - PreChat asks for the passphrase.
   - Client fetches salt from `/api/users/me`, derives MEK, caches it locally, and proceeds.
   - If the user forgot the passphrase, they must use the account-reset flow (note: resetting encryption will orphan existing ciphertext — see Caveats).

3. Sending messages
   - Text/link/file metadata object is encrypted with the MEK; only ciphertext+envelope is sent.
   - Files still upload to Drive client-side; the Drive file id is encrypted and stored in message ciphertext.

4. Receiving messages
   - On fetch/realtime, client attempts to decrypt ciphertext using cached MEK. If MEK absent, chat UI is blocked and user is directed to PreChat to provide the passphrase.
   - Decrypted messages are stored in Dexie for local search and UI rendering only.

5. Delete / pending deletion
   - Server records pending deletion entries including encrypted file payloads if the Drive ID is not stored plaintext.
   - Clients decrypt the record and call Drive deletion APIs client-side.

6. Logout / Delete account
   - Sign-out clears local Dexie caches and also clears cached MEK and salt from localStorage.
   - Account deletion endpoint additionally signals clients to delete Drive files; frontend clears cached MEK and `drivechat_prechat_passed` key.

---

## How to run & quick verification

1. Install frontend deps:

```powershell
cd frontend
npm install
npm run dev
```

2. Steps to manually verify encryption flow:

- Sign in, visit `/prechat`. If first-time, set a passphrase. If salt exists, enter passphrase.
- Compose and send a text message. On the server Firestore message document, verify that `ciphertext` exists and `text` is `null`.
- Send a file: upload to Drive (client-side). After send, check Firestore that `fileCiphertext` exists and `fileId` is not stored in plaintext (unless legacy path). In the UI the file should render after decryption.
- Sign out and sign back in on the same device: if MEK cached, you should be dropped directly to chat; if not cached (e.g., clear localStorage), PreChat will request password.
- Attempt to search on server endpoint: server will return empty results with a note — search must be done in client over Dexie cache.

---

## Caveats, tradeoffs, and next steps

- Password recovery: impossible. If the user loses their passphrase, ciphertext is unrecoverable unless you implement a recovery mechanism (e.g., secret-sharing, escrow, or using platform keys). Make this clear in UI messaging.
- KDF: scrypt was chosen for portability; Argon2id would be preferable for stronger security if you can add a WASM Argon2 library or if browsers provide good support.
- MEK caching in localStorage: convenient but less secure than keeping MEK in memory-only. You may improve security using WebAuthn credentials to wrap the key or using IndexedDB with OS-backed encryption.
- Server-side search is intentionally disabled for encrypted content; to support search across devices, consider client-side searchable indexes (encrypted search / order-preserving encryption or searchable encryption schemes) — these are complex.
- Consider switching to XChaCha20-Poly1305 for performance and streaming support, and to reduce issues with GCM nonce reuse risks (we currently use random 12-byte IVs per envelope).
- Consider rotating salts and key versions: adding `encryptionVersion` field to user profile was included; you will need migration tooling if algorithm or parameters change.

---

## Files of interest (quick links)

- Frontend utils:
  - `frontend/src/utils/crypto.js`
- Frontend flows:
  - `frontend/src/components/PreChat.jsx`
  - `frontend/src/components/ChatInterface.jsx`
  - `frontend/src/components/SettingsPage.jsx`
- Backend controllers:
  - `backend/src/controllers/messageController.js`
  - `backend/src/controllers/userController.js`
- Local persistence:
  - `frontend/src/db/dexie.js`

---

## Final notes

This integration moves DriveChat to a zero-knowledge model for message contents and Drive references while maintaining the existing client-driven Drive operations. The implementation is intentionally pragmatic — it favors cross-browser portability and developer ergonomics while delivering strong confidentiality properties. If you want, I can:

- Add automated unit tests for the crypto helpers and roundtrip encrypt/decrypt flows.
- Replace scrypt with Argon2 via WASM and add feature-detected fallbacks.
- Add UI copy changes (clearer warnings about password recoverability) and an explicit account-reset flow that warns about data loss.

If you'd like me to generate tests or the UI copy, tell me which to start with.
