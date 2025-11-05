import { useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  Star,
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  File,
  Video,
  Music,
  Archive,
  Download,
  Trash2,
  Filter,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const fileTypes = [
  { id: 'all', label: 'All Files', icon: File },
  {
    id: 'images',
    label: 'Images',
    icon: ImageIcon,
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FileText,
    extensions: ['pdf', 'doc', 'docx', 'txt', 'xlsx'],
  },
  { id: 'videos', label: 'Videos', icon: Video, extensions: ['mp4', 'mov', 'avi', 'mkv'] },
  { id: 'audio', label: 'Audio', icon: Music, extensions: ['mp3', 'wav', 'ogg'] },
  { id: 'archives', label: 'Archives', icon: Archive, extensions: ['zip', 'rar', '7z', 'tar'] },
];

export default function StarredMessages() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const [starredMessages, setStarredMessages] = useState([]);
  const [selectedType, setSelectedType] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStarredMessages();
  }, []);

  const fetchStarredMessages = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      // Use category endpoint to get starred messages
      const response = await axios.get(`${API_URL}/api/messages/category/starred`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStarredMessages(response.data.messages || []);
    } catch (error) {
      console.error('Error fetching starred messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const unstarMessage = async (messageId) => {
    try {
      const token = await getToken();
      if (!token) return;

      await axios.patch(
        `${API_URL}/api/messages/${messageId}`,
        {
          starred: false,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      fetchStarredMessages();
    } catch (error) {
      console.error('Error unstarring message:', error);
    }
  };

  const getFileExtension = (filename) => {
    return filename?.split('.').pop()?.toLowerCase() || '';
  };

  const getFileIcon = (filename) => {
    if (!filename) return <File className="w-5 h-5" />;
    const ext = getFileExtension(filename);

    const type = fileTypes.find((t) => t.extensions?.includes(ext));
    const Icon = type?.icon || File;
    return <Icon className="w-5 h-5" />;
  };

  const getFileColor = (filename) => {
    const ext = getFileExtension(filename);
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'text-green-400';
    if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) return 'text-blue-400';
    if (['mp4', 'mov', 'avi'].includes(ext)) return 'text-purple-400';
    if (['mp3', 'wav'].includes(ext)) return 'text-pink-400';
    if (['zip', 'rar', '7z'].includes(ext)) return 'text-yellow-400';
    return 'text-gray-400';
  };

  const filteredMessages = starredMessages.filter((message) => {
    if (selectedType === 'all') return true;
    if (message.type !== 'file' || !message.fileName) return false;

    const ext = getFileExtension(message.fileName);
    const type = fileTypes.find((t) => t.id === selectedType);
    return type?.extensions?.includes(ext);
  });

  const groupedByDate = filteredMessages.reduce((groups, message) => {
    const date = dayjs(message.timestamp).format('YYYY-MM-DD');
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {});

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate('/chat')}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Starred Messages</h1>
              <p className="text-sm text-gray-400">{filteredMessages.length} items</p>
            </div>
          </div>

          {/* File Type Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {fileTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    selectedType === type.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {type.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-400">Loading...</div>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Star className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">No starred messages</p>
            <p className="text-sm">Star important messages to keep them here</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedByDate).map(([date, messages]) => (
              <div key={date}>
                <h2 className="text-sm font-semibold text-gray-400 mb-3">
                  {dayjs(date).format('MMMM D, YYYY')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors group"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className={`${getFileColor(message.fileName)}`}>
                          {getFileIcon(message.fileName)}
                        </div>
                        <button
                          onClick={() => unstarMessage(message.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-yellow-400 hover:text-yellow-500"
                        >
                          <Star className="w-4 h-4 fill-current" />
                        </button>
                      </div>

                      {/* Content */}
                      {message.type === 'text' && message.text && (
                        <p className="text-gray-300 text-sm mb-3 line-clamp-3">{message.text}</p>
                      )}

                      {/* File Info */}
                      {message.type === 'file' && message.fileName && (
                        <div className="mb-3">
                          <p className="text-white font-medium text-sm truncate">
                            {message.fileName}
                          </p>
                          <p className="text-gray-500 text-xs">
                            {message.fileSize
                              ? `${(message.fileSize / 1024).toFixed(2)} KB`
                              : 'Unknown size'}
                          </p>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                        <span className="text-xs text-gray-500">
                          {dayjs(message.timestamp).fromNow()}
                        </span>
                        <div className="flex gap-2">
                          {message.type === 'file' && message.filePreviewUrl && (
                            <a
                              href={message.filePreviewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
                              title="View in Google Drive"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          )}
                          <button
                            onClick={() => unstarMessage(message.id)}
                            className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
