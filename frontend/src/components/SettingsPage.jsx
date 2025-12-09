import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, HardDrive, User, Shield, Bell, Trash2 } from 'lucide-react';
import {
  checkGoogleConnection,
  saveClerkProviderTokens,
  revokeGoogleTokens,
} from '../utils/driveAuth.js';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export default function SettingsPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

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

      // Check Google connection
      const connRes = await checkGoogleConnection(getToken);
      setGoogleConnected(connRes.connected);
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

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

  const handleConnectGoogle = async () => {
    try {
      setGoogleLoading(true);
      setMessage({ type: '', text: '' });

      // Try to save Clerk provider tokens
      await saveClerkProviderTokens(getToken);

      setMessage({ type: 'success', text: 'Google Drive connected successfully!' });
      setGoogleConnected(true);
    } catch (error) {
      console.error('Error connecting Google:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to connect Google Drive',
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm('Disconnect Google Drive? You will need to reconnect to upload files.')) return;

    try {
      setGoogleLoading(true);
      setMessage({ type: '', text: '' });

      await revokeGoogleTokens(getToken);

      setMessage({ type: 'success', text: 'Google Drive disconnected.' });
      setGoogleConnected(false);
    } catch (error) {
      console.error('Error disconnecting Google:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to disconnect Google Drive',
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
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-400">Loading...</div>
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
                </div>
                <button
                  onClick={googleConnected ? handleDisconnectGoogle : handleConnectGoogle}
                  disabled={googleLoading}
                  className={`px-4 py-2 rounded-lg transition-colors font-medium ${
                    googleConnected
                      ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 disabled:opacity-50'
                      : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 disabled:opacity-50'
                  }`}
                >
                  {googleLoading ? 'Processing...' : googleConnected ? 'Disconnect' : 'Connect'}
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
                      {analytics.analytics?.storageUsedBytes
                        ? `${(analytics.analytics.storageUsedBytes / 1024 / 1024).toFixed(1)} MB`
                        : '0 MB'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Devices Section */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-6">
                <Bell className="w-5 h-5 text-purple-400" />
                <h2 className="text-xl font-semibold text-white">Devices</h2>
              </div>
              {devices.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No devices registered</p>
              ) : (
                <div className="space-y-3">
                  {devices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between p-4 bg-gray-800 rounded-lg"
                    >
                      <div>
                        <p className="text-white font-medium">{device.name || device.deviceId}</p>
                        <p className="text-sm text-gray-400">
                          Last active: {new Date(device.lastActive).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => removeDevice(device.id)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
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
