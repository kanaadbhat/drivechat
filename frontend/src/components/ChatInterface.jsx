import { useState, useEffect, useRef } from 'react';
import { useAuth, useUser, useSession } from '@clerk/clerk-react';
import {
  Paperclip,
  Star,
  Clock,
  LogOut,
  Settings,
  Menu,
  X,
  StarOff,
  Image as ImageIcon,
  File,
  Trash2,
  Search,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

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
  const expiryTime = '24h'; // Hardcoded to 24 hours
  const [showSidebar, setShowSidebar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Helper functions - defined before useEffect hooks that use them
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      let url = `${API_URL}/api/messages`;
      if (searchQuery.trim()) {
        url = `${API_URL}/api/messages/search?q=${encodeURIComponent(searchQuery)}`;
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const checkGoogleConnection = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const response = await axios.get(`${API_URL}/api/oauth/google/check`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setGoogleConnected(response.data.connected);
    } catch (error) {
      console.log('Google not connected:', error.response?.data?.message);
      setGoogleConnected(false);
    }
  };

  // Start Google OAuth flow
  const startGoogleOAuth = async () => {
    try {
      const token = await getToken();
      if (!token) {
        alert('Authentication required');
        return;
      }

      // Redirect to backend OAuth endpoint with token as query parameter
      // (window.location.href doesn't send Authorization headers)
      window.location.href = `${API_URL}/api/oauth/google/auth?token=${encodeURIComponent(token)}`;
    } catch (error) {
      console.error('OAuth start error:', error);
      alert('Failed to start OAuth flow');
    }
  };

  // Get Google OAuth token from Clerk session or Firestore
  const getGoogleToken = async () => {
    try {
      console.log('=== GETTING GOOGLE TOKEN ===');

      const clerkToken = await getToken();
      if (!clerkToken) {
        console.error('No Clerk token available');
        return null;
      }

      // Get tokens from backend (which stores them in Firestore)
      try {
        const response = await axios.get(`${API_URL}/api/oauth/google/tokens`, {
          headers: { Authorization: `Bearer ${clerkToken}` },
        });
        console.log('Got tokens from backend:', response.data);
        return response.data.accessToken;
      } catch (backendError) {
        console.error('Backend error:', backendError.response?.data);
        return null;
      }
    } catch (error) {
      console.error('Error getting Google token:', error);
      return null;
    }
  };

  // useEffect hooks

  useEffect(() => {
    const fetch = async () => {
      await fetchMessages();
    };
    fetch();
  }, [searchQuery]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!searchQuery) fetchMessages();
    }, 5000);
    return () => clearInterval(interval);
  }, [searchQuery]);

  useEffect(() => {
    const check = async () => {
      await checkGoogleConnection();
    };
    check();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputMessage.trim() && !selectedFile) return;

    try {
      const token = await getToken();
      if (!token) {
        alert('Authentication required');
        return;
      }

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

      if (selectedFile) {
        try {
          // Get Google OAuth token from stored Firestore tokens
          const googleToken = await getGoogleToken();

          if (!googleToken) {
            alert(
              'Please connect Google Drive first.\n\nClick the "Connect Google Drive" button in the sidebar.'
            );
            return;
          }

          const fileFormData = new FormData();
          fileFormData.append('file', selectedFile);

          const fileResponse = await axios.post(`${API_URL}/api/files/upload`, fileFormData, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          });

          fileId = fileResponse.data.fileId;
          fileName = fileResponse.data.fileName;
          fileSize = fileResponse.data.fileSize;
          mimeType = fileResponse.data.mimeType;
          fileCategory = fileResponse.data.fileCategory;
          webViewLink = fileResponse.data.webViewLink;
        } catch (uploadError) {
          console.error('File upload failed:', uploadError);
          alert(
            `File upload failed: ${uploadError.response?.data?.message || uploadError.message}`
          );
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
            filePreviewUrl: webViewLink,
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
      if (isStarred) {
        await axios.patch(
          `${API_URL}/api/messages/${messageId}`,
          {
            starred: false,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      } else {
        await axios.patch(
          `${API_URL}/api/messages/${messageId}`,
          {
            starred: true,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }
      fetchMessages();
    } catch (error) {
      console.error('Error toggling star:', error);
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
            {googleConnected ? (
              <button
                onClick={checkGoogleConnection}
                className="w-full px-4 py-2 text-left text-green-400 hover:text-green-300 hover:bg-green-900/20 rounded-lg transition-colors flex items-center gap-3 text-xs"
              >
                ✅ Google Drive Connected
              </button>
            ) : (
              <button
                onClick={startGoogleOAuth}
                className="w-full px-4 py-2 text-left text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded-lg transition-colors flex items-center gap-3 text-xs font-medium"
                title="Click to authorize Google Drive access for file uploads"
              >
                🔗 Connect Google Drive
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
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => setShowSidebar(true)}
              className="lg:hidden text-gray-400 hover:text-white"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-white font-semibold flex-1">Messages</h2>
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Clock className="w-4 h-4" />
              <span>Auto-delete: 24 hours</span>
            </div>
          </div>
          {showSearch && (
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages..."
              className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
            />
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">No messages yet</p>
                <p className="text-sm">Send your first message below</p>
              </div>
            </div>
          ) : (
            messages.map((message) => {
              // Check if the message belongs to the current user
              const isSentByMe = message.sender?.deviceId === localStorage.getItem('deviceId');

              return (
                <div
                  key={message.id}
                  className={`flex ${isSentByMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-md px-4 py-3 rounded-lg ${
                      isSentByMe ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-100'
                    }`}
                  >
                    {message.type === 'text' && message.text && (
                      <p className="wrap-break-word">{message.text}</p>
                    )}
                    {message.type === 'file' && message.fileName && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-sm">
                          {getFileIcon(message.fileName)}
                          <span className="truncate font-medium">{message.fileName}</span>
                        </div>
                        {message.fileSize && (
                          <p className="text-xs opacity-75">
                            {(message.fileSize / 1024).toFixed(2)} KB
                          </p>
                        )}
                        {message.filePreviewUrl && (
                          <a
                            href={message.filePreviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline hover:no-underline opacity-90"
                          >
                            View in Google Drive
                          </a>
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
              disabled={!inputMessage.trim() && !selectedFile}
              className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
