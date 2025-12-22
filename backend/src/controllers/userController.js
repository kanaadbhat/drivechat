import { firestoreHelpers } from '../config/firebase.js';
import { nanoid } from 'nanoid';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publishUserEvent } from '../realtime/realtimeHub.js';

/**
 * Get current user profile
 */
export const getCurrentUser = asyncHandler(async (req, res) => {
  const { userId } = req;
  let user = await firestoreHelpers.getUserDoc(userId);
  // If user doesn't exist, create initial profile
  if (!user) {
    const userData = {
      email: req.user.email || '',
      name: req.user.name || '',
      isPro: false,
      driveConnected: false,
      driveFolderId: null,
      encryptionSalt: null,
      encryptionVersion: 'v1',
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      totalMessagesCount: 0,
      totalFilesCount: 0,
      storageUsedBytes: 0,
      devices: [],
      analyticsData: {
        messagesPerDay: 0,
        filesSharedPerWeek: 0,
        averageSessionDuration: 0,
      },
    };
    user = await firestoreHelpers.setUserDoc(userId, userData);
  } else {
    // Update last active
    await firestoreHelpers.updateUserAnalytics(userId, {
      lastActive: new Date().toISOString(),
    });
  }
  res.json({ user });
});

/**
 * Update user profile
 */
export const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req;
  const updates = req.body;

  // Don't allow updating certain fields
  const allowedFields = [
    'name',
    'driveConnected',
    'driveFolderId',
    'encryptionSalt',
    'encryptionVersion',
  ];
  const filteredUpdates = {};

  allowedFields.forEach((field) => {
    if (updates[field] !== undefined) {
      filteredUpdates[field] = updates[field];
    }
  });

  await firestoreHelpers.setUserDoc(userId, {
    ...filteredUpdates,
    lastActive: new Date().toISOString(),
  });

  const user = await firestoreHelpers.getUserDoc(userId);

  res.json({
    user,
    success: true,
  });
});

/**
 * Get user devices
 */
export const getDevices = asyncHandler(async (req, res) => {
  const { userId } = req;

  const user = await firestoreHelpers.getUserDoc(userId);

  if (!user) {
    return res.status(404).json({
      error: 'User not found',
    });
  }

  res.json({
    devices: user.devices || [],
    count: (user.devices || []).length,
  });
});

/**
 * Create/register a new device
 */
export const createDevice = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { deviceId, name, type } = req.body;

  if (!name || !type) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['name', 'type'],
    });
  }

  const validTypes = ['mobile', 'laptop', 'tablet', 'pc', 'guest'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({
      error: 'Invalid device type',
      validTypes,
    });
  }

  const user = await firestoreHelpers.getUserDoc(userId);

  if (!user) {
    return res.status(404).json({
      error: 'User not found',
    });
  }

  const devices = user.devices || [];

  // Check if device already exists (by deviceId)
  const existingDeviceIndex = deviceId ? devices.findIndex((d) => d.deviceId === deviceId) : -1;

  if (existingDeviceIndex !== -1) {
    // Update existing device
    devices[existingDeviceIndex] = {
      ...devices[existingDeviceIndex],
      name,
      type,
      lastSeen: new Date().toISOString(),
    };

    await firestoreHelpers.setUserDoc(userId, { devices });

    return res.json({
      device: devices[existingDeviceIndex],
      success: true,
      updated: true,
    });
  }

  // Create new device
  const newDevice = {
    deviceId: deviceId || nanoid(),
    name,
    type,
    isRegistered: true,
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  devices.push(newDevice);

  await firestoreHelpers.setUserDoc(userId, { devices });

  res.status(201).json({
    device: newDevice,
    success: true,
    updated: false,
  });
});

/**
 * Update device (rename)
 */
