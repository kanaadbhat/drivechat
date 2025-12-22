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
  return row?.value ?? null;
}

export async function setMeta(userId, key, value) {
  if (!userId) return;
  await db.meta.put({ userId, key, value });
}

export async function loadMessages(userId, limit = 500) {
  if (!userId) return [];
  const rows = await db.messages.where('userId').equals(userId).sortBy('timestamp');
  return rows.slice(-limit);
}

export async function upsertMessage(userId, message) {
  if (!userId || !message?.id) return;
  await db.messages.put({ ...message, userId });
}

export async function deleteMessage(userId, messageId) {
  if (!userId || !messageId) return;
  await db.messages.delete([userId, messageId]);
}

export async function clearMessages(userId) {
  if (!userId) return;
  await db.messages.where('userId').equals(userId).delete();
}

export async function getMessageById(userId, messageId) {
  if (!userId || !messageId) return null;
  return db.messages.get([userId, messageId]);
}

export async function clearMeta(userId) {
  if (!userId) return;
  await db.meta.where('userId').equals(userId).delete();
}

export async function clearAllUserData(userId) {
  if (!userId) return;
  await Promise.all([clearMessages(userId), clearMeta(userId)]);
}

export async function deleteDb() {
  try {
    await db.delete();
    console.info('[dexie] database deleted');
  } catch (err) {
    console.warn('[dexie] failed to delete database', err?.message);
    throw err;
  }
}

export async function resetDb() {
  try {
    await db.delete();
    await db.open();
    console.info('[dexie] database reset');
  } catch (err) {
    console.warn('[dexie] failed to reset database', err?.message);
    throw err;
  }
}
