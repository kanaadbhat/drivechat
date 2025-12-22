import { scryptAsync } from '@noble/hashes/scrypt';
import { randomBytes, utf8ToBytes, bytesToHex } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';

const DEFAULT_SCRYPT_PARAMS = { N: 1 << 15, r: 8, p: 1, dkLen: 32 };
const KEY_PREFIX = 'drivechat_mek_';
const SALT_PREFIX = 'drivechat_salt_';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes) {
  if (!bytes) return '';
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(bin);
}

function base64ToBytes(b64) {
  if (!b64) return new Uint8Array();
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importAesKey(rawBytes) {
  return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export function generateSalt(bytes = 16) {
  return bytesToBase64(randomBytes(bytes));
}

export function cacheSalt(userId, saltB64) {
  if (!userId || !saltB64) return;
  localStorage.setItem(`${SALT_PREFIX}${userId}`, saltB64);
}

export function loadCachedSalt(userId) {
  if (!userId) return null;
  return localStorage.getItem(`${SALT_PREFIX}${userId}`);
}

export function clearCachedSalt(userId) {
  if (!userId) return;
  localStorage.removeItem(`${SALT_PREFIX}${userId}`);
}

export async function deriveMek(password, saltB64, params = DEFAULT_SCRYPT_PARAMS) {
  const saltBytes = base64ToBytes(saltB64);
  const passwordBytes = utf8ToBytes(password);
  return scryptAsync(passwordBytes, saltBytes, params);
}

export function cacheMek(userId, mekBytes) {
  if (!userId || !mekBytes) return;
  const encoded = bytesToBase64(mekBytes);
  localStorage.setItem(`${KEY_PREFIX}${userId}`, encoded);
}

export function loadCachedMek(userId) {
  if (!userId) return null;
  const encoded = localStorage.getItem(`${KEY_PREFIX}${userId}`);
  if (!encoded) return null;
  try {
    return base64ToBytes(encoded);
  } catch (err) {
    console.warn('[crypto] Failed to parse cached MEK', err?.message);
    return null;
  }
}

export function clearCachedMek(userId) {
  if (!userId) return;
  localStorage.removeItem(`${KEY_PREFIX}${userId}`);
}

export async function encryptJson(mekBytes, payload) {
  if (!mekBytes) throw new Error('Missing MEK');
  const iv = randomBytes(12);
  const key = await importAesKey(mekBytes);
  const plaintext = textEncoder.encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  );
  return {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
    alg: 'aes-256-gcm',
    ver: 'v1',
    mac: bytesToHex(sha256(ciphertext)).slice(0, 32),
  };
}

export async function decryptJson(mekBytes, envelope) {
  if (!mekBytes) throw new Error('Missing MEK');
  if (!envelope?.ciphertext || !envelope?.iv) {
    throw new Error('Missing ciphertext or iv');
  }
  const key = await importAesKey(mekBytes);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.ciphertext)
  );
  return JSON.parse(textDecoder.decode(decrypted));
}

export function buildEncryptionHeader(envelope, saltB64) {
  return {
    version: envelope?.ver || 'v1',
    alg: envelope?.alg || 'aes-256-gcm',
    iv: envelope?.iv,
    salt: saltB64,
  };
}

export function exportMek(mekBytes) {
  return bytesToBase64(mekBytes);
}

export function importMek(mekB64) {
  if (!mekB64) return null;
  return base64ToBytes(mekB64);
}
