import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft,
  HardDrive,
  User,
  Shield,
  Bell,
  Trash2,
  Plus,
  Edit2,
  Smartphone,
} from 'lucide-react';
import {
  initGisClient,
  getAccessToken,
  hasValidToken,
  getDriveFolderUsage,
  revokeToken,
  clearStoredToken,
} from '../utils/gisClient.js';
import {
  getCurrentDevice,
  registerDevice,
  detectDeviceType,
  generateDefaultDeviceName,
  getDeviceIcon,
  DEVICE_TYPES,
} from '../utils/deviceManager';
import { clearCurrentDevice } from '../utils/deviceManager';
import Skeleton from './ui/Skeleton';
import { clearCachedMek, clearCachedSalt } from '../utils/crypto';
import { clearAllUserData, deleteDb } from '../db/dexie';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export default function SettingsPage() {
  const { getToken, signOut } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [driveUsageBytes, setDriveUsageBytes] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currentDevice, setCurrentDevice] = useState(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceType, setNewDeviceType] = useState(DEVICE_TYPES.GUEST);
  const [editingDevice, setEditingDevice] = useState(null);
  const hasRegisteredDevice = Boolean(currentDevice?.isRegistered || devices.length > 0);
  const showOnlyCurrentDeviceMessage = currentDevice?.isRegistered && devices.length === 0;

  const formatBytes = (bytes = 0, decimals = 1) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      // Fetch devices
      const devicesRes = await axios.get(`${API_URL}/api/users/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDevices(devicesRes.data.devices || []);

      // Fetch analytics
      const analyticsRes = await axios.get(`${API_URL}/api/users/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAnalytics(analyticsRes.data);

      // Check Google connection via GIS client
      initGisClient();
      const connected = hasValidToken();
      setGoogleConnected(connected);
      if (connected) {
        try {
          const usage = await getDriveFolderUsage();
          setDriveUsageBytes(usage);
        } catch (err) {
          console.warn('Failed to fetch Drive usage', err?.message);
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchUserData();
    // Load current device
    const device = getCurrentDevice();
    setCurrentDevice(device);
  }, [fetchUserData]);

  useEffect(() => {
    const interval = setInterval(() => {
      setGoogleConnected(hasValidToken());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const removeDevice = async (deviceId) => {
    if (!confirm('Remove this device?')) return;

    try {
      const token = await getToken();
      if (!token) return;

      await axios.delete(`${API_URL}/api/users/devices/${deviceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchUserData();
    } catch (error) {
      console.error('Error removing device:', error);
      alert('Failed to remove device');
    }
  };

  const handleAddCurrentDevice = async () => {
    const device = getCurrentDevice();
    const detectedType = detectDeviceType();
    setNewDeviceType(detectedType);
    setNewDeviceName(generateDefaultDeviceName(detectedType));
    setShowAddDevice(true);
  };

  const handleSaveDevice = async () => {
    if (!newDeviceName.trim()) {
      setMessage({ type: 'error', text: 'Device name is required' });
      return;
    }

    try {
      setLoading(true);
      setMessage({ type: '', text: '' });

      const token = await getToken();
      if (!token) return;

      const device = getCurrentDevice();

      // Register device in backend
      await axios.post(
        `${API_URL}/api/users/devices`,
        {
          deviceId: device.deviceId,
          name: newDeviceName,
          type: newDeviceType,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Update local storage
      const updatedDevice = registerDevice(newDeviceName, newDeviceType);
      setCurrentDevice(updatedDevice);

      setMessage({ type: 'success', text: 'Device registered successfully!' });
      setShowAddDevice(false);
      fetchUserData();
    } catch (error) {
      console.error('Error saving device:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to save device',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDevice = async (deviceId, newName) => {
    if (!newName.trim()) return;

    try {
      const token = await getToken();
      if (!token) return;

      await axios.put(
        `${API_URL}/api/users/devices/${deviceId}`,
        { name: newName },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Update current device if it's the one being edited
      if (currentDevice?.deviceId === deviceId) {
        const updatedDevice = { ...currentDevice, name: newName };
        setCurrentDevice(updatedDevice);
        registerDevice(newName, currentDevice.type);
      }

      setEditingDevice(null);
      fetchUserData();
    } catch (error) {
      console.error('Error updating device:', error);
      alert('Failed to update device');
    }
  };

  const handleConnectGoogle = async () => {
    try {
      setGoogleLoading(true);
      setMessage({ type: '', text: '' });

      // Use GIS to get access token (shows consent popup)
      const loginHint = user?.primaryEmailAddress?.emailAddress;
      await getAccessToken({ prompt: 'consent', login_hint: loginHint });

      setMessage({ type: 'success', text: 'Google Drive connected successfully!' });
      setGoogleConnected(true);
      try {
        const usage = await getDriveFolderUsage();
        setDriveUsageBytes(usage);
      } catch (err) {
        console.warn('Failed to refresh Drive usage after connect', err?.message);
      }
    } catch (error) {
      console.error('Error connecting Google:', error);
      setMessage({
        type: 'error',
        text: error.message || 'Failed to connect Google Drive',
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleClearAllMessages = async () => {
    if (
      !confirm(
        '⚠️ DELETE ALL MESSAGES?\n\nThis will permanently delete ALL your messages and files from both Google Drive and our database.\n\nThis action CANNOT be undone.\n\nAre you sure?'
      )
    )
      return;

    try {
      setLoading(true);
      setMessage({ type: '', text: '' });

      const token = await getToken();
      if (!token) return;

      const response = await axios.delete(`${API_URL}/api/messages/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setMessage({
        type: 'success',
        text: `Successfully deleted ${response.data.messagesDeleted} messages and ${response.data.filesDeleted} files.`,
      });

      // Refresh analytics
      fetchUserData();
    } catch (error) {
      console.error('Error clearing messages:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to clear messages',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    // First confirmation
    if (
      !confirm(
        '⚠️ DELETE ACCOUNT?\n\nThis will permanently delete:\n• Your entire account\n• All messages and files\n• All data from Google Drive\n• All settings and preferences\n\nThis action CANNOT be undone.\n\nAre you absolutely sure?'
      )
    )
      return;

    // Second confirmation
    const confirmText = prompt(
      'Type "DELETE MY ACCOUNT" (in all caps) to confirm permanent account deletion:'
    );

    if (confirmText !== 'DELETE MY ACCOUNT') {
      alert('Account deletion cancelled.');
      return;
    }

    try {
      setLoading(true);
      setMessage({ type: '', text: '' });

      const token = await getToken();
      if (!token) return;

      await axios.delete(`${API_URL}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Sign out and redirect to home
      alert('Your account has been permanently deleted.');
      try {
        clearCachedMek(user?.id);
        clearCachedSalt(user?.id);
        await clearAllUserData(user?.id);
        await deleteDb();
        // Clear prechat flag and any other drivechat_ localStorage keys
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (key.startsWith('drivechat_')) localStorage.removeItem(key);
          }
        } catch (lsErr) {
          console.warn('Failed to clear drivechat localStorage keys', lsErr?.message);
        }

        // Clear any GIS token state and device info
        try {
          revokeToken();
          clearStoredToken();
        } catch (gisErr) {
          console.warn('Failed to clear GIS tokens', gisErr?.message);
        }

        try {
          clearCurrentDevice();
        } catch (devErr) {
          console.warn('Failed to clear device info', devErr?.message);
        }

        // Clear sessionStorage as well
        try {
          sessionStorage.clear();
        } catch (ssErr) {
          console.warn('Failed to clear sessionStorage', ssErr?.message);
        }
      } catch (cacheErr) {
        console.warn('Failed to clear cached encryption data', cacheErr?.message);
      }

      try {
        await signOut();
      } catch (signErr) {
        console.warn('signOut failed, redirecting anyway', signErr?.message);
      }

      window.location.href = '/';
    } catch (error) {
      console.error('Error deleting account:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to delete account',
      });
      setLoading(false);
    }
  };

  const handleUnstarAll = async () => {
    if (
      !confirm(
        '⚠️ UNSTAR ALL MESSAGES?\n\nThis will remove the star from ALL your starred messages.\n\nUnstarred messages will expire in 24 hours.\n\nAre you sure?'
      )
    )
      return;

    try {
      setLoading(true);
      setMessage({ type: '', text: '' });

      const token = await getToken();
      if (!token) return;

      const response = await axios.patch(
        `${API_URL}/api/messages/unstar-all`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setMessage({
        type: 'success',
        text: `Successfully unstarred ${response.data.messagesUnstarred} messages.`,
      });

      // Refresh analytics
      fetchUserData();
    } catch (error) {
      console.error('Error unstarring messages:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to unstar messages',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/chat')}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Settings</h1>
              <p className="text-sm text-gray-400">Manage your account and preferences</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {loading ? (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
              <Skeleton className="h-5 w-40" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-9 w-28 rounded-lg" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Messages */}
            {message.text && (
              <div
                className={`p-4 rounded-lg ${
                  message.type === 'success'
                    ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}
              >
                {message.text}
              </div>
            )}

            {/* Google Drive Section */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-6">
                <HardDrive className="w-5 h-5 text-blue-400" />
                <h2 className="text-xl font-semibold text-white">Google Drive</h2>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium mb-1">
                    Status:{' '}
                    <span className={googleConnected ? 'text-green-400' : 'text-gray-400'}>
                      {googleConnected ? 'Connected' : 'Not Connected'}
                    </span>
                  </p>
                  <p className="text-sm text-gray-400">
                    {googleConnected
                      ? 'You can upload files from Google Drive to chat'
                      : 'Connect your Google Drive to share files in conversations'}
                  </p>
                  {driveUsageBytes !== null && (
                    <p className="text-xs text-gray-400 mt-2">
                      DriveChat folder size: {formatBytes(driveUsageBytes)}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleConnectGoogle}
                  disabled={googleLoading}
                  className={`px-4 py-2 rounded-lg transition-colors font-medium ${
                    googleConnected
                      ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 disabled:opacity-50'
                      : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 disabled:opacity-50'
                  }`}
                >
                  {googleLoading ? 'Processing...' : googleConnected ? 'Refresh Status' : 'Connect'}
                </button>
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-6">
                <User className="w-5 h-5 text-blue-400" />
                <h2 className="text-xl font-semibold text-white">Profile</h2>
              </div>
              <div className="flex items-center gap-4 mb-6">
                <img
                  src={user?.imageUrl || 'https://via.placeholder.com/80'}
                  alt={user?.fullName || 'User'}
                  className="w-20 h-20 rounded-full object-cover"
                />
                <div>
                  <p className="text-white font-medium text-lg">
                    {user?.fullName || user?.firstName || 'User'}
                  </p>
                  <p className="text-gray-400">{user?.primaryEmailAddress?.emailAddress}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Joined {new Date(user?.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Analytics Section */}
            {analytics && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Shield className="w-5 h-5 text-green-400" />
                  <h2 className="text-xl font-semibold text-white">Usage Statistics</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-gray-800 rounded-lg p-4">
                    <p className="text-gray-400 text-sm">Total Messages</p>
                    <p className="text-white text-2xl font-bold">
                      {analytics.analytics?.totalMessagesCount || 0}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <p className="text-gray-400 text-sm">Starred</p>
                    <p className="text-white text-2xl font-bold">
                      {analytics.analytics?.starredCount || 0}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <p className="text-gray-400 text-sm">Storage Used</p>
                    <p className="text-white text-2xl font-bold">
                      {driveUsageBytes !== null ? formatBytes(driveUsageBytes) : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Devices Section */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-purple-400" />
                  <h2 className="text-xl font-semibold text-white">Devices</h2>
                </div>
                {!currentDevice?.isRegistered && (
                  <button
                    onClick={handleAddCurrentDevice}
                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add This Device
                  </button>
                )}
              </div>

              {showOnlyCurrentDeviceMessage && (
                <p className="text-center text-sm text-gray-400 mb-4">
                  Only your current device is registered right now. Refresh the page if it doesn't
                  appear below this line.
                </p>
              )}

              {/* Current Device Info */}
              {currentDevice && (
                <div className="mb-4 p-4 bg-linear-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-lg">
                  <p className="text-xs text-purple-400 mb-2 font-semibold">CURRENT DEVICE</p>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-purple-600/20 flex items-center justify-center border-2 border-purple-500/30">
                      <img
                        src={getDeviceIcon(currentDevice.type)}
                        alt={currentDevice.type}
                        className="w-6 h-6"
                      />
                    </div>
                    <div>
                      <p className="text-white font-medium">{currentDevice.name}</p>
                      <p className="text-sm text-gray-400 capitalize">
                        {currentDevice.type}
                        {!currentDevice.isRegistered && (
                          <span className="ml-2 text-xs text-yellow-400">(Not Registered)</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Add Device Modal */}
              {showAddDevice && (
                <div className="mb-4 p-4 bg-gray-800 border border-gray-700 rounded-lg">
                  <h3 className="text-white font-medium mb-3">Register Current Device</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Device Name</label>
                      <input
                        type="text"
                        value={newDeviceName}
                        onChange={(e) => setNewDeviceName(e.target.value)}
                        placeholder="My Laptop"
                        className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Device Type</label>
                      <select
                        value={newDeviceType}
                        onChange={(e) => setNewDeviceType(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                      >
                        <option value={DEVICE_TYPES.MOBILE}>Mobile</option>
                        <option value={DEVICE_TYPES.LAPTOP}>Laptop</option>
                        <option value={DEVICE_TYPES.TABLET}>Tablet</option>
                        <option value={DEVICE_TYPES.PC}>PC</option>
                        <option value={DEVICE_TYPES.GUEST}>Guest</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveDevice}
                        disabled={loading}
                        className="flex-1 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setShowAddDevice(false)}
                        className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Registered Devices List */}
              {!hasRegisteredDevice ? (
                <p className="text-gray-400 text-center py-4">
                  No devices registered. Add this device to get started!
                </p>
              ) : devices.length === 0 ? null : (
                <div className="space-y-3">
                  {devices.map((device) => {
                    const isCurrentDevice = device.deviceId === currentDevice?.deviceId;
                    return (
                      <div
                        key={device.deviceId}
                        className={`flex items-center justify-between p-4 rounded-lg ${
                          isCurrentDevice
                            ? 'bg-purple-500/10 border border-purple-500/30'
                            : 'bg-gray-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              isCurrentDevice ? 'bg-purple-600/20' : 'bg-gray-700'
                            }`}
                          >
                            <img
                              src={getDeviceIcon(device.type)}
                              alt={device.type}
                              className="w-5 h-5"
                            />
                          </div>
                          <div>
                            {editingDevice === device.deviceId ? (
                              <input
                                type="text"
                                defaultValue={device.name}
                                onBlur={(e) => handleUpdateDevice(device.deviceId, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleUpdateDevice(device.deviceId, e.target.value);
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingDevice(null);
                                  }
                                }}
                                autoFocus
                                className="px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-purple-500 focus:outline-none"
                              />
                            ) : (
                              <p className="text-white font-medium">
                                {device.name || device.deviceId}
                                {isCurrentDevice && (
                                  <span className="ml-2 text-xs text-purple-400">
                                    (This Device)
                                  </span>
                                )}
                              </p>
                            )}
                            <p className="text-sm text-gray-400 capitalize">
                              {device.type} • Last seen:{' '}
                              {new Date(device.lastSeen).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingDevice(device.deviceId)}
                            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-gray-700 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeDevice(device.deviceId)}
                            className="p-2 text-red-400 hover:text-red-300 hover:bg-gray-700 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Danger Zone */}
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-red-400 mb-4">Danger Zone</h2>

              {/* Unstar All Messages */}
              <div className="mb-6 pb-6 border-b border-red-500/20">
                <p className="text-gray-400 mb-2 font-medium">Unstar All Messages</p>
                <p className="text-sm text-gray-500 mb-4">
                  Remove stars from all starred messages. Unstarred messages will expire in 24
                  hours.
                </p>
                <button
                  onClick={handleUnstarAll}
                  disabled={loading}
                  className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-colors disabled:opacity-50"
                >
                  Unstar All Messages
                </button>
              </div>

              {/* Clear All Messages */}
              <div className="mb-6 pb-6 border-b border-red-500/20">
                <p className="text-gray-400 mb-2 font-medium">Clear All Messages</p>
                <p className="text-sm text-gray-500 mb-4">
                  Permanently delete all your messages and files. This will remove files from Google
                  Drive and all message data.
                </p>
                <button
                  onClick={handleClearAllMessages}
                  disabled={loading}
                  className="px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg transition-colors disabled:opacity-50"
                >
                  Clear All Messages
                </button>
              </div>

              {/* Delete Account */}
              <div>
                <p className="text-gray-400 mb-2 font-medium">Delete Account</p>
                <p className="text-sm text-gray-500 mb-4">
                  Once you delete your account, there is no going back. This will delete all your
                  data, messages, files, and settings permanently.
                </p>
                <button
                  onClick={handleDeleteAccount}
                  disabled={loading}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                >
                  Delete Account Permanently
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
