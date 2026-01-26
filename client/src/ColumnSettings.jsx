import React, { useState, useEffect } from 'react';

const AVAILABLE_COLUMNS = [
  { id: 'timestamp', label: 'Timestamp', defaultVisible: true },
  { id: 'lineNumber', label: 'Line Number', defaultVisible: true },
  { id: 'logLevel', label: 'Log Level', defaultVisible: true },
  { id: 'message', label: 'Message', defaultVisible: true, disabled: true }, // Message is always visible
  { id: 'module', label: 'Module', defaultVisible: true },
  { id: 'sourceFile', label: 'Source File', defaultVisible: true },
  { id: 'processThread', label: 'P:T', defaultVisible: true },
  { id: 'timeGap', label: 'Time Gap', defaultVisible: true },
];

const ColumnSettings = ({ isOpen, onClose, visibleColumns, onColumnsChange }) => {
  const [tempColumns, setTempColumns] = useState(visibleColumns);

  useEffect(() => {
    if (isOpen) {
      setTempColumns(visibleColumns);
    }
  }, [isOpen, visibleColumns]);

  if (!isOpen) return null;

  const handleToggle = (columnId) => {
    setTempColumns(prev => ({
      ...prev,
      [columnId]: !prev[columnId]
    }));
  };

  const handleSave = () => {
    onColumnsChange(tempColumns);
    localStorage.setItem('logViewerColumns', JSON.stringify(tempColumns));
    onClose();
  };

  const handleReset = () => {
    const defaultColumns = {};
    AVAILABLE_COLUMNS.forEach(col => {
      defaultColumns[col.id] = col.defaultVisible;
    });
    setTempColumns(defaultColumns);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Column Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Select which columns to display in the log viewer
          </p>
          
          {AVAILABLE_COLUMNS.map(column => (
            <div
              key={column.id}
              className={`flex items-center justify-between p-3 rounded-md ${
                column.disabled 
                  ? 'bg-gray-50 dark:bg-gray-900 opacity-60 cursor-not-allowed' 
                  : 'bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <label
                htmlFor={`column-${column.id}`}
                className={`text-sm font-medium text-gray-700 dark:text-gray-300 ${
                  column.disabled ? 'cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                {column.label}
                {column.disabled && (
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(Required)</span>
                )}
              </label>
              
              <input
                id={`column-${column.id}`}
                type="checkbox"
                checked={tempColumns[column.id]}
                onChange={() => handleToggle(column.id)}
                disabled={column.disabled}
                className={`w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 ${
                  column.disabled ? 'cursor-not-allowed' : 'cursor-pointer'
                }`}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            Reset to Default
          </button>
          
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColumnSettings;
export { AVAILABLE_COLUMNS };
