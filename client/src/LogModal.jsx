import React, { useEffect } from 'react';
import { getLevelButtonColor, getLevelTextColor, cleanMessage } from './utils/logLevelColors';

const LogModal = ({ log, onClose, onAddStickyLog, onNext, onPrev, hasNext, hasPrev }) => {
  // Close modal when Escape key is pressed
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
        e.preventDefault();
        onPrev();
      }
      if (e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrev, hasNext, hasPrev]);

  if (!log) return null;

  const handleAddStickyLog = () => {
    if (onAddStickyLog) {
      // Create sticky log object with cleaned message for tooltip
      const stickyLogData = {
        ...log,
        cleanedMessage: cleanMessage(log.message || log.raw)
      };

      onAddStickyLog(stickyLogData);
    }
    onClose();
  }; const handleCopy = () => {
    navigator.clipboard.writeText(log.raw);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return timestamp;
    // Convert milliseconds format from HH:MM:SS:mmm to HH:MM:SS.mmm
    return timestamp.replace(/(\d{2}:\d{2}:\d{2}):(\d{3})/, '$1.$2');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl max-h-[80vh] w-full mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Log Details</h2>
            {log.level && (
              <span className={`px-2 py-1 rounded text-xs font-medium ${getLevelTextColor(log.level)}`}>
                {log.level.toUpperCase()}
              </span>
            )}
          </div>

          {/* Navigation and Close buttons */}
          <div className="flex items-center gap-2">
            {/* Previous button */}
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className={`p-1 rounded-md transition-colors ${!hasPrev
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              title="Previous log (←)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Next button */}
            <button
              onClick={onNext}
              disabled={!hasNext}
              className={`p-1 rounded-md transition-colors ${!hasNext
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              title="Next log (→)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl ml-2"
            >
              ×
            </button>
          </div>
        </div>

        {/* Metadata */}
        {(log.timestamp || log.module || log.thread || log.sourceFile || log.lineNumber) && (
          <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {log.lineNumber && (
                <div>
                  <span className="font-medium text-gray-600 dark:text-gray-400">Line:</span>
                  <span className="ml-2 font-mono text-gray-900 dark:text-white">{log.lineNumber}</span>
                </div>
              )}
              {log.timestamp && (
                <div>
                  <span className="font-medium text-gray-600 dark:text-gray-400">Timestamp:</span>
                  <span className="ml-2 font-mono text-gray-900 dark:text-white">{formatTimestamp(log.timestamp)}</span>
                </div>
              )}
              {log.module && (
                <div>
                  <span className="font-medium text-gray-600 dark:text-gray-400">Module:</span>
                  <span className="ml-2 text-gray-900 dark:text-white">{log.module}</span>
                </div>
              )}
              {log.thread && (
                <div>
                  <span className="font-medium text-gray-600 dark:text-gray-400">Thread:</span>
                  <span className="ml-2 font-mono text-gray-900 dark:text-white">#{log.thread}</span>
                </div>
              )}
              {log.sourceFile && (
                <div>
                  <span className="font-medium text-gray-600 dark:text-gray-400">Source:</span>
                  <span className="ml-2 text-gray-900 dark:text-white">{log.sourceFile}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="whitespace-pre-wrap font-mono text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 p-4 rounded border">
            {log.raw}
          </pre>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm"
            >
              Copy
            </button>
            <button
              onClick={handleAddStickyLog}
              className={`px-3 py-2 rounded transition-colors text-sm ${getLevelButtonColor(log.level)}`}
            >
              Sticky Log Line
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogModal;
