import React from "react";

export default function LogViewerHeader({ fileName, fileHandle, fullPath, logMetadata, onImport, onExport, onReload, onSummarize }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-2 text-gray-800 dark:text-white">
          <img src="/assets/cato-logo.svg" className="h-6" />
          <span className="text-2xl font-bold whitespace-nowrap">iOS Log Viewer</span>
          {fileName && (
            <span className="text-sm text-gray-600 dark:text-gray-300">
              • <strong title={fullPath || fileName}>{fileName}</strong>
              {fileHandle && (
                <button title="Reload Log file" onClick={onReload} className="ml-2 text-blue-500 underline text-xs">🔄</button>
              )}
            </span>
          )}
        </div>
      </div>
      {logMetadata.user && (
        <div className="text-xs text-gray-500 dark:text-gray-300">
          · {logMetadata.user} · {logMetadata.account} · v{logMetadata.clientVersion} · OS {logMetadata.osVersion}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button onClick={onSummarize} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white px-4 py-2 rounded text-sm">🧠 Explain Logs</button>
        <button onClick={onImport} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white px-4 py-2 rounded text-sm">📁 Import Log</button>
        <button onClick={onExport} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white px-4 py-2 rounded text-sm">📤 Export Log</button>
      </div>
    </div>
  );
}
