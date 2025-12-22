import React from 'react';

export function EncryptionGate({ ready, error, onReenter, onHome }) {
  if (ready) return null;
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center space-y-4">
        <p className="text-white text-lg font-semibold">Encryption key required</p>
        <p className="text-gray-300 text-sm whitespace-pre-wrap">{error}</p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={onReenter}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            Re-enter password
          </button>
          <button
            onClick={onHome}
            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-200 rounded-lg"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
}

export function DriveAuthOverlay({ status, message, onRetry, onCancel }) {
  if (status !== 'authorizing' && status !== 'error') return null;
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center space-y-4">
        {status === 'authorizing' ? (
          <>
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-white text-lg font-semibold">Connecting Google Drive...</p>
            <p className="text-gray-400 text-sm">
              Keep this window open while we complete Drive consent. The popup will close when
              finished.
            </p>
          </>
        ) : (
          <>
            <p className="text-red-400 text-lg font-semibold">Drive access failed</p>
            <p className="text-gray-300 text-sm whitespace-pre-wrap">{message}</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={onRetry}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Retry
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-200 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function DeleteConfirmModal({ confirmDelete, onConfirm, onCancel }) {
  if (!confirmDelete) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-sm shadow-xl text-center space-y-4">
        <p className="text-white text-lg font-semibold">Delete this message?</p>
        <p className="text-gray-300 text-sm">
          This will remove the message and its file (if any) from DriveChat.
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
          >
            Delete
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-200 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function DrivePromptModal({ visible, onRequestAccess }) {
  if (!visible) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 className="text-white text-lg font-semibold mb-2">Connect Google Drive</h3>
        <p className="text-gray-300 text-sm mb-4">
          DriveChat needs Drive access to upload and delete your files. Click below to grant access.
          This should appear once right after sign-in.
        </p>
        <div className="space-y-3">
          <button
            onClick={onRequestAccess}
            className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
          >
            Grant Drive Access
          </button>
          <p className="text-xs text-gray-400 text-center">
            If a popup is blocked or auto-closed, allow popups for this site and try again.
          </p>
        </div>
      </div>
    </div>
  );
}