export const updateDevice = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { deviceId } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({
      error: 'Device name is required',
    });
  }

  const user = await firestoreHelpers.getUserDoc(userId);

  if (!user) {
    return res.status(404).json({
      error: 'User not found',
    });
  }

  const devices = user.devices || [];
  const deviceIndex = devices.findIndex((d) => d.deviceId === deviceId);

  if (deviceIndex === -1) {
    return res.status(404).json({
      error: 'Device not found',
    });
  }

  devices[deviceIndex].name = name;
  devices[deviceIndex].lastSeen = new Date().toISOString();

  await firestoreHelpers.setUserDoc(userId, { devices });

  res.json({
    device: devices[deviceIndex],
    success: true,
  });
});

/**
 * Delete device
 */
export const deleteDevice = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { deviceId } = req.params;

  const user = await firestoreHelpers.getUserDoc(userId);

  if (!user) {
    return res.status(404).json({
      error: 'User not found',
    });
  }

  const devices = user.devices || [];
  const filteredDevices = devices.filter((d) => d.deviceId !== deviceId);

  if (filteredDevices.length === devices.length) {
    return res.status(404).json({
      error: 'Device not found',
    });
  }

  await firestoreHelpers.setUserDoc(userId, { devices: filteredDevices });

  res.json({
    success: true,
    message: 'Device deleted',
  });
});

/**
 * Get user analytics
 */
export const getAnalytics = asyncHandler(async (req, res) => {
  const { userId } = req;

  const user = await firestoreHelpers.getUserDoc(userId);

  if (!user) {
    return res.status(404).json({
      error: 'User not found',
    });
  }

  // Get actual message count from Firestore
  const allMessages = await firestoreHelpers.getUserMessages(userId, 10000);
  const totalMessagesCount = allMessages.length;

  // Get starred messages count
  const starredMessages = await firestoreHelpers.getStarredMessages(userId);
  const starredCount = starredMessages.length;

  // Get file messages for count
  const fileMessages = allMessages.filter((msg) => msg.type === 'file');
  const totalFilesCount = fileMessages.length;

  // Server no longer queries Drive for storage; client computes if needed
  const storageUsedBytes = null;

  res.json({
    analytics: {
      totalMessagesCount,
      totalFilesCount,
      storageUsedBytes,
      devicesCount: (user.devices || []).length,
      starredCount,
      ...user.analyticsData,
    },
  });
});

/**
 * Delete user account and all associated data
 * This includes: all messages (text + files from Drive), tokens, user profile
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  const { userId } = req;

  console.log(`[deleteAccount] Starting account deletion for user: ${userId}`);

  // Step 1: Get all messages to delete files from Drive
  const messages = await firestoreHelpers.getUserMessages(userId, 10000);
  const fileMessages = messages.filter((msg) => msg.type === 'file' && msg.fileId);

  // Step 2: Client-side Drive deletion requested via realtime; backend does not call Drive
  if (fileMessages.length > 0) {
    await Promise.all(
      fileMessages.map(async (msg) => {
        try {
          await publishUserEvent(userId, {
            type: 'drive.delete.request',
            messageId: msg.id,
            payload: {
              fileId: msg.fileId,
              fileFolderId: msg.fileFolderId || null,
              mimeType: msg.mimeType,
              fileName: msg.fileName,
            },
          });
        } catch {
          // non-fatal
        }
      })
    );
  }

  // Step 3: Delete all messages from Firestore
  console.log(`[deleteAccount] Deleting ${messages.length} messages from Firestore...`);
  const deletePromises = messages.map((msg) => firestoreHelpers.deleteMessage(userId, msg.id));
  await Promise.all(deletePromises);

  // Step 4: Clear stored Drive metadata (tokens are managed client-side)
  console.log(`[deleteAccount] Clearing Drive metadata from user profile...`);
  try {
    await firestoreHelpers.setUserDoc(userId, { driveConnected: false, driveFolderId: null });
  } catch (err) {
    console.warn('[deleteAccount] Failed to clear drive metadata:', err?.message || err);
  }

  // Step 5: Delete user profile from Firestore
  console.log(`[deleteAccount] Deleting user profile...`);
  await firestoreHelpers.deleteUserDoc(userId);

  console.log(`[deleteAccount] ✅ Account deletion complete`);

  res.json({
    success: true,
    message: 'Account deleted successfully',
    messagesDeleted: messages.length,
    filesDeleted: fileMessages.length,
  });
});
