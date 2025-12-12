import Dexie from 'dexie';

export const db = new Dexie('drivechat');

db.version(1).stores({
  // Compound primary key so multiple Clerk users on same browser don't collide
  messages: '&[userId+id], userId, id, timestamp, starred, type',
  meta: '&[userId+key], userId, key',
});

export async function getMeta(userId, key) {
  if (!userId) return null;
  const row = await db.meta.get([userId, key]);
  console.info('[dexie] getMeta', { userId, key, found: Boolean(row) });
  return row?.value ?? null;
}

export async function setMeta(userId, key, value) {
  if (!userId) return;
  await db.meta.put({ userId, key, value });
  console.info('[dexie] setMeta', { userId, key, value });
}

export async function loadMessages(userId, limit = 500) {
  if (!userId) return [];
  const rows = await db.messages.where('userId').equals(userId).sortBy('timestamp');
  console.info('[dexie] loadMessages', { userId, count: rows.length, limit });
  return rows.slice(-limit);
}

export async function upsertMessage(userId, message) {
  if (!userId || !message?.id) return;
  await db.messages.put({ ...message, userId });
  console.info('[dexie] upsertMessage', { userId, id: message.id });
}

export async function deleteMessage(userId, messageId) {
  if (!userId || !messageId) return;
  await db.messages.delete([userId, messageId]);
  console.info('[dexie] deleteMessage', { userId, messageId });
}

export async function clearMessages(userId) {
  if (!userId) return;
  await db.messages.where('userId').equals(userId).delete();
  console.info('[dexie] clearMessages', { userId });
}
