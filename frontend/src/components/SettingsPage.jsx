import { useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { ArrowLeft, User, Bell, Shield, Trash2, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export default function SettingsPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [devices, setDevices] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      // Fetch user profile
      const profileRes = await axios.get(`${API_URL}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUserProfile(profileRes.data.user);

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
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

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
            {/* Profile Section */}
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-800 rounded-lg p-4">
                    <p className="text-gray-400 text-sm">Total Messages</p>
                    <p className="text-white text-2xl font-bold">{analytics.totalMessages || 0}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <p className="text-gray-400 text-sm">Files Shared</p>
                    <p className="text-white text-2xl font-bold">{analytics.totalFiles || 0}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <p className="text-gray-400 text-sm">Starred</p>
                    <p className="text-white text-2xl font-bold">{analytics.starredCount || 0}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <p className="text-gray-400 text-sm">Storage Used</p>
                    <p className="text-white text-2xl font-bold">
                      {analytics.storageUsed
                        ? `${(analytics.storageUsed / 1024 / 1024).toFixed(1)} MB`
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
              <p className="text-gray-400 mb-4">
                Once you delete your account, there is no going back. Please be certain.
              </p>
              <button className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors">
                Delete Account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
