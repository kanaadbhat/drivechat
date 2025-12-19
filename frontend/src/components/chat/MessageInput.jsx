import { useRef } from 'react';
import { Paperclip, Send, X } from 'lucide-react';

export default function MessageInput({
  selectedFile,
  setSelectedFile,
  inputMessage,
  setInputMessage,
  sendMessage,
  isSending,
  handleFileSelect,
  getFileIcon,
}) {
  const fileInputRef = useRef(null);

  return (
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
  );
}
