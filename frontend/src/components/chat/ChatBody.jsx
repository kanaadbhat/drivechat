import dayjs from 'dayjs';
import MessageItem from './MessageItem';
import PendingUploadBanner from './PendingUploadBanner';
import Skeleton from '../ui/Skeleton';

const getDayLabel = (dateKey) => {
  const date = dayjs(dateKey, 'YYYY-MM-DD');
  const today = dayjs().startOf('day');
  const yesterday = today.subtract(1, 'day');

  if (date.isSame(today, 'day')) return 'Today';
  if (date.isSame(yesterday, 'day')) return 'Yesterday';
  if (date.isSame(today, 'year')) return date.format('MMMM D');
  return date.format('MMMM D, YYYY');
};

function buildTimeline(messages) {
  const items = [];
  let lastDate = null;

  messages.forEach((message) => {
    const dateKey = dayjs(message.timestamp).format('YYYY-MM-DD');
    if (dateKey !== lastDate) {
      items.push({ type: 'separator', date: dateKey });
      lastDate = dateKey;
    }
    items.push({ type: 'message', message });
  });

  return items;
}

export default function ChatBody({
  messages,
  isLoading,
  showStarredOnly,
  pendingUpload,
  formatBytes,
  handlePauseUpload,
  handleCancelUpload,
  currentDevice,
  editingMessage,
  editText,
  setEditText,
  setEditingMessage,
  handleEditMessage,
  handleContextMenu,
  handleDownloadFile,
  toggleStar,
  setConfirmDelete,
  closeContextMenu,
  downloadStates,
  deleteErrors,
  getFileDisplayUrl,
  getThumbnailUrl,
  getFileIcon,
}) {
  const timelineItems = buildTimeline(messages);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex gap-3 items-start">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
        <div className="flex gap-3 items-start justify-end">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-1/4 ml-auto" />
            <Skeleton className="h-16 w-full" />
          </div>
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
        {[...Array(3)].map((_, idx) => (
          <div key={`chat-skel-${idx}`} className="flex gap-3 items-start">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <p className="text-lg mb-2">
            {showStarredOnly ? 'No starred messages' : 'No messages yet'}
          </p>
          <p className="text-sm">
            {showStarredOnly ? 'Star messages to see them here' : 'Send your first message below'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {timelineItems.map((item) =>
        item.type === 'separator' ? (
          <div key={`separator-${item.date}`} className="flex justify-center">
            <span className="px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 bg-gray-900/70 border border-gray-800 rounded-full shadow-sm">
              {getDayLabel(item.date)}
            </span>
          </div>
        ) : (
          <MessageItem
            key={item.message.id}
            message={item.message}
            currentDevice={currentDevice}
            editingMessage={editingMessage}
            editText={editText}
            setEditText={setEditText}
            setEditingMessage={setEditingMessage}
            handleEditMessage={handleEditMessage}
            handleContextMenu={handleContextMenu}
            handleDownloadFile={handleDownloadFile}
            toggleStar={toggleStar}
            setConfirmDelete={setConfirmDelete}
            closeContextMenu={closeContextMenu}
            formatBytes={formatBytes}
            downloadState={downloadStates[item.message.id]}
            deleteError={deleteErrors[item.message.id]}
            getFileDisplayUrl={getFileDisplayUrl}
            getThumbnailUrl={getThumbnailUrl}
            getFileIcon={getFileIcon}
          />
        )
      )}

      <PendingUploadBanner
        pendingUpload={pendingUpload}
        formatBytes={formatBytes}
        onPause={handlePauseUpload}
        onCancel={handleCancelUpload}
      />
    </>
  );
}
