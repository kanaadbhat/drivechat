# Last Seen & Cache Flow

## Why it exists

- Avoids replaying old Redis stream events ("ghost messages") when a user signs out/in or changes devices.
- Ensures realtime connects with a watermark and API syncs can delta-fetch instead of full replays.

## Persistence layers

- **Dexie meta**: `realtime:lastSeenId` keeps the watermark alongside cached messages.
- **localStorage**: `drivechat_last_seen_{userId}` survives Dexie wipes and full DB deletes.
- **Fallback fetch**: If neither store has a value, we call `/api/messages?limit=1` to seed a watermark from the server response.

## Startup paths

- **PreChat sync**: Uses `ensurePersistedLastSeenId` to set `sinceId` for the first sync; if missing it clears cached messages and performs a full fetch. On success it calls `setPersistedLastSeenId` to write both stores.
- **Realtime connect**: `createRealtimeClient` loads the persisted watermark (or fallback) before opening the socket and sends it in `auth.lastSeenId` so the server can stream only new events.

## During runtime

- Every realtime event with a `streamId` is ACKed and persisted via `setPersistedLastSeenId`, keeping Dexie and localStorage in lockstep.
- Chat event handlers dedupe by ID (`getMessageById` before insert) so replays do not double-insert.

## Sign-out / cleanup behavior

- `cleanupUserSession` preserves the last seen ID by default: it snapshots via `getPersistedLastSeenId`, clears Dexie/session/localStorage (prefixed keys), then restores the watermark to Dexie/localStorage. Pass `preserveLastSeen: false` to fully clear.

## Failure & recovery

- If localStorage is blocked or Dexie fails, we log a warning and continue. The next reconnect will try the fallback fetch path.
- If the API delta request fails, PreChat retries with a full fetch and resets cached messages before applying the new watermark.
