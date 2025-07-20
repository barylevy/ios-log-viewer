import React from "react";

export default function LogModal({ selectedLog, onClose }) {
  if (!selectedLog) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-white p-6 rounded shadow-lg max-w-3xl max-h-[80vh] overflow-auto relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-black dark:hover:text-white">
          ✖
        </button>
        <pre className="whitespace-pre-wrap">{selectedLog.raw}</pre>
      </div>
    </div>
  );
}
