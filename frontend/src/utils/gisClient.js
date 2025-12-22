/**
 * Google Identity Services (GIS) Client-Side Drive Module
 * Handles OAuth PKCE flow and Google Drive operations entirely client-side.
 * No server-side tokens needed - client uploads directly to Drive.
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file';
const STORAGE_KEY = 'drivechat_gis_token';

// GIS token client instance
let tokenClient = null;
let currentAccessToken = null;
let tokenExpiresAt = 0;
let tokenPromiseResolve = null;
let tokenPromiseReject = null;

// Eagerly load any stored token at module load so hasValidToken works before initGisClient runs
loadStoredToken();

function loadStoredToken() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken || !parsed?.expiresAt) return;
    if (Date.now() < parsed.expiresAt) {
      currentAccessToken = parsed.accessToken;
      tokenExpiresAt = parsed.expiresAt;
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.warn('[gisClient] Failed to load stored token', err?.message);
  }
}

function persistToken() {
  try {
    if (currentAccessToken && tokenExpiresAt) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken: currentAccessToken, expiresAt: tokenExpiresAt })
      );
    }
  } catch (err) {
    console.warn('[gisClient] Failed to persist token', err?.message);
  }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[gisClient] Failed to clear stored token', err?.message);
  }
  currentAccessToken = null;
  tokenExpiresAt = 0;
}

/**
 * Initialize GIS token client (call once on app start)
 */
export function initGisClient() {
  if (typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
    console.warn('[gisClient] google.accounts.oauth2 not loaded yet');
    return false;
  }

  if (!currentAccessToken) {
    loadStoredToken();
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPES,
    callback: (response) => {
      if (response.error) {
        console.error('[gisClient] Token error:', response.error);
        tokenPromiseReject?.(new Error(response.error_description || response.error));
        tokenPromiseResolve = null;
        tokenPromiseReject = null;
        return;
      }
      currentAccessToken = response.access_token;
      // expires_in is in seconds
      tokenExpiresAt = Date.now() + (response.expires_in - 60) * 1000;
      persistToken();
      tokenPromiseResolve?.(currentAccessToken);
      tokenPromiseResolve = null;
      tokenPromiseReject = null;
    },
    error_callback: (err) => {
      console.error('[gisClient] Token client error:', err);
      tokenPromiseReject?.(err);
      tokenPromiseResolve = null;
      tokenPromiseReject = null;
    },
  });

  return true;
}

/**
 * Check if we have a valid access token
 */
export function hasValidToken() {
  return currentAccessToken && Date.now() < tokenExpiresAt;
}

/**
 * Get access token (prompts user if expired/missing)
 * @param {boolean} prompt - Force prompt even if token exists
 */
export async function getAccessToken(options = {}) {
  const { prompt = false, login_hint } = options;

  // Ensure we hydrate from storage before deciding if we need to prompt
  if (!currentAccessToken) {
    loadStoredToken();
  }

  if (prompt !== true && prompt !== 'consent' && hasValidToken()) {
    return currentAccessToken;
  }

  if (!tokenClient) {
    initGisClient();
    if (!tokenClient) {
      throw new Error('GIS not initialized. Ensure google.accounts.oauth2 script is loaded.');
    }
  }

  return new Promise((resolve, reject) => {
    tokenPromiseResolve = resolve;
    tokenPromiseReject = reject;

    const promptValue = prompt === true || prompt === 'consent' ? 'consent' : '';
    const requestPayload = { prompt: promptValue };
    if (login_hint) {
      requestPayload.login_hint = login_hint;
    }

    tokenClient.requestAccessToken(requestPayload);
  });
}

/**
 * Revoke current token and clear state
 */
export function revokeToken() {
  if (currentAccessToken) {
    window.google?.accounts?.oauth2?.revoke(currentAccessToken, () => {
      // Intentionally silent
    });
    currentAccessToken = null;
    tokenExpiresAt = 0;
  }
  clearStoredToken();
}

/**
 * Download a Drive file using authenticated media endpoint with progress
 */
