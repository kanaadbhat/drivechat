import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, useUser, useSession } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Star,
  StarOff,
  Menu,
  X,
  Edit,
  Copy,
  Eye,
  Trash2,
  Paperclip,
  Send,
  Settings,
  LogOut,
  Filter,
  Search,
  Clock,
  File,
  ImageIcon,
  FileText,
} from 'lucide-react';

dayjs.extend(relativeTime);

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export default function ChatInterface() {
  const { signOut, getToken } = useAuth();
  const { user } = useUser();
  const { session } = useSession();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [authenticatedUrls, setAuthenticatedUrls] = useState({});
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Helper functions - defined before useEffect hooks that use them
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      let url = `${API_URL}/api/messages`;

      // If showing starred only, fetch from starred endpoint
      if (showStarredOnly) {
        url = `${API_URL}/api/messages/category/starred`;
        console.log('Fetching starred messages from:', url);
      } else if (searchQuery.trim()) {
        url = `${API_URL}/api/messages/search?q=${encodeURIComponent(searchQuery)}`;
        console.log('Searching messages:', searchQuery);
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log('Received messages:', response.data.messages?.length, 'messages');

      // Reverse the order so newest messages appear at the bottom
      const sortedMessages = (response.data.messages || []).sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      setMessages(sortedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      // If starred filter fails, try client-side filtering instead
      if (showStarredOnly && error.response?.status === 500) {
        console.log('Falling back to client-side starred filtering');
        try {
          const token = await getToken();
          if (!token) return;

          const response = await axios.get(`${API_URL}/api/messages`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const allMessages = response.data.messages || [];
          const starredMessages = allMessages.filter((msg) => msg.starred === true);
          const sortedMessages = starredMessages.sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
          );
          setMessages(sortedMessages);
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError);
        }
      }
    }
  }, [getToken, showStarredOnly, searchQuery]);

  const checkGoogleConnection = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        console.warn('   - ❌ [checkGoogleConnection] No JWT token');
        return false;
      }

      console.log(
        '   - 🔍 [checkGoogleConnection] Calling GET /api/authentication/google/check...'
      );
      const response = await axios.get(`${API_URL}/api/authentication/google/check`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const connected = response.data.connected;
      const needsAuthorization = response.data.needsAuthorization;
      console.log('     - Status: ' + (connected ? '✅ CONNECTED' : '❌ NOT CONNECTED'));
      console.log('     - Has Refresh Token:', response.data.hasRefreshToken ? '✅' : '❌');
      console.log('     - Needs Authorization:', needsAuthorization ? '⚠️  YES' : '❌ NO');

      setGoogleConnected(connected);

      // If authorization is needed (no tokens or no refresh token), redirect to auth page
      if (needsAuthorization) {
        console.log('   - 🔄 Redirecting to authorization page...');
        navigate('/authorize?reauth=true');
        return false;
      }

      return connected;
    } catch (error) {
      console.warn(
        '   - ⚠️  [checkGoogleConnection] Request failed:',
        error.response?.data?.message || error.message
      );
      setGoogleConnected(false);
      return false;
    }
  }, [getToken, navigate]);

  // Get Google OAuth token from Clerk session or Firestore
  const getGoogleToken = useCallback(async () => {
    try {
      console.log('     - 🔑 [getGoogleToken] Fetching Google token...');

      const clerkToken = await getToken();
      if (!clerkToken) {
        console.error('       - ❌ No Clerk JWT available');
        return null;
      }

      // Get tokens from backend (which stores them in Firestore)
      try {
        console.log('       - 📞 Calling GET /api/authentication/google/tokens...');
        const response = await axios.get(`${API_URL}/api/authentication/google/tokens`, {
          headers: { Authorization: `Bearer ${clerkToken}` },
        });
        console.log('       - ✅ Got Google token from backend');
        return response.data.accessToken;
      } catch (backendError) {
        console.error(
          '       - ❌ Backend error:',
          backendError.response?.data?.message || backendError.message
        );
        return null;
      }
    } catch (error) {
      console.error('       - ❌ Error getting Google token:', error);
      return null;
    }
  }, [getToken]);

  // useEffect hooks

  useEffect(() => {
    const fetch = async () => {
      await fetchMessages();
    };
    fetch();
  }, [searchQuery, showStarredOnly, fetchMessages]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Only auto-refresh if: not searching, not filtering starred, and document is visible
      if (!searchQuery && !showStarredOnly && document.visibilityState === 'visible') {
        fetchMessages();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [searchQuery, showStarredOnly, fetchMessages]);

  // Handle OAuth query parameters (success/error from authorization callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');

    if (success === 'true') {
      console.log('✅ Authorization callback successful');
      checkGoogleConnection();
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error) {
      console.error('❌ Authorization callback failed:', error);
      // Don't show alert - let AuthorizationPage handle error display
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [checkGoogleConnection]);

  useEffect(() => {
    const check = async () => {
      await checkGoogleConnection();
    };
    check();
  }, [checkGoogleConnection]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputMessage.trim() && !selectedFile) return;
    if (isSending) return; // Prevent double-sending

    setIsSending(true);

    try {
      const token = await getToken();
      if (!token) {
        alert('Authentication required');
        setIsSending(false);
        return;
      }

      console.log('\n💬 [sendMessage] Starting message send...');

      // Get device info
      const deviceId = localStorage.getItem('deviceId') || `device-${Date.now()}`;
      const deviceName =
        localStorage.getItem('deviceName') || `Browser-${navigator.userAgent.split(' ').pop()}`;

      localStorage.setItem('deviceId', deviceId);
      localStorage.setItem('deviceName', deviceName);

      // If file is selected, upload to Google Drive
      let fileId = null;
      let fileName = null;
      let fileSize = null;
      let mimeType = null;
      let fileCategory = null;
      let webViewLink = null;
      let webContentLink = null;

      if (selectedFile) {
        console.log('   - 📎 File selected:', selectedFile.name);
        try {
          // Get Google OAuth token from stored Firestore tokens
          console.log('   - 🔑 Getting Google OAuth token...');
          const googleToken = await getGoogleToken();
          console.log('   - Token: ' + (googleToken ? '✅ Got token' : '❌ No token'));

          if (!googleToken) {
            console.warn('   - ❌ No Google token available');
            alert(
              'Please connect Google Drive first.\n\nClick the "Connect Google Drive" button in the sidebar.'
            );
            setIsSending(false);
            return;
          }

          console.log('   - 📤 Uploading file to Google Drive...');
          const fileFormData = new FormData();
          fileFormData.append('file', selectedFile);

          const fileResponse = await axios.post(`${API_URL}/api/files/upload`, fileFormData, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          });
          console.log('   - ✅ File uploaded successfully:', fileResponse.data.fileName);

          fileId = fileResponse.data.fileId;
          fileName = fileResponse.data.fileName;
          fileSize = fileResponse.data.fileSize;
          mimeType = fileResponse.data.mimeType;
          fileCategory = fileResponse.data.fileCategory;
          webViewLink = fileResponse.data.webViewLink;
          webContentLink = fileResponse.data.webContentLink;
        } catch (uploadError) {
          console.error(
            '❌ File upload failed:',
            uploadError.response?.data || uploadError.message
          );

          // Check if token was revoked
          if (uploadError.response?.data?.code === 'TOKEN_REVOKED') {
            console.log('   - 🔄 Token revoked - clearing connection status');
            setGoogleConnected(false);
            alert(
              'Google Drive authorization has expired or been revoked.\n\n' +
                'Please reconnect your Google Drive account to upload files.'
            );
          } else {
            alert(
              `File upload failed: ${uploadError.response?.data?.message || uploadError.message}`
            );
          }
          setIsSending(false);
          return;
        }
      }

      // Send text message if there's text
      if (inputMessage.trim()) {
        await axios.post(
          `${API_URL}/api/messages`,
          {
            type: 'text',
            text: inputMessage.trim(),
            deviceId,
            deviceName,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      // Send file message if there's a file
      if (fileId) {
        await axios.post(
          `${API_URL}/api/messages`,
          {
            type: 'file',
            fileId,
            fileName,
            fileSize,
            mimeType,
            fileCategory,
            filePreviewUrl: webContentLink || webViewLink,
            deviceId,
            deviceName,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      setInputMessage('');
      setSelectedFile(null);
      fetchMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      alert(`Failed to send message: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const deleteMessage = async (messageId) => {
    if (!confirm('Delete this message?')) return;

    try {
      const token = await getToken();
      if (!token) return;

      await axios.delete(`${API_URL}/api/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchMessages();
    } catch (error) {
      console.error('Error deleting message:', error);
      alert('Failed to delete message');
    }
  };

  const toggleStar = async (messageId, isStarred) => {
    try {
      const token = await getToken();
      if (!token) return;

      console.log(
        'Toggling star:',
        messageId,
        'Current starred:',
        isStarred,
        'New starred:',
        !isStarred
      );

      await axios.patch(
        `${API_URL}/api/messages/${messageId}`,
        {
          starred: !isStarred,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Refetch messages to update the UI
      await fetchMessages();
    } catch (error) {
      console.error('Error toggling star:', error);
      alert('Failed to toggle star');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const getFileIcon = (filename) => {
    if (!filename) return <File className="w-4 h-4" />;
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return <ImageIcon className="w-4 h-4" />;
    }
    return <FileText className="w-4 h-4" />;
  };

  const handleContextMenu = (e, message) => {
    e.preventDefault();

    // Calculate position with boundary checks
    const menuWidth = 200; // Approximate context menu width
    const menuHeight = 200; // Approximate context menu height
    const padding = 10;

    let x = e.clientX;
    let y = e.clientY;

    // Adjust if too close to right edge
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }

    // Adjust if too close to bottom edge
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    // Ensure not too close to left/top edges
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    setContextMenu({
      x,
      y,
      message,
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleDownloadFile = async (message) => {
    if (!message.fileId) return;

    try {
      const token = await getToken();
      const downloadUrl = `${API_URL}/api/files/${message.fileId}/content`;

      // Fetch with auth token
      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = message.fileName || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download file');
    }

    closeContextMenu();
  };

  // Get authenticated URL with token for media
  const getAuthenticatedUrl = useCallback(
    async (fileId) => {
      // Check if we already have the URL cached
      if (authenticatedUrls[fileId]) {
        return authenticatedUrls[fileId];
      }

      try {
        const token = await getToken();
        if (!token) {
          console.error('No token available for authenticated URL');
          return null;
        }

        const url = `${API_URL}/api/files/${fileId}/content?token=${encodeURIComponent(token)}`;

        // Cache the URL
        setAuthenticatedUrls((prev) => ({ ...prev, [fileId]: url }));

        return url;
      } catch (error) {
        console.error('Error getting authenticated URL:', error);
        return null;
      }
    },
    [authenticatedUrls, getToken]
  );

  // Generate authenticated URLs for all file messages when messages change
  useEffect(() => {
    const generateUrls = async () => {
      const fileMessages = messages.filter((m) => m.type === 'file' && m.fileId);
      if (fileMessages.length === 0) return;

      console.log('Generating authenticated URLs for', fileMessages.length, 'file messages');
      console.log(
        'File messages:',
        fileMessages.map((m) => ({ id: m.fileId, type: m.mimeType, name: m.fileName }))
      );

      for (const msg of fileMessages) {
        if (!authenticatedUrls[msg.fileId]) {
          const url = await getAuthenticatedUrl(msg.fileId);
          if (url) {
            console.log('Generated URL for file:', msg.fileId, '→', url);
          } else {
            console.error('Failed to generate URL for file:', msg.fileId);
          }
        } else {
          console.log('URL already cached for:', msg.fileId);
        }
      }

      console.log('Current authenticatedUrls state:', authenticatedUrls);
    };

    if (messages.length > 0) {
      generateUrls();
    }
  }, [messages, authenticatedUrls, getToken, getAuthenticatedUrl]);

  const handleEditMessage = async () => {
    if (!editText.trim() || !editingMessage) return;

    try {
      const token = await getToken();
      if (!token) return;

      await axios.patch(
        `${API_URL}/api/messages/${editingMessage}`,
        { text: editText.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setEditingMessage(null);
      setEditText('');
      fetchMessages();
    } catch (error) {
      console.error('Error editing message:', error);
      alert('Failed to edit message');
    }
  };

  const handleCopyMessage = (message) => {
    const textToCopy = message.type === 'text' ? message.text : message.fileName;
    navigator.clipboard.writeText(textToCopy || '');
    closeContextMenu();
  };

  const handleViewFile = (message) => {
    if (message.filePreviewUrl) {
      window.open(message.filePreviewUrl, '_blank');
    }
    closeContextMenu();
  };

  const startEdit = (message) => {
    setEditingMessage(message.id);
    setEditText(message.text || '');
    closeContextMenu();
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  return (
    <div className="h-screen bg-gray-950 flex overflow-hidden">
      {/* Sidebar */}
      <div
        className={`${
          showSidebar ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 fixed lg:relative z-40 w-72 bg-gray-900 border-r border-gray-800 transition-transform duration-200 h-full flex flex-col`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-xl">💬</span>
            </div>
            <span className="font-bold text-white">DriveChat</span>
          </div>
          <button
            onClick={() => setShowSidebar(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Profile */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-3 mb-4">
            <img
              src={user?.imageUrl || 'https://via.placeholder.com/40'}
              alt={user?.fullName || user?.firstName || 'User'}
              className="w-10 h-10 rounded-full object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">
                {user?.fullName || user?.firstName || 'User'}
              </p>
              <p className="text-gray-400 text-sm truncate">
                {user?.primaryEmailAddress?.emailAddress || 'user@email.com'}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/starred')}
            className="w-full px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors flex items-center justify-center gap-2 font-medium"
          >
            <Star className="w-4 h-4" />
            View Starred Messages
          </button>
        </div>

        {/* Settings */}
        <div className="flex-1 p-4">
          <div className="space-y-2">
            <button
              onClick={() => navigate('/settings')}
              className="w-full px-4 py-2 text-left text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-3"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            {googleConnected && (
              <button
                onClick={checkGoogleConnection}
                className="w-full px-4 py-2 text-left text-green-400 hover:text-green-300 hover:bg-green-900/20 rounded-lg transition-colors flex items-center gap-3 text-xs"
              >
                ✅ Google Drive Connected
              </button>
            )}
            <button
              onClick={() => {
                console.log('=== FULL DEBUG INFO ===');
                console.log('User object:', JSON.stringify(user, null, 2));
                console.log('External accounts:', user?.externalAccounts);
                console.log('Session object:', JSON.stringify(session, null, 2));
                console.log('Google connected state:', googleConnected);

                const clerkGoogle = user?.externalAccounts?.find((a) => a.provider === 'google');
                const statusMsg = googleConnected
                  ? '✅ Google Drive is connected for file uploads'
                  : clerkGoogle
                    ? '⚠️ You signed in with Google, but need to authorize Drive access.\n\nClick "Connect Google Drive" button above.'
                    : '❌ Not connected. Click "Connect Google Drive" to enable file uploads.';

                alert(
                  `User: ${user?.firstName || 'Unknown'}\nEmail: ${user?.primaryEmailAddress?.emailAddress || 'N/A'}\n\n${statusMsg}\n\nCheck browser console for full details!`
                );
              }}
              className="w-full px-4 py-2 text-left text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-3 text-xs"
            >
              Debug User Data
            </button>
          </div>
        </div>

        {/* Sign Out */}
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full">
        {/* Chat Header */}
        <div className="bg-gray-900 border-b border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(true)}
              className="lg:hidden text-gray-400 hover:text-white"
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Animated Header Title */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 bg-linear-to-br from-blue-500 via-purple-500 to-pink-500 rounded-lg flex items-center justify-center shadow-lg shrink-0">
                <span className="text-lg">💬</span>
              </div>
              {!showSearch ? (
                <div className="flex flex-col min-w-0 flex-1">
                  <h2 className="font-bold text-lg bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent truncate">
                    DriveChat
                  </h2>
                  <p className="text-xs text-gray-400 truncate">
                    {showStarredOnly ? 'Starred Messages' : `${messages.length} messages`}
                  </p>
                </div>
              ) : (
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 px-3 py-1.5 bg-gray-800 text-white text-sm rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none min-w-0"
                  autoFocus
                />
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowStarredOnly(!showStarredOnly);
                  if (!showStarredOnly) {
                    // When enabling starred filter, clear search
                    setShowSearch(false);
                    setSearchQuery('');
                  }
                }}
                className={`p-2 ${
                  showStarredOnly
                    ? 'text-yellow-400 bg-yellow-400/10'
                    : 'text-gray-400 hover:bg-gray-800'
                } hover:text-yellow-300 rounded-lg transition-colors`}
                title={showStarredOnly ? 'Show all messages' : 'Show only starred messages'}
              >
                <Filter className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setShowSearch(!showSearch);
                  if (!showSearch) setSearchQuery('');
                }}
                className={`p-2 ${
                  showSearch ? 'text-blue-400 bg-blue-400/10' : 'text-gray-400 hover:bg-gray-800'
                } hover:text-blue-300 rounded-lg transition-colors`}
              >
                <Search className="w-5 h-5" />
              </button>
              <div className="hidden md:flex items-center gap-2 text-sm text-gray-400 px-3 py-1.5 bg-gray-800/50 rounded-lg">
                <Clock className="w-4 h-4" />
                <span>24h</span>
              </div>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">
                  {showStarredOnly ? 'No starred messages' : 'No messages yet'}
                </p>
                <p className="text-sm">
                  {showStarredOnly
                    ? 'Star messages to see them here'
                    : 'Send your first message below'}
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => {
              // Check if the message belongs to the current user
              const isSentByMe = message.sender?.deviceId === localStorage.getItem('deviceId');
              const isEditing = editingMessage === message.id;

              return (
                <div
                  key={message.id}
                  className={`flex ${isSentByMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-md px-4 py-3 rounded-lg ${
                      isSentByMe ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-100'
                    } relative group`}
                    onContextMenu={(e) => handleContextMenu(e, message)}
                  >
                    {message.type === 'text' && message.text && (
                      <>
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditMessage();
                                if (e.key === 'Escape') {
                                  setEditingMessage(null);
                                  setEditText('');
                                }
                              }}
                              className="w-full px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleEditMessage}
                                className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingMessage(null);
                                  setEditText('');
                                }}
                                className="px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="wrap-break-word">
                            {message.text}
                            {message.edited && (
                              <span className="text-xs opacity-60 ml-2">(edited)</span>
                            )}
                          </p>
                        )}
                      </>
                    )}
                    {message.type === 'file' && message.fileName && (
                      <div
                        className="flex flex-col gap-2"
                        onDoubleClick={() =>
                          message.fileId &&
                          window.open(
                            `https://drive.google.com/file/d/${message.fileId}/view`,
                            '_blank'
                          )
                        }
                      >
                        {/* Image preview */}
                        {message.mimeType?.startsWith('image/') && message.fileId && (
                          <>
                            {authenticatedUrls[message.fileId] ? (
                              <img
                                src={authenticatedUrls[message.fileId]}
                                alt={message.fileName}
                                className="max-w-xs max-h-64 rounded cursor-pointer object-cover"
                                onClick={() =>
                                  window.open(
                                    `https://drive.google.com/file/d/${message.fileId}/view`,
                                    '_blank'
                                  )
                                }
                                onError={(e) => {
                                  console.error('Image load error for', message.fileId);
                                  e.target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="flex items-center justify-center w-32 h-32 bg-gray-700 rounded">
                                <span className="text-gray-400 text-xs">Loading...</span>
                              </div>
                            )}
                          </>
                        )}
                        {/* Video preview with controls */}
                        {message.mimeType?.startsWith('video/') && message.fileId && (
                          <>
                            {authenticatedUrls[message.fileId] ? (
                              <video
                                controls
                                controlsList="nodownload"
                                className="max-w-xs max-h-64 rounded"
                                onError={(e) => {
                                  console.error('Video load error for', message.fileId);
                                  e.target.style.display = 'none';
                                }}
                              >
                                <source
                                  src={authenticatedUrls[message.fileId]}
                                  type={message.mimeType}
                                />
                                Your browser does not support the video tag.
                              </video>
                            ) : (
                              <div className="flex items-center justify-center w-64 h-48 bg-gray-700 rounded">
                                <span className="text-gray-400 text-xs">Loading video...</span>
                              </div>
                            )}
                          </>
                        )}
                        {/* Audio preview with controls */}
                        {message.mimeType?.startsWith('audio/') && message.fileId && (
                          <>
                            {authenticatedUrls[message.fileId] ? (
                              <audio controls className="w-full max-w-xs">
                                <source
                                  src={authenticatedUrls[message.fileId]}
                                  type={message.mimeType}
                                />
                                Your browser does not support the audio tag.
                              </audio>
                            ) : (
                              <div className="flex items-center justify-center w-64 h-12 bg-gray-700 rounded">
                                <span className="text-gray-400 text-xs">Loading audio...</span>
                              </div>
                            )}
                          </>
                        )}
                        {/* PDF preview - show link instead of iframe due to CORS */}
                        {message.mimeType === 'application/pdf' && message.fileId && (
                          <div className="px-4 py-3 bg-gray-700/50 rounded">
                            <p className="text-sm text-gray-300 mb-2">PDF Document</p>
                            <button
                              onClick={() =>
                                window.open(
                                  `https://drive.google.com/file/d/${message.fileId}/view`,
                                  '_blank'
                                )
                              }
                              className="text-sm text-blue-400 hover:text-blue-300 underline"
                            >
                              Open in Google Drive
                            </button>
                          </div>
                        )}
                        {/* File info */}
                        <div className="flex items-center gap-2 text-sm">
                          {getFileIcon(message.fileName)}
                          <span className="truncate font-medium">{message.fileName}</span>
                        </div>
                        {message.fileSize && (
                          <p className="text-xs opacity-75">
                            {(message.fileSize / 1024).toFixed(2)} KB
                          </p>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 mt-2 text-xs opacity-75">
                      <span>{dayjs(message.timestamp).fromNow()}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => toggleStar(message.id, message.starred)}
                          className="hover:scale-110 transition-transform"
                        >
                          {message.starred ? (
                            <Star className="w-3 h-3 fill-current" />
                          ) : (
                            <StarOff className="w-3 h-3" />
                          )}
                        </button>
                        {isSentByMe && (
                          <button
                            onClick={() => deleteMessage(message.id)}
                            className="hover:scale-110 transition-transform text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                toggleStar(contextMenu.message.id, contextMenu.message.starred);
                closeContextMenu();
              }}
              className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
            >
              {contextMenu.message.starred ? (
                <>
                  <StarOff className="w-4 h-4" /> Unstar
                </>
              ) : (
                <>
                  <Star className="w-4 h-4" /> Star
                </>
              )}
            </button>
            {contextMenu.message.type === 'text' && (
              <button
                onClick={() => startEdit(contextMenu.message)}
                className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
              >
                <Edit className="w-4 h-4" /> Edit
              </button>
            )}
            <button
              onClick={() => handleCopyMessage(contextMenu.message)}
              className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
            >
              <Copy className="w-4 h-4" /> Copy
            </button>
            {contextMenu.message.type === 'file' && contextMenu.message.fileId && (
              <>
                <button
                  onClick={() => handleViewFile(contextMenu.message)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" /> View
                </button>
                <button
                  onClick={() => handleDownloadFile(contextMenu.message)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download
                </button>
              </>
            )}
            <button
              onClick={() => {
                deleteMessage(contextMenu.message.id);
                closeContextMenu();
              }}
              className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        )}

        {/* Input Area */}
        <div className="bg-gray-900 border-t border-gray-800 p-4">
          {selectedFile && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg text-sm text-gray-300">
                {getFileIcon(selectedFile.name)}
                <span className="truncate max-w-xs">{selectedFile.name}</span>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={(!inputMessage.trim() && !selectedFile) || isSending}
              className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center"
            >
              {isSending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
