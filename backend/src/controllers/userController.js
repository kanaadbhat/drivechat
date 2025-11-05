import { firestoreHelpers } from '../config/firebase.js';
import { nanoid } from 'nanoid';

/**
 * Get current user profile
 */
export const getCurrentUser = async (req, res) => {
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
};

/**
 * Update user profile
 */
export const updateUser = async (req, res) => {
  const { userId } = req;
  const updates = req.body;

  // Don't allow updating certain fields
  const allowedFields = ['name', 'driveConnected', 'driveFolderId'];
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
};

/**
 * Get user devices
 */
export const getDevices = async (req, res) => {
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
};

/**
 * Create/register a new device
 */
export const createDevice = async (req, res) => {
  const { userId } = req;
  const { name, type } = req.body;

  if (!name || !type) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['name', 'type'],
    });
  }

  const validTypes = ['desktop', 'mobile', 'tablet', 'other'];
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

  const newDevice = {
    deviceId: nanoid(),
    name,
    type,
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const devices = user.devices || [];
  devices.push(newDevice);

  await firestoreHelpers.setUserDoc(userId, { devices });

  res.status(201).json({
    device: newDevice,
    success: true,
  });
};

/**
 * Update device (rename)
 */
export const updateDevice = async (req, res) => {
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
};

/**
 * Delete device
 */
export const deleteDevice = async (req, res) => {
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
};

/**
 * Get user analytics
 */
export const getAnalytics = async (req, res) => {
  const { userId } = req;

  const user = await firestoreHelpers.getUserDoc(userId);

  if (!user) {
    return res.status(404).json({
      error: 'User not found',
    });
  }

  res.json({
    analytics: {
      totalMessagesCount: user.totalMessagesCount || 0,
      totalFilesCount: user.totalFilesCount || 0,
      storageUsedBytes: user.storageUsedBytes || 0,
      devicesCount: (user.devices || []).length,
      ...user.analyticsData,
    },
  });
};