export async function downloadFileFromDrive(fileId, mimeType, onProgress) {
  if (!fileId) throw new Error('Missing file id');
  const accessToken = await getAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${res.statusText}`);
  }

  const total = parseInt(res.headers.get('content-length') || '0', 10);
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  const startedAt = performance.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (onProgress) {
      const percent = total ? Math.round((loaded / total) * 100) : null;
      const elapsedSec = Math.max((performance.now() - startedAt) / 1000, 0.001);
      const speedBps = Math.round(loaded / elapsedSec);
      onProgress({ percent, loaded, total, speedBps });
    }
  }

  return new Blob(chunks, { type: mimeType || 'application/octet-stream' });
}

/**
 * Get the DriveChat app folder ID (creates if needed)
 */
async function getOrCreateAppFolder(accessToken) {
  const folderName = 'DriveChat';

  // Search for existing folder
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  )}&spaces=drive&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    throw new Error(`Drive folder search failed: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files?.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Drive folder creation failed: ${createRes.statusText}`);
  }

  const createData = await createRes.json();
  return createData.id;
}

/**
 * Upload a file to Google Drive (client-side)
 * @param {File} file - File object to upload
 * @param {Function} onProgress - Optional progress callback (0-100)
 * @param {Function} onAbortable - Optional callback receiving an abort function for caller control
 * @returns {Object} - { driveFileId, webViewLink, webContentLink, mimeType, size, name }
 */
export async function uploadFileToDrive(file, onProgress, onAbortable) {
  const accessToken = await getAccessToken();
  const folderId = await getOrCreateAppFolder(accessToken);

  // Use resumable upload for reliability
  const metadata = {
    name: file.name,
    parents: [folderId],
  };

  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': file.type || 'application/octet-stream',
        'X-Upload-Content-Length': file.size,
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    throw new Error(`Drive upload init failed: ${initRes.statusText}`);
  }

  const uploadUri = initRes.headers.get('Location');

  // Upload the file content with progress reporting
  const uploadResponse = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startedAt = Date.now();
    let lastLoaded = 0;

    if (onAbortable) {
      onAbortable(() => {
        xhr.abort();
        const abortError = new Error('Upload aborted');
        abortError.name = 'AbortError';
        abortError.code = 'abort';
        reject(abortError);
      });
    }

    xhr.open('PUT', uploadUri, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const percent = Math.round((evt.loaded / evt.total) * 100);
      const now = Date.now();
      const deltaBytes = evt.loaded - lastLoaded;
      const deltaTime = Math.max(now - startedAt, 1);
      const speedBps = Math.round((evt.loaded / deltaTime) * 1000);
      lastLoaded = evt.loaded;
      onProgress?.({ percent, loaded: evt.loaded, total: evt.total, speedBps, deltaBytes });
    };

    xhr.onerror = () => reject(new Error('Drive upload failed'));
    xhr.ontimeout = () => reject(new Error('Drive upload timed out'));

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText || '{}'));
        } catch (err) {
          resolve({});
        }
      } else {
        reject(new Error(`Drive upload failed: ${xhr.statusText}`));
      }
    };

    xhr.send(file);
  });

  const fileId = uploadResponse?.id;
  if (!fileId) {
    throw new Error('Drive upload failed: missing file id');
  }

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,webViewLink,webContentLink`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!metaRes.ok) {
    throw new Error(`Drive metadata fetch failed: ${metaRes.statusText}`);
  }

  const fileMeta = await metaRes.json();

  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    }),
  });

  onProgress?.({ percent: 100, loaded: file.size, total: file.size, speedBps: 0 });

  return {
    driveFileId: fileMeta.id,
    fileName: fileMeta.name,
    mimeType: fileMeta.mimeType,
    size: parseInt(fileMeta.size || '0', 10),
    webViewLink: fileMeta.webViewLink,
    webContentLink: fileMeta.webContentLink,
  };
}

/**
 * Delete a file from Google Drive
 * @param {string} driveFileId - Drive file ID to delete
 */
export async function deleteFileFromDrive(driveFileId) {
  if (!driveFileId) return;

  try {
    const accessToken = await getAccessToken();

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 404) {
      console.warn('[gisClient] File already deleted:', driveFileId);
      return true;
    }

    if (!res.ok) {
      throw new Error(`Drive delete failed: ${res.statusText}`);
    }

    return true;
  } catch (err) {
    console.error('[gisClient] Delete error:', err);
    throw err;
  }
}

/**
 * Get a direct content URL for a Drive file (for images/videos)
 * @param {string} driveFileId - Drive file ID
 */
export function getDriveContentUrl(driveFileId) {
  // Direct download URL works for files shared with "anyone with link"
  return `https://drive.google.com/uc?export=view&id=${driveFileId}`;
}

/**
 * Get a thumbnail URL for a Drive file
 * @param {string} driveFileId - Drive file ID
 * @param {number} size - Thumbnail size (default 200)
 */
export function getDriveThumbnailUrl(driveFileId, size = 200) {
  return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=s${size}`;
}

/**
 * Compute total size of DriveChat folder
 */
export async function getDriveFolderUsage() {
  const accessToken = await getAccessToken();
  const folderId = await getOrCreateAppFolder(accessToken);
  let pageToken = null;
  let totalBytes = 0;

  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${folderId}' in parents and trashed=false`);
    url.searchParams.set('fields', 'files(size),nextPageToken');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Drive usage fetch failed: ${res.statusText}`);
    }

    const data = await res.json();
    for (const f of data.files || []) {
      totalBytes += parseInt(f.size || '0', 10);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return totalBytes;
}
